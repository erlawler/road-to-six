export type ScenarioControls = {
  quarterback: number;
  lamb: number;
  pickens: number;
  williams: number;
  defense: number;
  opponentStar: number;
};

export type ForecastGame = {
  opponent: string;
  opponentName: string;
  venue: "home" | "away" | "neutral";
  cowboysMoneyline: number | null;
  opponentMoneyline: number | null;
  opponentStarName?: string;
};

export type ForecastResult = {
  probability: number;
  footballOnly: number;
  marketImplied: number | null;
  confidenceLow: number;
  confidenceHigh: number;
  modelVersion: string;
  drivers: Array<{ label: string; impact: number; evidence: string }>;
  uncertainty: string[];
};

export const MODEL_VERSION: string;
export const FOOTBALL_WEIGHT_WITH_MARKET: number;
export function clampProbability(value: number): number;
export function moneylineToImplied(moneyline: number | null): number | null;
export function removeVig(cowboysMoneyline: number | null, opponentMoneyline: number | null): number | null;
export function eloWinProbability(cowboysElo: number, opponentElo: number, venue: ForecastGame["venue"]): number;
export function calculateForecast(input: {
  game: ForecastGame;
  ratings: Record<string, number>;
  controls: ScenarioControls;
}): ForecastResult;
export function deterministicExplanation(input: { forecast: ForecastResult; game: ForecastGame }): {
  mode: "deterministic";
  summary: string;
  drivers: ForecastResult["drivers"];
  uncertainty: string[];
  disclaimer: string;
};
