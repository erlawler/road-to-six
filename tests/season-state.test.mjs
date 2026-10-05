import assert from "node:assert/strict";
import test from "node:test";
import { cowboysSeasonState, gameProgress, kickoffTimestamp, scenarioContextKey, seasonWeekCalendar } from "../lib/season-state.mjs";

const at = (date) => Date.parse(date);
const game = (week, date, result = null) => ({
  id: `fixture-${week}`, week, date, opponentName: "Fixture opponent", venue: "home",
  kickoffAt: kickoffTimestamp(date, "20:15"), status: result ? "final" : "scheduled",
  cowboysScore: result?.[0] ?? null, opponentScore: result?.[1] ?? null,
});
function fixture(schedule, date = "2026-10-05") {
  const source = { metadataStatus: "verified", sourceUpdatedAt: `${date}T10:00:00Z`, retrievedBetween: { start: `${date}T11:00:00Z`, end: `${date}T11:01:00Z` } };
  return { dataVersion: "fixture-v1", asOf: date, schedule,
    manifest: { validatedAt: date, validationStatus: "passed", inputs: { games: source, roster: source } },
    season: { verifiedAt: `${date}T11:02:00Z`, byeWeeks: [14], weeks: seasonWeekCalendar([
      { week: 4, gameday: "2026-10-01" }, { week: 5, gameday: "2026-10-08" },
      { week: 13, gameday: "2026-12-03" }, { week: 14, gameday: "2026-12-10" }, { week: 15, gameday: "2026-12-17" },
    ]) } };
}

test("actual wins, losses and ties are distinct from unplayed games", () => {
  const data = fixture([game(1, "2026-09-13", [20, 28]), game(2, "2026-09-20", [37, 20]), game(3, "2026-09-27", [14, 14]), game(5, "2026-10-08")]);
  const state = cowboysSeasonState(data, at("2026-10-05T23:00:00Z"));
  assert.deepEqual(state.record, { wins: 1, losses: 1, ties: 1 });
  assert.equal(state.completed.length, 3);
  assert.equal(state.remaining.length, 1);
  assert.equal(state.nextGame.week, 5);
  assert.equal(state.current, true);
  assert.equal(state.status, "upcoming");
});

test("Eastern kickoffs retain the correct instant across daylight saving time", () => {
  assert.equal(kickoffTimestamp("2026-10-08", "20:15"), "2026-10-09T00:15:00.000Z");
  assert.equal(kickoffTimestamp("2026-12-07", "20:15"), "2026-12-08T01:15:00.000Z");
  assert.equal(kickoffTimestamp("2026-12-07", "TBD"), null);
});

test("a started game without verified final scores blocks a current scenario", () => {
  const data = fixture([game(5, "2026-10-08"), game(6, "2026-10-18")]);
  const before = cowboysSeasonState(data, at("2026-10-09T00:14:59Z"));
  const after = cowboysSeasonState(data, at("2026-10-09T00:15:00Z"));
  assert.equal(before.nextGame.week, 5);
  assert.equal(after.pending[0].week, 5);
  assert.equal(after.status, "results_pending");
  assert.equal(after.current, false);
  assert.deepEqual(after.record, { wins: 0, losses: 0, ties: 0 });
  assert.notEqual(scenarioContextKey(data, before), scenarioContextKey(data, after));
});

test("bye week remains explicit while the next matchup is in a later week", () => {
  const data = fixture([game(13, "2026-12-07", [21, 14]), game(15, "2026-12-20")], "2026-12-09");
  const state = cowboysSeasonState(data, at("2026-12-09T15:00:00Z"));
  assert.equal(state.byeWeek, 14);
  assert.equal(state.nextGame.week, 15);
  const nextWeek = cowboysSeasonState(data, at("2026-12-15T15:00:00Z"));
  assert.equal(nextWeek.byeWeek, null);
  assert.notEqual(scenarioContextKey(data, state), scenarioContextKey(data, nextWeek));
});

test("season completion and unconfirmed kickoffs do not fall back to a past forecast", () => {
  const data = fixture([game(18, "2027-01-10", [21, 21])], "2027-01-11");
  const state = cowboysSeasonState(data, at("2027-01-11T15:00:00Z"));
  assert.equal(state.status, "complete");
  assert.equal(state.nextGame, null);
  const unknown = { ...game(18, "2027-01-10"), kickoffAt: null };
  assert.equal(gameProgress(unknown), "time_unconfirmed");
  assert.equal(cowboysSeasonState(fixture([unknown]), at("2026-10-05T23:00:00Z")).status, "schedule_unconfirmed");
});

test("source or verification expiry and a new data version invalidate current context", () => {
  const data = fixture([game(6, "2026-10-18")]);
  const old = cowboysSeasonState(data, at("2026-10-05T23:00:00Z"));
  assert.equal(cowboysSeasonState(data, at("2026-10-13T23:00:00Z")).current, false);
  data.season.verifiedAt = "2026-09-20T11:00:00Z";
  assert.equal(cowboysSeasonState(data, at("2026-10-05T23:00:00Z")).current, false);
  assert.notEqual(scenarioContextKey(data, old), scenarioContextKey({ ...data, dataVersion: "fixture-v2" }, old));
});
