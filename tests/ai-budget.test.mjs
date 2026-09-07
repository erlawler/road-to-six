import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateTokenCostMicros,
  modelTokenRatesUsdPerMillion,
  requestReservationMicros,
} from "../lib/ai-budget.mjs";

test("uses the documented GPT-5.6 Luna standard token rates", () => {
  assert.deepEqual(modelTokenRatesUsdPerMillion("gpt-5.6-luna"), {
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2,
  });
  assert.equal(estimateTokenCostMicros({
    model: "gpt-5.6-luna",
    inputTokens: 1_000,
    outputTokens: 500,
  }), 800);
});

test("prices GPT-5.6 alias conservatively as the Sol model", () => {
  assert.deepEqual(modelTokenRatesUsdPerMillion("gpt-5.6"), {
    input: 4,
    cachedInput: 0.4,
    output: 20,
  });
  assert.equal(estimateTokenCostMicros({
    model: "gpt-5.6",
    inputTokens: 1_000,
    outputTokens: 500,
  }), 14_000);
});

test("uses the current Terra rates and discounts only cached input tokens", () => {
  assert.deepEqual(modelTokenRatesUsdPerMillion("gpt-5.6-terra"), {
    input: 2,
    cachedInput: 0.2,
    output: 12,
  });
  assert.equal(estimateTokenCostMicros({
    model: "gpt-5.6-luna",
    inputTokens: 1_000,
    cachedInputTokens: 600,
    outputTokens: 500,
  }), 692);
});

test("reserves enough budget for the bounded two-call explanation flow", () => {
  assert.equal(requestReservationMicros("gpt-5.6-luna"), 25_000);
  assert.equal(requestReservationMicros("gpt-5.6-terra"), 30_500);
  assert.equal(requestReservationMicros("gpt-5.6"), 55_000);
});

test("can apply the conservative input-rate reservation margin", () => {
  assert.equal(estimateTokenCostMicros({
    model: "gpt-5.6",
    inputTokens: 1_000,
    outputTokens: 500,
    inputRateMultiplier: 1.25,
  }), 15_000);
});
