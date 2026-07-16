export type TokenRates = { input: number; output: number };

export function modelTokenRatesUsdPerMillion(model?: string): TokenRates;

export function estimateTokenCostMicros(input: {
  model?: string;
  inputTokens: number;
  outputTokens: number;
}): number;

export function requestReservationMicros(model?: string): number;
