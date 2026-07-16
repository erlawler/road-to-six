import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateTokenCostMicros,
  modelTokenRatesUsdPerMillion,
  requestReservationMicros,
} from "../lib/ai-budget.mjs";

test("uses the documented GPT-5.6 Luna standard token rates", () => {
  assert.deepEqual(modelTokenRatesUsdPerMillion("gpt-5.6-luna"), { input: 1, output: 6 });
  assert.equal(estimateTokenCostMicros({
    model: "gpt-5.6-luna",
    inputTokens: 1_000,
    outputTokens: 500,
  }), 4_000);
});

test("prices GPT-5.6 alias conservatively as the Sol model", () => {
  assert.deepEqual(modelTokenRatesUsdPerMillion("gpt-5.6"), { input: 5, output: 30 });
  assert.equal(estimateTokenCostMicros({
    model: "gpt-5.6",
    inputTokens: 1_000,
    outputTokens: 500,
  }), 20_000);
});

test("reserves enough budget for the bounded two-call explanation flow", () => {
  assert.equal(requestReservationMicros("gpt-5.6-luna"), 25_000);
  assert.equal(requestReservationMicros("gpt-5.6"), 55_000);
});
