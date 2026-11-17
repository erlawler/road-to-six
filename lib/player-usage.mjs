import { cowboysSeasonState } from "./season-state.mjs";

export const USAGE_SCHEMA_VERSION = "player-usage-v1";
export const USAGE_POSITIONS = Object.freeze(["QB", "RB", "WR", "TE"]);
export const USAGE_SCORING = Object.freeze({ id: "ppr", label: "PPR, four-point passing touchdowns",
  description: "1 per reception; 1 per 10 rushing/receiving yards; 1 per 25 passing yards; 6 per rushing/receiving/return touchdown; 4 per passing touchdown; 2 per two-point conversion; -2 per interception or lost fumble. No bonuses." });
export const USAGE_CORRECTION_NOTICE = "nflverse player stats update after game days. Wednesday night/Thursday may include NFL stat corrections. This site's Wednesday 8 a.m. Central policy can precede those corrections; each source timestamp identifies the evidence actually used.";
const round = (value) => Number(value.toFixed(4));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const num = (row, field) => {
  if (row[field] === undefined || row[field] === "" || !Number.isFinite(Number(row[field]))) throw new Error(`Weekly player stats: missing or invalid ${field}`);
  return Number(row[field]);
};
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const ties = (players, field) => players.length ? players.filter((p) => p[field] === players.reduce((n, q) => Math.max(n, q[field]), -Infinity)).sort((a, b) => a.id.localeCompare(b.id)) : [];
const fields = ["carries", "targets", "receptions", "rushing_yards", "receiving_yards", "rushing_tds", "receiving_tds", "passing_yards", "passing_tds", "passing_interceptions", "passing_2pt_conversions", "rushing_2pt_conversions", "receiving_2pt_conversions", "sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost", "special_teams_tds", "fantasy_points", "fantasy_points_ppr"];
const countFields = fields.filter((field) => !["rushing_yards", "receiving_yards", "passing_yards", "fantasy_points", "fantasy_points_ppr"].includes(field));
const rushPoints = (r) => r.rushing_yards / 10 + r.rushing_tds * 6 + r.rushing_2pt_conversions * 2 - r.rushing_fumbles_lost * 2;
const receivePoints = (r) => r.receiving_yards / 10 + r.receiving_tds * 6 + r.receiving_2pt_conversions * 2 - r.receiving_fumbles_lost * 2;
const standardPoints = (r) => rushPoints(r) + receivePoints(r) + r.passing_yards / 25 + r.passing_tds * 4 - r.passing_interceptions * 2 + r.passing_2pt_conversions * 2 - r.sack_fumbles_lost * 2 + r.special_teams_tds * 6;

