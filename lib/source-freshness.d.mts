export const FOOTBALL_REVIEW_WINDOW_DAYS: number;
export function footballSnapshotFreshness(snapshot: unknown, now?: number): {
  status: "current" | "stale" | "unavailable";
  ageDays: number | null;
  message: string;
};
