import assert from "node:assert/strict";
import test from "node:test";
import { calculateFantasyPoints, createSyntheticFantasySnapshot, evaluateFantasyComparison, FANTASY_POLICY,
  FANTASY_SCORING, validateFantasyExplanation } from "../lib/fantasy.mjs";
import { fantasyImpactForContext } from "../lib/fantasy-impact.mjs";

const now = Date.parse("2026-10-29T02:00:00Z");
const context = { season: 2026, week: 8, cowboysTeam: "DAL", opponentTeam: "ARI", opponentName: "Arizona Cardinals",
  kickoffAt: "2026-11-01T18:00:00Z", verified: true, bye: false };
const fixture = () => createSyntheticFantasySnapshot(context, now);
const compare = (snapshot, overrides = {}, time = now) => evaluateFantasyComparison(snapshot, { ...context, ...overrides }, time);
const hasReason = (result, code) => result.reasons.some((reason) => reason.code === code);

test("programmatic PPR leaders come from both full fixture pools and are explicitly fictional", () => {
  const data = fixture();
  const result = compare(data);
  assert.equal(result.status, "ready_demo");
  assert.equal(result.leaders.cowboys.player.name, "Cameron Lane");
  assert.equal(result.leaders.cowboys.player.projectedPoints, 20);
  assert.equal(result.leaders.opponent.player.name, "Taylor Ridge");
  assert.equal(result.leaders.opponent.player.projectedPoints, 18.56);
  assert.equal(result.pointsDifference, 1.44);
  assert.equal(result.candidateCount, 8);
  assert.match(result.notice, /not current FantasyPros projections/);
  assert.equal(FANTASY_SCORING.rules.passingTouchdowns, 4);
  assert.deepEqual(FANTASY_SCORING.positions, ["QB", "RB", "WR", "TE"]);
  const qb = data.players.find((player) => player.team === "DAL" && player.position === "QB");
  qb.stats.passingTouchdowns = 5;
  qb.projectedPoints = calculateFantasyPoints(qb.stats);
  assert.equal(compare(data).leaders.cowboys.player.id, qb.id);
});

test("all tied leaders are exposed with stable identity ordering", () => {
  const data = fixture();
  const wr = data.players.find((player) => player.team === "DAL" && player.position === "WR");
  const qb = data.players.find((player) => player.team === "DAL" && player.position === "QB");
  qb.stats = { ...wr.stats };
  qb.projectedPoints = wr.projectedPoints;
  const result = compare(data);
  assert.equal(result.leaders.cowboys.tiedPlayers.length, 2);
  data.players.reverse();
  assert.equal(compare(data).leaders.cowboys.player.id, result.leaders.cowboys.player.id);
});

test("full scoring includes turnovers and never substitutes missing inputs with zero", () => {
  const stats = { passingYards: 250, passingTouchdowns: 2, passingInterceptions: 1,
    rushingYards: 20, rushingTouchdowns: 1, receivingYards: 10, receivingTouchdowns: 0,
    receptions: 2, fumblesLost: 1, twoPointConversions: 1 };
  assert.equal(calculateFantasyPoints(stats), 27);
  delete stats.receptions;
  assert.equal(calculateFantasyPoints(stats), null);
  assert.equal(calculateFantasyPoints(null), null);
});

test("truncation, team coverage and missing position scope cannot produce a team leader", () => {
  for (const mutate of [
    (data) => { data.coverage.truncated = true; },
    (data) => { data.coverage.complete = false; },
    (data) => { data.coverage.teamPlayerCounts.DAL = 5; },
    (data) => { data.coverage.positions = ["RB", "WR", "TE"]; },
    (data) => { data.players.pop(); },
  ]) {
    const data = fixture(); mutate(data);
    const result = compare(data);
    assert.equal(result.status, "unavailable");
    assert.equal(result.leaders, null);
    assert.ok(hasReason(result, "incomplete_coverage"));
  }
});

