const DEFAULT_INPUT_RATE = 5;
const DEFAULT_OUTPUT_RATE = 30;

export function modelTokenRatesUsdPerMillion(model = "gpt-5.6-luna") {
  const normalized = String(model).toLowerCase();
  if (normalized.includes("gpt-5.6-luna")) return { input: 1, output: 6 };
  if (normalized.includes("gpt-5.6-terra")) return { input: 2.5, output: 15 };
  if (normalized === "gpt-5.6" || normalized.includes("gpt-5.6-sol")) {
    return { input: 5, output: 30 };
  }
  return { input: DEFAULT_INPUT_RATE, output: DEFAULT_OUTPUT_RATE };
}

export function estimateTokenCostMicros({ model, inputTokens, outputTokens }) {
  const rates = modelTokenRatesUsdPerMillion(model);
  const safeInput = Math.max(0, Number(inputTokens) || 0);
  const safeOutput = Math.max(0, Number(outputTokens) || 0);
  return Math.ceil(safeInput * rates.input + safeOutput * rates.output);
}

export function requestReservationMicros(model) {
  return Math.max(25_000, estimateTokenCostMicros({
    model,
    inputTokens: 5_000,
    outputTokens: 1_000,
  }));
}
