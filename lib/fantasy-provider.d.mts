import type { FantasyContext, FantasySnapshot, FantasyComparison } from "./fantasy.mjs";
export function licensedFantasyProsAdapter(): Readonly<{
  enabled: false; provider: "FantasyPros"; status: "disabled"; reason: string; callsMade: 0;
}>;
export type FantasySimulationResult = {
  mode: "cache_hit" | "provider_fixture" | "abstained"; comparison: FantasyComparison;
  preservedSnapshot: FantasySnapshot | null; reason: string | null;
  receipt: { transport: "simulated"; providerCalls: number; nextRetryAt: string | null };
};
export function createFantasySimulationClient(options: {
  provider: (context: FantasyContext) => Promise<{ status: number; snapshot?: FantasySnapshot; retryAfterSeconds?: number }>;
  now?: () => number; timeoutMs?: number; cacheTtlMs?: number;
}): { read(context: FantasyContext, options?: { forceRefresh?: boolean }): Promise<FantasySimulationResult> };
