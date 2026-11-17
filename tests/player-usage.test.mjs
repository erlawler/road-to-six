import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildPlayerUsage, calculateUsageScenario, comparePlayerUsage, getPlayerUsage } from "../lib/player-usage.mjs";
import { footballContentHash } from "../lib/football-sources.mjs";

const numericFields = ["carries", "targets", "receptions", "rushing_yards", "receiving_yards", "rushing_tds", "receiving_tds", "passing_yards", "passing_tds", "passing_interceptions", "passing_2pt_conversions", "rushing_2pt_conversions", "receiving_2pt_conversions", "sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost", "special_teams_tds", "fantasy_points", "fantasy_points_ppr"];
const snapshot = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const reference = Date.parse(snapshot.manifest.reviewedAt);
function fixture() {
  const games = [1, 2, 4].map((week) => ({ season: "2026", game_type: "REG", home_score: "20", away_score: "14", gameday: `2026-09-${String(week * 7).padStart(2, "0")}`, game_id: `2026_${week}_NYG_DAL`, home_team: "DAL", away_team: "NYG", week: String(week) }));
  const weeklyRows = games.flatMap((game) => [
    { player_id: "b", player_display_name: "Back", position: "RB", carries: 10, rushing_yards: 50, targets: 5, receptions: 4, receiving_yards: 40 },
    { player_id: "a", player_display_name: "Receiver", position: "WR", targets: 10, receptions: 8, receiving_yards: 50 },
    { player_id: "x", player_display_name: "Fullback", position: "FB", targets: 5, receptions: 1, receiving_yards: 0 },
  ].map((p) => {
    const r = { ...Object.fromEntries(numericFields.map((f) => [f, 0])), ...p, season: "2026", season_type: "REG", week: game.week, game_id: game.game_id, team: "DAL" };
    r.fantasy_points = r.rushing_yards / 10 + r.receiving_yards / 10;
    r.fantasy_points_ppr = r.fantasy_points + r.receptions;
    return r;
  }));
  const seasonRows = ["a", "b", "x"].map((id) => ({ season: "2026", season_type: "REG", player_id: id, ...Object.fromEntries(numericFields.map((f) => [f, weeklyRows.filter((r) => r.player_id === id).reduce((n, r) => n + r[f], 0)])) }));
  return { games, weeklyRows, seasonRows, activeRoster: [
    { gsis_id: "b", full_name: "Back", team: "DAL", position: "RB" },
    { gsis_id: "a", full_name: "Receiver", team: "DAL", position: "WR" },
    { gsis_id: "idle", full_name: "No recorded line", team: "DAL", position: "TE" },
    { gsis_id: "x", full_name: "Fullback", team: "DAL", position: "FB" },
  ], teams: ["DAL"], season: 2026, source: { url: "https://example.test/stats.csv", sourceUpdatedAt: "2026-09-29T10:00:00Z", sha256: "a".repeat(64) }, reviewedAt: "2026-09-29T12:00:00Z" };
}
const build = (input = fixture()) => buildPlayerUsage(input).teams.DAL;

test("last three team games skip a bye, include every eligible active candidate, and retain stable ties", () => {
  const team = build();
  assert.equal(team.complete, true);
  assert.deepEqual(team.weeks, [1, 2, 4]);
  assert.deepEqual(team.leaders.map((p) => p.id), ["a", "b"]);
  assert.deepEqual(team.players.map((p) => p.id), ["a", "b", "idle"]);
  assert.equal(team.teamTargets, 60, "FB targets belong in team denominator");
  assert.equal(team.players.find((p) => p.id === "b").targetShare, 0.25);
  assert.equal(team.players.find((p) => p.id === "idle").recordedGames, 0);
  assert.ok(team.players.find((p) => p.id === "idle").weekly.every((w) => !w.recorded && w.ppr === 0));
});

