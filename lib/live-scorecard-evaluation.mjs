import { AI_CONTRACT_VERSION, AI_EVAL_VERSION, AI_PROMPT_VERSION } from "./ai-contract.mjs";
import { estimateTokenCostMicros } from "./ai-budget.mjs";
import { evaluateAIOutput } from "./ai-evaluation.mjs";
import { calculateForecast } from "./forecast.mjs";
import { buildComparisonEvidence } from "./scenario-comparison.mjs";

export function scoreRuntimeResponse({ data, scenario, snapshot, expectedModel }) {
  const game = snapshot.schedule.find((item) => item.id === scenario.gameId);
  if (!game) throw new Error("Scorecard scenario is absent from the local source snapshot");
  const market = data.marketEvidence;
  const live = market?.source === "The Odds API";
  // Current market inputs are observed response evidence; ratings and scoring come from this checkout.
  const effectiveGame = live ? {
    ...game,
    cowboysMoneyline: market.market?.cowboysMoneyline ?? null,
    opponentMoneyline: market.market?.opponentMoneyline ?? null,
    marketImpliedProbability: market.market?.marketImpliedProbability ?? null,
    sportsbookCount: market.market?.sportsbookCount ?? 0,
  } : game;
  const forecast = calculateForecast({
    game: { ...effectiveGame, opponentStarName: snapshot.opponents[game.opponent]?.leaders[0]?.name },
    ratings: snapshot.ratings,
    controls: scenario.controls,
  });
  const sourceUpdatedAt = live ? market.retrievedAt : game.sourceUpdatedAt;
  const contract = {
    probability: forecast.probability,
    modelVersion: forecast.modelVersion,
    sourceUpdatedAt,
    expectedDrivers: forecast.drivers,
    expectedUncertainty: forecast.uncertainty,
    expectedComparisonEvidence: buildComparisonEvidence({ forecast, controls: scenario.controls }),
  };
  const report = evaluateAIOutput({ output: data, contract });
  const receipt = data.reliability ?? {};
  const validCount = (value) => Number.isInteger(value) && value > 0;
  const tokenCountsValid = validCount(receipt.inputTokens) && validCount(receipt.outputTokens);
  const minCost = estimateTokenCostMicros({ model: expectedModel, inputTokens: receipt.inputTokens, cachedInputTokens: receipt.inputTokens, outputTokens: receipt.outputTokens }) / 1_000_000;
  const maxCost = estimateTokenCostMicros({ model: expectedModel, inputTokens: receipt.inputTokens, outputTokens: receipt.outputTokens }) / 1_000_000;
  const validQuote = (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 100;
  const liveMarket = market?.market;
  const hasPair = validQuote(liveMarket?.cowboysMoneyline) && validQuote(liveMarket?.opponentMoneyline);
  const hasProbability = typeof liveMarket?.marketImpliedProbability === "number" && liveMarket.marketImpliedProbability > 0 && liveMarket.marketImpliedProbability < 1;
  const marketCoverageValid = hasPair && hasProbability && Number.isInteger(liveMarket.sportsbookCount) && liveMarket.sportsbookCount >= 1
    || liveMarket?.cowboysMoneyline === null && liveMarket?.opponentMoneyline === null && liveMarket?.marketImpliedProbability === null && liveMarket?.sportsbookCount === 0;
  const retrievedAt = Date.parse(sourceUpdatedAt);
  const expiresAt = Date.parse(market?.cacheExpiresAt);
  const checks = [
    ...report.checks,
    { id: "independent_forecast", passed: ["probability", "baselineProbability", "scenarioDelta", "footballOnly", "confidenceLow", "confidenceHigh", "marketImplied"].every((key) => forecast[key] === null ? data.forecast?.[key] === null : typeof data.forecast?.[key] === "number" && Math.abs(data.forecast[key] - forecast[key]) < 1e-9) && data.forecast?.modelVersion === forecast.modelVersion && JSON.stringify(data.forecast?.drivers) === JSON.stringify(forecast.drivers) && JSON.stringify(data.forecast?.uncertainty) === JSON.stringify(forecast.uncertainty) },
    { id: "receipt_contract", passed: receipt.mode === "ai" && data.explanation?.mode === "ai" && receipt.validationStatus === "passed" && receipt.fallbackReasonCode === null && data.fallbackReason == null && receipt.model === expectedModel && receipt.promptVersion === AI_PROMPT_VERSION && receipt.contractVersion === AI_CONTRACT_VERSION && receipt.evalVersion === AI_EVAL_VERSION && receipt.forecastVersion === forecast.modelVersion && receipt.sourceUpdatedAt === sourceUpdatedAt && typeof receipt.requestId === "string" && receipt.requestId.length > 0 },
    { id: "receipt_usage", passed: tokenCountsValid && Number.isFinite(receipt.latencyMs) && receipt.latencyMs >= 0 && Number.isFinite(receipt.estimatedCostUsd) && receipt.estimatedCostUsd + 1e-9 >= minCost && receipt.estimatedCostUsd <= maxCost + 1e-9 },
    { id: "market_provenance", passed: live ? Number.isFinite(retrievedAt) && retrievedAt <= Date.now() && expiresAt > Date.now() && expiresAt <= retrievedAt + 6 * 60 * 60 * 1000 && marketCoverageValid : market?.source === "Bundled nflverse market snapshot" && market.retrievedAt === game.sourceUpdatedAt },
  ];
  return { passed: checks.every((check) => check.passed), checks, contract, forecast };
}
