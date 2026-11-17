export const MCP_RATE_LIMIT: Readonly<{ scope: string; windowMs: number; maxRequests: number }>;
export const MCP_USAGE_RETENTION_DAYS: number;
export const MCP_USAGE_SURFACES: readonly string[];
export const MCP_USAGE_OUTCOMES: readonly string[];

export type McpUsageOutcome = "ok" | "degraded" | "unavailable" | "invalid_arguments" | "rate_limited" | "error";
export type McpUsageSummary = {
  schemaVersion: string; status: "available" | "unavailable"; observedAt: string; windowDays: number;
  since: string | null; totalCalls: number; byOperation: Record<string, number>; byClient: Record<string, number>;
  byOutcome: Record<string, number>; byDay: { day: string; calls: number }[]; limitations: string[];
};

export function clientFamily(clientName: string | null | undefined, userAgent: string | null | undefined): string;
export function consumePublicMcpRateLimit(db: D1Database | undefined, now?: number): Promise<{ allowed: boolean; enforced: boolean; retryAfterSeconds?: number; windowOpened?: boolean }>;
export function recordMcpUsage(db: D1Database | undefined, event: { surface: string; operation: string; client: string; outcome: McpUsageOutcome }, now?: number): Promise<boolean>;
export function readMcpUsageSummary(db: D1Database | undefined, now?: number, windowDays?: number): Promise<McpUsageSummary>;
export function pruneMcpUsage(db: D1Database | undefined, now?: number): Promise<boolean>;
