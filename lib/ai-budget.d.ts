export type TokenRates = { input: number; cachedInput: number; output: number };

export const RESERVATION_INPUT_RATE_MULTIPLIER: number;

export function modelTokenRatesUsdPerMillion(model?: string): TokenRates;

export function estimateTokenCostMicros(input: {
  model?: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  inputRateMultiplier?: number;
}): number;

export function requestReservationMicros(model?: string): number;
