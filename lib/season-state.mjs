import { footballSnapshotFreshness } from "./source-freshness.mjs";

const DAY_MS = 86_400_000;

// nflverse gametime is Eastern local time. Resolve its offset for the actual
// date, including the November DST change, rather than assuming UTC or Dallas.
export function kickoffTimestamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^\d{2}:\d{2}$/.test(time ?? "")) return null;
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    const p = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
    const represented = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    instant += wall - represented;
  }
  return new Date(instant).toISOString();
}

// A league week runs Tuesday through Monday. Derive its start from the league
// schedule so a Cowboys bye is not mistaken for the next scheduled matchup.
export function seasonWeekCalendar(games) {
  const firstDates = new Map();
  for (const game of games) {
    const week = Number(game.week);
    if (!firstDates.has(week) || game.gameday < firstDates.get(week)) firstDates.set(week, game.gameday);
  }
  return [...firstDates].sort(([a], [b]) => a - b).map(([week, date]) => {
    const day = new Date(`${date}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 5) % 7));
    const startDate = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 7);
    return { week, startsAt: kickoffTimestamp(startDate, "00:00"), endsAt: kickoffTimestamp(day.toISOString().slice(0, 10), "00:00") };
  });
}

export function gameProgress(game, now = Date.now()) {
  if (game.status === "final") return "final";
  const kickoff = Date.parse(game.kickoffAt);
  if (Number.isFinite(kickoff)) return kickoff <= now ? "result_pending" : "scheduled";
  // An unconfirmed kickoff is never eligible for a current forecast.
  return "time_unconfirmed";
}

export function cowboysSeasonState(snapshot, now = Date.now()) {
  const schedule = [...snapshot.schedule].sort((a, b) => a.week - b.week);
  const completed = schedule.filter((game) => gameProgress(game, now) === "final");
  const remaining = schedule.filter((game) => gameProgress(game, now) !== "final");
  const pending = remaining.filter((game) => gameProgress(game, now) === "result_pending");
  const upcoming = remaining.filter((game) => gameProgress(game, now) === "scheduled");
  const record = { wins: 0, losses: 0, ties: 0 };
  for (const game of completed) {
    record[game.cowboysScore > game.opponentScore ? "wins" : game.cowboysScore < game.opponentScore ? "losses" : "ties"] += 1;
  }
  const calendarWeek = snapshot.season?.weeks?.find((week) => Date.parse(week.startsAt) <= now && now < Date.parse(week.endsAt))?.week ?? null;
  const byeWeek = calendarWeek !== null && snapshot.season?.byeWeeks?.includes(calendarWeek) ? calendarWeek : null;
  const verificationTime = Date.parse(snapshot.season?.verifiedAt);
  const freshness = footballSnapshotFreshness(snapshot, now);
  const verificationCurrent = Number.isFinite(verificationTime) && verificationTime <= now
    && now - verificationTime <= 7 * DAY_MS;
  const scheduleUnconfirmed = remaining.length > 0 && gameProgress(remaining[0], now) === "time_unconfirmed";
  return {
    completed, remaining, pending, upcoming, record, calendarWeek, byeWeek,
    nextGame: upcoming[0] ?? null,
    status: remaining.length === 0 ? "complete" : pending.length ? "results_pending" : !scheduleUnconfirmed && upcoming.length ? "upcoming" : "schedule_unconfirmed",
    current: freshness.status === "current" && verificationCurrent && pending.length === 0 && !scheduleUnconfirmed,
  };
}

export function scenarioContextKey(snapshot, state) {
  return `${snapshot.dataVersion}:${state.calendarWeek}:${state.nextGame?.id ?? "none"}:${state.status}`;
}
