import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { validateJsonSchema } from "../lib/json-schema-lite.mjs";
import { FORECAST_CONTROL_KEYS, getFootballForecast } from "../lib/football-forecast-tool.mjs";
import { DEFAULT_CONTROLS } from "../lib/forecast.mjs";
import {
  EDUCATIONAL_NOTICE, EVIDENCE_OUTPUT_SCHEMA, MCP_SERVER_INFO, OWNER_TOOLS, PUBLIC_INSTRUCTIONS, PUBLIC_TOOLS, buildEvidence,
  findPublicTool, forecastScenario, validateToolArguments,
} from "../lib/mcp-tools.mjs";
import {
  MCP_RATE_LIMIT, MCP_USAGE_RETENTION_DAYS, clientFamily, consumePublicMcpRateLimit, pruneMcpUsage, readMcpUsageSummary, recordMcpUsage,
} from "../lib/mcp-usage.mjs";
import { footballSnapshotFreshness } from "../lib/source-freshness.mjs";

const snapshot = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const reference = Date.parse(snapshot.season.verifiedAt) + 60_000;
const readyState = () => ({
  snapshot,
  update: { status: "ready", lastSuccessAt: new Date(reference - 1000).toISOString(), lastAttemptAt: new Date(reference - 2000).toISOString(), reasonCode: null },
  freshness: footballSnapshotFreshness(snapshot, reference),
});

function database(t, files = ["0002_ai_runtime_governance", "0005_mcp_usage_daily"]) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  return (async () => {
    for (const name of files) sqlite.exec(await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
    return { sqlite, db: { prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { const outcome = statement.run(...args); return { success: true, meta: { changes: Number(outcome.changes) } }; },
      };
    } } };
  })();
}

test("the schema checker enforces the subset the tool catalog declares", () => {
  const schema = {
    type: "object", additionalProperties: false, required: ["team"],
    properties: { team: { type: "string", enum: ["DAL", "opponent"] }, share: { type: "number", minimum: 0, maximum: 100 }, tags: { type: "array", items: { type: "string" } }, note: { type: ["string", "null"] }, kind: { const: "x" } },
  };
  assert.deepEqual(validateJsonSchema(schema, { team: "DAL", share: 12.5, tags: ["a"], note: null, kind: "x" }), []);
  assert.deepEqual(validateJsonSchema(schema, {}), ["value.team is required"]);
  assert.deepEqual(validateJsonSchema(schema, { team: "PHI" }), ['value.team must be one of "DAL", "opponent"']);
  assert.deepEqual(validateJsonSchema(schema, { team: ["DAL"] }), ["value.team must be of type string"]);
  assert.deepEqual(validateJsonSchema(schema, { team: "DAL", share: 101 }), ["value.share must be between 0 and 100"]);
  assert.deepEqual(validateJsonSchema(schema, { team: "DAL", url: "https://evil.example" }), ["value.url is not an accepted property"]);
  assert.deepEqual(validateJsonSchema(schema, { team: "DAL", tags: ["a", 2] }), ["value.tags[1] must be of type string"]);
  assert.deepEqual(validateJsonSchema(schema, { team: "DAL", note: 4 }), ["value.note must be one of the types string, null"]);
  assert.deepEqual(validateJsonSchema(schema, { team: "DAL", kind: "y" }), ['value.kind must equal "x"']);
  assert.deepEqual(validateJsonSchema(schema, "DAL"), ["value must be of type object"]);
  assert.deepEqual(validateJsonSchema({ type: "integer" }, 1.5), ["value must be of type integer"]);
  assert.deepEqual(validateJsonSchema({ type: "number", minimum: 1 }, 0), ["value must be at least 1"]);
});

test("the catalog is small, unambiguous and honest about what each tool is not", () => {
  assert.equal(PUBLIC_TOOLS.length, 6);
  assert.equal(new Set([...PUBLIC_TOOLS, ...OWNER_TOOLS].map((tool) => tool.name)).size, PUBLIC_TOOLS.length + OWNER_TOOLS.length);
  for (const tool of PUBLIC_TOOLS) {
    assert.match(tool.name, /^[a-z][a-z_]{2,40}$/);
    assert.equal(findPublicTool(tool.name), tool);
    assert.equal(tool.outputSchema.properties.evidence, EVIDENCE_OUTPUT_SCHEMA);
    assert.ok(!/[–—]/.test(tool.description + tool.title));
  }
  for (const tool of OWNER_TOOLS) assert.equal(findPublicTool(tool.name), null);
  const description = (name) => findPublicTool(name).description;
  assert.match(description("get_player_usage"), /not projections/);
  assert.match(description("compare_players"), /no start or sit advice/);
  assert.match(description("get_football_forecast"), /Betting-market prices are excluded by design/);
  assert.match(description("get_football_forecast"), /not a pick or betting advice/);
  assert.match(description("get_game_day_context"), /changes no estimate/);
  assert.match(PUBLIC_INSTRUCTIONS, /do not substitute other data/);
  assert.match(EDUCATIONAL_NOTICE, /not affiliated with the Dallas Cowboys or the NFL/);
  assert.match(MCP_SERVER_INFO.version, /^\d+\.\d+\.\d+$/);
});