test("former-team production reconciles but never enters current-team usage or leader selection", () => {
  const f = fixture();
  const old = { ...f.weeklyRows[0], team: "NYG", player_id: "b", game_id: "2026_3_ARI_NYG", week: "3", fantasy_points: 100, fantasy_points_ppr: 104, rushing_yards: 1000, receiving_yards: 0 };
  f.games.push({ ...f.games[0], game_id: old.game_id, week: "3", gameday: "2026-09-21", home_team: "NYG", away_team: "ARI" });
  f.weeklyRows.push(old);
  const season = f.seasonRows.find((r) => r.player_id === "b");
  for (const field of numericFields) season[field] += old[field];
  const team = build(f);
  assert.equal(team.players.find((p) => p.id === "b").totalPpr, 39);
  assert.deepEqual(team.weeks, [1, 2, 4]);
});

test("partial weekly input is rejected even when the missing row belongs to an ineligible player", () => {
  for (const id of ["a", "x"]) {
    const f = fixture();
    f.weeklyRows.splice(f.weeklyRows.findIndex((r) => r.player_id === id), 1);
    assert.throws(() => build(f), /incomplete season reconciliation/);
  }
});

test("missing game, duplicate, nonfinite, negative count, and scoring conflicts fail closed", () => {
  const mutations = [
    (f) => f.weeklyRows.push({ ...f.weeklyRows[0] }),
    (f) => { f.weeklyRows[0].game_id = "unknown"; },
    (f) => { f.weeklyRows[0].team = "ARI"; },
    (f) => { f.weeklyRows[0].carries = -1; },
    (f) => { f.weeklyRows[0].targets = NaN; },
    (f) => { f.weeklyRows[0].fantasy_points_ppr += 1; },
    (f) => { delete f.weeklyRows[0].receiving_tds; },
    (f) => { f.weeklyRows[0].player_id = ""; },
    (f) => f.seasonRows.push({ ...f.seasonRows[0] }),
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => build(f)); }
});

test("fewer than three completed games is explicit insufficient history", () => {
  const f = fixture();
  f.games = f.games.slice(0, 2);
  f.weeklyRows = f.weeklyRows.filter((r) => r.week !== "4");
  for (const row of f.seasonRows) for (const field of numericFields) row[field] *= 2 / 3;
  const team = build(f);
  assert.equal(team.complete, false);
  assert.match(team.limitations.join(" "), /Three completed team games/);
  assert.equal(calculateUsageScenario(team.players[0], team, team.players[0].scenarioBaseline).status, "unavailable");
});

test("recent trends compare the latest game with preceding team games", () => {
  const f = fixture();
  const row = f.weeklyRows.find((r) => r.player_id === "b" && r.week === "4");
  row.carries += 4;
  f.seasonRows.find((r) => r.player_id === "b").carries += 4;
  assert.equal(build(f).players.find((p) => p.id === "b").trend.carries, 4);
});

test("scenario reset exactly reproduces historical scoring in all supported formats", () => {
  const team = build(), player = team.players.find((p) => p.id === "b");
  for (const [scoring, points] of [["ppr", 13], ["half-ppr", 11], ["standard", 9]]) {
    const result = calculateUsageScenario(player, team, { ...player.scenarioBaseline, scoring });
    assert.equal(result.status, "available");
    assert.equal(result.scenarioPoints, points);
    assert.equal(result.baselinePoints, points);
    assert.equal(result.delta, 0);
  }
  assert.equal(calculateUsageScenario(player, team, { carries: 20, targetShare: 0.5, scoring: "ppr" }).scenarioPoints, 26);
  assert.equal(calculateUsageScenario(player, team, player.scenarioBaseline).scenarioPoints, 13);
});

test("scenario rejects out-of-range, absent, unobserved role and nonfinite inputs", () => {
  const team = build(), player = team.players.find((p) => p.id === "b");
  const bad = [{ carries: -1 }, { carries: 41 }, { carries: NaN }, { targetShare: -0.1 }, { targetShare: 1.1 }, { targetShare: Infinity }, { scoring: "unknown" }];
  for (const override of bad) assert.equal(calculateUsageScenario(player, team, { ...player.scenarioBaseline, ...override }).status, "unavailable");
  assert.equal(calculateUsageScenario(null, team, player.scenarioBaseline).status, "unavailable");
  const receiver = team.players.find((p) => p.id === "a");
  assert.equal(calculateUsageScenario(receiver, team, { ...receiver.scenarioBaseline, carries: 1 }).status, "unavailable");
  assert.equal(calculateUsageScenario(receiver, team, receiver.scenarioBaseline).status, "available");
  assert.equal(calculateUsageScenario(team.players.find((p) => p.id === "idle"), team, { carries: 0, targetShare: 0.1, scoring: "ppr" }).status, "unavailable");
});

