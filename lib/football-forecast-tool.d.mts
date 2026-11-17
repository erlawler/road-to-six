import type { FootballState } from "./football-store.mjs";

export const FORECAST_TOOL_SCHEMA_VERSION: string;
export const FORECAST_CONTROL_KEYS: readonly string[];
export const MODEL_CARD_URL: string;

export type FootballForecastResult = {
  schemaVersion: string;
  status: "available" | "unavailable";
  reasons: string[];
  scope: "football_only";
  marketPricesIncluded: false;
  matchup: { season: number; week: number | null; opponent: string; opponentName: string; kickoffAt: string | null; venue: string } | null;
  forecast: {
    cowboysWinProbability: number; cowboysWinPercent: number; baselinePercent: number; scenarioDeltaPoints: number;
    illustrativeBandPercent: { low: number; high: number }; scenarioApplied: boolean; controls: Record<string, number>;
    drivers: { label: string; impactPoints: number; evidence: string }[]; modelVersion: string; uncertainty: string[];
  } | null;
  ratings: { dallas: number; opponent: number; trainedThrough: string | null } | null;
  evaluation: { holdout: string; games: number | null; footballOnlyBrier: number; marketBaselineBrier: number; note: string } | null;
  modelCardUrl: string;
};

export function getFootballForecast(state: FootballState, scenario?: Partial<Record<string, number>>, now?: number): FootballForecastResult;
