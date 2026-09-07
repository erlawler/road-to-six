import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AI_CONTRACT_VERSION, AI_EVAL_VERSION, AI_PROMPT_VERSION } from "../lib/ai-contract.mjs";
import { estimateTokenCostMicros } from "../lib/ai-budget.mjs";
import { calculateForecast, deterministicExplanation } from "../lib/forecast.mjs";
import { scoreRuntimeResponse } from "../lib/live-scorecard-evaluation.mjs";

const snapshot = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const game = snapshot.schedule[0];
const controls = { quarterback: 50, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 };
const scenario = { gameId: game.id, controls };
const expectedModel = "gpt-5.6-luna";
const forecast = calculateForecast({ game: { ...game, opponentStarName: snapshot.opponents[game.opponent].leaders[0].name }, ratings: snapshot.ratings, controls });
const data = {
  forecast,
  explanation: { ...deterministicExplanation({ forecast, game }), mode: "ai", probability: forecast.probability, modelVersion: forecast.modelVersion, sourceUpdatedAt: game.sourceUpdatedAt, comparisonEvidenceIds: ["baseline_change", "control_quarterback"] },
  marketEvidence: { source: "Bundled nflverse market snapshot", retrievedAt: game.sourceUpdatedAt },
  reliability: {
    mode: "ai", requestId: "synthetic-scorecard-test", validationStatus: "passed", fallbackReasonCode: null,
    model: expectedModel, promptVersion: AI_PROMPT_VERSION, contractVersion: AI_CONTRACT_VERSION,
    evalVersion: AI_EVAL_VERSION, forecastVersion: forecast.modelVersion, sourceUpdatedAt: game.sourceUpdatedAt,
    latencyMs: 1000, inputTokens: 100, outputTokens: 50,
    estimatedCostUsd: estimateTokenCostMicros({ model: expectedModel, inputTokens: 100, outputTokens: 50 }) / 1_000_000,
  },
};

test("scorecard accepts a known local scenario with complete receipt evidence", () => {
  assert.equal(scoreRuntimeResponse({ data, scenario, snapshot, expectedModel }).passed, true);
});

test("self-consistent but wrong forecast cannot serve as its own expected answer", () => {
  const changed = structuredClone(data);
  changed.forecast.probability += 0.1;
  changed.explanation.probability = changed.forecast.probability;
  const result = scoreRuntimeResponse({ data: changed, scenario, snapshot, expectedModel });
  assert.equal(result.passed, false);
  assert.equal(result.checks.find(({ id }) => id === "independent_forecast").passed, false);
});

test("scorecard rejects corrupted visible model version and uncertainty bounds", () => {
  const changed = structuredClone(data);
  changed.forecast.modelVersion = "invalid-model";
  changed.forecast.confidenceLow = 0;
  changed.forecast.confidenceHigh = 1;
  assert.equal(scoreRuntimeResponse({ data: changed, scenario, snapshot, expectedModel }).passed, false);
});

test("a self-consistent forecast with fabricated unpaired live consensus fails provenance", () => {
  const changed = structuredClone(data);
  const retrievedAt = new Date(Date.now() - 1000).toISOString();
  changed.marketEvidence = { source: "The Odds API", retrievedAt, cacheExpiresAt: new Date(Date.now() + 10000).toISOString(), market: { cowboysMoneyline: null, opponentMoneyline: null, sportsbookCount: 0, marketImpliedProbability: 0.8 } };
  changed.forecast = calculateForecast({ game: { ...game, ...changed.marketEvidence.market, opponentStarName: snapshot.opponents[game.opponent].leaders[0].name }, ratings: snapshot.ratings, controls });
  changed.explanation = { ...changed.explanation, ...deterministicExplanation({ forecast: changed.forecast, game }), mode: "ai", probability: changed.forecast.probability, sourceUpdatedAt: retrievedAt };
  changed.reliability.sourceUpdatedAt = retrievedAt;
  const result = scoreRuntimeResponse({ data: changed, scenario, snapshot, expectedModel });
  assert.equal(result.checks.find(({ id }) => id === "market_provenance").passed, false);
  assert.equal(result.passed, false);
});

test("scorecard rejects missing, failed, stale-version and implausible usage receipts", () => {
  for (const mutation of [
    { mode: "deterministic" }, { validationStatus: "failed" }, { fallbackReasonCode: "budget_exhausted" },
    { promptVersion: "old" }, { contractVersion: "old" }, { evalVersion: "old" }, { model: "unexpected" },
    { inputTokens: 0 }, { outputTokens: "50" }, { estimatedCostUsd: 0 }, { estimatedCostUsd: 1 },
  ]) {
    assert.equal(scoreRuntimeResponse({ data: { ...data, reliability: { ...data.reliability, ...mutation } }, scenario, snapshot, expectedModel }).passed, false, JSON.stringify(mutation));
  }
  assert.equal(scoreRuntimeResponse({ data: { ...data, reliability: undefined }, scenario, snapshot, expectedModel }).passed, false);
});
