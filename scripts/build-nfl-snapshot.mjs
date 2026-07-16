import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { moneylineToImplied } from "../lib/forecast.mjs";

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

  const [headers, ...records] = rows;
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function numberOrNull(value) {
  const parsed = Number(value);
  return value === "" || !Number.isFinite(parsed) ? null : parsed;
}

function impliedProbability(moneyline) {
  return moneyline === null ? null : moneylineToImplied(moneyline);
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
const latestCompleteStatsSeason = Math.max(
  ...allStats
    .filter((row) => row.season_type === "REG")
    .map((row) => Number(row.season))
    .filter(Number.isFinite),
);

const completedGames = allGames
  .filter((game) => game.game_type === "REG" && game.home_score !== "" && game.away_score !== "")
  .sort((left, right) => left.gameday.localeCompare(right.gameday) || left.game_id.localeCompare(right.game_id));

const ratings = {};
let season = null;
const evaluation = [];

for (const game of completedGames) {
  const currentSeason = Number(game.season);
  if (season !== currentSeason) {
    if (season !== null) {
      for (const team of Object.keys(ratings)) {
        ratings[team] = 1500 + (ratings[team] - 1500) * 0.75;
      }
    }
    season = currentSeason;
  }

  const homeRating = ratings[game.home_team] ?? 1500;
  const awayRating = ratings[game.away_team] ?? 1500;
  const footballProbability = 1 / (1 + 10 ** (-((homeRating + 55) - awayRating) / 400));
  const homeScore = Number(game.home_score);
  const awayScore = Number(game.away_score);
  const outcome = homeScore > awayScore ? 1 : homeScore < awayScore ? 0 : 0.5;
  const homeMoneyline = numberOrNull(game.home_moneyline);
  const awayMoneyline = numberOrNull(game.away_moneyline);
  const homeRaw = impliedProbability(homeMoneyline);
  const awayRaw = impliedProbability(awayMoneyline);
  const marketProbability = homeRaw === null || awayRaw === null ? null : homeRaw / (homeRaw + awayRaw);

  if (currentSeason >= 2024) {
    evaluation.push({ footballProbability, marketProbability, outcome });
  }

  const marginMultiplier = Math.min(2.2, Math.max(1, Math.log(Math.abs(homeScore - awayScore) + 1)));
  const change = 18 * marginMultiplier * (outcome - footballProbability);
  ratings[game.home_team] = homeRating + change;
  ratings[game.away_team] = awayRating - change;
}

function brierScore(records, probabilityKey) {
  const eligible = records.filter((record) => record[probabilityKey] !== null);
  return eligible.reduce((total, record) => total + (record[probabilityKey] - record.outcome) ** 2, 0) / eligible.length;
}

function calibrationError(records, probabilityKey) {
  const eligible = records.filter((record) => record[probabilityKey] !== null);
  const buckets = Array.from({ length: 10 }, () => []);
  for (const record of eligible) {
    const index = Math.min(9, Math.floor(record[probabilityKey] * 10));
    buckets[index].push(record);
  }
  return buckets.reduce((total, bucket) => {
    if (!bucket.length) return total;
    const predicted = bucket.reduce((sum, record) => sum + record[probabilityKey], 0) / bucket.length;
    const observed = bucket.reduce((sum, record) => sum + record.outcome, 0) / bucket.length;
    return total + Math.abs(predicted - observed) * (bucket.length / eligible.length);
  }, 0);
}

const blended = evaluation
  .filter((record) => record.marketProbability !== null)
  .map((record) => ({
    ...record,
    blendedProbability: 0.2 * record.footballProbability + 0.8 * record.marketProbability,
  }));

const schedule = allGames
  .filter((game) => game.season === "2026" && (game.home_team === "DAL" || game.away_team === "DAL"))
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
      sourceUpdatedAt: "2026-07-15",
    };
  });

const activeRosterAll = allRoster.filter(
  (player) => player.week === "1" && player.game_type === "REG" && player.status === "ACT",
);
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

const statsByName = new Map();
const statsById = new Map();
for (const row of allStats) {
  if (row.season !== String(latestCompleteStatsSeason) || row.season_type !== "REG") continue;
  statsById.set(row.player_id, row);
  const current = statsByName.get(row.player_display_name) ?? {
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
  for (const [source, target] of [
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
  ]) {
    current[target] += Number(row[source] || 0);
  }
  statsByName.set(row.player_display_name, current);
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
      statsSeason: statsByName.has(name) ? latestCompleteStatsSeason : null,
      stats: statsByName.get(name) ?? null,
    };
  })
  .filter(Boolean);

function opponentEvidence(row) {
  const position = row.position;
  if (position === "QB") {
    return `${Number(row.passing_yards || 0).toLocaleString()} pass yds, ${Number(row.passing_tds || 0)} pass TD`;
  }
  if (position === "RB") {
    return `${Number(row.rushing_yards || 0).toLocaleString()} rush yds, ${Number(row.receptions || 0)} rec`;
  }
  return `${Number(row.receptions || 0)} rec, ${Number(row.receiving_yards || 0).toLocaleString()} yds`;
}

const opponentCodes = [...new Set(schedule.map((game) => game.opponent))];
const opponents = Object.fromEntries(opponentCodes.map((team) => {
  const leaders = activeRosterAll
    .filter((player) => player.team === team && ["QB", "RB", "WR", "TE"].includes(player.position))
    .map((player) => {
      const stats = statsById.get(player.gsis_id);
      if (!stats) return null;
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
    .sort((left, right) => right.fantasyPointsPpr - left.fantasyPointsPpr)
    .slice(0, 4);

  return [team, {
    teamName: teamNames[team] ?? team,
    statsSeason: latestCompleteStatsSeason,
    rankingMethod: "PPR fantasy points among active 2026 roster players with complete 2025 regular-season stats",
    leaders,
  }];
}));

const snapshot = {
  asOf: "2026-07-15",
  schedule,
  players,
  opponents,
  ratings,
  backtest: {
    seasons: "2024 to 2025 holdout",
    games: evaluation.length,
    footballOnlyBrier: Number(brierScore(evaluation, "footballProbability").toFixed(3)),
    marketAwareBrier: Number(brierScore(blended, "blendedProbability").toFixed(3)),
    marketBaselineBrier: Number(brierScore(evaluation, "marketProbability").toFixed(3)),
    marketAwareCalibrationError: Number(calibrationError(blended, "blendedProbability").toFixed(3)),
    method: "Walk-forward Elo with preseason regression, home-field adjustment, and a predeclared 80% vig-adjusted market blend evaluated after the 2019 to 2023 development window.",
  },
  sources: [
    {
      name: "nflverse schedules",
      url: "https://github.com/nflverse/nfldata/blob/master/data/games.csv",
      license: "CC BY 4.0 repository license; underlying data rights remain with their owners.",
    },
    {
      name: "nflverse roster and 2025 player stats",
      url: "https://github.com/nflverse/nflverse-data/releases/tag/stats_player",
      license: "CC BY 4.0 repository license; underlying data rights remain with their owners.",
    },
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
