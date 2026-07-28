import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { evaluateAIOutput } from "../lib/ai-evaluation.mjs";
import { deterministicExplanation } from "../lib/forecast.mjs";

const DEFAULT_BASE_URL = "http://localhost:3000";
const EXPECTED_MODE = "ai";

const scenarios = Object.freeze([
  {
    id: "baseline_week_1",
    gameId: "2026_01_DAL_NYG",
    opponentName: "New York Giants",
    controls: {
      quarterback: 100,
      lamb: 100,
      pickens: 100,
      williams: 100,
      defense: 100,
      opponentStar: 100,
    },
  },
  {
    id: "pickens_reduced",
    gameId: "2026_02_WAS_DAL",
    opponentName: "Washington Commanders",
    controls: {
      quarterback: 100,
      lamb: 100,
      pickens: 50,
      williams: 100,
      defense: 100,
      opponentStar: 100,
    },
  },
  {
    id: "williams_reduced",
    gameId: "2026_03_BAL_DAL",
    opponentName: "Baltimore Ravens",
    controls: {
      quarterback: 100,
      lamb: 100,
      pickens: 100,
      williams: 50,
      defense: 100,
      opponentStar: 100,
    },
  },
  {
    id: "two_sided_stress",
    gameId: "2026_06_DAL_GB",
    opponentName: "Green Bay Packers",
    controls: {
      quarterback: 75,
      lamb: 80,
      pickens: 70,
      williams: 85,
      defense: 80,
      opponentStar: 60,
    },
  },
]);

function rounded(value, digits = 6) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

function summarizeChecks(report) {
  return report.checks.map(({ id, passed }) => ({ id, passed }));
}

function buildContract(data) {
  const sourceUpdatedAt = data.reliability?.sourceUpdatedAt
    ?? data.explanation?.sourceUpdatedAt
    ?? data.marketEvidence?.retrievedAt;
  return {
    probability: data.forecast.probability,
    modelVersion: data.forecast.modelVersion,
    sourceUpdatedAt,
    expectedDrivers: data.forecast.drivers,
    expectedUncertainty: data.forecast.uncertainty,
  };
}

function deterministicBaseline(data, scenario) {
  const startedAt = performance.now();
  const explanation = deterministicExplanation({
    forecast: data.forecast,
    game: { opponentName: scenario.opponentName },
  });
  const latencyMs = performance.now() - startedAt;
  const output = {
    forecast: data.forecast,
    explanation,
    fallbackReason: "scorecard_deterministic_baseline",
    marketEvidence: data.marketEvidence,
  };
  const report = evaluateAIOutput({
    output,
    contract: {
      ...buildContract(data),
      expectedFallback: true,
    },
  });
  return {
    scenarioId: scenario.id,
    mode: "deterministic",
    passed: report.passed,
    validationStatus: report.passed ? "passed" : "failed",
    latencyMs: rounded(latencyMs, 3),
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    checks: summarizeChecks(report),
  };
}

async function evaluateRuntime(baseUrl, scenario) {
  const startedAt = performance.now();
  const response = await fetch(new URL("/api/forecast", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId: scenario.gameId,
      controls: scenario.controls,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const measuredLatencyMs = performance.now() - startedAt;
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Scenario ${scenario.id} returned HTTP ${response.status}`);
  }

  const report = evaluateAIOutput({
    output: {
      explanation: data.explanation,
      forecast: data.forecast,
      fallbackReason: data.fallbackReason,
      marketEvidence: data.marketEvidence,
    },
    contract: buildContract(data),
  });
  const reliability = data.reliability ?? {};
  return {
    runtime: {
      scenarioId: scenario.id,
      mode: data.explanation?.mode ?? reliability.mode ?? "unknown",
      model: reliability.model ?? "unreported",
      promptVersion: reliability.promptVersion ?? "unreported",
      contractVersion: reliability.contractVersion ?? "unreported",
      evalVersion: reliability.evalVersion ?? "unreported",
      forecastVersion: reliability.forecastVersion ?? data.forecast?.modelVersion ?? "unreported",
      passed: report.passed && data.explanation?.mode === EXPECTED_MODE,
      validationStatus: reliability.validationStatus ?? (report.passed ? "passed" : "failed"),
      latencyMs: rounded(reliability.latencyMs ?? measuredLatencyMs, 3),
      measuredLatencyMs: rounded(measuredLatencyMs, 3),
      inputTokens: Number(reliability.inputTokens ?? 0),
      outputTokens: Number(reliability.outputTokens ?? 0),
      estimatedCostUsd: rounded(reliability.estimatedCostUsd ?? 0, 8),
      fallbackReasonCode: reliability.fallbackReasonCode ?? null,
      checks: summarizeChecks(report),
    },
    deterministic: deterministicBaseline(data, scenario),
  };
}

function aggregate(rows, mode) {
  const selected = rows.map((row) => row[mode]);
  const passed = selected.filter((row) => row.passed).length;
  return {
    mode,
    cases: selected.length,
    passed,
    passRate: selected.length ? rounded(passed / selected.length, 4) : 0,
    averageLatencyMs: selected.length
      ? rounded(selected.reduce((sum, row) => sum + row.latencyMs, 0) / selected.length, 3)
      : 0,
    totalEstimatedCostUsd: rounded(
      selected.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
      8,
    ),
  };
}

async function main() {
  const baseUrl = process.env.LIVE_EVAL_BASE_URL ?? DEFAULT_BASE_URL;
  const rows = [];
  for (const scenario of scenarios) {
    rows.push(await evaluateRuntime(baseUrl, scenario));
  }

  const summary = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarios.length,
    expectedRuntimeMode: EXPECTED_MODE,
    scorecard: [
      aggregate(rows, "runtime"),
      aggregate(rows, "deterministic"),
    ],
    scenarios: rows,
  };
  const output = `${JSON.stringify(summary, null, 2)}\n`;
  const outputPath = process.env.LIVE_EVAL_OUTPUT;
  if (outputPath) {
    const resolved = resolve(outputPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, output);
  }
  process.stdout.write(output);

  if (summary.scorecard.some((row) => row.passed !== row.cases)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
