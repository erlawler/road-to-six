import bundledSnapshot from "../app/data/nfl-snapshot.json";
export type FootballSnapshot = typeof bundledSnapshot;
export type FootballState = {
  snapshot: FootballSnapshot;
  update: { status: string; lastSuccessAt: string | null; lastAttemptAt: string | null; reasonCode: string | null };
  freshness: { status: string; ageDays: number | null; message: string };
};
export const FOOTBALL_STATE_SELECT: string;
export function readFootballState(env: { DB?: D1Database }, fallback: FootballSnapshot): Promise<FootballState>;
export function refreshFootballState(env: { DB?: D1Database }, fallback: FootballSnapshot): Promise<{ status: string; materialChange: boolean; state: FootballState }>;
