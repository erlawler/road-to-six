export const AI_PROMPT_VERSION = "forecast-explanation-prompt-v1.0.0";
export const AI_CONTRACT_VERSION = "forecast-explanation-contract-v1.0.0";
export const AI_EVAL_VERSION = "1.0.0";
export const APPROVED_OPENAI_MODELS = Object.freeze([
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.6",
]);

export const AI_VALIDATION_STATUSES = Object.freeze([
  "passed",
  "failed",
  "not_run",
]);

export const AI_FALLBACK_REASON_CODES = Object.freeze([
  "ai_not_configured",
  "unsupported_model",
  "rate_limit_unavailable",
  "rate_limited",
  "budget_ledger_unavailable",
  "budget_exhausted",
  "provider_timeout",
  "provider_http_error",
  "provider_unavailable",
  "tool_contract_violation",
  "output_parse_failed",
  "output_validation_failed",
  "runtime_error",
  "request_body_too_large",
  "unsupported_content_type",
  "invalid_json",
  "unknown_game",
]);

export function isApprovedOpenAIModel(model) {
  return typeof model === "string" && APPROVED_OPENAI_MODELS.includes(model);
}

export function buildForecastExplanationTool() {
  return {
    type: "function",
    name: "get_forecast",
    description: "Return the versioned probability result that must be used without alteration.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  };
}

export function buildForecastExplanationInput({ game, controls }) {
  return [
    {
      role: "system",
      content: "Explain an educational football forecast. Call get_forecast before explaining. Preserve the exact probability, model version, source timestamp, driver labels, driver evidence, driver impacts, and uncertainty returned by the tool. Never recommend a bet, stake, payout, sportsbook, or action.",
    },
    {
      role: "user",
      content: `Explain the Dallas scenario for Week ${game.week} against ${game.opponentName}. The scenario assumptions are ${JSON.stringify(controls)}.`,
    },
  ];
}

export function buildForecastExplanationSchema() {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      drivers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            evidence: { type: "string" },
            impact: { type: "number" },
          },
          required: ["label", "evidence", "impact"],
          additionalProperties: false,
        },
      },
      uncertainty: { type: "array", items: { type: "string" } },
      disclaimer: { type: "string" },
      probability: { type: "number" },
      modelVersion: { type: "string" },
      sourceUpdatedAt: { type: "string" },
    },
    required: [
      "summary",
      "drivers",
      "uncertainty",
      "disclaimer",
      "probability",
      "modelVersion",
      "sourceUpdatedAt",
    ],
    additionalProperties: false,
  };
}

export function buildInitialForecastExplanationRequest({
  model,
  game,
  controls,
}) {
  return {
    model,
    input: buildForecastExplanationInput({ game, controls }),
    tools: [buildForecastExplanationTool()],
    tool_choice: { type: "function", name: "get_forecast" },
    max_output_tokens: 300,
    store: false,
  };
}

export function buildGroundedForecastExplanationRequest({
  model,
  game,
  controls,
  firstOutput,
  callId,
  forecast,
  sourceUpdatedAt,
}) {
  const validatedFunctionCall = firstOutput.find((item) => (
    item?.type === "function_call"
    && item.name === "get_forecast"
    && item.call_id === callId
  ));
  if (!validatedFunctionCall) {
    throw new Error("The validated get_forecast call is required");
  }
  return {
    model,
    input: [
      ...buildForecastExplanationInput({ game, controls }),
      validatedFunctionCall,
      {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({ forecast, sourceUpdatedAt }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "forecast_explanation",
        strict: true,
        schema: buildForecastExplanationSchema(),
      },
    },
    max_output_tokens: 500,
    store: false,
  };
}