test("declared input schemas are the enforced rules, with messages a model can act on", () => {
  const usage = findPublicTool("get_player_usage"), forecast = findPublicTool("get_football_forecast"), matchup = findPublicTool("get_current_matchup");
  assert.deepEqual(validateToolArguments(usage, { team: "DAL" }), []);
  assert.deepEqual(validateToolArguments(usage, {}), ["team is required"]);
  assert.deepEqual(validateToolArguments(usage, { team: "PHI" }), ['team must be one of "DAL", "opponent"']);
  assert.deepEqual(validateToolArguments(matchup, { url: "https://evil.example" }), ["url is not an accepted argument for this tool"]);
  assert.deepEqual(validateToolArguments(forecast, {}), []);
  assert.deepEqual(validateToolArguments(forecast, Object.fromEntries(FORECAST_CONTROL_KEYS.map((key) => [key, 0]))), []);
  assert.deepEqual(validateToolArguments(forecast, { defense: -1 }), ["defense must be between 0 and 100"]);
  assert.deepEqual(forecastScenario({ quarterback: 40, lamb: "x", extra: 1 }), { quarterback: 40 });
});

test("the evidence block always states status, staleness and a reason when a result is not fully usable", () => {
  const state = readyState();
  const ok = buildEvidence("get_current_matchup", { status: "verified", reason: null }, state, reference);
  assert.deepEqual(validateJsonSchema(EVIDENCE_OUTPUT_SCHEMA, ok), []);
  assert.deepEqual([ok.status, ok.reason, ok.stale, ok.football.freshness], ["ok", null, false, "current"]);
  assert.equal(buildEvidence("get_current_matchup", { status: "bye", reason: "Dallas has a bye in the current league week." }, state, reference).status, "ok");

  const degraded = buildEvidence("get_source_health", { status: "degraded" }, state, reference);
  assert.deepEqual([degraded.status, degraded.stale], ["degraded", false]);
  assert.match(degraded.reason, /incomplete/);
  assert.equal(buildEvidence("get_game_day_context", { status: "partial", reason: "kickoff_outside_available_forecast" }, state, reference).reason, "kickoff_outside_available_forecast");
  assert.equal(buildEvidence("compare_players", { status: "unavailable", reasons: ["first", "second"] }, state, reference).reason, "first");

  const failed = { ...state, update: { ...state.update, status: "failed", reasonCode: "source_validation_failed" } };
  const stale = buildEvidence("get_source_health", { status: "degraded" }, failed, reference);
  assert.equal(stale.stale, true);
  assert.match(stale.reason, /failed \(source_validation_failed\)/);
  const aged = { ...state, freshness: footballSnapshotFreshness(snapshot, reference + 30 * 86_400_000) };
  const old = buildEvidence("get_source_health", { status: "degraded" }, aged, reference + 30 * 86_400_000);
  assert.deepEqual([old.stale, old.football.freshness], [true, "stale"]);
  assert.equal(typeof old.reason, "string");
  assert.deepEqual(validateJsonSchema(EVIDENCE_OUTPUT_SCHEMA, old), []);

  const weather = buildEvidence("get_game_day_context", { status: "current" }, state, reference, [{ name: "NOAA National Weather Service", url: "https://www.weather.gov/documentation/services-web-api", license: "open", licenseUrl: "ignored" }]);
  assert.deepEqual(Object.keys(weather.sources[0]), ["name", "url", "license"]);
  assert.equal(weather.sources.length, snapshot.sources.length + 1);
});

test("the forecast tool reuses the shared model, never reads market inputs, and abstains when unverified", () => {
  const state = readyState();
  const baseline = getFootballForecast(state, {}, reference);
  assert.equal(baseline.status, "available");
  assert.deepEqual(baseline.forecast.controls, { ...DEFAULT_CONTROLS });
  assert.equal(baseline.forecast.modelVersion, snapshot.ratingsMetadata.modelVersion);
  assert.equal(baseline.ratings.trainedThrough, snapshot.ratingsMetadata.trainedThrough);

  // Changing every market field in the saved schedule must not move the football-only result.
  const altered = structuredClone(snapshot);
  for (const game of altered.schedule) Object.assign(game, { cowboysMoneyline: -900, opponentMoneyline: 650, cowboysSpread: -14, totalLine: 30, marketImpliedProbability: 0.9 });
  assert.deepEqual(getFootballForecast({ ...state, snapshot: altered }, {}, reference).forecast, baseline.forecast);

  const scenario = getFootballForecast(state, { quarterback: 0, defense: 0 }, reference).forecast;
  assert.equal(scenario.scenarioApplied, true);
  assert.ok(scenario.cowboysWinPercent < baseline.forecast.cowboysWinPercent);
  assert.ok(scenario.cowboysWinPercent >= 5);
  assert.deepEqual(getFootballForecast(state, { quarterback: Number.NaN, lamb: "50" }, reference).forecast.controls, { ...DEFAULT_CONTROLS });

  for (const broken of [
    { ...state, update: { ...state.update, status: "failed" } },
    { ...state, snapshot: { ...snapshot, ratings: {} } },
  ]) {
    const result = getFootballForecast(broken, {}, reference);
    assert.deepEqual([result.status, result.forecast, result.marketPricesIncluded], ["unavailable", null, false]);
    assert.equal(typeof result.reasons[0], "string");
  }
  assert.equal(getFootballForecast(state, {}, reference + 30 * 86_400_000).status, "unavailable");
});

