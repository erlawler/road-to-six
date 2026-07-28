import type { ForecastResult, ScenarioControls } from "./forecast.mjs";

export type AIValidationStatus = "passed" | "failed" | "not_run";

export type AIFallbackReasonCode =
  | "ai_not_configured"
  | "unsupported_model"
  | "rate_limit_unavailable"
  | "rate_limited"
  | "budget_ledger_unavailable"
  | "budget_exhausted"
  | "provider_timeout"
  | "provider_http_error"
  | "provider_unavailable"
  | "tool_contract_violation"
  | "output_parse_failed"
  | "output_validation_failed"
  | "runtime_error"
  | "request_body_too_large"
  | "unsupported_content_type"
  | "invalid_json"
  | "unknown_game";

export type AIReliabilityMode = "ai" | "deterministic" | "rejected";

export type AIReliabilityReceipt = {
  mode: AIReliabilityMode;
  requestId: string;
  model: string;
  promptVersion: string;
  contractVersion: string;
  evalVersion: string;
  forecastVersion: string;
  validationStatus: AIValidationStatus;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  fallbackReasonCode: AIFallbackReasonCode | null;
  sourceUpdatedAt: string;
};

export const AI_PROMPT_VERSION: string;
export const AI_CONTRACT_VERSION: string;
export const AI_EVAL_VERSION: string;
export type ApprovedOpenAIModel =
  | "gpt-5.6-luna"
  | "gpt-5.6-terra"
  | "gpt-5.6-sol"
  | "gpt-5.6";
export const APPROVED_OPENAI_MODELS: ReadonlyArray<ApprovedOpenAIModel>;
export const AI_VALIDATION_STATUSES: ReadonlyArray<AIValidationStatus>;
export const AI_FALLBACK_REASON_CODES: ReadonlyArray<AIFallbackReasonCode>;
export function isApprovedOpenAIModel(model: unknown): model is ApprovedOpenAIModel;

export type ForecastExplanationGame = {
  week: number;
  opponentName: string;
};

export type ForecastExplanationRequestInput = {
  model: string;
  game: ForecastExplanationGame;
  controls: ScenarioControls;
};

export function buildForecastExplanationTool(): Record<string, unknown>;
export function buildForecastExplanationInput(input: {
  game: ForecastExplanationGame;
  controls: ScenarioControls;
}): Array<Record<string, unknown>>;
export function buildForecastExplanationSchema(): Record<string, unknown>;
export function buildInitialForecastExplanationRequest(
  input: ForecastExplanationRequestInput,
): Record<string, unknown>;
export function buildGroundedForecastExplanationRequest(
  input: ForecastExplanationRequestInput & {
    firstOutput: Array<Record<string, unknown>>;
    callId: string;
    forecast: ForecastResult;
    sourceUpdatedAt: string;
  },
): Record<string, unknown>;
