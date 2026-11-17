// Abuse control and usage evidence for the public MCP endpoint.
//
// Both are aggregate by design. Nothing here stores an IP address, a raw
// user agent, tool arguments, or any other per-person value, which keeps
// public exploration anonymous as the project rules require.

// 120 data-bearing calls per aligned five-minute window, shared by all
// anonymous callers. At the cap this is about 69,000 storage writes a day
// (one rate-limit write and one usage write per call).
export const MCP_RATE_LIMIT = Object.freeze({ scope: "mcp_public", windowMs: 5 * 60_000, maxRequests: 120 });
export const MCP_USAGE_RETENTION_DAYS = 400;
export const MCP_USAGE_SURFACES = Object.freeze(["public"]);
export const MCP_USAGE_OUTCOMES = Object.freeze(["ok", "degraded", "unavailable", "invalid_arguments", "rate_limited", "error"]);

// Client names are self-reported and unverified. They are folded into a
// short fixed list so the table cannot grow with attacker-chosen strings.
const CLIENT_FAMILIES = Object.freeze([
  ["claude", /claude|anthropic/i],
  ["chatgpt", /chatgpt|openai|codex/i],
  ["cursor", /cursor/i],
  ["vscode", /visual studio code|vscode|vs code|copilot/i],
  ["goose", /goose/i],
  ["inspector", /inspector|mcpjam|postman/i],
]);

/** Maps a self-reported client name or user agent to a bounded label. */
export function clientFamily(clientName, userAgent) {
  for (const candidate of [clientName, userAgent]) {
    if (typeof candidate !== "string" || !candidate) continue;
    const match = CLIENT_FAMILIES.find(([, pattern]) => pattern.test(candidate));
    if (match) return match[0];
  }
  return typeof clientName === "string" && clientName ? "other" : "unknown";
}

/**
 * Consumes one request from the shared public window. Uses the existing
 * anonymous rate-limit table with its own scope, so no schema change is
 * needed. Fails open: these are free cached reads, and a storage fault must
 * not take the read path down.
 *
 * @param {{ prepare(sql: string): any } | undefined} db
 * @param {number} [now]
 */
export async function consumePublicMcpRateLimit(db, now = Date.now()) {
  if (!db) return { allowed: true, enforced: false };
  const { scope, windowMs, maxRequests } = MCP_RATE_LIMIT;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = windowStart + windowMs;
  try {
    const row = await db.prepare(`
      INSERT INTO ai_rate_limit_window (scope, window_start, request_count, expires_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(scope, window_start) DO UPDATE SET request_count = request_count + 1
      WHERE request_count < ?
      RETURNING request_count
    `).bind(scope, windowStart, expiresAt, maxRequests).first();
    if (!row) return { allowed: false, enforced: true, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1_000)) };
    const windowOpened = row.request_count === 1;
    if (windowOpened) {
      // First request of a window: drop this scope's expired windows.
      try {
        await db.prepare("DELETE FROM ai_rate_limit_window WHERE scope = ? AND expires_at <= ?").bind(scope, now).run();
      } catch { /* Cleanup is best effort. */ }
    }
    return { allowed: true, enforced: true, windowOpened };
  } catch {
    return { allowed: true, enforced: false };
  }
}

const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

/**
 * Adds one call to the daily aggregate. Best effort: returns false instead of
 * throwing, so a missing table or storage fault never breaks a tool call.
 */
export async function recordMcpUsage(db, { surface, operation, client, outcome }, now = Date.now()) {
  if (!db || !MCP_USAGE_SURFACES.includes(surface) || !MCP_USAGE_OUTCOMES.includes(outcome)) return false;
  try {
    await db.prepare(`
      INSERT INTO mcp_usage_daily (day, surface, operation, client, outcome, call_count)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(day, surface, operation, client, outcome) DO UPDATE SET call_count = call_count + 1
    `).bind(dayOf(now), surface, String(operation).slice(0, 64), String(client).slice(0, 32), outcome).run();
    return true;
  } catch {
    return false;
  }
}

const emptySummary = (status, now, windowDays) => ({
  schemaVersion: "mcp-usage-v1", status, observedAt: new Date(now).toISOString(), windowDays,
  since: null, totalCalls: 0, byOperation: {}, byClient: {}, byOutcome: {}, byDay: [],
  limitations: [
    "Counts are aggregate calls to the public MCP endpoint. They are not unique people, sessions, or organizations.",
    "Client labels are self-reported by the calling software and are not verified.",
    "No IP address, raw user agent, or tool argument is stored.",
  ],
});

/** Reads the aggregate for the trailing window. Never throws. */
export async function readMcpUsageSummary(db, now = Date.now(), windowDays = 30) {
  if (!db) return emptySummary("unavailable", now, windowDays);
  const since = dayOf(now - (windowDays - 1) * 86_400_000);
  try {
    const result = await db.prepare(`
      SELECT day, operation, client, outcome, call_count FROM mcp_usage_daily
      WHERE surface = 'public' AND day >= ? ORDER BY day, operation, client, outcome
    `).bind(since).all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    const summary = emptySummary("available", now, windowDays);
    summary.since = since;
    const add = (bucket, key, count) => { bucket[key] = (bucket[key] ?? 0) + count; };
    const days = new Map();
    for (const row of rows) {
      const count = Number(row.call_count) || 0;
      summary.totalCalls += count;
      add(summary.byOperation, row.operation, count);
      add(summary.byClient, row.client, count);
      add(summary.byOutcome, row.outcome, count);
      days.set(row.day, (days.get(row.day) ?? 0) + count);
    }
    summary.byDay = [...days].map(([day, calls]) => ({ day, calls }));
    return summary;
  } catch {
    return emptySummary("unavailable", now, windowDays);
  }
}

/** Removes aggregates older than the retention window. Best effort. */
export async function pruneMcpUsage(db, now = Date.now()) {
  if (!db) return false;
  try {
    await db.prepare("DELETE FROM mcp_usage_daily WHERE day < ?").bind(dayOf(now - MCP_USAGE_RETENTION_DAYS * 86_400_000)).run();
    return true;
  } catch {
    return false;
  }
}
