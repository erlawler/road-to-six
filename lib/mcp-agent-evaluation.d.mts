import type { McpTool } from "./mcp-tools.mjs";

export type AgentEvalCase = {
  id: string; category: string; fixture: "ready" | "unavailable"; prompt: string;
  expect: { tool?: string; arguments?: Record<string, unknown> }; answer: string[];
};
export type DecoyTool = { name: string; description: string; inputSchema: Record<string, unknown>; result: unknown };
export type ToolCall = { name: string; arguments?: Record<string, unknown> };
export type AgentEvalScore = {
  scoringVersion: string; casesPassed: number; totalCases: number; caseRate: number;
  toolSelection: { passed: number; total: number; rate: number | null };
  argumentAccuracy: { passed: number; total: number; rate: number | null };
  validCalls: { passed: number; total: number; rate: number | null };
  answerChecks: Record<string, { passed: number; total: number; rate: number | null }>;
  byCategory: Record<string, { passed: number; total: number }>;
  cases: { id: string; category: string; fixture: string; passed: boolean; checks: { id: string; passed: boolean; applicable?: false; detail?: unknown }[] }[];
};

export const MCP_AGENT_SCORING_VERSION: string;
export const ANSWER_CHECKS: readonly string[];
export function statedFigures(answer: string): number[];
export function normalizeArguments(toolName: string, args: unknown): Record<string, unknown>;
export function validateCaseSet(cases: readonly AgentEvalCase[], serverTools: readonly McpTool[], decoys: readonly DecoyTool[]): string[];
export function catalogFootprint(serverTools: readonly McpTool[]): { tools: { name: string; descriptionCharacters: number; approximateTokens: number }[]; toolCount: number; approximateTokens: number; method: string };
export function resultFootprint(toolResults: Record<string, { name: string; result: unknown }[]>, serverTools: readonly McpTool[]): { tools: { name: string; largestResultCharacters: number; approximateTokens: number }[]; method: string };
export function buildModelCatalog(serverTools: readonly McpTool[], decoys: readonly DecoyTool[], seed: string): { name: string; description: string; inputSchema: Record<string, unknown> }[];
export function scoreMcpAgentRun(run: {
  cases: readonly AgentEvalCase[]; serverTools: readonly McpTool[]; decoys: readonly DecoyTool[];
  transcript: { cases: { id: string; toolCalls?: ToolCall[]; finalAnswer?: string }[] };
  toolResults: Record<string, { name: string; result: unknown }[]>;
}): AgentEvalScore;
