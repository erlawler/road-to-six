export type SeasonGame = {
  id: string; week: number; date: string; opponentName: string; venue: string;
  status: string; kickoffAt: string | null; cowboysScore: number | null; opponentScore: number | null;
};
export type SeasonSnapshot<T extends SeasonGame> = {
  dataVersion: string; schedule: readonly T[];
  season?: { verifiedAt: string | null; weeks: { week: number; startsAt: string | null; endsAt: string | null }[]; byeWeeks: number[] };
};
export function kickoffTimestamp(date: string, time: string): string | null;
export function seasonWeekCalendar(games: { week: string | number; gameday: string }[]): { week: number; startsAt: string | null; endsAt: string | null }[];
export function gameProgress(game: SeasonGame, now?: number): "final" | "result_pending" | "scheduled" | "time_unconfirmed";
export function cowboysSeasonState<T extends SeasonGame>(snapshot: SeasonSnapshot<T>, now?: number): {
  completed: T[]; remaining: T[]; pending: T[]; upcoming: T[];
  record: { wins: number; losses: number; ties: number };
  calendarWeek: number | null; byeWeek: number | null; nextGame: T | null;
  status: "complete" | "results_pending" | "upcoming" | "schedule_unconfirmed"; current: boolean;
};
export function scenarioContextKey(snapshot: { dataVersion: string }, state: { calendarWeek: number | null; nextGame: { id: string } | null; status: string }): string;
