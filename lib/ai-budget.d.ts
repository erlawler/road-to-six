export type TokenRates = { input: number; output: number };

export const PROMPT_CACHE_WRITE_INPUT_MULTIPLIER: number;

export function modelTokenRatesUsdPerMillion(model?: string): TokenRates;

export function estimateTokenCostMicros(input: {
  model?: string;
  inputTokens: number;
  outputTokens: number;
  inputRateMultiplier?: number;
}): number;

export function requestReservationMicros(model?: string): number;