test("schema, scoring and player-context violations fail closed", () => {
  const cases = [
    ["invalid_schema", (data) => { data.schemaVersion = "unknown"; }],
    ["scoring_mismatch", (data) => { data.scoringId = "half-ppr"; }],
    ["scoring_mismatch", (data) => { data.players[0].scoringId = "six-point-qb"; }],
    ["context_mismatch", (data) => { data.week = 9; }],
    ["player_context_mismatch", (data) => { data.players[0].week = 9; }],
    ["missing_stats", (data) => { delete data.players[0].stats.receptions; }],
    ["missing_stats", (data) => { data.players[0].stats.receptions = NaN; }],
    ["invalid_player", (data) => { data.players[0].position = "K"; }],
    ["invalid_player", (data) => { data.players[0].projectedPoints = Infinity; }],
    ["duplicate_player", (data) => { data.players[1].id = data.players[0].id; }],
    ["projection_conflict", (data) => { data.players[0].projectedPoints += 1; }],
  ];
  for (const [code, mutate] of cases) {
    const data = fixture(); mutate(data);
    const result = compare(data);
    assert.equal(result.leaders, null, code);
    assert.ok(hasReason(result, code), code);
  }
});

test("unverified, wrong-opponent, bye and started contexts do not reuse a previous comparison", () => {
  const data = fixture();
  for (const [overrides, code] of [
    [{ verified: false }, "unverified_context"],
    [{ opponentTeam: "PHI" }, "context_mismatch"],
    [{ bye: true }, "bye_week"],
    [{ kickoffAt: null }, "unknown_kickoff"],
  ]) {
    assert.equal(compare(data, overrides).status, "unavailable");
    assert.ok(hasReason(compare(data, overrides), code));
  }
  assert.ok(hasReason(compare(data, {}, Date.parse(context.kickoffAt)), "game_started"));
});

test("source expiry, freshness ceiling and conflicting timestamps trigger abstention", () => {
  const data = fixture();
  assert.ok(hasReason(compare(data, {}, now + FANTASY_POLICY.maxAgeMs), "stale_snapshot"));
  data.source.expiresAt = new Date(now + 7 * FANTASY_POLICY.maxAgeMs).toISOString();
  assert.ok(hasReason(compare(data, {}, now + FANTASY_POLICY.maxAgeMs + 1), "stale_snapshot"));
  data.source.updatedAt = new Date(now + 1).toISOString();
  assert.ok(hasReason(compare(data), "conflicting_timestamps"));
  data.source.updatedAt = "missing";
  assert.ok(hasReason(compare(data), "invalid_source"));
});

test("calling a fixture licensed cannot bypass the public display-rights boundary", () => {
  const data = fixture();
  data.mode = "licensed";
  assert.ok(hasReason(compare(data), "license_unverified"));
  assert.equal(FANTASY_POLICY.licensedAdapterEnabled, false);
});

test("structured explanations reject numerical tampering, invented text and false live labeling", () => {
  const result = compare(fixture());
  const claims = [result.leaders.cowboys.player, result.leaders.opponent.player].map((player) => ({
    type: "leader", playerId: player.id, points: player.projectedPoints, mode: result.status,
  }));
  claims.push({ type: "difference", points: result.pointsDifference, mode: result.status });
  assert.equal(validateFantasyExplanation(claims, result).passed, true);
  const changed = structuredClone(claims); changed[0].points += 1;
  assert.equal(validateFantasyExplanation(changed, result).passed, false);
  const invented = structuredClone(claims); invented[0].explanation = "Guaranteed touchdown";
  assert.equal(validateFantasyExplanation(invented, result).passed, false);
  const falseLive = structuredClone(claims); falseLive[0].mode = "ready_live";
  assert.equal(validateFantasyExplanation(falseLive, result).passed, false);
  const unavailable = compare(null);
  assert.equal(validateFantasyExplanation([{ type: "abstention" }], unavailable).passed, true);
  assert.equal(validateFantasyExplanation(claims, unavailable).passed, false);
});

test("participation facts remain attributed, scoped, non-medical and time limited", () => {
  const impact = fantasyImpactForContext(context, now);
  assert.equal(impact.status, "current");
  assert.equal(impact.cards.length, 2);
  assert.ok(impact.cards.every((card) => card.sourceUrl.startsWith("https://www.dallascowboys.com/")
    && card.publishedAt === null && card.dateNote && card.interpretation && card.uncertainty));
  assert.doesNotMatch(JSON.stringify(impact.cards), /hamstring|ribs|shoulder|surgery|diagnosis/i);
  assert.equal(fantasyImpactForContext({ ...context, week: 9 }, now).cards.length, 0);
  assert.equal(fantasyImpactForContext({ ...context, verified: false }, now).cards.length, 0);
  assert.equal(fantasyImpactForContext(context, Date.parse(impact.expiresAt)).cards.length, 0);
  assert.equal(fantasyImpactForContext(context, Date.parse(impact.checkedAt) - 1).cards.length, 0);
});