// All transformations are team-bound. A traded player's former-team statistics
// never enter the new team's lookback window or target-share denominator.
export function buildPlayerUsage({ weeklyRows, seasonRows, games, activeRoster, season, teams, source, reviewedAt }) {
  if (!weeklyRows?.length) throw new Error("Weekly player statistics are unavailable");
  const required = ["player_id", "player_display_name", "position", "season", "week", "season_type", "game_id", "team", ...fields];
  if (required.some((key) => !Object.hasOwn(weeklyRows[0], key))) throw new Error("Weekly player stats: required columns are missing");
  const finals = games.filter((g) => Number(g.season) === season && g.game_type === "REG" && g.home_score !== "" && g.away_score !== "" && g.gameday <= reviewedAt.slice(0, 10));
  const gamesById = new Map(finals.map((g) => [g.game_id, g]));
  const normalized = [], seen = new Set();
  for (const row of weeklyRows) {
    if (Number(row.season) !== season || row.season_type !== "REG") continue;
    const data = Object.fromEntries(fields.map((field) => [field, num(row, field)]));
    if (countFields.some((field) => data[field] < 0 || !Number.isInteger(data[field]))) throw new Error("Weekly player stats: invalid count");
    if (!row.player_id) {
      if (data.targets || data.carries || data.fantasy_points_ppr) throw new Error("Weekly player stats: unidentified offensive production");
      continue;
    }
    const game = gamesById.get(row.game_id);
    if (!game || Number(row.week) !== Number(game.week) || ![game.home_team, game.away_team].includes(row.team)) throw new Error("Weekly player stats: unmatched completed game or team");
    const key = `${row.player_id}:${row.game_id}`;
    if (seen.has(key)) throw new Error("Weekly player stats: duplicate player game");
    seen.add(key);
    if (USAGE_POSITIONS.includes(row.position) && (Math.abs(standardPoints(data) - data.fantasy_points) > 0.011 || Math.abs(data.fantasy_points + data.receptions - data.fantasy_points_ppr) > 0.011)) throw new Error("Weekly player stats: scoring does not reconcile");
    normalized.push({ ...data, id: row.player_id, name: row.player_display_name, position: row.position, team: row.team, gameId: row.game_id, week: Number(row.week) });
  }
  if (!normalized.length) throw new Error("Weekly player stats: no current regular-season records");
  const currentSeasonRows = seasonRows.filter((r) => Number(r.season) === season && r.season_type === "REG" && r.player_id);
  const seasonById = new Map(currentSeasonRows.map((r) => [r.player_id, r]));
  if (seasonById.size !== currentSeasonRows.length) throw new Error("Weekly player stats: duplicate season totals");
  const reconcileFields = ["fantasy_points_ppr", "targets", "carries", "receptions", "rushing_yards", "receiving_yards", "passing_yards"];
  // Separate season totals catch missing weekly rows even when the CSV parses.
  // Published checksums additionally prove that a downloaded file is complete.
  const weeklyById = new Map();
  for (const row of normalized) {
    if (!weeklyById.has(row.id)) weeklyById.set(row.id, []);
    weeklyById.get(row.id).push(row);
  }
  // Reconcile the entire league, including inactive and non-eligible players
  // whose targets still belong in the team target-share denominator.
  for (const id of new Set([...weeklyById.keys(), ...seasonById.keys()])) {
    const weekly = weeklyById.get(id) ?? [];
    const total = seasonById.get(id);
    if (!total && weekly.some((r) => r.fantasy_points_ppr || r.targets || r.carries)) throw new Error("Weekly player stats: season totals are missing");
    for (const field of reconcileFields) {
      const expected = total ? num(total, field) : 0;
      if (Math.abs(sum(weekly, field) - expected) > 0.011) throw new Error(`Weekly player stats: incomplete season reconciliation for ${field}`);
    }
  }
  const output = {};
  for (const team of teams) {
    const recent = finals.filter((g) => [g.home_team, g.away_team].includes(team)).sort((a, b) => Number(a.week) - Number(b.week)).slice(-3);
    const ids = new Set(recent.map((g) => g.game_id));
    const rows = normalized.filter((r) => r.team === team && ids.has(r.gameId));
    const limitations = [];
    if (recent.length !== 3) limitations.push("Three completed team games are not yet available.");
    for (const game of recent) if (!rows.some((r) => r.gameId === game.game_id && r.targets > 0) || !rows.some((r) => r.gameId === game.game_id && r.carries > 0)) limitations.push(`Team offensive coverage is incomplete for Week ${game.week}.`);
    const gameTargets = Object.fromEntries(recent.map((g) => [g.game_id, sum(rows.filter((r) => r.gameId === g.game_id), "targets")]));
    const teamTargets = sum(rows, "targets"), teamCarries = sum(rows, "carries");
    const players = activeRoster.filter((p) => p.team === team && USAGE_POSITIONS.includes(p.position)).map((p) => {
      const playerRows = rows.filter((r) => r.id === p.gsis_id);
      const totals = Object.fromEntries(fields.map((field) => [field, sum(playerRows, field)]));
      const weekly = recent.map((g) => {
        const r = playerRows.find((row) => row.gameId === g.game_id);
        return { week: Number(g.week), date: g.gameday, ppr: r?.fantasy_points_ppr ?? 0, targets: r?.targets ?? 0, carries: r?.carries ?? 0,
          targetShare: gameTargets[g.game_id] ? (r?.targets ?? 0) / gameTargets[g.game_id] : null, recorded: Boolean(r) };
      });
      const trend = Object.fromEntries(["ppr", "targets", "carries"].map((field) => [field, weekly.length > 1 ? round(weekly.at(-1)[field] - sum(weekly.slice(0, -1), field) / (weekly.length - 1)) : null]));
      return { id: p.gsis_id, name: p.full_name, position: p.position, team, games: recent.length,
        recordedGames: playerRows.length, totalPpr: round(totals.fantasy_points_ppr), totalStandard: round(totals.fantasy_points),
        perGamePpr: recent.length ? round(totals.fantasy_points_ppr / recent.length) : 0,
        targets: totals.targets, carries: totals.carries, targetShare: teamTargets ? totals.targets / teamTargets : null,
        receptions: totals.receptions, receivingYards: totals.receiving_yards, rushingYards: totals.rushing_yards,
        weekly, trend,
        scenarioBaseline: { carries: recent.length ? totals.carries / recent.length : 0, targetShare: teamTargets ? totals.targets / teamTargets : 0, scoring: "ppr" },
        efficiency: { rushStandardPerCarry: totals.carries ? rushPoints(totals) / totals.carries : null,
          receiveStandardPerTarget: totals.targets ? receivePoints(totals) / totals.targets : null,
          receptionsPerTarget: totals.targets ? totals.receptions / totals.targets : null,
          otherStandardPerGame: recent.length ? (totals.fantasy_points - rushPoints(totals) - receivePoints(totals)) / recent.length : 0,
          teamTargetsPerGame: recent.length ? teamTargets / recent.length : 0 } };
    }).sort((a, b) => b.totalPpr - a.totalPpr || a.id.localeCompare(b.id));
    if (!players.length || !players.some((p) => p.recordedGames)) limitations.push("No eligible active-roster player evidence is available.");
    output[team] = { team, complete: limitations.length === 0, weeks: recent.map((g) => Number(g.week)),
      games: recent.map((g) => ({ id: g.game_id, week: Number(g.week), date: g.gameday, opponent: g.home_team === team ? g.away_team : g.home_team })),
      players, leaders: ties(players, "totalPpr"), usageLeaders: { targets: ties(players, "targets"), carries: ties(players, "carries") }, teamTargets, teamCarries, limitations };
  }
  return { schemaVersion: USAGE_SCHEMA_VERSION, season, lookbackGames: 3, source: { url: source.url,
    updatedAt: source.sourceUpdatedAt, reviewedAt, sha256: source.sha256, license: "CC-BY-4.0",
    licenseUrl: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md", attribution: "nflverse / nflfastR player statistics. Road to Six aggregates and transforms the data; no endorsement or warranty.", correctionNotice: USAGE_CORRECTION_NOTICE },
    teams: output, limitations: ["Recent production is historical evidence, not a projection. Active-roster QB, RB, WR and TE candidates only; ties are retained and ordered by stable player ID.", "Windows use each team's last three completed games, excluding byes. Per-game averages include all three team games. A missing player stat line contributes no recorded production and does not establish participation or availability.", "Target share is player targets divided by all recorded team targets in the same games. Usage means recorded carries and targets, not snaps or routes."] };
}

function usageContext(snapshot, now) {
  const state = cowboysSeasonState(snapshot, now), usage = snapshot.usage;
  const reasons = [];
  if (!state.current) reasons.push("Current-season results or source freshness need verification.");
  if (state.byeWeek) reasons.push(`Dallas has a bye in Week ${state.byeWeek}; there is no current-week opponent comparison.`);
  if (!state.nextGame || state.calendarWeek !== state.nextGame.week) reasons.push("A verified current-week matchup is unavailable.");
  if (!usage || usage.schemaVersion !== USAGE_SCHEMA_VERSION) reasons.push("Verified weekly player-usage data is unavailable in this snapshot.");
  if (usage && (usage.season !== snapshot.season.year || !Number.isFinite(Date.parse(usage.source?.updatedAt)) || Date.parse(usage.source.updatedAt) > now || !Number.isFinite(Date.parse(usage.source?.reviewedAt)) || Date.parse(usage.source.reviewedAt) > now || now - Date.parse(usage.source.reviewedAt) > 7 * 86400000)) reasons.push("Player-usage source dates are stale, missing or inconsistent.");
  const evidence = snapshot.manifest?.inputs?.weeklyStats;
  if (usage && (!evidence || evidence.metadataStatus !== "verified" || evidence.sha256 !== usage.source?.sha256 || evidence.url !== usage.source?.url || evidence.sourceUpdatedAt !== usage.source?.updatedAt || snapshot.manifest.reviewedAt !== usage.source?.reviewedAt
    || ![evidence.retrievedBetween?.start, evidence.retrievedBetween?.end].every((value) => Number.isFinite(Date.parse(value)))
    || Date.parse(evidence.retrievedBetween.start) > Date.parse(evidence.retrievedBetween.end) || Date.parse(evidence.retrievedBetween.end) > now || now - Date.parse(evidence.retrievedBetween.end) > 7 * 86400000)) reasons.push("Weekly usage provenance or retrieval freshness is inconsistent.");
  return { state, usage, reasons };
}

export function getPlayerUsage(snapshot, team, now = Date.now()) {
  const { state, usage, reasons } = usageContext(snapshot, now);
  if (!["DAL", state.nextGame?.opponent].includes(team)) reasons.push("Only Dallas and the verified current opponent are supported.");
  const data = usage?.teams?.[team];
  if (!data?.complete || !Array.isArray(data.games) || data.games.length !== 3 || !Array.isArray(data.players) || !data.players.length) reasons.push("Complete three-game player coverage is unavailable.");
  return { status: reasons.length ? "unavailable" : "available", reasons, team: reasons.length ? null : { ...data, teamName: team === "DAL" ? "Dallas Cowboys" : snapshot.opponents[team]?.teamName ?? team }, source: usage?.source ?? null };
}

export function comparePlayerUsage(snapshot, now = Date.now()) {
  const { state, usage, reasons } = usageContext(snapshot, now);
  const matchup = state.nextGame ? { season: snapshot.season.year, week: state.nextGame.week, opponent: state.nextGame.opponent, opponentName: state.nextGame.opponentName, kickoffAt: state.nextGame.kickoffAt } : null;
  const sides = [getPlayerUsage(snapshot, "DAL", now), getPlayerUsage(snapshot, state.nextGame?.opponent, now)];
  const allReasons = [...new Set([...reasons, ...sides.flatMap((s) => s.reasons)])];
  const teams = allReasons.length ? [] : sides.map((s) => s.team);
  return { status: allReasons.length ? "unavailable" : "available", reasons: allReasons, matchup, source: usage?.source ?? null, lookbackGames: 3, scoring: USAGE_SCORING,
    teams, leaders: teams.flatMap((t) => t.leaders), notice: "Actual recent PPR production, not live fantasy projections.", limitations: usage?.limitations ?? [] };
}

export function calculateUsageScenario(player, team, input) {
  const reasons = [];
  const empty = { status: "unavailable", reasons, baselinePoints: null, scenarioPoints: null, delta: null, assumptions: null, components: null,
    formula: "Historical rushing points/carry x assumed carries + (historical receiving points/target + reception value x receptions/target) x assumed targets + unchanged historical other points/game.",
    limitations: ["Arithmetic scenario, not a forecast. Historical efficiency is held constant; football roles and efficiency may change.", "Passing, special-teams and other scoring remain at the historical per-game average. Team targets per game stay fixed; target share does not model changes for teammates.", "No opponent, weather, medical or causal game-win adjustment is made."] };
  if (!player || !team?.complete || !Array.isArray(team.players) || !team.players.some((p) => p.id === player.id && p.team === player.team) || !player.efficiency || player.games !== 3 || !finite(player.recordedGames) || player.recordedGames < 1 || !finite(player.totalStandard) || !finite(player.receptions)) reasons.push("A verified player with recorded recent production and complete team coverage is required.");
  if (!input || !finite(input.carries) || input.carries < 0 || input.carries > 40 || !finite(input.targetShare) || input.targetShare < 0 || input.targetShare > 1 || !["ppr", "half-ppr", "standard"].includes(input.scoring)) reasons.push("Use 0 to 40 carries, 0 to 100 percent target share, and a supported scoring format.");
  if (reasons.length) return empty;
  const e = player.efficiency, targets = input.targetShare * e.teamTargetsPerGame;
  if (!finite(e.otherStandardPerGame) || !finite(e.teamTargetsPerGame) || e.teamTargetsPerGame <= 0) reasons.push("Historical scoring or team-target evidence is missing.");
  if (input.carries > 0 && !finite(e.rushStandardPerCarry)) reasons.push("No recorded carries support a historical rushing rate for this player.");
  if (targets > 0 && (!finite(e.receiveStandardPerTarget) || !finite(e.receptionsPerTarget))) reasons.push("No recorded targets support a historical receiving rate for this player.");
  if (reasons.length) return empty;
  const receptionValue = { ppr: 1, "half-ppr": 0.5, standard: 0 }[input.scoring];
  const rushing = input.carries * (e.rushStandardPerCarry ?? 0);
  const receiving = targets * ((e.receiveStandardPerTarget ?? 0) + receptionValue * (e.receptionsPerTarget ?? 0));
  const baseline = (player.totalStandard + receptionValue * player.receptions) / player.games;
  const result = rushing + receiving + e.otherStandardPerGame;
  return { ...empty, status: "available", baselinePoints: Number(baseline.toFixed(2)) || 0, scenarioPoints: Number(result.toFixed(2)) || 0, delta: Number((result - baseline).toFixed(2)) || 0,
    assumptions: { ...input, targets: round(targets) }, components: { rushing: round(rushing), receiving: round(receiving), other: round(e.otherStandardPerGame) } };
}
