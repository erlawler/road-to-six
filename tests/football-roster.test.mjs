import assert from "node:assert/strict";
import test from "node:test";
import { latestStartedRosterWeek, selectFootballRoster } from "../lib/football-roster.mjs";

const game = (week, home, away, date = "2026-10-22", time = "20:15") => ({ season: "2026", game_type: "REG", week: String(week), home_team: home, away_team: away, gameday: date, gametime: time });
const row = (week, team, id, status = "ACT") => ({ season: "2026", game_type: "REG", week: String(week), team, gsis_id: id, status, full_name: id, position: "QB", jersey_number: "1", years_exp: "2" });
const games = [game(6, "DAL", "JAX"), game(6, "SF", "HOU"), game(7, "DAL", "SF")];

test("a schedule-confirmed bye retains its latest team roster without marking coverage incomplete", () => {
  const selected = selectFootballRoster([row(6, "JAX", "j"), row(6, "HOU", "h"), row(7, "DAL", "d"), row(7, "SF", "s")], games, 2026, 7, ["DAL", "JAX", "SF", "HOU"]);
  assert.deepEqual(selected.rosterWeeksByTeam, { DAL: 7, JAX: 6, SF: 7, HOU: 6 });
  assert.deepEqual(selected.expectedRosterWeeksByTeam, selected.rosterWeeksByTeam);
  assert.deepEqual(selected.missingTeamWeeks, []);
  assert.equal(selected.rows.length, 4);
});

test("missing rows for a team that played are incomplete instead of silently carrying an old roster", () => {
  const selected = selectFootballRoster([row(6, "DAL", "d"), row(6, "SF", "s"), row(6, "JAX", "j")], games, 2026, 7, ["DAL", "SF", "JAX"]);
  assert.deepEqual(selected.missingTeamWeeks, ["DAL", "SF"]);
});

test("a newer team roster does not revive a player omitted or made inactive", () => {
  const selected = selectFootballRoster([row(6, "DAL", "omitted"), row(6, "DAL", "inactive"), row(7, "DAL", "inactive", "RES")], games, 2026, 7, ["DAL"]);
  assert.deepEqual(selected.rows.map((value) => [value.gsis_id, value.status]), [["inactive", "RES"]]);
});

test("a newer transfer status supersedes the same player's old bye-team row in either input order", () => {
  const rows = [row(6, "JAX", "transfer"), row(7, "DAL", "transfer", "RES")];
  for (const input of [rows, [...rows].reverse()]) {
    const selected = selectFootballRoster(input, games, 2026, 7, ["DAL", "JAX"]);
    assert.deepEqual(selected.rows.map((value) => [value.team, value.status]), [["DAL", "RES"]]);
  }
});

test("conflicting same-week stable IDs fail closed while exact duplicates are counted", () => {
  assert.throws(() => selectFootballRoster([row(7, "DAL", "same"), row(7, "SF", "same")], games, 2026, 7, ["DAL", "SF"]), /Conflicting roster/);
  const selected = selectFootballRoster([row(7, "DAL", "same"), row(7, "DAL", "same")], games, 2026, 7, ["DAL"]);
  assert.equal(selected.duplicateRows, 1);
  assert.equal(selected.rows.length, 1);
});

test("future roster weeks and other seasons cannot satisfy current coverage", () => {
  const selected = selectFootballRoster([row(8, "DAL", "future"), { ...row(7, "DAL", "old"), season: "2025" }], games, 2026, 7, ["DAL"]);
  assert.deepEqual(selected.rows, []);
  assert.deepEqual(selected.missingTeamWeeks, ["DAL"]);
});

test("the started week advances at actual Eastern kickoff, not UTC date midnight", () => {
  const schedule = [game(7, "DAL", "PHI", "2026-10-26"), game(8, "GB", "CAR", "2026-10-29")];
  assert.equal(latestStartedRosterWeek(schedule, 2026, "2026-10-29", "2026-10-29T02:00:00Z"), 7);
  assert.equal(latestStartedRosterWeek(schedule, 2026, "2026-10-30", "2026-10-30T00:14:59Z"), 7);
  assert.equal(latestStartedRosterWeek(schedule, 2026, "2026-10-30", "2026-10-30T00:15:00Z"), 8);
});

test("the kickoff boundary follows the November daylight-saving transition", () => {
  const schedule = [game(8, "DAL", "ARI", "2026-11-01", "13:00")];
  assert.equal(latestStartedRosterWeek(schedule, 2026, "2026-11-01", "2026-11-01T17:59:59Z"), 1);
  assert.equal(latestStartedRosterWeek(schedule, 2026, "2026-11-01", "2026-11-01T18:00:00Z"), 8);
});
