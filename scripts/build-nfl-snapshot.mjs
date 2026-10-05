import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { MODEL_VERSION, MODEL_PARAMETERS, advanceRatingsSeason, calculateProbabilities, eloWinProbability, removeVig } from "../lib/forecast.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);

const gamesPath = args.games ?? "/tmp/road-to-six-games.csv";
const rosterPath = args.roster ?? "/tmp/road-to-six-roster.csv";
const statsPath = args.stats ?? "/tmp/road-to-six-player-stats-2025.csv";
const outputPath = resolve(root, args.output ?? "app/data/nfl-snapshot.json");
const snapshotAsOf = args["as-of"];
const evaluationOutputPath = resolve(args["evaluation-output"] ?? resolve(dirname(outputPath), "model-evaluation.json"));

function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

if (!isValidDateOnly(snapshotAsOf)) {
  throw new Error("Provide the source validation date with --as-of=YYYY-MM-DD");
}

const forecastSeason = Number(args.season ?? (Number(snapshotAsOf.slice(0, 4)) - (Number(snapshotAsOf.slice(5, 7)) < 3 ? 1 : 0)));
if (!Number.isInteger(forecastSeason) || forecastSeason < 2024) throw new Error("Provide a supported forecast season");
const metadata = args["source-metadata"] ? JSON.parse(await readFile(args["source-metadata"], "utf8")) : { inputs: {} };
if (args["source-metadata"] && metadata.validatedAt !== snapshotAsOf) throw new Error("Source metadata validation date must match --as-of");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (quoted) throw new Error("Unterminated quoted CSV field");
  const [headers, ...records] = rows;
  if (!headers?.length || new Set(headers).size !== headers.length) throw new Error("Missing or duplicate CSV headers");
  return records.map((values) => {
    if (values.length !== headers.length) throw new Error("CSV row width differs from header");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid numeric source value");
  return parsed;
}

const teamNames = {
  ARI: "Arizona Cardinals",
  BAL: "Baltimore Ravens",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  LA: "Los Angeles Rams",
  NYG: "New York Giants",
  PHI: "Philadelphia Eagles",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

const [gamesText, rosterText, statsText] = await Promise.all([
  readFile(gamesPath, "utf8"),
  readFile(rosterPath, "utf8"),
  readFile(statsPath, "utf8"),
]);

const allGames = parseCsv(gamesText);
const allRoster = parseCsv(rosterText);
const allStats = parseCsv(statsText);
const statFieldMappings = [
    ["passing_yards", "passingYards"],
    ["passing_tds", "passingTds"],
    ["passing_interceptions", "interceptions"],
    ["rushing_yards", "rushingYards"],
    ["rushing_tds", "rushingTds"],
    ["receptions", "receptions"],
    ["receiving_yards", "receivingYards"],
    ["receiving_tds", "receivingTds"],
    ["def_sacks", "defSacks"],
    ["def_qb_hits", "defQbHits"],
    ["def_interceptions", "defInterceptions"],
    ["def_pass_defended", "defPassDefended"],
    ["fg_made", "fgMade"],
    ["fg_att", "fgAttempts"],

];
function requireColumns(rows, names, source) {
  if (!rows.length || names.some((name) => !(name in rows[0]))) throw new Error(`${source}: missing records or required columns`);
}
requireColumns(allGames, ["game_id", "season", "game_type", "gameday", "home_score", "away_score", "home_team", "away_team", "location", "week", "home_moneyline", "away_moneyline", "spread_line", "total_line", "stadium", "gametime"], "games");
requireColumns(allRoster, ["season", "week", "gsis_id", "team", "status", "game_type", "full_name", "position", "jersey_number", "years_exp"], "roster");
requireColumns(allStats, ["season", "season_type", "player_id", "player_display_name", "position", "fantasy_points_ppr", ...statFieldMappings.map(([source]) => source)], "stats");
if (allGames.some((game) => !game.game_id || !isValidDateOnly(game.gameday) || !Number.isInteger(Number(game.season)) || !Number.isInteger(Number(game.week)))) throw new Error("Invalid game identifier, date, season, or week");
if (new Set(allGames.map((game) => game.game_id)).size !== allGames.length) throw new Error("Duplicate game identifiers");
const latestCompleteStatsSeason = Math.max(...allStats
  .filter((row) => row.season_type === "REG" && Number(row.season) < forecastSeason)
  .map((row) => Number(row.season)).filter(Number.isFinite));
if (!Number.isFinite(latestCompleteStatsSeason)) throw new Error("No prior-season regular-season player baseline");
const baselineSeasonGames = allGames.filter((game) => Number(game.season) === latestCompleteStatsSeason && game.game_type === "REG");
if (!baselineSeasonGames.length || baselineSeasonGames.some((game) => game.gameday > snapshotAsOf || game.home_score === "" || game.away_score === "")) {
  throw new Error("Player baseline season is not complete as of the validation date");
}
const completedGames = allGames
  .filter((game) => game.game_type === "REG" && game.gameday <= snapshotAsOf && Number(game.season) <= forecastSeason && game.home_score !== "" && game.away_score !== "")
  .sort((left, right) => left.gameday.localeCompare(right.gameday) || left.game_id.localeCompare(right.game_id));
let ratings = {};
let season = null;
const evaluation = [];
for (const game of completedGames) {
  const currentSeason = Number(game.season);
  if (!Number.isInteger(currentSeason)) throw new Error("Invalid completed-game season");
  if (season !== null && season !== currentSeason) ratings = advanceRatingsSeason(ratings, season, currentSeason);
  season = currentSeason;
  const homeRating = ratings[game.home_team] ?? 1500;
  const awayRating = ratings[game.away_team] ?? 1500;
  const venue = game.location === "Neutral" ? "neutral" : "home";
  const footballBaseline = eloWinProbability(homeRating, awayRating, venue);
  const homeScore = Number(game.home_score);
  const awayScore = Number(game.away_score);
  if (![homeScore, awayScore].every((score) => Number.isInteger(score) && score >= 0)) throw new Error("Invalid completed-game score");
  const outcome = homeScore > awayScore ? 1 : homeScore < awayScore ? 0 : 0.5;
  const homeMoneyline = numberOrNull(game.home_moneyline);
  const awayMoneyline = numberOrNull(game.away_moneyline);
  const marketProbability = removeVig(homeMoneyline, awayMoneyline);
  const probabilities = calculateProbabilities({ footballBaseline, marketImplied: marketProbability });
  // Keep the predeclared retrospective holdout fixed as current-season ratings advance.
  if (currentSeason >= 2024 && currentSeason <= 2025) {
    evaluation.push({ gameId: game.game_id, season: currentSeason, date: game.gameday,
      homeRating, awayRating, venue, homeMoneyline, awayMoneyline,
      footballProbability: probabilities.footballOnly, marketProbability,
      blendedProbability: marketProbability === null ? null : probabilities.probability, outcome });
  }
  const marginMultiplier = Math.min(MODEL_PARAMETERS.maxMarginMultiplier, Math.max(1, Math.log(Math.abs(homeScore - awayScore) + 1)));
  const change = MODEL_PARAMETERS.eloK * marginMultiplier * (outcome - footballBaseline);
  ratings[game.home_team] = homeRating + change;
  ratings[game.away_team] = awayRating - change;
}
if (season === null) throw new Error("No completed games available for ratings");
// Explicit forecast-season advancement avoids missing or double preseason regression.
ratings = advanceRatingsSeason(ratings, season, forecastSeason);

const evaluatedSeasons = [...new Set(evaluation.map((record) => record.season))]
  .sort((left, right) => left - right);
if (!evaluatedSeasons.length) {
  throw new Error("No completed regular-season games are available for the backtest window");
}
const firstEvaluatedSeason = evaluatedSeasons[0];
const lastEvaluatedSeason = evaluatedSeasons.at(-1);
const evaluatedSeasonRange = firstEvaluatedSeason === lastEvaluatedSeason
  ? String(firstEvaluatedSeason)
  : `${firstEvaluatedSeason} to ${lastEvaluatedSeason}`;

function brierScore(records, probabilityKey) {
  const eligible = records.filter((record) => record[probabilityKey] !== null);
  return eligible.length ? eligible.reduce((total, record) => total + (record[probabilityKey] - record.outcome) ** 2, 0) / eligible.length : null;
}

function calibrationBins(records, probabilityKey) {
  const buckets = Array.from({ length: 10 }, () => []);
  for (const record of records.filter((record) => record[probabilityKey] !== null)) {
    buckets[Math.min(9, Math.floor(record[probabilityKey] * 10))].push(record);
  }
  return buckets.map((bucket, index) => ({ lower: index / 10, upper: (index + 1) / 10, count: bucket.length,
    meanPredicted: bucket.length ? bucket.reduce((sum, record) => sum + record[probabilityKey], 0) / bucket.length : null,
    meanOutcome: bucket.length ? bucket.reduce((sum, record) => sum + record.outcome, 0) / bucket.length : null }));
}
const blended = evaluation.filter((record) => record.marketProbability !== null);
const bins = calibrationBins(blended, "blendedProbability");
const calibrationError = blended.length ? bins.reduce((sum, bin) => sum + (bin.count ? Math.abs(bin.meanPredicted - bin.meanOutcome) * bin.count / blended.length : 0), 0) : null;
const roundMetric = (value) => value === null ? null : Number(value.toFixed(3));

const schedule = allGames
  .filter((game) => Number(game.season) === forecastSeason && game.game_type === "REG" && (game.home_team === "DAL" || game.away_team === "DAL"))
  .sort((left, right) => Number(left.week) - Number(right.week))
  .map((game) => {
    const cowboysHome = game.home_team === "DAL";
    const venue = game.location === "Neutral" ? "neutral" : cowboysHome ? "home" : "away";
    const opponent = game.home_team === "DAL" ? game.away_team : game.home_team;
    const spreadLine = numberOrNull(game.spread_line);
    return {
      id: game.game_id,
      week: Number(game.week),
      date: game.gameday,
      time: game.gametime,
      opponent,
      opponentName: teamNames[opponent] ?? opponent,
      venue,
      cowboysMoneyline: numberOrNull(cowboysHome ? game.home_moneyline : game.away_moneyline),
      opponentMoneyline: numberOrNull(cowboysHome ? game.away_moneyline : game.home_moneyline),
      cowboysSpread: spreadLine === null ? null : cowboysHome ? -spreadLine : spreadLine,
      totalLine: numberOrNull(game.total_line),
      stadium: game.stadium,
      sourceUpdatedAt: metadata.inputs?.games?.sourceUpdatedAt ?? null,
      validatedAt: snapshotAsOf,
      sourceRecordId: game.game_id,
    };
  });

if (!schedule.length) throw new Error("No Cowboys regular-season schedule for forecast season");
// Week 1 rosters are valid preseason. After the season begins, admit only weeks that have started.
const startedWeeks = allGames.filter((game) => Number(game.season) === forecastSeason && game.game_type === "REG" && game.gameday <= snapshotAsOf).map((game) => Number(game.week));
const eligibleWeek = Math.max(1, ...startedWeeks);
const eligibleRoster = allRoster.filter((player) => Number(player.season) === forecastSeason && player.game_type === "REG"
  && Number.isInteger(Number(player.week)) && Number(player.week) >= 1 && Number(player.week) <= eligibleWeek);
const rosterWeek = Math.max(...eligibleRoster.map((player) => Number(player.week)));
if (!Number.isFinite(rosterWeek)) throw new Error("No roster for the forecast season and eligible week");
const latestRosterRows = eligibleRoster.filter((player) => Number(player.week) === rosterWeek);
const rosterById = new Map();
let duplicateRosterRows = 0;
for (const player of latestRosterRows) {
  if (!player.gsis_id) continue;
  const previous = rosterById.get(player.gsis_id);
  if (previous) {
    const projected = (row) => JSON.stringify([row.team, row.status, row.full_name, row.position, row.jersey_number, row.years_exp]);
    if (projected(previous) !== projected(player)) throw new Error(`Conflicting roster records for a stable player ID in week ${rosterWeek}`);
    duplicateRosterRows += 1;
  } else rosterById.set(player.gsis_id, player);
}
const activeRosterAll = [...rosterById.values()].filter((player) => player.status === "ACT");
const activeRoster = activeRosterAll.filter((player) => player.team === "DAL");

const selectedNames = [
  "Dak Prescott",
  "CeeDee Lamb",
  "George Pickens",
  "Javonte Williams",
  "Jake Ferguson",
  "Brandon Aubrey",
  "Quinnen Williams",
  "DaRon Bland",
];

const normalizedStatsById = new Map();
const statsById = new Map();
for (const row of allStats) {
  if (row.season !== String(latestCompleteStatsSeason) || row.season_type !== "REG") continue;
  if (!row.player_id) continue;
  if (statsById.has(row.player_id)) throw new Error("Duplicate season-stat player ID");
  statsById.set(row.player_id, row);
  const current = {
    passingYards: 0,
    passingTds: 0,
    interceptions: 0,
    rushingYards: 0,
    rushingTds: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTds: 0,
    defSacks: 0,
    defQbHits: 0,
    defInterceptions: 0,
    defPassDefended: 0,
    fgMade: 0,
    fgAttempts: 0,
  };
  for (const [source, target] of statFieldMappings) {
    const value = Number(row[source] || 0);
    if (!Number.isFinite(value)) throw new Error(`Invalid player statistic ${source}`);
    current[target] = value;
  }
  normalizedStatsById.set(row.player_id, current);
}

const players = selectedNames
  .map((name) => {
    const roster = activeRoster.find((player) => player.full_name === name);
    if (!roster) return null;
    return {
      id: roster.gsis_id,
      name,
      position: roster.position,
      jerseyNumber: numberOrNull(roster.jersey_number),
      status: roster.status,
      yearsExperience: numberOrNull(roster.years_exp),
      statsSeason: normalizedStatsById.has(roster.gsis_id) ? latestCompleteStatsSeason : null,
      stats: normalizedStatsById.get(roster.gsis_id) ?? null,
    };
  })
  .filter(Boolean);

function opponentEvidence(row) {
  const position = row.position;
  if (position === "QB") {
    return `${Number(row.passing_yards || 0).toLocaleString("en-US")} pass yds, ${Number(row.passing_tds || 0)} pass TD`;
  }
  if (position === "RB") {
    return `${Number(row.rushing_yards || 0).toLocaleString("en-US")} rush yds, ${Number(row.receptions || 0)} rec`;
  }
  return `${Number(row.receptions || 0)} rec, ${Number(row.receiving_yards || 0).toLocaleString("en-US")} yds`;
}

const opponentCodes = [...new Set(schedule.map((game) => game.opponent))];
const opponents = Object.fromEntries(opponentCodes.map((team) => {
  const leaders = activeRosterAll
    .filter((player) => player.team === team && ["QB", "RB", "WR", "TE"].includes(player.position))
    .map((player) => {
      const stats = statsById.get(player.gsis_id);
      if (!stats) return null;
      if (!Number.isFinite(Number(stats.fantasy_points_ppr || 0))) throw new Error("Invalid PPR ranking statistic");
      return {
        id: player.gsis_id,
        name: player.full_name,
        position: player.position,
        jerseyNumber: numberOrNull(player.jersey_number),
        fantasyPointsPpr: Number(stats.fantasy_points_ppr || 0),
        evidence: opponentEvidence(stats),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.fantasyPointsPpr - left.fantasyPointsPpr || left.id.localeCompare(right.id))
    .slice(0, 4);

  return [team, {
    teamName: teamNames[team] ?? team,
    statsSeason: latestCompleteStatsSeason,
    rankingMethod: `PPR fantasy points among active ${forecastSeason} roster players with complete ${latestCompleteStatsSeason} regular-season stats`,
    leaders,
  }];
}));

const sourceInputs = Object.fromEntries([
  ["games", gamesText, allGames], ["roster", rosterText, allRoster], ["stats", statsText, allStats],
].map(([key, raw, rows]) => {
  const source = metadata.inputs?.[key] ?? {};
  const digest = sha256(raw);
  if (source.expectedSha256 && source.expectedSha256 !== digest) throw new Error(`${key}: source checksum mismatch`);
  if (source.retrievedBetween && (Date.parse(source.retrievedBetween.start) > Date.parse(source.retrievedBetween.end)
    || Date.parse(source.sourceUpdatedAt) > Date.parse(source.retrievedBetween.end))) throw new Error("Source retrieval window is inconsistent");
  for (const timestamp of [source.sourceUpdatedAt, source.retrievedBetween?.start, source.retrievedBetween?.end].filter(Boolean)) {
    if (Number.isNaN(Date.parse(timestamp)) || timestamp.slice(0, 10) > snapshotAsOf) throw new Error("Source metadata is invalid or newer than validation date");
  }
  return [key, { ...source, sha256: digest, bytes: Buffer.byteLength(raw), rows: rows.length,
    metadataStatus: source.url && source.sourceUpdatedAt && source.retrievedBetween && source.expectedSha256 ? "verified" : "not_provided" }];
}));
const evaluationArtifact = { modelVersion: MODEL_VERSION, modelParameters: MODEL_PARAMETERS, asOf: snapshotAsOf,
  sourceSha256: sourceInputs.games.sha256, records: evaluation };
const evaluationText = `${JSON.stringify(evaluationArtifact, null, 2)}\n`;
const missingOpponentLeaders = Object.entries(opponents).filter(([, value]) => value.leaders.length < 4).map(([team, value]) => ({ team, found: value.leaders.length, expected: 4 }));
const missingFeaturedPlayers = selectedNames.filter((name) => !players.some((player) => player.name === name));
const coverage = {
  scheduleGames: schedule.length, expectedRegularSeasonGames: 17,
  featuredPlayers: players.length, expectedFeaturedPlayers: selectedNames.length, missingFeaturedPlayers,
  opponentTeams: opponentCodes.length, opponentLeaders: Object.values(opponents).reduce((sum, opponent) => sum + opponent.leaders.length, 0),
  missingOpponentLeaders, rosterSeason: forecastSeason, rosterWeek, latestStartedWeek: eligibleWeek,
  duplicateRosterRowsRemoved: duplicateRosterRows, unidentifiedRosterRows: latestRosterRows.filter((player) => !player.gsis_id).length,
  playerBaselineSeason: latestCompleteStatsSeason,
  unidentifiedStatsRows: allStats.filter((row) => Number(row.season) === latestCompleteStatsSeason && row.season_type === "REG" && !row.player_id).length,
};
const limitations = [];
if (schedule.length !== 17) limitations.push("Schedule does not contain the expected 17 regular-season games.");
if (missingFeaturedPlayers.length) limitations.push("Featured Cowboys roster coverage is incomplete.");
if (missingOpponentLeaders.length) limitations.push("Some opponents have fewer than four players joined to prior-season statistics.");
if (rosterWeek < eligibleWeek) limitations.push("Roster source has not reached the latest started week.");
if (Object.values(sourceInputs).some((source) => source.metadataStatus !== "verified")) limitations.push("Source metadata was not supplied for every input.");
const snapshot = {
  asOf: snapshotAsOf,
  dataVersion: `nflverse-${snapshotAsOf}-${sha256(JSON.stringify(sourceInputs)).slice(0, 12)}`,
  manifest: { schemaVersion: "1.0.0", validatedAt: snapshotAsOf, inputs: sourceInputs,
    validationStatus: limitations.length ? "partial" : "passed", limitations, coverage },
  schedule, players, opponents, ratings,
  ratingsMetadata: { season: forecastSeason, trainedThrough: completedGames.at(-1).gameday,
    lastCompletedSeason: season, preseasonRegressionAppliedThrough: forecastSeason, modelVersion: MODEL_VERSION },
  backtest: {
    seasons: `${evaluatedSeasonRange} holdout`, modelVersion: MODEL_VERSION,
    games: evaluation.length, marketEligibleGames: blended.length, missingMarketGames: evaluation.length - blended.length,
    footballOnlyBrier: roundMetric(brierScore(evaluation, "footballProbability")),
    footballOnlyPairedBrier: roundMetric(brierScore(blended, "footballProbability")),
    marketAwareBrier: roundMetric(brierScore(blended, "blendedProbability")),
    marketBaselineBrier: roundMetric(brierScore(blended, "marketProbability")),
    marketAwareCalibrationError: roundMetric(calibrationError), calibrationBins: bins,
    evaluationSha256: sha256(evaluationText),
    method: `Walk-forward Elo with preseason regression and neutral-aware venue adjustment; shared production scoring and a predeclared 80% vig-adjusted market blend. Historical rating warm-up begins in ${completedGames[0].season}; the documented development window is 2019 to 2023. Scenario sensitivities are not evaluated by this default-control backtest.`,
  },
  sources: [
    { name: "nflverse schedules", url: sourceInputs.games.url ?? "https://github.com/nflverse/nfldata/blob/master/data/games.csv", license: "CC BY 4.0 repository license; underlying data rights remain with their owners." },
    { name: `nflverse ${forecastSeason} weekly roster`, url: sourceInputs.roster.url ?? "https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters", license: "CC BY 4.0 repository license; underlying data rights remain with their owners." },
    { name: `nflverse ${latestCompleteStatsSeason} player stats`, url: sourceInputs.stats.url ?? "https://github.com/nflverse/nflverse-data/releases/tag/stats_player", license: "CC BY 4.0 repository license; underlying data rights remain with their owners." },
  ],
};
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(evaluationOutputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
await writeFile(evaluationOutputPath, evaluationText, "utf8");
console.log(`Wrote ${outputPath}; validation ${snapshot.manifest.validationStatus}; ${evaluation.length} evaluated games`);
