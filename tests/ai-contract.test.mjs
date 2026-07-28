import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_OPENAI_MODELS,
  AI_CONTRACT_VERSION,
  AI_EVAL_VERSION,
  AI_FALLBACK_REASON_CODES,
  AI_PROMPT_VERSION,
  AI_VALIDATION_STATUSES,
  buildForecastExplanationSchema,
  buildGroundedForecastExplanationRequest,
  buildInitialForecastExplanationRequest,
  isApprovedOpenAIModel,
} from "../lib/ai-contract.mjs";

const game = {
  week: 1,
  opponentName: "New York Giants",
};
const controls = {
  quarterback: 100,
  lamb: 100,
  pickens: 100,
  williams: 100,
  defense: 100,
  opponentStar: 100,
};
const forecast = {
  probability: 0.55,
  footballOnly: 0.56,
  marketImplied: 0.55,
  confidenceLow: 0.47,
  confidenceHigh: 0.63,
  modelVersion: "elo-market-v1.1.0",
  drivers: [{
    label: "Team strength baseline",
    evidence: "Walk-forward Elo ratings.",
    impact: 6,
  }],
  uncertainty: ["Opening prices can change before kickoff."],
};

test("versions the prompt, structured contract, and evaluation independently", () => {
  assert.equal(AI_PROMPT_VERSION, "forecast-explanation-prompt-v1.0.0");
  assert.equal(AI_CONTRACT_VERSION, "forecast-explanation-contract-v1.0.0");
  assert.equal(AI_EVAL_VERSION, "1.0.0");
  assert.deepEqual(APPROVED_OPENAI_MODELS, [
    "gpt-5.6-luna",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
    "gpt-5.6",
  ]);
  assert.equal(isApprovedOpenAIModel("gpt-5.6-luna"), true);
  assert.equal(isApprovedOpenAIModel("gpt-5.6-luna-preview"), false);
  assert.deepEqual(AI_VALIDATION_STATUSES, ["passed", "failed", "not_run"]);
  assert.equal(AI_FALLBACK_REASON_CODES.includes("unsupported_model"), true);
  assert.equal(AI_FALLBACK_REASON_CODES.includes("rate_limited"), true);
  assert.equal(AI_FALLBACK_REASON_CODES.includes("output_validation_failed"), true);
});

test("builds the required tool call before the grounded explanation", () => {
  const request = buildInitialForecastExplanationRequest({
    model: "gpt-5.6-luna",
    game,
    controls,
  });

  assert.equal(request.model, "gpt-5.6-luna");
  assert.equal(request.tool_choice.name, "get_forecast");
  assert.equal(request.tools[0].strict, true);
  assert.match(request.input[0].content, /Never recommend a bet/);
  assert.equal(request.store, false);
});

test("grounds the second request in the immutable forecast and strict schema", () => {
  const firstOutput = [
    {
      type: "message",
      content: [{ type: "output_text", text: "Do not forward this extra output." }],
    },
    {
      type: "function_call",
      call_id: "forecast-call-1",
      name: "get_forecast",
      arguments: "{}",
    },
  ];
  const request = buildGroundedForecastExplanationRequest({
    model: "gpt-5.6-luna",
    game,
    controls,
    firstOutput,
    callId: "forecast-call-1",
    forecast,
    sourceUpdatedAt: "2026-07-15",
  });
  const toolOutput = request.input.find(
    (item) => item.type === "function_call_output",
  );
  const grounded = JSON.parse(toolOutput.output);
  const schema = buildForecastExplanationSchema();

  assert.deepEqual(grounded.forecast, forecast);
  assert.equal(grounded.sourceUpdatedAt, "2026-07-15");
  assert.equal(
    request.input.some((item) => JSON.stringify(item).includes("extra output")),
    false,
  );
  assert.equal(
    request.input.filter((item) => item.type === "function_call").length,
    1,
  );
  assert.equal(request.text.format.strict, true);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.required.includes("probability"), true);
  assert.equal(schema.required.includes("sourceUpdatedAt"), true);
});
