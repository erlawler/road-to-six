import { AI_MAX_INITIAL_OUTPUT_TOKENS, AI_MAX_GROUNDED_OUTPUT_TOKENS } from "./ai-contract.mjs";

const DEFAULT_INPUT_RATE = 4;
const DEFAULT_CACHED_INPUT_RATE = 0.4;
const DEFAULT_OUTPUT_RATE = 20;
export const RESERVATION_INPUT_RATE_MULTIPLIER = 1.25;

export function modelTokenRatesUsdPerMillion(model = "gpt-5.6-luna") {
  const normalized = String(model).toLowerCase();
  if (normalized.includes("gpt-5.6-luna")) {
    return { input: 0.2, cachedInput: 0.02, output: 1.2 };
  }
  if (normalized.includes("gpt-5.6-terra")) {
    return { input: 2, cachedInput: 0.2, output: 12 };
  }
  if (normalized === "gpt-5.6" || normalized.includes("gpt-5.6-sol")) {
    return { input: 4, cachedInput: 0.4, output: 20 };
  }
  return {
    input: DEFAULT_INPUT_RATE,
    cachedInput: DEFAULT_CACHED_INPUT_RATE,
    output: DEFAULT_OUTPUT_RATE,
  };
}

export function estimateTokenCostMicros({
  model,
  inputTokens,
  cachedInputTokens = 0,
  outputTokens,
  inputRateMultiplier = 1,
}) {
  const rates = modelTokenRatesUsdPerMillion(model);
  const safeInput = Math.max(0, Number(inputTokens) || 0);
  const safeCachedInput = Math.min(
    safeInput,
    Math.max(0, Number(cachedInputTokens) || 0),
  );
  const safeUncachedInput = safeInput - safeCachedInput;
  const safeOutput = Math.max(0, Number(outputTokens) || 0);
  const safeInputRateMultiplier = Math.max(1, Number(inputRateMultiplier) || 1);
  return Math.ceil(
    safeUncachedInput * rates.input * safeInputRateMultiplier
      + safeCachedInput * rates.cachedInput
      + safeOutput * rates.output,
  );
}

export function requestReservationMicros(model) {
  return Math.max(25_000, estimateTokenCostMicros({
    model,
    inputTokens: 5_000,
    outputTokens: AI_MAX_INITIAL_OUTPUT_TOKENS + AI_MAX_GROUNDED_OUTPUT_TOKENS,
    inputRateMultiplier: RESERVATION_INPUT_RATE_MULTIPLIER,
  }));
}
