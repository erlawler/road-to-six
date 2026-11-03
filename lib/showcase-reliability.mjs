import { aiExplanationCases } from "../evals/ai-explanation-cases.mjs";
import { runAIEvaluationSuite } from "./ai-evaluation.mjs";
import { footballSnapshotFreshness } from "./source-freshness.mjs";
import { createSyntheticFantasySnapshot, evaluateFantasyComparison, validateFantasyExplanation } from "./fantasy.mjs";
import { createFantasySimulationClient, licensedFantasyProsAdapter } from "./fantasy-provider.mjs";

export const SHOWCASE_RELIABILITY_VERSION = "showcase-reliability-v1";

// The clock and provider responses below are injected. This suite never calls a
// live API and does not measure production uptime, model quality, or latency.
const SIMULATION_NOW = Date.parse("2026-10-29T12:00:00Z");
const context = Object.freeze({
  season: 2026, week: 8, cowboysTeam: "DAL", opponentTeam: "ARI",
  opponentName: "Arizona Cardinals", kickoffAt: "2026-11-01T18:00:00Z",
  verified: true, bye: false,
});

function check(id, label, category, expected, run, detail) {
  try {
    const observed = run();
    return { id, label, category, simulated: true, passed: observed === expected, expected, observed, detail };
  } catch (error) {
    return { id, label, category, simulated: true, passed: false, expected, observed: "threw", detail: `${detail} Test error: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

function fixtureReview() {
  const reviewedAt = "2026-10-29T11:00:00Z";
  return {
    asOf: "2026-10-29",
    manifest: {
      validatedAt: "2026-10-29", reviewedAt, validationStatus: "passed",
      inputs: Object.fromEntries(["games", "roster", "stats"].map((key) => [key, {
        metadataStatus: "verified", sourceUpdatedAt: "2026-10-29T10:00:00Z",
        retrievedBetween: { start: reviewedAt, end: reviewedAt },
      }])),
    },
  };
}

function fantasyStatus(mutate, ctx = context, now = SIMULATION_NOW) {
  const input = createSyntheticFantasySnapshot(context, SIMULATION_NOW);
  mutate(input);
  const result = evaluateFantasyComparison(input, ctx, now);
  return result.status === "unavailable" && result.leaders === null ? "abstained" : result.status;
}

function fantasyClaims(mutate = () => {}) {
  const comparison = evaluateFantasyComparison(createSyntheticFantasySnapshot(context, SIMULATION_NOW), context, SIMULATION_NOW);
  const claims = [comparison.leaders.cowboys.player, comparison.leaders.opponent.player].map((player) => ({
    type: "leader", playerId: player.id, points: player.projectedPoints, mode: comparison.status,
  }));
  claims.push({ type: "difference", points: comparison.pointsDifference, mode: comparison.status });
  mutate(claims);
  return validateFantasyExplanation(claims, comparison).passed ? "accepted" : "rejected";
}

export function runShowcaseReliabilitySuite() {
  const results = [
    check("fantasy_valid", "Complete projection schema", "Input validation", "ready_demo", () =>
      fantasyStatus(() => {}), "Accept a complete synthetic, correctly scored two-team projection fixture."),
    check("fantasy_invalid_schema", "Unsupported projection schema", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.schemaVersion = "unknown-v99"; }), "Reject an unrecognized response contract rather than guessing its fields."),
    check("fantasy_truncated", "Truncated projection response", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.coverage.truncated = true; }), "Inject a truncated response. No weekly leader may be declared."),
    check("fantasy_incomplete", "Incomplete player coverage", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.coverage.complete = false; }), "Mark coverage incomplete and require an unavailable result with no leaders."),
    check("fantasy_missing_stat", "Missing scoring input", "Input validation", "abstained", () =>
      fantasyStatus((input) => { delete input.players[0].stats.receptions; }), "Remove a required scoring statistic instead of substituting zero."),
    check("fantasy_conflicting_score", "Conflicting projected points", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.players[0].projectedPoints += 10; }), "Tamper with provider points and require disagreement with deterministic scoring to fail closed."),
    check("fantasy_duplicate_player", "Duplicate player identity", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.players[1].id = input.players[0].id; }), "Inject duplicate player IDs so conflicting player rows cannot be ranked."),
    check("fantasy_wrong_week", "Wrong-week projection", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.week = 7; }), "Use the wrong week while the verified matchup expects Week 8."),
    check("fantasy_wrong_scoring", "Scoring format mismatch", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.scoringId = "standard"; }), "Reject standard scoring in a PPR comparison."),
    check("fantasy_invalid_number", "Nonfinite projection value", "Input validation", "abstained", () =>
      fantasyStatus((input) => { input.players[0].projectedPoints = NaN; }), "Reject an unrepresentable point value rather than ranking it."),
    check("fantasy_expired", "Expired projection evidence", "Freshness and abstention", "abstained", () =>
      fantasyStatus((input) => { input.source.expiresAt = "2026-10-29T11:59:59Z"; }), "An expired source cannot support a current-week leader."),
    check("fantasy_future_timestamp", "Future source timestamp", "Freshness and abstention", "abstained", () =>
      fantasyStatus((input) => { input.source.updatedAt = "2026-10-30T12:00:00Z"; }), "Reject source metadata dated after the test clock."),
    check("fantasy_bye", "Cowboys bye handling", "Freshness and abstention", "abstained", () =>
      fantasyStatus(() => {}, { ...context, bye: true }), "A bye does not borrow the next game's projections."),
    check("fantasy_unverified_matchup", "Unverified matchup", "Freshness and abstention", "abstained", () =>
      fantasyStatus(() => {}, { ...context, verified: false }), "Withhold current leaders when the schedule is unverified."),
    check("fantasy_claim_valid", "Evidence-matched fantasy explanation", "AI output contract", "accepted", () =>
      fantasyClaims(), "Structured explanation claims preserve both calculated leaders and their difference."),
    check("fantasy_claim_invented_player", "Invented player claim", "AI output contract", "rejected", () =>
      fantasyClaims((claims) => { claims[0].playerId = "unavailable-player"; }), "An explanation cannot substitute a player outside the calculated evidence."),
    check("fantasy_claim_changed_number", "Invented point adjustment", "AI output contract", "rejected", () =>
      fantasyClaims((claims) => { claims[2].points += 5; }), "An explanation cannot change the deterministic fantasy point difference."),
    check("fantasy_claim_demo_as_live", "Synthetic result called live", "AI output contract", "rejected", () =>
      fantasyClaims((claims) => { claims[0].mode = "ready_live"; }), "An explanation must preserve the synthetic mode alongside the number."),
    check("fantasy_claim_uncited_prose", "Uncited player narrative", "AI output contract", "rejected", () =>
      fantasyClaims((claims) => { claims[0].narrative = "This player is certain to score."; }), "Unrestricted prose is not permitted in the structured evidence contract."),
    check("fantasy_claim_abstention", "Grounded abstention", "AI output contract", "accepted", () => {
      const comparison = evaluateFantasyComparison(null, context, SIMULATION_NOW);
      return validateFantasyExplanation([{ type: "abstention" }], comparison).passed ? "accepted" : "rejected";
    }, "Missing projections allow only an explicit abstention."),
    check("fantasy_claim_missing_abstention", "Recommendation without evidence", "AI output contract", "rejected", () => {
      const comparison = evaluateFantasyComparison(null, context, SIMULATION_NOW);
      return validateFantasyExplanation([{ type: "leader", playerId: "invented", points: 99 }], comparison).passed ? "accepted" : "rejected";
    }, "A fabricated leader must not replace abstention when projections are missing."),
    check("football_current", "Fresh football evidence", "Freshness and abstention", "current", () =>
      footballSnapshotFreshness(fixtureReview(), SIMULATION_NOW).status, "All three football sources have verified timestamps inside the weekly window."),
    check("football_stale", "Expired weekly review", "Freshness and abstention", "stale", () =>
      footballSnapshotFreshness(fixtureReview(), SIMULATION_NOW + 7 * 86_400_000).status, "Advance the test clock past seven days since the oldest source review."),
    check("football_missing_source", "Missing football source", "Freshness and abstention", "unavailable", () => {
      const input = fixtureReview(); delete input.manifest.inputs.stats;
      return footballSnapshotFreshness(input, SIMULATION_NOW).status;
    }, "Remove statistics provenance and require unavailable freshness."),
    check("football_conflicting_time", "Conflicting source timestamps", "Freshness and abstention", "unavailable", () => {
      const input = fixtureReview(); input.manifest.inputs.roster.sourceUpdatedAt = "2026-10-29T13:00:00Z";
      return footballSnapshotFreshness(input, SIMULATION_NOW).status;
    }, "Publication after retrieval invalidates football provenance."),
  ];
  const ai = runAIEvaluationSuite(aiExplanationCases);
  for (const item of ai.results) {
    results.push({
      id: `ai_${item.id}`, label: item.description, category: "AI output contract",
      simulated: true, passed: item.expectationMet,
      expected: item.expectedValid ? "accepted" : "rejected",
      observed: item.actualValid ? "accepted" : "rejected",
      detail: item.failedChecks.length ? `Validation checks triggered: ${item.failedChecks.join(", ")}.` : "Every output contract check passed.",
    });
  }
  return {
    schemaVersion: "1.0", suiteVersion: SHOWCASE_RELIABILITY_VERSION,
    evidenceType: "local_deterministic_simulation",
    simulatedClock: new Date(SIMULATION_NOW).toISOString(),
    passed: results.filter((item) => item.passed).length, total: results.length,
    allPassed: results.every((item) => item.passed), paidProviderCalls: 0,
    productionTelemetry: { uptime: null, modelLatencyMs: null, factualAccuracy: null },
    limits: [
      "These are executable tests with synthetic inputs and injected failures, not production traffic.",
      "No live model or FantasyPros call was made. Model factual accuracy, production uptime, latency, and cost per decision are unmeasured.",
      "Output checks validate bounded structured claims and evidence fields; this is not a general hallucination benchmark.",
      "A passing refusal demonstrates the tested guardrail, not the availability of licensed current-week projections.",
    ],
    results,
  };
}

async function transportCheck(id, label, expected, run, detail) {
  try {
    const observed = await run();
    return { id, label, category: "Simulated transport", simulated: true, passed: observed === expected, expected, observed, detail };
  } catch (error) {
    return { id, label, category: "Simulated transport", simulated: true, passed: false, expected, observed: "threw", detail: `${detail} Test error: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function runShowcaseReliabilitySimulation() {
  const report = runShowcaseReliabilitySuite();
  const results = await Promise.all([
    transportCheck("transport_cache_hit", "Fresh cache avoids another provider call", "cache_hit; calls=1; ready_demo", async () => {
      const client = createFantasySimulationClient({ provider: async () => ({ status: 200, snapshot: createSyntheticFantasySnapshot(context, SIMULATION_NOW) }), now: () => SIMULATION_NOW });
      await client.read(context);
      const result = await client.read(context);
      return `${result.mode}; calls=${result.receipt.providerCalls}; ${result.comparison.status}`;
    }, "Read a valid cached fixture twice; the second read must not request the injected provider."),
    transportCheck("transport_cache_expired", "Expired cache revalidates", "provider_fixture; calls=2; fresh=true", async () => {
      let time = SIMULATION_NOW;
      const client = createFantasySimulationClient({ provider: async () => ({ status: 200, snapshot: createSyntheticFantasySnapshot(context, time) }), now: () => time });
      await client.read(context); time += 60_001;
      const result = await client.read(context);
      return `${result.mode}; calls=${result.receipt.providerCalls}; fresh=${result.preservedSnapshot?.source.updatedAt === new Date(time).toISOString()}`;
    }, "Advance the injected clock past the local cache TTL and require a new valid fixture."),
    transportCheck("transport_expired_failure", "Failed refresh retains last-good evidence", "abstained; no leader=true; retained=true; calls=2", async () => {
      let time = SIMULATION_NOW;
      let response = 200;
      const snapshot = createSyntheticFantasySnapshot(context, time);
      const client = createFantasySimulationClient({ provider: async () => ({ status: response, snapshot }), now: () => time });
      await client.read(context); time += 60_001; response = 503;
      const result = await client.read(context);
      return `${result.mode}; no leader=${result.comparison.leaders === null}; retained=${result.preservedSnapshot?.source.updatedAt === snapshot.source.updatedAt}; calls=${result.receipt.providerCalls}`;
    }, "Expire cache, inject HTTP 503, retain the dated snapshot and suppress current leaders."),
    transportCheck("transport_429", "Rate-limit cooldown prevents repeated requests", "rate_limited; calls=2; no leader=true; retained=true; retry=true", async () => {
      let response = 200;
      const snapshot = createSyntheticFantasySnapshot(context, SIMULATION_NOW);
      const client = createFantasySimulationClient({ provider: async () => ({ status: response, snapshot, retryAfterSeconds: 60 }), now: () => SIMULATION_NOW });
      await client.read(context); response = 429;
      await client.read(context, { forceRefresh: true });
      const result = await client.read(context, { forceRefresh: true });
      return `${result.reason}; calls=${result.receipt.providerCalls}; no leader=${result.comparison.leaders === null}; retained=${result.preservedSnapshot?.source.updatedAt === snapshot.source.updatedAt}; retry=${result.receipt.nextRetryAt === new Date(SIMULATION_NOW + 60_000).toISOString()}`;
    }, "Inject HTTP 429 and Retry-After. Repeated forced refresh must honor cooldown without another request."),
    transportCheck("transport_429_recovery", "Retry resumes only after cooldown", "provider_fixture; calls=3; ready_demo", async () => {
      let time = SIMULATION_NOW;
      let response = 200;
      const client = createFantasySimulationClient({ provider: async () => ({ status: response, snapshot: createSyntheticFantasySnapshot(context, time), retryAfterSeconds: 60 }), now: () => time });
      await client.read(context); response = 429;
      await client.read(context, { forceRefresh: true });
      time += 60_001; response = 200;
      const result = await client.read(context);
      return `${result.mode}; calls=${result.receipt.providerCalls}; ${result.comparison.status}`;
    }, "Advance the injected clock beyond Retry-After and accept the next complete fixture."),
    transportCheck("transport_timeout", "Provider timeout abstains", "provider_timeout; no leader=true; calls=1", async () => {
      const client = createFantasySimulationClient({ provider: () => new Promise(() => {}), now: () => SIMULATION_NOW, timeoutMs: 20 });
      const result = await client.read(context);
      return `${result.reason}; no leader=${result.comparison.leaders === null}; calls=${result.receipt.providerCalls}`;
    }, "Inject a nonresponding fixture transport and require bounded timeout with no recommendation."),
    transportCheck("transport_context_isolation", "Cache never crosses matchup boundaries", "abstained; retained=false; no leader=true; calls=2", async () => {
      let response = 200;
      const client = createFantasySimulationClient({ provider: async () => ({ status: response, snapshot: createSyntheticFantasySnapshot(context, SIMULATION_NOW) }), now: () => SIMULATION_NOW });
      await client.read(context); response = 503;
      const result = await client.read({ ...context, week: 9, kickoffAt: "2026-11-08T18:00:00Z" });
      return `${result.mode}; retained=${result.preservedSnapshot !== null}; no leader=${result.comparison.leaders === null}; calls=${result.receipt.providerCalls}`;
    }, "Switch weeks and fail the new request. The previous week's snapshot must not fill the new context."),
    transportCheck("transport_overlap", "Overlapping reads share one request", "calls=1; both ready=true", async () => {
      const client = createFantasySimulationClient({ provider: () => new Promise((resolve) => setTimeout(() => resolve({ status: 200, snapshot: createSyntheticFantasySnapshot(context, SIMULATION_NOW) }), 5)), now: () => SIMULATION_NOW });
      const pair = await Promise.all([client.read(context), client.read(context)]);
      return `calls=${pair[1].receipt.providerCalls}; both ready=${pair.every((item) => item.comparison.status === "ready_demo")}`;
    }, "Start two reads before the fixture response resolves; only one provider call is allowed."),
    transportCheck("transport_partial_retention", "Partial response cannot replace good evidence", "invalid_provider_snapshot; no leader=true; retained=true", async () => {
      const good = createSyntheticFantasySnapshot(context, SIMULATION_NOW);
      let next = good;
      const client = createFantasySimulationClient({ provider: async () => ({ status: 200, snapshot: next }), now: () => SIMULATION_NOW });
      await client.read(context);
      next = structuredClone(good); next.coverage.truncated = true; next.players = [];
      const result = await client.read(context, { forceRefresh: true });
      return `${result.reason}; no leader=${result.comparison.leaders === null}; retained=${JSON.stringify(result.preservedSnapshot) === JSON.stringify(good)}`;
    }, "Force refresh with a truncated payload. Keep the full last-good fixture and abstain."),
    transportCheck("transport_licensed_disabled", "Licensed adapter stays disabled", "disabled=true; calls=0", async () => {
      const adapter = licensedFantasyProsAdapter();
      return `disabled=${adapter.enabled === false}; calls=${adapter.callsMade}`;
    }, "The public showcase exposes a disabled licensed-data boundary with no credentials or API calls."),
  ]);
  report.results.push(...results);
  report.passed = report.results.filter((item) => item.passed).length;
  report.total = report.results.length;
  report.allPassed = report.results.every((item) => item.passed);
  return report;
}
