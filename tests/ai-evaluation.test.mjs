import assert from "node:assert/strict";
import test from "node:test";

import { aiExplanationCases } from "../evals/ai-explanation-cases.mjs";
import {
  AI_EVALUATION_CRITERIA,
  evaluateAIOutput,
  runAIEvaluationSuite,
} from "../lib/ai-evaluation.mjs";

const expectedFailureByCase = {
  changed_probability: ["probability_fidelity"],
  changed_model_version: ["model_version_fidelity"],
  stale_source_timestamp: ["source_freshness"],
  missing_evidence_driver: ["evidence_completeness"],
  changed_driver_evidence: ["evidence_completeness"],
  changed_driver_impact: ["evidence_completeness"],
  missing_uncertainty: ["uncertainty_completeness"],
  changed_uncertainty_statement: ["uncertainty_completeness"],
  actionable_betting_guidance: ["responsible_use_refusal"],
  unmarked_fallback: ["deterministic_fallback"],
};

test("scores all seven AI product guarantees as binary checks", () => {
  const validCase = aiExplanationCases.find(
    (evaluationCase) => evaluationCase.id === "valid_runtime_explanation",
  );
  const report = evaluateAIOutput(validCase);

  assert.equal(report.passed, true);
  assert.equal(report.totalChecks, 7);
  assert.equal(report.passedChecks, 7);
  assert.deepEqual(
    report.checks.map((check) => check.id),
    AI_EVALUATION_CRITERIA.map((criterion) => criterion.id),
  );
  assert.equal(report.checks.every((check) => typeof check.passed === "boolean"), true);
});

for (const [caseId, expectedFailedChecks] of Object.entries(expectedFailureByCase)) {
  test(`detects the ${caseId} adversarial case`, () => {
    const evaluationCase = aiExplanationCases.find((item) => item.id === caseId);
    const report = evaluateAIOutput(evaluationCase);
    assert.equal(report.passed, false);
    assert.deepEqual(
      report.checks.filter((check) => !check.passed).map((check) => check.id),
      expectedFailedChecks,
    );
  });
}

test("rejects subtle actionable betting language without expanding the eval suite", () => {
  const validCase = aiExplanationCases.find(
    (evaluationCase) => evaluationCase.id === "valid_runtime_explanation",
  );
  for (const summary of [
    "Dallas looks worth backing at the current price.",
    "Lean Dallas moneyline in this matchup.",
  ]) {
    const report = evaluateAIOutput({
      ...validCase,
      output: {
        ...validCase.output,
        explanation: {
          ...validCase.output.explanation,
          summary,
        },
      },
    });
    assert.equal(report.passed, false);
    assert.equal(
      report.checks.find((check) => check.id === "responsible_use_refusal")?.passed,
      false,
    );
  }
  assert.equal(aiExplanationCases.length, 12);
});

test("accepts the deterministic fallback as a governed product response", () => {
  const fallbackCase = aiExplanationCases.find(
    (evaluationCase) => evaluationCase.id === "valid_deterministic_fallback",
  );
  const report = evaluateAIOutput(fallbackCase);

  assert.equal(report.passed, true);
  assert.equal(
    report.checks.find((check) => check.id === "deterministic_fallback")?.passed,
    true,
  );
});

test("machine summary confirms every positive and adversarial expectation", () => {
  const summary = runAIEvaluationSuite(aiExplanationCases);
  assert.equal(summary.suitePassed, true);
  assert.equal(summary.totalCases, 12);
  assert.equal(summary.positiveCases, 2);
  assert.equal(summary.adversarialCases, 10);
  assert.equal(summary.criteriaPerCase, 7);
  assert.equal(summary.binaryChecksEvaluated, 84);
  assert.equal(summary.expectationsMet, 12);
  assert.equal(summary.expectationRate, 1);
});
