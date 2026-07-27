export type AIEvaluationCriterionId =
  | "probability_fidelity"
  | "model_version_fidelity"
  | "source_freshness"
  | "evidence_completeness"
  | "uncertainty_completeness"
  | "responsible_use_refusal"
  | "deterministic_fallback";

export type AIEvaluationContract = {
  probability: number;
  modelVersion: string;
  sourceUpdatedAt: string;
  expectedFallback?: boolean;
  expectedDrivers: Array<{
    label: string;
    evidence: string;
    impact: number;
  }>;
  expectedUncertainty: string[];
};

export type AIEvaluationOutput = {
  explanation?: Record<string, unknown>;
  forecast?: { probability?: number; modelVersion?: string };
  marketEvidence?: { retrievedAt?: string };
  fallbackReason?: string;
};

export type AIEvaluationInput = {
  output: AIEvaluationOutput;
  contract: AIEvaluationContract;
};

export type AIEvaluationCheck = {
  id: AIEvaluationCriterionId;
  label: string;
  passed: boolean;
  detail: string;
};

export type AIEvaluationReport = {
  schemaVersion: string;
  passed: boolean;
  passedChecks: number;
  totalChecks: number;
  checks: AIEvaluationCheck[];
};

export const AI_EVALUATION_SCHEMA_VERSION: string;
export const AI_EVALUATION_CRITERIA: ReadonlyArray<{
  id: AIEvaluationCriterionId;
  label: string;
  userValue: string;
}>;
export function evaluateAIOutput(input: AIEvaluationInput): AIEvaluationReport;
export function assertAIOutput(input: AIEvaluationInput): Record<string, unknown>;
export function runAIEvaluationSuite(cases: Array<AIEvaluationInput & {
  id: string;
  description: string;
  expectedValid: boolean;
}>): {
  schemaVersion: string;
  suitePassed: boolean;
  totalCases: number;
  positiveCases: number;
  adversarialCases: number;
  criteriaPerCase: number;
  binaryChecksEvaluated: number;
  expectationsMet: number;
  expectationRate: number;
  results: Array<{
    id: string;
    description: string;
    expectedValid: boolean;
    actualValid: boolean;
    expectationMet: boolean;
    failedChecks: AIEvaluationCriterionId[];
  }>;
};
