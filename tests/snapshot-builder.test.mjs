import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { advanceRatingsSeason, calculateForecast, DEFAULT_CONTROLS, eloWinProbability, MODEL_PARAMETERS, MODEL_VERSION } from "../lib/forecast.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const gameHeader = "season,game_type,home_score,away_score,gameday,game_id,home_team,away_team,home_moneyline,away_moneyline,week,location,spread_line,total_line,stadium,gametime";
const initialGame = "2025,REG,24,17,2025-09-07,2025_01_NYG_DAL,DAL,NYG,-120,110,1,Neutral,2.5,44.5,Test Stadium,12:00";
const week1 = "2026,REG,21,20,2026-09-13,2026_01_DAL_NYG,NYG,DAL,-110,100,1,Home,1.5,43.5,Test Stadium,19:20";
const week2 = "2026,REG,,,2026-09-20,2026_02_NYG_DAL,DAL,NYG,-110,100,2,Home,1.5,43.5,Test Stadium,19:20";
const rosterHeader = "season,week,game_type,status,team,full_name,position,gsis_id,jersey_number,years_exp";
const currentPlayer = "2026,1,REG,ACT,DAL,Dak Prescott,QB,fixture,4,10";
const statsFields = ["passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds", "def_sacks", "def_qb_hits", "def_interceptions", "def_pass_defended", "fg_made", "fg_att"];
const stats = `season,season_type,player_id,player_display_name,position,fantasy_points_ppr,${statsFields.join(",")}\n2025,REG,fixture,Dak Prescott,QB,100,${statsFields.map((field) => field === "passing_yards" ? "1000" : "0").join(",")}\n`;

async function fixture(context, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "road-to-six-snapshot-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const games = `${gameHeader}\n${overrides.games ?? [initialGame, week1, week2].join("\n")}\n`;
  const roster = `${rosterHeader}\n${overrides.roster ?? currentPlayer}\n`;
  await Promise.all([writeFile(join(directory, "games.csv"), games), writeFile(join(directory, "roster.csv"), roster), writeFile(join(directory, "stats.csv"), overrides.stats ?? stats)]);
  const args = ["scripts/build-nfl-snapshot.mjs", `--games=${join(directory, "games.csv")}`, `--roster=${join(directory, "roster.csv")}`, `--stats=${join(directory, "stats.csv")}`, `--output=${join(directory, "snapshot.json")}`, `--as-of=${overrides.asOf ?? "2026-09-07"}`, "--season=2026"];
  const run = () => spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  return { directory, games, roster, args, run, read: async () => JSON.parse(await readFile(join(directory, "snapshot.json"), "utf8")) };
}

test("snapshot builder requires an explicit source validation date", () => {
  const result = spawnSync(process.execPath, ["scripts/build-nfl-snapshot.mjs"], { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--as-of=YYYY-MM-DD/);
});

test("preseason snapshot excludes future outcomes and regresses ratings exactly once", async (context) => {
  const f = await fixture(context);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const snapshot = await f.read();
  const change = MODEL_PARAMETERS.eloK * Math.log(8) * 0.5;
  assert.equal(snapshot.ratings.DAL, 1500 + change * MODEL_PARAMETERS.preseasonRetention);
  assert.equal(snapshot.ratingsMetadata.season, 2026);
  assert.equal(snapshot.ratingsMetadata.lastCompletedSeason, 2025);
  assert.equal(snapshot.backtest.seasons, "2025 holdout");
  assert.equal(snapshot.backtest.games, 1);
  assert.equal(snapshot.schedule.length, 2);
  assert.equal(snapshot.schedule[0].status, "scheduled");
  assert.equal(snapshot.schedule[0].cowboysScore, null);
  const evaluation = JSON.parse(await readFile(join(f.directory, "model-evaluation.json"), "utf8"));
  assert.equal(evaluation.records[0].footballProbability, 0.5);
});

test("first current-season result updates regressed ratings without a second regression", async (context) => {
  const f = await fixture(context, { asOf: "2026-09-14" });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const snapshot = await f.read();
  const change = MODEL_PARAMETERS.eloK * Math.log(8) * 0.5;
  const preseason = advanceRatingsSeason({ DAL: 1500 + change, NYG: 1500 - change }, 2025, 2026);
  const homeProbability = eloWinProbability(preseason.NYG, preseason.DAL, "home");
  const delta = MODEL_PARAMETERS.eloK * (1 - homeProbability);
  assert.equal(snapshot.ratings.DAL, preseason.DAL - delta);
  assert.equal(snapshot.ratingsMetadata.lastCompletedSeason, 2026);
  assert.equal(snapshot.backtest.seasons, "2025 holdout");
  assert.equal(snapshot.backtest.games, 1);
  assert.equal(snapshot.schedule[0].status, "final");
  assert.equal(snapshot.schedule[0].cowboysScore, 20);
  assert.equal(snapshot.schedule[0].opponentScore, 21);
  const evaluation = JSON.parse(await readFile(join(f.directory, "model-evaluation.json"), "utf8"));
  assert.deepEqual(evaluation.records.map((row) => row.season), [2025]);
});

test("roster selection excludes other seasons and future weeks and deduplicates identical records", async (context) => {
  const f = await fixture(context, { roster: [currentPlayer, currentPlayer, "2025,1,REG,ACT,NYG,Dak Prescott,QB,fixture,4,9", "2026,2,REG,RES,DAL,Dak Prescott,QB,fixture,4,10"].join("\n") });
  assert.equal(f.run().status, 0);
  const snapshot = await f.read();
  assert.equal(snapshot.players.length, 1);
  assert.equal(snapshot.manifest.coverage.rosterWeek, 1);
  assert.equal(snapshot.manifest.coverage.duplicateRosterRowsRemoved, 1);
  assert.equal(snapshot.players[0].stats.passingYards, 1000);
});

test("latest eligible roster week replaces prior active status and does not revive old rows", async (context) => {
  const f = await fixture(context, { asOf: "2026-09-21", roster: [currentPlayer, "2026,2,REG,RES,DAL,Dak Prescott,QB,fixture,4,10"].join("\n") });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const snapshot = await f.read();
  assert.equal(snapshot.manifest.coverage.rosterWeek, 2);
  assert.equal(snapshot.players.length, 0);
  assert.equal(snapshot.manifest.validationStatus, "partial");
});

test("conflicting stable-ID roster records fail closed", async (context) => {
  const f = await fixture(context, { roster: [currentPlayer, currentPlayer.replace(",DAL,", ",NYG,")].join("\n") });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Conflicting roster records/);
});

