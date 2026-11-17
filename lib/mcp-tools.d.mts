import type { FootballState } from "./football-store.mjs";
import type { ServerInfo } from "./mcp-protocol.mjs";

export type McpTool = Readonly<{
  name: string;
  title: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema?: Readonly<Record<string, unknown>>;
  annotations: Readonly<Record<string, boolean>>;
  _meta?: Readonly<Record<string, unknown>>;
}>;

export type Evidence = {
  schemaVersion: string;
  tool: string;
  status: "ok" | "degraded" | "unavailable";
  reason: string | null;
  stale: boolean;
  observedAt: string;
  football: { dataVersion: string; asOf: string | null; verifiedAt: string | null; freshness: string; ageDays: number | null; lastRefreshOutcome: string };
  sources: { name: string; url: string; license: string }[];
  notice: string;
};

export const MCP_SERVER_INFO: Readonly<ServerInfo>;
export const EVIDENCE_SCHEMA_VERSION: string;
export const EDUCATIONAL_NOTICE: string;
export const PUBLIC_INSTRUCTIONS: string;
export const OWNER_INSTRUCTIONS: string;
export const EVIDENCE_OUTPUT_SCHEMA: Readonly<Record<string, unknown>>;
export const PUBLIC_TOOLS: readonly McpTool[];
export const OWNER_TOOLS: readonly McpTool[];
export const PUBLIC_TOOL_NAMES: readonly string[];

export function findPublicTool(name: unknown): McpTool | null;
export function validateToolArguments(tool: McpTool, args: unknown): string[];
export function buildEvidence(tool: string, output: Record<string, unknown>, state: FootballState, now: number, extraSources?: { name: string; url: string; license: string }[]): Evidence;
export function forecastScenario(args: Record<string, unknown> | null | undefined): Partial<Record<string, number>>;
