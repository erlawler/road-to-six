import { kickoffTimestamp } from "./season-state.mjs";

export function latestStartedRosterWeek(games, season, asOf, reviewedAt) {
  const cutoff = reviewedAt ? Date.parse(reviewedAt) : Date.parse(`${asOf}T23:59:59.999Z`);
  if (!Number.isFinite(cutoff)) throw new Error("Roster review time is invalid");
  const started = games.filter((game) => Number(game.season) === season && game.game_type === "REG")
    .filter((game) => {
      const kickoff = Date.parse(kickoffTimestamp(game.gameday, game.gametime));
      return Number.isFinite(kickoff) && kickoff <= cutoff;
    });
  return Math.max(1, ...started.map((game) => Number(game.week)));
}

export function selectFootballRoster(rows, games, season, eligibleWeek, teams) {
  const eligible = rows.filter((row) => Number(row.season) === season && row.game_type === "REG"
    && Number.isInteger(Number(row.week)) && Number(row.week) >= 1 && Number(row.week) <= eligibleWeek);
  const weeksByTeam = {};
  for (const row of eligible) weeksByTeam[row.team] = Math.max(weeksByTeam[row.team] ?? 0, Number(row.week));
  const expectedWeeksByTeam = Object.fromEntries(teams.map((team) => [team, Math.max(1, ...games
    .filter((game) => Number(game.season) === season && game.game_type === "REG" && Number(game.week) <= eligibleWeek
      && (game.home_team === team || game.away_team === team))
    .map((game) => Number(game.week)))]));
  const rosterWeeksByTeam = Object.fromEntries(teams.map((team) => [team, weeksByTeam[team] ?? null]));
  const missingTeamWeeks = teams.filter((team) => (weeksByTeam[team] ?? 0) < expectedWeeksByTeam[team]);
  // A bye may have no release rows. Retain its latest roster only when the
  // league schedule proves that no more recent game week is required.
  const latestRows = eligible.filter((row) => Number(row.week) === weeksByTeam[row.team]);
  const byId = new Map();
  let duplicateRows = 0;
  for (const row of latestRows) {
    if (!row.gsis_id) continue;
    const previous = byId.get(row.gsis_id);
    if (!previous || Number(row.week) > Number(previous.week)) byId.set(row.gsis_id, row);
    else if (Number(row.week) === Number(previous.week)) {
      const projected = (value) => JSON.stringify([value.team, value.status, value.full_name, value.position, value.jersey_number, value.years_exp]);
      if (projected(previous) !== projected(row)) throw new Error(`Conflicting roster records for a stable player ID in week ${row.week}`);
      duplicateRows++;
    }
  }
  return { rows: [...byId.values()], rosterWeek: Math.max(...Object.values(weeksByTeam)),
    rosterWeeksByTeam, expectedRosterWeeksByTeam: expectedWeeksByTeam, missingTeamWeeks,
    duplicateRows, unidentifiedRows: latestRows.filter((row) => !row.gsis_id).length };
}
