import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCurrentMatchup, getSourceHealth } from "../lib/source-health.mjs";
const snapshot = JSON.parse(readFileSync(new URL("../app/data/nfl-snapshot.json", import.meta.url)));
const now = Date.parse(snapshot.season.verifiedAt) + 1000;
const state = () => ({ snapshot: structuredClone(snapshot), update: { status: "ready", lastAttemptAt: new Date(now - 2000).toISOString(), lastSuccessAt: new Date(now - 1000).toISOString(), reasonCode: null }, freshness: { status: "current", ageDays: 0, message: "Current" } });

test("source health reports latest recorded duration without inventing aggregate metrics", () => {
  const s = state();
  s.snapshot.usage = { schemaVersion: "player-usage-v1", season: snapshot.season.year, source: { reviewedAt: snapshot.season.verifiedAt },
    teams: Object.fromEntries([...new Set(["DAL", ...snapshot.schedule.map((game) => game.opponent)])].map((team) => [team, { complete: true, games: [{}, {}, {}], players: [{}], limitations: [] }])),
    limitations: ["Historical evidence, not a projection."] };
  const h = getSourceHealth(s, now);
  assert.equal(h.status, "current");
  assert.deepEqual(h.coverage.missing, []);
  assert.equal(h.lastSuccessfulDurationMs, 1000);
  assert.deepEqual(h.metrics, { uptime: null, modelAccuracy: null, paidAiLatency: null, paidAiCost: null });
  assert.equal(h.coverage.games, 17);
  assert.equal(h.coverage.opponentLeaders, 56);
  assert.ok(h.trace.every((item) => typeof item.detail === "string"));
  assert.ok(h.limitations.some((item) => item.includes("Wednesday night")));
  delete s.snapshot.usage.teams[snapshot.schedule.find((game) => game.week === getCurrentMatchup(s, now).week).opponent];
  assert.equal(getSourceHealth(s, now).status, "degraded");
  s.update.status = "not_initialized"; s.update.lastSuccessAt = null;
  assert.equal(getSourceHealth(s, now).status, "degraded");
});

test("failed refresh preserves source evidence but blocks current matchup and timing claims", () => {
  const s = state(); s.update.status = "failed"; s.update.reasonCode = "football_refresh_failed";
  assert.equal(getCurrentMatchup(s, now).status, "unavailable");
  const h = getSourceHealth(s, now);
  assert.equal(h.status, "degraded");
  assert.equal(h.lastSuccessfulDurationMs, null);
  assert.equal(h.dataVersion, snapshot.dataVersion);
});

test("missing usage and missing storage stay observable without fake success", () => {
  const s = state(); delete s.snapshot.usage;
  assert.equal(getSourceHealth(s, now).status, "degraded");
  assert.equal(getSourceHealth(s, now).coverage.usageTeams, 0);
  s.update.status = "unavailable"; s.update.lastSuccessAt = null;
  const h = getSourceHealth(s, now);
  assert.equal(h.status, "unavailable"); assert.equal(h.lastSuccessAt, null);
  assert.equal(h.lastSuccessfulDurationMs, null);
});

test("invalid or reverse timestamps never become a successful latency metric", () => {
  const s = state(); s.update.lastAttemptAt = "bad-date";
  assert.equal(getSourceHealth(s, now).lastSuccessfulDurationMs, null);
  s.update.lastAttemptAt = new Date(now + 20_000).toISOString();
  assert.equal(getSourceHealth(s, now).lastSuccessfulDurationMs, null);
});
