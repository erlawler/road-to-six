import bundledSnapshot from "../app/data/nfl-snapshot.json";
import { readFootballState, refreshFootballState } from "../lib/football-store.mjs";
import { cowboysSeasonState } from "../lib/season-state.mjs";
import { readEvidenceTool } from "./showcase";
import {
  JSONRPC_ERROR, RATE_LIMITED_ERROR, SUPPORTED_PROTOCOL_VERSIONS, cacheableResult, classifyRequest, completeResult,
  errorBody, negotiateLegacyVersion,
} from "../lib/mcp-protocol.mjs";
import {
  MCP_SERVER_INFO, OWNER_INSTRUCTIONS, OWNER_TOOLS, PUBLIC_INSTRUCTIONS, PUBLIC_TOOLS, findPublicTool, validateToolArguments,
} from "../lib/mcp-tools.mjs";
import { UI_RESOURCES, readUiResource } from "../lib/mcp-app-view.mjs";
import { clientFamily, consumePublicMcpRateLimit, pruneMcpUsage, readMcpUsageSummary, recordMcpUsage, type McpUsageOutcome } from "../lib/mcp-usage.mjs";

// Two surfaces share one protocol core.
//
// "owner" is the Site-hosted /mcp path. The hosting platform puts its own
// sign-in in front of it and supplies verified identity headers, and the
// owner-only updater tools live only here. Its behavior is unchanged apart
// from the additive fields the current protocol revision requires.
//
// "public" is /api/mcp: anonymous, read-only, rate limited, and limited to
// the bounded evidence tools. It never lists or runs an owner tool.
type Surface = "owner" | "public";
type Env = { DB?: D1Database; FOOTBALL_UPDATER_OWNER_EMAIL?: string; MCP_ALLOWED_ORIGINS?: string };
type JsonRpcMessage = {
  jsonrpc?: string; id?: string | number | null; method?: unknown;
  params?: { protocolVersion?: unknown; name?: unknown; uri?: unknown; arguments?: unknown; _meta?: unknown };
};

const MAX_BODY_BYTES = 8192;
const DISCOVERY_TTL_MS = 60 * 60_000;
const CATALOG_TTL_MS = 5 * 60_000;
const RESOURCE_TTL_MS = 60 * 60_000;
const SECURITY_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const TRUSTED_BROWSER_ORIGINS = ["https://chatgpt.com", "https://claude.ai"];
const LOCAL_TOOL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const CAPABILITIES = { tools: {}, resources: {} };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// The transport requires Origin validation. Requests without an Origin header
// come from non-browser clients and are accepted. The public surface answers
// reviewed browser hosts and local developer tools; it holds no credentials
// or cookies, so an allowed origin gains nothing a direct request lacks.
function originAllowed(origin: string, request: Request, env: Env, surface: Surface) {
  if (origin === new URL(request.url).origin) return true;
  if (surface === "owner") return origin === "https://chatgpt.com";
  if (TRUSTED_BROWSER_ORIGINS.includes(origin) || LOCAL_TOOL_ORIGIN.test(origin)) return true;
  return (env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}

function corsHeaders(origin: string | null, surface: Surface): Record<string, string> {
  if (surface !== "public" || !origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

async function readBoundedJson(request: Request): Promise<JsonRpcMessage | Response> {
  const tooLarge = () => Response.json({ error: "Request too large" }, { status: 413, headers: SECURITY_HEADERS });
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge();
  const invalid = () => Response.json(errorBody(null, JSONRPC_ERROR.parseError, "Invalid JSON-RPC request"), { status: 400, headers: SECURITY_HEADERS });
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "JSON required" }, { status: 400, headers: SECURITY_HEADERS });
    let bytes = 0, text = "";
    const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); return tooLarge(); }
      text += decoder.decode(part.value, { stream: true });
    }
    const message = JSON.parse(text + decoder.decode());
    if (!isRecord(message) || message.jsonrpc !== "2.0") return invalid();
    return message as JsonRpcMessage;
  } catch {
    return invalid();
  }
}

