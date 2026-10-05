import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateForecast, DEFAULT_CONTROLS, MODEL_VERSION, MODEL_PARAMETERS } from "../lib/forecast.mjs";
import { footballSnapshotFreshness } from "../lib/source-freshness.mjs";
import { cowboysSeasonState, kickoffTimestamp } from "../lib/season-state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const snapshot = await readJson(resolve(root, args.snapshot ?? "app/data/nfl-snapshot.json"));
const sourceMetadata = await readJson(resolve(root, args["source-metadata"] ?? "app/data/source-manifest.json"));
const evaluationText = await readFile(resolve(root, args.evaluation ?? "app/data/model-evaluation.json"), "utf8");
const evaluation = JSON.parse(evaluationText);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const finite = (value, label) => assert.ok(typeof value === "number" && Number.isFinite(value), `${label} must be finite`);
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label} must be unique`);
const probability = (value, label) => { finite(value, label); assert.ok(value >= 0 && value <= 1, `${label} must be bounded`); };
const date = (value, label) => assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, `${label} must be a date`);
const equalNumber = (actual, expected, label) => { finite(actual, label); assert.ok(Math.abs(actual - expected) < 1e-12, `${label} differs from recomputation`); };

date(snapshot.asOf, "asOf");
assert.equal(snapshot.asOf, sourceMetadata.validatedAt);
assert.equal(snapshot.manifest.validatedAt, snapshot.asOf);
assert.equal(snapshot.manifest.validationStatus, "passed", "A partial data snapshot requires owner review before release");
assert.deepEqual(snapshot.manifest.limitations, []);
const freshness = footballSnapshotFreshness(snapshot);
assert.equal(freshness.status, "current", freshness.message);
for (const key of ["games", "roster", "stats"]) {
  const source = snapshot.manifest.inputs[key];
  const expected = sourceMetadata.inputs[key];
  assert.equal(source.metadataStatus, "verified");
  assert.match(source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(source.sha256, expected.expectedSha256, `${key} checksum differs from approved source manifest`);
  for (const field of Object.keys(expected)) assert.deepEqual(source[field], expected[field], `${key}.${field} metadata mismatch`);
  assert.ok(Number.isInteger(source.rows) && source.rows > 0);
  assert.ok(Number.isInteger(source.bytes) && source.bytes > 0);
  assert.ok(Number.isFinite(Date.parse(source.sourceUpdatedAt)));
  assert.ok(Date.parse(source.retrievedBetween.start) <= Date.parse(source.retrievedBetween.end));
  assert.ok(Date.parse(source.sourceUpdatedAt) <= Date.parse(source.retrievedBetween.end));
  assert.ok(source.retrievedBetween.end.slice(0, 10) <= snapshot.asOf);
  if (args[key]) assert.equal(hash(await readFile(args[key])), source.sha256, `${key} raw input checksum mismatch`);
}
assert.equal(snapshot.dataVersion, `nflverse-${snapshot.asOf}-${hash(JSON.stringify({ inputs: snapshot.manifest.inputs, seasonVerification: sourceMetadata.seasonVerification ?? null })).slice(0, 12)}`);
const coverage = snapshot.manifest.coverage;
assert.equal(snapshot.schedule.length, coverage.expectedRegularSeasonGames);
assert.equal(coverage.scheduleGames, snapshot.schedule.length);
unique(snapshot.schedule.map((game) => game.id), "Schedule IDs");
for (const game of snapshot.schedule) {
  date(game.date, "Game date");
  assert.ok(Number.isInteger(game.week) && game.week >= 1 && game.week <= 18);
  assert.ok(["home", "away", "neutral"].includes(game.venue));
  assert.equal(game.sourceUpdatedAt, snapshot.manifest.inputs.games.sourceUpdatedAt);
  assert.equal(game.validatedAt, snapshot.asOf);
  assert.equal(game.sourceRecordId, game.id);
  for (const field of ["cowboysMoneyline", "opponentMoneyline", "cowboysSpread", "totalLine"]) {
    if (game[field] !== null) finite(game[field], field);
  }
  for (const field of ["cowboysMoneyline", "opponentMoneyline"]) assert.ok(game[field] === null || (Math.abs(game[field]) >= 100 && Math.abs(game[field]) <= 10_000), "Invalid American moneyline");
  assert.ok(game.totalLine === null || game.totalLine > 0);
  assert.ok(snapshot.opponents[game.opponent], "Missing scheduled opponent evidence");
  assert.ok(["final", "scheduled"].includes(game.status));
  if (game.status === "final") {
    for (const score of [game.cowboysScore, game.opponentScore]) assert.ok(Number.isInteger(score) && score >= 0, "Final scores must be nonnegative integers");
    assert.ok(game.date <= snapshot.asOf, "Future game cannot be final");
  } else {
    assert.equal(game.cowboysScore, null);
    assert.equal(game.opponentScore, null);
  }
}
const verified = sourceMetadata.seasonVerification;
assert.ok(verified && Number.isFinite(Date.parse(verified.verifiedAt)), "Official season verification is required");
assert.equal(snapshot.season.verifiedAt, verified.verifiedAt);
assert.deepEqual(snapshot.season.primarySources, verified.sources);
assert.ok(verified.sources.includes("https://www.dallascowboys.com/schedule/"));
const seasonState = cowboysSeasonState(snapshot, Date.parse(verified.verifiedAt));
assert.deepEqual(seasonState.record, verified.record, "Record differs from official verification");
assert.deepEqual(seasonState.completed.map(({ week, cowboysScore, opponentScore }) => ({ week, cowboysScore, opponentScore })), verified.completedResults);
assert.deepEqual(snapshot.season.byeWeeks, verified.byeWeeks);
assert.deepEqual(seasonState.nextGame ? { week: seasonState.nextGame.week, opponent: seasonState.nextGame.opponent, kickoffAt: seasonState.nextGame.kickoffAt } : null, verified.nextGame);
for (const game of snapshot.schedule) assert.equal(game.kickoffAt,
  verified.unconfirmedKickoffWeeks.includes(game.week) ? null : kickoffTimestamp(game.date, game.time));
assert.ok(cowboysSeasonState(snapshot).current, "Season verification expired or a started game needs a verified result");
assert.equal(snapshot.players.length, coverage.expectedFeaturedPlayers);
assert.equal(coverage.featuredPlayers, snapshot.players.length);
assert.deepEqual(coverage.missingFeaturedPlayers, []);
unique(snapshot.players.map((player) => player.id), "Featured player IDs");
for (const player of snapshot.players) {
  if (player.stats) for (const [field, value] of Object.entries(player.stats)) finite(value, field);
}
const opponentTeams = new Set(snapshot.schedule.map((game) => game.opponent));
assert.equal(coverage.opponentTeams, opponentTeams.size);
assert.equal(Object.keys(snapshot.opponents).length, opponentTeams.size);
assert.equal(coverage.opponentLeaders, opponentTeams.size * 4);
assert.deepEqual(coverage.missingOpponentLeaders, []);
for (const opponent of Object.values(snapshot.opponents)) {
  assert.equal(opponent.leaders.length, 4);
  unique(opponent.leaders.map((leader) => leader.id), "Opponent leader IDs");
  opponent.leaders.forEach((leader) => finite(leader.fantasyPointsPpr, "PPR"));
}
assert.ok(coverage.rosterWeek <= coverage.latestStartedWeek);
assert.equal(coverage.rosterWeek, coverage.latestStartedWeek, "Roster has not reached the latest started week");
for (const rating of Object.values(snapshot.ratings)) finite(rating, "Rating");
assert.equal(snapshot.ratingsMetadata.modelVersion, MODEL_VERSION);
assert.equal(snapshot.ratingsMetadata.season, snapshot.ratingsMetadata.preseasonRegressionAppliedThrough);
date(snapshot.ratingsMetadata.trainedThrough, "Ratings cutoff");
assert.ok(snapshot.ratingsMetadata.trainedThrough <= snapshot.asOf);
assert.equal(evaluation.modelVersion, MODEL_VERSION);
assert.equal(snapshot.backtest.modelVersion, MODEL_VERSION);
assert.deepEqual(evaluation.modelParameters, MODEL_PARAMETERS);
assert.equal(evaluation.asOf, snapshot.asOf);
assert.equal(evaluation.sourceSha256, snapshot.manifest.inputs.games.sha256);
assert.equal(snapshot.backtest.evaluationSha256, hash(evaluationText));
assert.equal(evaluation.records.length, snapshot.backtest.games);
unique(evaluation.records.map((record) => record.gameId), "Evaluation game IDs");
for (const row of evaluation.records) {
  date(row.date, "Evaluation date");
  assert.ok(row.date <= snapshot.asOf, "Future outcome in evaluation");
  finite(row.homeRating, "Home rating"); finite(row.awayRating, "Away rating");
  assert.ok([0, 0.5, 1].includes(row.outcome));
  const forecast = calculateForecast({ game: { opponent: "OPP", opponentName: "Opponent", venue: row.venue, cowboysMoneyline: row.homeMoneyline, opponentMoneyline: row.awayMoneyline }, ratings: { DAL: row.homeRating, OPP: row.awayRating }, controls: DEFAULT_CONTROLS });
  probability(row.footballProbability, "Football probability");
  equalNumber(row.footballProbability, forecast.footballOnly, row.gameId);
  assert.equal(row.marketProbability, forecast.marketImplied);
  if (row.marketProbability === null) assert.equal(row.blendedProbability, null);
  else equalNumber(row.blendedProbability, forecast.probability, row.gameId);
}
const paired = evaluation.records.filter((row) => row.marketProbability !== null);
assert.equal(paired.length, snapshot.backtest.marketEligibleGames);
assert.equal(evaluation.records.length - paired.length, snapshot.backtest.missingMarketGames);
const score = (records, key) => records.length ? Number((records.reduce((sum, row) => sum + (row[key] - row.outcome) ** 2, 0) / records.length).toFixed(3)) : null;
assert.equal(snapshot.backtest.footballOnlyBrier, score(evaluation.records, "footballProbability"));
assert.equal(snapshot.backtest.footballOnlyPairedBrier, score(paired, "footballProbability"));
assert.equal(snapshot.backtest.marketAwareBrier, score(paired, "blendedProbability"));
assert.equal(snapshot.backtest.marketBaselineBrier, score(paired, "marketProbability"));
let calibrationError = 0;
assert.equal(snapshot.backtest.calibrationBins.length, 10);
for (let index = 0; index < 10; index += 1) {
  const rows = paired.filter((row) => Math.min(9, Math.floor(row.blendedProbability * 10)) === index);
  const bin = snapshot.backtest.calibrationBins[index];
  assert.equal(bin.lower, index / 10); assert.equal(bin.upper, (index + 1) / 10);
  assert.equal(bin.count, rows.length);
  if (rows.length) {
    const meanPredicted = rows.reduce((sum, row) => sum + row.blendedProbability, 0) / rows.length;
    const meanOutcome = rows.reduce((sum, row) => sum + row.outcome, 0) / rows.length;
    equalNumber(bin.meanPredicted, meanPredicted, "Calibration prediction");
    equalNumber(bin.meanOutcome, meanOutcome, "Calibration outcome");
    calibrationError += Math.abs(meanPredicted - meanOutcome) * rows.length / paired.length;
  } else { assert.equal(bin.meanPredicted, null); assert.equal(bin.meanOutcome, null); }
}
assert.equal(snapshot.backtest.marketAwareCalibrationError, paired.length ? Number(calibrationError.toFixed(3)) : null);
console.log(`Validated ${snapshot.dataVersion}: ${snapshot.schedule.length} games, ${snapshot.players.length} featured players, ${paired.length} paired backtest rows; model ${MODEL_VERSION}`);
