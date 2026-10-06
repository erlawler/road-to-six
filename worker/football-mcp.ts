import bundledSnapshot from "../app/data/nfl-snapshot.json";
import { readFootballState, refreshFootballState } from "../lib/football-store.mjs";
import { cowboysSeasonState } from "../lib/season-state.mjs";

type Env = { DB?: D1Database; FOOTBALL_UPDATER_OWNER_EMAIL?: string };
const tools = [
  { name: "football_update_status", description: "Read Road to Six football verification status and current season facts. Owner only.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: "refresh_football", description: "Refresh and atomically publish this Site's football snapshot from fixed approved free sources. Retains the last good snapshot on failure. Never calls paid AI or odds providers. Owner only; repeated calls within one hour do not refetch.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
];

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function handleFootballMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== "https://chatgpt.com") return reply({ error: "Origin not allowed" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ error: "JSON required" }, 415);
  if (Number(request.headers.get("content-length")) > 8192) return reply({ error: "Request too large" }, 413);
  let message: { jsonrpc?: string; id?: string | number; method?: string; params?: { protocolVersion?: string; name?: string; arguments?: Record<string, unknown> } };
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "JSON required" }, 400);
    let bytes = 0, text = "";
    const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return reply({ error: "Request too large" }, 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    message = JSON.parse(text + decoder.decode());
    if (!message || Array.isArray(message) || message.jsonrpc !== "2.0") throw new Error("Invalid request");
  } catch { return reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON-RPC request" } }, 400); }
  const id = message.id ?? null;
  const result = (value: unknown) => reply({ jsonrpc: "2.0", id, result: value });
  if (message.method === "initialize") return result({ protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18"].includes(message.params?.protocolVersion ?? "") ? message.params?.protocolVersion : "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "road-to-six-football", version: "1.0.0" }, instructions: "Only the Site owner may read updater status or publish football data. Do not call AI or odds endpoints." });
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (message.method === "ping") return result({});
  if (message.method === "tools/list") return result({ tools });
  if (message.method !== "tools/call") return reply({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });

  // Sites dispatch supplies verified identity headers. Its service token alone
  // supplies no user identity and never authorizes this public Site's writer.
  const configuredOwner = env.FOOTBALL_UPDATER_OWNER_EMAIL?.trim().toLowerCase();
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!configuredOwner || !userId || !email || email !== configuredOwner) return reply({ error: "Owner authorization required" }, 403);
  const args = message.params?.arguments ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length) return reply({ jsonrpc: "2.0", id, error: { code: -32602, message: "This tool accepts no arguments" } });
  if (!tools.some((tool) => tool.name === message.params?.name)) return reply({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown tool" } });
  try {
    const refreshed = message.params?.name === "refresh_football" ? await refreshFootballState(env, bundledSnapshot) : null;
    const state = refreshed?.state ?? await readFootballState(env, bundledSnapshot);
    const season = cowboysSeasonState(state.snapshot);
    const output = { operation: refreshed?.status ?? "read", materialChange: refreshed?.materialChange ?? false, dataVersion: state.snapshot.dataVersion, update: state.update, freshness: state.freshness, record: season.record, completed: season.completed.map(({ week, cowboysScore, opponentScore }) => ({ week, cowboysScore, opponentScore })), remaining: season.remaining.length, nextGame: season.nextGame ? { week: season.nextGame.week, opponent: season.nextGame.opponentName, kickoffAt: season.nextGame.kickoffAt } : null, verifiedAt: state.snapshot.season.verifiedAt };
    return result({ content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output });
  } catch (error) {
    return result({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message.slice(0, 500) : "Football refresh failed; last good snapshot retained" }] });
  }
}