async function handleMcp(request: Request, env: Env, surface: Surface): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && !originAllowed(origin, request, env, surface)) {
    return Response.json({ jsonrpc: "2.0", error: { code: JSONRPC_ERROR.invalidRequest, message: "Origin not allowed" } }, { status: 403, headers: SECURITY_HEADERS });
  }
  const headers = { ...SECURITY_HEADERS, ...corsHeaders(origin, surface) };
  const allow = surface === "public" ? "POST, OPTIONS" : "POST";
  if (surface === "public" && request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, Allow: allow } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: allow } });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "JSON required" }, { status: 415, headers });
  }

  const parsed = await readBoundedJson(request);
  if (parsed instanceof Response) return parsed;
  const message = parsed;
  const id = message.id ?? null;
  const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
  const fail = (code: number, text: string, status = 200, data?: unknown) => reply(errorBody(id, code, text, data), status);
  if (typeof message.method !== "string") return fail(JSONRPC_ERROR.invalidRequest, "A method is required", 400);
  // Notifications carry no id and expect no body.
  if (message.id === undefined) return new Response(null, { status: 202, headers });

  const classified = classifyRequest(message, request.headers);
  if (classified.error) return fail(classified.error.code, classified.error.message, classified.error.status, classified.error.data);
  const modern = classified.era === "modern";
  // Each era gets exactly its own result shape. Handshake-era clients may
  // validate results strictly (an empty ping result must be an empty object),
  // so the fields revision 2026-07-28 requires are added for modern requests only.
  const result = (value: Record<string, unknown>) => reply({ jsonrpc: "2.0", id, result: modern ? completeResult(value, MCP_SERVER_INFO) : value });
  const cached = (value: Record<string, unknown>, ttlMs: number) => reply({ jsonrpc: "2.0", id, result: modern ? cacheableResult(value, MCP_SERVER_INFO, ttlMs) : value });
  const instructions = surface === "owner" ? OWNER_INSTRUCTIONS : PUBLIC_INSTRUCTIONS;
  const tools = surface === "owner" ? [...OWNER_TOOLS, ...PUBLIC_TOOLS] : [...PUBLIC_TOOLS];
  const params = isRecord(message.params) ? message.params : {};

  switch (message.method) {
    case "server/discover":
      // Discovery exists only in the modern revision, so it always answers in that shape.
      return reply({ jsonrpc: "2.0", id, result: cacheableResult({ supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS], capabilities: CAPABILITIES, instructions }, MCP_SERVER_INFO, DISCOVERY_TTL_MS) });
    case "initialize":
      return result({ protocolVersion: negotiateLegacyVersion(params.protocolVersion), capabilities: CAPABILITIES, serverInfo: MCP_SERVER_INFO, instructions });
    case "ping":
      // Removed in revision 2026-07-28; kept for clients on earlier revisions.
      return modern ? fail(JSONRPC_ERROR.methodNotFound, "Method not found", 404) : result({});
    case "tools/list":
      return cached({ tools }, CATALOG_TTL_MS);
    case "resources/list":
      return cached({ resources: [...UI_RESOURCES] }, RESOURCE_TTL_MS);
    case "resources/templates/list":
      return cached({ resourceTemplates: [] }, RESOURCE_TTL_MS);
    case "resources/read": {
      const contents = readUiResource(params.uri);
      return contents ? cached({ contents }, RESOURCE_TTL_MS) : fail(JSONRPC_ERROR.invalidParams, "Resource not found");
    }
    case "tools/call":
      break;
    default:
      return fail(JSONRPC_ERROR.methodNotFound, "Method not found", modern ? 404 : 200);
  }

  const name = typeof params.name === "string" ? params.name : "";
  const publicTool = findPublicTool(name);
  if (publicTool) {
    const client = clientFamily(classified.clientName, request.headers.get("user-agent"));
    const record = (outcome: McpUsageOutcome) => surface === "public"
      ? recordMcpUsage(env.DB, { surface, operation: publicTool.name, client, outcome })
      : Promise.resolve(false);
    if (surface === "public") {
      const limit = await consumePublicMcpRateLimit(env.DB);
      if (!limit.allowed) {
        await record("rate_limited");
        const retryAfterSeconds = limit.retryAfterSeconds ?? 60;
        return reply(errorBody(id, RATE_LIMITED_ERROR, `The shared public rate limit was reached. Retry in ${retryAfterSeconds} seconds.`, { retryAfterSeconds }),
          429, { "Retry-After": String(retryAfterSeconds) });
      }
      // At most once per window: drop usage aggregates past their retention.
      if (limit.windowOpened) await pruneMcpUsage(env.DB);
    }
    const args = params.arguments ?? {};
    if (!isRecord(args)) return fail(JSONRPC_ERROR.invalidParams, "Tool arguments must be an object");
    // Argument problems are tool execution errors so the calling model can correct itself.
    const problems = validateToolArguments(publicTool, args);
    if (problems.length) {
      await record("invalid_arguments");
      return result({ isError: true, content: [{ type: "text", text: `Invalid arguments for ${publicTool.name}: ${problems.join("; ")}. No data was read.` }] });
    }
    try {
      const output = await readEvidenceTool(publicTool.name, args, env);
      await record(output.evidence.status);
      return result({ content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output, isError: false });
    } catch {
      await record("error");
      return result({ isError: true, content: [{ type: "text", text: "Evidence is unavailable. No external write or paid provider call was made." }] });
    }
  }
  if (surface === "public") return fail(JSONRPC_ERROR.invalidParams, `Unknown tool: ${name.slice(0, 64)}`);

  // Sites dispatch supplies verified identity headers. Its service token alone
  // supplies no user identity and never authorizes this public Site's writer.
  const configuredOwner = env.FOOTBALL_UPDATER_OWNER_EMAIL?.trim().toLowerCase();
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!configuredOwner || !userId || !email || email !== configuredOwner) return reply({ error: "Owner authorization required" }, 403);
  const args = params.arguments ?? {};
  if (!isRecord(args) || Object.keys(args).length) return fail(JSONRPC_ERROR.invalidParams, "This tool accepts no arguments");
  if (!OWNER_TOOLS.some((tool) => tool.name === name)) return fail(JSONRPC_ERROR.invalidParams, "Unknown tool");
  try {
    const refreshed = name === "refresh_football" ? await refreshFootballState(env, bundledSnapshot) : null;
    const state = refreshed?.state ?? await readFootballState(env, bundledSnapshot);
    const season = cowboysSeasonState(state.snapshot);
    const output = { operation: refreshed?.status ?? "read", materialChange: refreshed?.materialChange ?? false, dataVersion: state.snapshot.dataVersion, update: state.update, freshness: state.freshness, record: season.record, completed: season.completed.map(({ week, cowboysScore, opponentScore }) => ({ week, cowboysScore, opponentScore })), remaining: season.remaining.length, nextGame: season.nextGame ? { week: season.nextGame.week, opponent: season.nextGame.opponentName, kickoffAt: season.nextGame.kickoffAt } : null, verifiedAt: state.snapshot.season.verifiedAt };
    return result({ content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output });
  } catch (error) {
    return result({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message.slice(0, 500) : "Football refresh failed; last good snapshot retained" }] });
  }
}

/** Site-hosted endpoint behind the platform's sign-in. Carries the owner-only updater tools. */
export function handleFootballMcp(request: Request, env: Env): Promise<Response> {
  return handleMcp(request, env, "owner");
}

/** Anonymous read-only endpoint for any MCP client. */
export function handlePublicMcp(request: Request, env: Env): Promise<Response> {
  return handleMcp(request, env, "public");
}

/** Aggregate, non-personal usage counts for the public endpoint. */
export async function handleMcpUsage(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  if (new URL(request.url).search) return Response.json({ error: "This endpoint accepts no query parameters" }, { status: 400, headers: SECURITY_HEADERS });
  return Response.json(await readMcpUsageSummary(env.DB), { headers: SECURITY_HEADERS });
}
