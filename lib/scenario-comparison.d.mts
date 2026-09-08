import type { ForecastResult, ScenarioControls } from "./forecast.mjs";

export type ComparisonEvidence = { id: string; text: string };
export function buildComparisonEvidence(input: {
  forecast: ForecastResult;
  controls: ScenarioControls;
}): ComparisonEvidence[];
export function defaultComparisonSelection(evidence: ComparisonEvidence[]): string[];
export function validateComparisonSelection(ids: unknown, evidence: ComparisonEvidence[]): ids is string[];
export function selectComparisonEvidence(ids: unknown, evidence: ComparisonEvidence[]): ComparisonEvidence[];