test("client labels are bounded and never echo caller-chosen text", () => {
  assert.equal(clientFamily("claude-ai", null), "claude");
  assert.equal(clientFamily("ChatGPT", null), "chatgpt");
  assert.equal(clientFamily(null, "Cursor/2.4 (darwin)"), "cursor");
  assert.equal(clientFamily("Visual Studio Code", null), "vscode");
  assert.equal(clientFamily("mcp-inspector", null), "inspector");
  assert.equal(clientFamily("'; DROP TABLE mcp_usage_daily; --", "curl/8"), "other");
  assert.equal(clientFamily(null, null), "unknown");
  assert.equal(clientFamily("", "node"), "unknown");
});

test("the rate limit is atomic per aligned window, scoped, and fails open without storage", async (t) => {
  const { sqlite, db } = await database(t);
  const start = Math.floor(reference / MCP_RATE_LIMIT.windowMs) * MCP_RATE_LIMIT.windowMs;
  sqlite.prepare("INSERT INTO ai_rate_limit_window (scope, window_start, request_count, expires_at) VALUES ('mcp_public', ?, 5, ?)").run(start - MCP_RATE_LIMIT.windowMs, start);
  sqlite.prepare("INSERT INTO ai_rate_limit_window (scope, window_start, request_count, expires_at) VALUES ('anonymous_ai', ?, 20, ?)").run(start - MCP_RATE_LIMIT.windowMs, start);

  const results = await Promise.all(Array.from({ length: MCP_RATE_LIMIT.maxRequests + 5 }, () => consumePublicMcpRateLimit(db, start + 1_000)));
  assert.equal(results.filter((result) => result.allowed).length, MCP_RATE_LIMIT.maxRequests);
  const denied = results.find((result) => !result.allowed);
  assert.deepEqual([denied.enforced, denied.retryAfterSeconds], [true, 299]);
  assert.equal(sqlite.prepare("SELECT request_count FROM ai_rate_limit_window WHERE scope = 'mcp_public' AND window_start = ?").get(start).request_count, MCP_RATE_LIMIT.maxRequests);
  // Only this scope's expired windows are cleaned up.
  assert.deepEqual(sqlite.prepare("SELECT scope FROM ai_rate_limit_window WHERE window_start < ?").all(start).map((row) => row.scope), ["anonymous_ai"]);
  assert.equal((await consumePublicMcpRateLimit(db, start + MCP_RATE_LIMIT.windowMs)).allowed, true);

  assert.deepEqual(await consumePublicMcpRateLimit(undefined, reference), { allowed: true, enforced: false });
  assert.equal((await consumePublicMcpRateLimit(db, start + 2 * MCP_RATE_LIMIT.windowMs)).windowOpened, true);
  assert.deepEqual(await consumePublicMcpRateLimit({ prepare() { throw new Error("storage down"); } }, reference), { allowed: true, enforced: false });
});

test("usage aggregates reject unknown dimensions, summarize a trailing window, and prune old days", async (t) => {
  const { sqlite, db } = await database(t);
  const event = { surface: "public", operation: "get_current_matchup", client: "claude", outcome: "ok" };
  assert.equal(await recordMcpUsage(db, event, reference), true);
  assert.equal(await recordMcpUsage(db, event, reference), true);
  assert.equal(await recordMcpUsage(db, { ...event, outcome: "unavailable" }, reference - 3 * 86_400_000), true);
  assert.equal(await recordMcpUsage(db, { ...event, client: "cursor" }, reference - 45 * 86_400_000), true);
  assert.equal(await recordMcpUsage(db, { ...event, surface: "owner" }, reference), false);
  assert.equal(await recordMcpUsage(db, { ...event, outcome: "anything" }, reference), false);
  assert.equal(await recordMcpUsage(undefined, event, reference), false);

  const summary = await readMcpUsageSummary(db, reference);
  assert.deepEqual([summary.status, summary.totalCalls], ["available", 3]);
  assert.deepEqual(summary.byOutcome, { unavailable: 1, ok: 2 });
  assert.deepEqual(summary.byDay.map((day) => day.calls), [1, 2]);
  assert.equal(summary.since, new Date(reference - 29 * 86_400_000).toISOString().slice(0, 10));

  assert.equal(await pruneMcpUsage(db, reference + (MCP_USAGE_RETENTION_DAYS - 10) * 86_400_000), true);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS rows FROM mcp_usage_daily").get().rows, 2);
  assert.equal((await readMcpUsageSummary(undefined, reference)).status, "unavailable");
  assert.equal((await readMcpUsageSummary({ prepare() { throw new Error("no table"); } }, reference)).status, "unavailable");
});