test("source checksums and evaluation artifact are reproducible and incomplete metadata is explicit", async (context) => {
  const f = await fixture(context);
  assert.equal(f.run().status, 0);
  const first = await readFile(join(f.directory, "snapshot.json"), "utf8");
  assert.equal(f.run().status, 0);
  assert.equal(await readFile(join(f.directory, "snapshot.json"), "utf8"), first);
  const snapshot = JSON.parse(first);
  assert.equal(snapshot.manifest.inputs.games.sha256, createHash("sha256").update(f.games).digest("hex"));
  assert.equal(snapshot.manifest.inputs.games.metadataStatus, "not_provided");
  assert.equal(snapshot.schedule[0].sourceUpdatedAt, null);
  assert.equal(snapshot.schedule[0].validatedAt, "2026-09-07");
  const evaluation = await readFile(join(f.directory, "model-evaluation.json"), "utf8");
  assert.equal(snapshot.backtest.evaluationSha256, createHash("sha256").update(evaluation).digest("hex"));
});

test("missing markets retain explicit eligible counts and null metrics rather than invalid scores", async (context) => {
  const f = await fixture(context, { games: [initialGame.replace(",-120,110,", ",,,"), week2].join("\n") });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const snapshot = await f.read();
  assert.equal(snapshot.backtest.marketEligibleGames, 0);
  assert.equal(snapshot.backtest.missingMarketGames, 1);
  assert.equal(snapshot.backtest.marketAwareBrier, null);
  assert.equal(snapshot.backtest.marketAwareCalibrationError, null);
});

test("every checked-in holdout row matches the production scorer at default controls", async () => {
  const evaluation = JSON.parse(await readFile(new URL("../app/data/model-evaluation.json", import.meta.url), "utf8"));
  assert.equal(evaluation.modelVersion, MODEL_VERSION);
  for (const row of evaluation.records) {
    const forecast = calculateForecast({ game: { opponent: "OPP", opponentName: "Opponent", venue: row.venue, cowboysMoneyline: row.homeMoneyline, opponentMoneyline: row.awayMoneyline }, ratings: { DAL: row.homeRating, OPP: row.awayRating }, controls: DEFAULT_CONTROLS });
    assert.equal(forecast.footballOnly, row.footballProbability, row.gameId);
    if (row.marketProbability !== null) assert.equal(forecast.probability, row.blendedProbability, row.gameId);
  }
});

test("malformed source numbers fail rather than silently becoming missing coverage", async (context) => {
  const f = await fixture(context, { games: [initialGame.replace(",-120,110,", ",invalid,110,"), week2].join("\n") });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid numeric source value/);
});

test("builder rejects raw inputs that differ from the declared source checksum", async (context) => {
  const f = await fixture(context);
  const metadataPath = join(f.directory, "metadata.json");
  await writeFile(metadataPath, JSON.stringify({ validatedAt: "2026-09-07", inputs: { games: { expectedSha256: "0".repeat(64) } } }));
  f.args.push(`--source-metadata=${metadataPath}`);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source checksum mismatch/);
});

test("checked-in data validation recomputes claims and rejects tampered metrics", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "road-to-six-data-validation-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const good = spawnSync(process.execPath, ["scripts/validate-nfl-snapshot.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(good.status, 0, good.stderr);
  const snapshot = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
  snapshot.backtest.marketAwareBrier = 0.01;
  const path = join(directory, "snapshot.json");
  await writeFile(path, JSON.stringify(snapshot));
  const bad = spawnSync(process.execPath, ["scripts/validate-nfl-snapshot.mjs", `--snapshot=${path}`], { cwd: root, encoding: "utf8" });
  assert.notEqual(bad.status, 0);
});


test("missing required source statistic columns fail instead of fabricating zeros", async (context) => {
  const f = await fixture(context, { stats: stats.replace("passing_yards", "renamed_passing_yards") });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stats: missing records or required columns/);
});
