export type ReliabilityCheck = {
  id: string;
  label: string;
  category: string;
  simulated: boolean;
  passed: boolean;
  expected: string;
  observed: string;
  detail: string;
};

export type ShowcaseReliabilityReport = {
  schemaVersion: string;
  suiteVersion: string;
  evidenceType: string;
  simulatedClock: string;
  passed: number;
  total: number;
  allPassed: boolean;
  paidProviderCalls: number;
  productionTelemetry: { uptime: null; modelLatencyMs: null; factualAccuracy: null };
  limits: string[];
  results: ReliabilityCheck[];
};

export const SHOWCASE_RELIABILITY_VERSION: string;
export function runShowcaseReliabilitySuite(): ShowcaseReliabilityReport;
export function runShowcaseReliabilitySimulation(): Promise<ShowcaseReliabilityReport>;