test("touchdowns, two-point conversions and fumbles remain in historical efficiency; passing stays constant", () => {
  const f = fixture(), row = f.weeklyRows[0];
  Object.assign(row, { rushing_tds: 1, receiving_tds: 1, rushing_2pt_conversions: 1, receiving_2pt_conversions: 1, rushing_fumbles_lost: 1, receiving_fumbles_lost: 1, passing_yards: 200, passing_tds: 2, passing_interceptions: 1, passing_2pt_conversions: 1, sack_fumbles_lost: 1, special_teams_tds: 1, fantasy_points: 41, fantasy_points_ppr: 45 });
  for (const field of numericFields) f.seasonRows.find((r) => r.player_id === "b")[field] = f.weeklyRows.filter((r) => r.player_id === "b").reduce((n, r) => n + r[field], 0);
  const team = build(f), player = team.players.find((p) => p.id === "b");
  assert.equal(player.efficiency.rushStandardPerCarry, 0.7);
  assert.equal(player.efficiency.receiveStandardPerTarget, 1.2);
  const result = calculateUsageScenario(player, team, { ...player.scenarioBaseline, carries: 0, targetShare: 0 });
  assert.equal(result.scenarioPoints, 6.67);
  assert.equal(result.components.other, 6.6667);
  assert.match(result.limitations.join(" "), /Passing.*remain/);
});

test("bundled real evidence permits only the verified current matchup and clean abstention", () => {
  const comparison = comparePlayerUsage(snapshot, reference);
  assert.equal(comparison.status, "available", comparison.reasons.join(" "));
  assert.deepEqual(comparison.teams.map((t) => t.team), ["DAL", comparison.matchup.opponent]);
  for (const team of comparison.teams) {
    assert.equal(team.games.length, 3);
    assert.ok(team.leaders.every((p) => p.totalPpr === Math.max(...team.players.map((q) => q.totalPpr))));
  }
  assert.equal(getPlayerUsage(snapshot, "KC", reference).status, "unavailable");
  const missing = structuredClone(snapshot); delete missing.usage;
  assert.equal(comparePlayerUsage(missing, reference).status, "unavailable");
  const partial = structuredClone(snapshot); partial.usage.teams.DAL.complete = false;
  assert.equal(comparePlayerUsage(partial, reference).teams.length, 0);
  const bye = structuredClone(snapshot); bye.season.byeWeeks.push(comparison.matchup.week);
  assert.match(comparePlayerUsage(bye, reference).reasons.join(" "), /bye/);
  assert.equal(comparePlayerUsage(snapshot, reference + 8 * 86400000).status, "unavailable");
  const invalidDate = structuredClone(snapshot); invalidDate.usage.source.updatedAt = "invalid";
  assert.equal(comparePlayerUsage(invalidDate, reference).status, "unavailable");
});

test("all real players reset without rounding drift across scoring formats", () => {
  for (const team of comparePlayerUsage(snapshot, reference).teams) for (const player of team.players) {
    for (const scoring of ["ppr", "half-ppr", "standard"]) {
      const result = calculateUsageScenario(player, team, { ...player.scenarioBaseline, scoring });
      if (!player.recordedGames) { assert.equal(result.status, "unavailable"); continue; }
      assert.equal(result.status, "available", `${player.name}: ${result.reasons.join(" ")}`);
      assert.equal(result.delta, 0, player.name);
      assert.equal(result.scenarioPoints, result.baselinePoints, player.name);
    }
  }
});

test("review-only metadata does not create a false material football change", async () => {
  const same = structuredClone(snapshot);
  same.usage.source.reviewedAt = "2026-10-29T23:00:00Z";
  assert.equal(await footballContentHash(snapshot), await footballContentHash(same));
  same.usage.teams.DAL.players[0].totalPpr += 1;
  assert.notEqual(await footballContentHash(snapshot), await footballContentHash(same));
});
