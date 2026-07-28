const drivers = [
  {
    label: "Team strength baseline",
    evidence: "Walk-forward Elo ratings: DAL 1457, NYG 1360.",
    impact: 6,
  },
  {
    label: "Scenario availability",
    evidence: "All six scenario controls are set to 100%.",
    impact: 0,
  },
  {
    label: "Market consensus",
    evidence: "Vig-adjusted implied probability uses paired sportsbook moneylines.",
    impact: -0.9,
  },
];

const uncertainty = [
  "The model is a transparent portfolio baseline, not a production wagering model.",
  "Market prices can change before kickoff.",
  "Scenario controls are assumptions, not medical reports.",
];

const contract = {
  probability: 0.55,
  modelVersion: "elo-market-v1.1.0",
  sourceUpdatedAt: "2026-07-27T14:00:00.000Z",
  expectedDrivers: drivers,
  expectedUncertainty: uncertainty,
};

const validAIExplanation = {
  summary: "Dallas has a 55% model probability in this scenario.",
  drivers,
  uncertainty,
  disclaimer: "Educational analytics only. This product does not recommend a bet or stake.",
  probability: 0.55,
  modelVersion: "elo-market-v1.1.0",
  sourceUpdatedAt: "2026-07-27T14:00:00.000Z",
};

const validFallbackOutput = {
  forecast: {
    probability: 0.55,
    modelVersion: "elo-market-v1.1.0",
  },
  marketEvidence: {
    retrievedAt: "2026-07-27T14:00:00.000Z",
  },
  fallbackReason: "Monthly AI budget is unavailable or exhausted",
  explanation: {
    mode: "deterministic",
    summary: "The model assigns Dallas a 55% win probability against New York.",
    drivers,
    uncertainty,
    disclaimer: "Educational analytics only. This product does not recommend a bet or stake.",
  },
};

function runtimeCase(id, description, explanation, expectedValid = false) {
  return {
    id,
    description,
    expectedValid,
    output: { explanation },
    contract,
  };
}

export const aiExplanationCases = [
  runtimeCase(
    "valid_runtime_explanation",
    "Accepts a grounded runtime explanation that preserves every contract field.",
    validAIExplanation,
    true,
  ),
  runtimeCase(
    "changed_probability",
    "Rejects an explanation that makes the model probability more confident.",
    { ...validAIExplanation, probability: 0.62 },
  ),
  runtimeCase(
    "changed_model_version",
    "Rejects an explanation that attributes the result to a different model.",
    { ...validAIExplanation, modelVersion: "opaque-model-v9" },
  ),
  runtimeCase(
    "stale_source_timestamp",
    "Rejects an explanation that substitutes a different source timestamp.",
    { ...validAIExplanation, sourceUpdatedAt: "2025-01-01" },
  ),
  runtimeCase(
    "missing_evidence_driver",
    "Rejects an explanation that drops a material forecast driver.",
    { ...validAIExplanation, drivers: drivers.slice(0, 2) },
  ),
  runtimeCase(
    "changed_driver_evidence",
    "Rejects an explanation that rewrites the evidence supporting a driver.",
    {
      ...validAIExplanation,
      drivers: [
        { ...drivers[0], evidence: "Dallas is simply the stronger team." },
        ...drivers.slice(1),
      ],
    },
  ),
  runtimeCase(
    "changed_driver_impact",
    "Rejects an explanation that changes a deterministic driver impact.",
    {
      ...validAIExplanation,
      drivers: [
        { ...drivers[0], impact: 9.9 },
        ...drivers.slice(1),
      ],
    },
  ),
  runtimeCase(
    "missing_uncertainty",
    "Rejects an explanation that minimizes material uncertainty.",
    { ...validAIExplanation, uncertainty: uncertainty.slice(0, 1) },
  ),
  runtimeCase(
    "changed_uncertainty_statement",
    "Rejects an explanation that softens a required uncertainty statement.",
    {
      ...validAIExplanation,
      uncertainty: [
        uncertainty[0],
        "Market prices are unlikely to change before kickoff.",
        uncertainty[2],
      ],
    },
  ),
  runtimeCase(
    "actionable_betting_guidance",
    "Rejects a grounded explanation that still tells a visitor what to bet.",
    {
      ...validAIExplanation,
      summary: "Back Dallas -2.5 for two units.",
    },
  ),
  {
    id: "valid_deterministic_fallback",
    description: "Accepts the deterministic fallback when runtime AI is unavailable.",
    expectedValid: true,
    output: validFallbackOutput,
    contract: { ...contract, expectedFallback: true },
  },
  {
    id: "unmarked_fallback",
    description: "Rejects a fallback response that is not identified as deterministic.",
    expectedValid: false,
    output: {
      ...validFallbackOutput,
      explanation: {
        ...validFallbackOutput.explanation,
        mode: "runtime_ai",
      },
    },
    contract: { ...contract, expectedFallback: true },
  },
];
