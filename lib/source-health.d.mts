import type { FootballState } from "./football-store.mjs";
export type CurrentMatchup = {
  status: "verified" | "unavailable" | "bye";
  reason: string | null; season: number; week: number | null;
  game: { id: string; week: number; opponent: string; opponentName: string; kickoffAt: string | null; stadium: string; venue: string } | null;
  record: { wins: number; losses: number; ties: number }; verifiedAt: string;
};
export type SourceTrace = { step: string; status: string; checkedAt: string | null; sourceUrl?: string; detail: string };
export type SourceHealth = {
  status: "current" | "degraded" | "unavailable"; observedAt: string; dataVersion: string;
  latestOutcome: string; lastAttemptAt: string | null; lastSuccessAt: string | null;
  lastSuccessfulDurationMs: number | null; snapshotAgeDays: number | null; sourceValidation: string;
  coverage: { games: number; featuredPlayers: number; opponentTeams: number; opponentLeaders: number; usageTeams: number; missing: string[] };
  metrics: { uptime: null; modelAccuracy: null; paidAiLatency: null; paidAiCost: null };
  trace: SourceTrace[]; limitations: string[];
};
export function getCurrentMatchup(state: FootballState, now?: number): CurrentMatchup;
export function getSourceHealth(state: FootballState, now?: number): SourceHealth;
