import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { refreshFootballState } from "../lib/football-store.mjs";
import { validateJsonSchema } from "../lib/json-schema-lite.mjs";
import { JSONRPC_ERROR, META_KEY, RATE_LIMITED_ERROR, SUPPORTED_PROTOCOL_VERSIONS } from "../lib/mcp-protocol.mjs";
import { EDUCATIONAL_NOTICE, EVIDENCE_SCHEMA_VERSION, PUBLIC_TOOL_NAMES } from "../lib/mcp-tools.mjs";
import { FORECAST_CARD_URI, UI_RESOURCE_MIME_TYPE } from "../lib/mcp-app-view.mjs";
import { MCP_RATE_LIMIT } from "../lib/mcp-usage.mjs";

const fallback = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const MIGRATIONS = ["0002_ai_runtime_governance", "0003_football_state", "0004_game_weather_cache", "0005_mcp_usage_daily"];
const migrations = await Promise.all(MIGRATIONS.map((name) => readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8")));
const reference = Date.parse(fallback.season.verifiedAt) + 60_000;
const ctx = { waitUntil() {}, passThroughOnException() {} };
const MODERN = "2026-07-28";
const OWNER_TOOL_NAMES = ["football_update_status", "refresh_football"];
const worker = async () => (await import(new URL(`../dist/server/index.js?mcp=${Math.random()}`, import.meta.url))).default;

function database(t, { usageTable = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  migrations.forEach((sql, index) => { if (usageTable || MIGRATIONS[index] !== "0005_mcp_usage_daily") sqlite.exec(sql); });
  t.after(() => sqlite.close());
  const calls = [];
  const env = { DB: { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { calls.push(sql); return statement.get(...args) ?? null; },
      async all() { calls.push(sql); return { results: statement.all(...args) }; },
      async run() { calls.push(sql); const outcome = statement.run(...args); return { success: true, meta: { changes: Number(outcome.changes) } }; },
    };
  } } };
  return { sqlite, calls, env };
}

// A verified, current football state at a fixed clock.
async function ready(t, options) {
  t.mock.timers.enable({ apis: ["Date"], now: reference });
  const db = database(t, options);
  await refreshFootballState(db.env, fallback, { retrieve: async () => ({ snapshot: fallback }), now: () => reference });
  db.calls.length = 0;
  return db;
}

function modern(method, params = {}, { path = "/api/mcp", headers = {}, clientName = "test-client" } = {}) {
  const named = params.name ?? params.uri;
  return new Request(`https://site.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MODERN, "Mcp-Method": method, ...(named ? { "Mcp-Name": named } : {}), ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: {
      [META_KEY.protocolVersion]: MODERN, [META_KEY.clientCapabilities]: {},
      ...(clientName ? { [META_KEY.clientInfo]: { name: clientName, version: "1.0.0" } } : {}),
    } } }),
  });
}
const legacy = (method, params, { path = "/api/mcp", headers = {} } = {}) => new Request(`https://site.example${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
});
const call = (name, args = {}, options) => modern("tools/call", { name, arguments: args }, options);
const blockNetwork = (t) => {
  const seen = { count: 0 };
  t.mock.method(globalThis, "fetch", async () => { seen.count++; throw new Error("Unexpected external call"); });
  return seen;
};

test("discovery advertises versions, capabilities, identity and cache hints without owner details", async () => {
  const app = await worker();
  const response = await app.fetch(modern("server/discover"), {}, ctx);
  assert.equal(response.status, 200);
  const { result } = await response.json();
  assert.equal(result.resultType, "complete");
  assert.deepEqual(result.supportedVersions, [...SUPPORTED_PROTOCOL_VERSIONS]);
  assert.deepEqual(result.capabilities, { tools: {}, resources: {} });
  assert.ok(Number.isInteger(result.ttlMs) && result.ttlMs >= 0);
  assert.equal(result.cacheScope, "public");
  assert.equal(result._meta[META_KEY.serverInfo].name, "road-to-six-football");
  assert.match(result._meta[META_KEY.serverInfo].version, /^\d+\.\d+\.\d+$/);
  assert.ok(result.instructions.includes("evidence.status"));
  assert.ok(!/owner/i.test(result.instructions));
});

test("the public catalog is deterministic, read-only, schema-complete and never lists an owner tool", async () => {
  const app = await worker();
  const first = (await (await app.fetch(modern("tools/list"), {}, ctx)).json()).result;
  const second = (await (await app.fetch(modern("tools/list"), {}, ctx)).json()).result;
  assert.deepEqual(first.tools, second.tools);
  assert.deepEqual(first.tools.map((tool) => tool.name), [...PUBLIC_TOOL_NAMES]);
  assert.deepEqual([first.resultType, first.cacheScope], ["complete", "public"]);
  assert.ok(Number.isInteger(first.ttlMs) && first.ttlMs >= 0);
  for (const tool of first.tools) {
    assert.ok(!OWNER_TOOL_NAMES.includes(tool.name));
    assert.ok(tool.title && tool.description.length >= 80 && tool.description.length <= 600, tool.name);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.properties.evidence.properties.schemaVersion.const, EVIDENCE_SCHEMA_VERSION);
    assert.ok(tool.outputSchema.required.includes("evidence"));
    assert.deepEqual([tool.annotations.readOnlyHint, tool.annotations.destructiveHint, tool.annotations.idempotentHint], [true, false, true]);
  }
  const forecast = first.tools.find((tool) => tool.name === "get_football_forecast");
  assert.equal(forecast._meta.ui.resourceUri, FORECAST_CARD_URI);
  assert.ok(!JSON.stringify(first).includes("refresh_football"));
});

test("owner tools cannot be reached through the public endpoint and cost no storage access", async (t) => {
  const db = database(t), app = await worker();
  const owner = { "oai-authenticated-user-email": "owner@example.com", "oai-authenticated-user-id": "owner" };
  for (const name of OWNER_TOOL_NAMES) {
    const response = await app.fetch(call(name, {}, { headers: owner }), { ...db.env, FOOTBALL_UPDATER_OWNER_EMAIL: "owner@example.com" }, ctx);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.error.code, JSONRPC_ERROR.invalidParams);
    assert.match(body.error.message, /^Unknown tool/);
  }
  assert.equal(db.calls.length, 0);
});

test("version and header problems use the specification's status codes and error codes", async () => {
  const app = await worker();
  const json = async (request) => { const response = await app.fetch(request, {}, ctx); return [response.status, await response.json()]; };

  const [unsupportedStatus, unsupported] = await json(legacy("tools/list", undefined, { headers: { "MCP-Protocol-Version": "1900-01-01" } }));
  assert.equal(unsupportedStatus, 400);
  assert.equal(unsupported.error.code, JSONRPC_ERROR.unsupportedProtocolVersion);
  assert.ok(unsupported.error.data.supported.includes(MODERN));
  assert.equal(unsupported.error.data.requested, "1900-01-01");

  const [mismatchStatus, mismatch] = await json(modern("tools/list", {}, { headers: { "Mcp-Method": "tools/call" } }));
  assert.deepEqual([mismatchStatus, mismatch.error.code], [400, JSONRPC_ERROR.headerMismatch]);
  const [nameStatus, name] = await json(call("get_current_matchup", {}, { headers: { "Mcp-Name": "get_source_health" } }));
  assert.deepEqual([nameStatus, name.error.code], [400, JSONRPC_ERROR.headerMismatch]);

  const [missingStatus, missing] = await json(legacy("tools/list", {}, { headers: { "MCP-Protocol-Version": MODERN } }));
  assert.deepEqual([missingStatus, missing.error.code], [400, JSONRPC_ERROR.invalidParams]);

  const [unknownStatus, unknown] = await json(modern("sampling/createMessage"));
  assert.deepEqual([unknownStatus, unknown.error.code], [404, JSONRPC_ERROR.methodNotFound]);
  const [pingStatus, ping] = await json(modern("ping"));
  assert.deepEqual([pingStatus, ping.error.code], [404, JSONRPC_ERROR.methodNotFound]);
});

test("clients on handshake revisions still connect, list tools and ping", async () => {
  const app = await worker();
  const initialize = (version) => legacy("initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "legacy-client", version: "1" } });
  const known = (await (await app.fetch(initialize("2025-06-18"), {}, ctx)).json()).result;
  assert.equal(known.protocolVersion, "2025-06-18");
  assert.equal(known.serverInfo.name, "road-to-six-football");
  assert.deepEqual(known.capabilities, { tools: {}, resources: {} });
  const future = (await (await app.fetch(initialize("2030-01-01"), {}, ctx)).json()).result;
  assert.equal(future.protocolVersion, "2025-11-25");

  const notified = await app.fetch(new Request("https://site.example/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }), {}, ctx);
  assert.equal(notified.status, 202);
  assert.equal(await notified.text(), "");

  const listed = (await (await app.fetch(legacy("tools/list", undefined, { headers: { "MCP-Protocol-Version": "2025-06-18" } }), {}, ctx)).json()).result;
  assert.deepEqual(listed.tools.map((tool) => tool.name), [...PUBLIC_TOOL_NAMES]);
  assert.deepEqual((await (await app.fetch(legacy("ping"), {}, ctx)).json()).result.resultType, "complete");
  const unknown = await app.fetch(legacy("prompts/list"), {}, ctx);
  assert.equal(unknown.status, 200);
  assert.equal((await unknown.json()).error.code, JSONRPC_ERROR.methodNotFound);
});

test("origins are validated, reviewed origins get cross-origin headers, and the owner path keeps its narrower rule", async () => {
  const app = await worker();
  const withOrigin = (origin, options = {}) => modern("tools/list", {}, { ...options, headers: { Origin: origin } });
  const denied = await app.fetch(withOrigin("https://evil.example"), {}, ctx);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);

  for (const origin of ["https://claude.ai", "https://chatgpt.com", "http://localhost:6274", "http://127.0.0.1:3000", "https://site.example"]) {
    const allowed = await app.fetch(withOrigin(origin), {}, ctx);
    assert.equal(allowed.status, 200, origin);
    assert.equal(allowed.headers.get("access-control-allow-origin"), origin);
    assert.equal(allowed.headers.get("vary"), "Origin");
  }
  const configured = await app.fetch(withOrigin("https://tools.example"), { MCP_ALLOWED_ORIGINS: "https://a.example, https://tools.example" }, ctx);
  assert.equal(configured.status, 200);
  assert.equal((await app.fetch(withOrigin("http://localhost.evil.example"), {}, ctx)).status, 403);

  const preflight = await app.fetch(new Request("https://site.example/api/mcp", { method: "OPTIONS", headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST" } }), {}, ctx);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-headers"), /MCP-Protocol-Version/);
  assert.match(preflight.headers.get("access-control-allow-headers"), /Mcp-Method/);

  const get = await app.fetch(new Request("https://site.example/api/mcp"), {}, ctx);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST, OPTIONS");

  // The owner path is unchanged: only its own origin and chatgpt.com, and no cross-origin headers.
  assert.equal((await app.fetch(withOrigin("https://claude.ai", { path: "/mcp" }), {}, ctx)).status, 403);
  const ownerPath = await app.fetch(withOrigin("https://chatgpt.com", { path: "/mcp" }), {}, ctx);
  assert.equal(ownerPath.status, 200);
  assert.equal(ownerPath.headers.get("access-control-allow-origin"), null);
  assert.equal((await app.fetch(new Request("https://site.example/mcp", { method: "OPTIONS" }), {}, ctx)).status, 405);
});

test("oversized and malformed bodies are rejected before any processing", async (t) => {
  const db = database(t), app = await worker();
  const post = (body) => new Request("https://site.example/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.equal((await app.fetch(post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(9000) } })), db.env, ctx)).status, 413);
  const malformed = await app.fetch(post("{not json"), db.env, ctx);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, JSONRPC_ERROR.parseError);
  assert.equal((await app.fetch(post(JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])), db.env, ctx)).status, 400);
  const text = new Request("https://site.example/api/mcp", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.equal((await app.fetch(text, db.env, ctx)).status, 415);
  assert.equal(db.calls.length, 0);
});

test("every public tool returns schema-valid evidence from the verified saved state without paid or external calls", async (t) => {
  const db = await ready(t), app = await worker(), network = blockNetwork(t);
  const env = { ...db.env, FOOTBALL_UPDATER_OWNER_EMAIL: "private-owner@example.com", OPENAI_API_KEY: "secret-ai", THE_ODDS_API_KEY: "secret-odds" };
  const tools = (await (await app.fetch(modern("tools/list"), env, ctx)).json()).result.tools;
  const expected = { get_current_matchup: "verified", get_player_usage: "available", compare_players: "available", get_source_health: "current", get_football_forecast: "available" };

  for (const tool of tools.filter((item) => item.name !== "get_game_day_context")) {
    const response = await app.fetch(call(tool.name, tool.name === "get_player_usage" ? { team: "opponent" } : {}), env, ctx);
    const text = await response.text(), { result } = JSON.parse(text);
    assert.equal(response.status, 200, tool.name);
    assert.deepEqual([result.resultType, result.isError], ["complete", false]);
    const output = result.structuredContent;
    assert.deepEqual(validateJsonSchema(tool.outputSchema, output, tool.name), []);
    assert.deepEqual(JSON.parse(result.content[0].text), output);
    assert.equal(output.status, expected[tool.name]);
    assert.deepEqual(
      [output.evidence.schemaVersion, output.evidence.tool, output.evidence.status, output.evidence.reason, output.evidence.stale],
      [EVIDENCE_SCHEMA_VERSION, tool.name, "ok", null, false]);
    assert.equal(output.evidence.observedAt, new Date(reference).toISOString());
    assert.equal(output.evidence.football.dataVersion, fallback.dataVersion);
    assert.equal(output.evidence.football.verifiedAt, fallback.season.verifiedAt);
    assert.equal(output.evidence.notice, EDUCATIONAL_NOTICE);
    assert.ok(output.evidence.sources.length >= 1 && output.evidence.sources.every((source) => source.name && source.url && source.license));
    assert.ok(!/private-owner|secret-ai|secret-odds/.test(text));
  }
  assert.equal(network.count, 0);
});

test("weather context degrades to an explicit unavailable state when its source cannot be reached", async (t) => {
  const db = await ready(t), app = await worker();
  blockNetwork(t);
  const tool = (await (await app.fetch(modern("tools/list"), db.env, ctx)).json()).result.tools.find((item) => item.name === "get_game_day_context");
  const { result } = await (await app.fetch(call("get_game_day_context"), db.env, ctx)).json();
  const output = result.structuredContent;
  assert.deepEqual(validateJsonSchema(tool.outputSchema, output, tool.name), []);
  assert.equal(output.status, "unavailable");
  assert.equal(output.evidence.status, "unavailable");
  assert.equal(typeof output.evidence.reason, "string");
  assert.equal(output.evidence.sources[0].name, "NOAA National Weather Service");
});

test("without verified football state every tool abstains instead of substituting data", async (t) => {
  const app = await worker(), network = blockNetwork(t);
  const tools = (await (await app.fetch(modern("tools/list"), {}, ctx)).json()).result.tools;
  for (const tool of tools) {
    const { result } = await (await app.fetch(call(tool.name, tool.name === "get_player_usage" ? { team: "DAL" } : {}), {}, ctx)).json();
    const output = result.structuredContent;
    assert.deepEqual(validateJsonSchema(tool.outputSchema, output, tool.name), []);
    assert.equal(output.status, "unavailable", tool.name);
    assert.deepEqual([output.evidence.status, output.evidence.stale], ["unavailable", true]);
    assert.equal(typeof output.evidence.reason, "string");
  }
  const forecast = (await (await app.fetch(call("get_football_forecast"), {}, ctx)).json()).result.structuredContent;
  assert.deepEqual([forecast.forecast, forecast.ratings, forecast.matchup], [null, null, null]);
  assert.equal(network.count, 0);
});

test("the forecast is football-only, reconciles with its drivers, and applies bounded what-if controls", async (t) => {
  const db = await ready(t), app = await worker(), network = blockNetwork(t);
  const read = async (args) => (await (await app.fetch(call("get_football_forecast", args), db.env, ctx)).json()).result;

  const baseline = (await read({})).structuredContent;
  assert.deepEqual([baseline.status, baseline.scope, baseline.marketPricesIncluded], ["available", "football_only", false]);
  const { forecast } = baseline;
  assert.equal(forecast.scenarioApplied, false);
  assert.equal(forecast.scenarioDeltaPoints, 0);
  assert.ok(forecast.cowboysWinPercent >= 5 && forecast.cowboysWinPercent <= 95);
  assert.equal(forecast.cowboysWinPercent, forecast.baselinePercent);
  assert.deepEqual(forecast.drivers.map((driver) => driver.label), ["Football baseline contribution", "Scenario contribution"]);
  const reconciled = 50 + forecast.drivers.reduce((sum, driver) => sum + driver.impactPoints, 0);
  assert.ok(Math.abs(reconciled - forecast.cowboysWinPercent) <= 0.15);
  assert.ok(forecast.illustrativeBandPercent.low <= forecast.cowboysWinPercent && forecast.cowboysWinPercent <= forecast.illustrativeBandPercent.high);
  assert.match(forecast.uncertainty[0], /excluded from this tool by design/);
  assert.ok(forecast.drivers.every((driver) => !/market/i.test(driver.evidence)));
  assert.equal(baseline.evaluation.footballOnlyBrier, fallback.backtest.footballOnlyBrier);
  assert.match(baseline.evaluation.note, /less accurate than market prices/);
  const current = (await (await app.fetch(call("get_current_matchup"), db.env, ctx)).json()).result.structuredContent;
  assert.deepEqual([baseline.matchup.opponent, baseline.matchup.week], [current.game.opponent, current.week]);
  // No market field or value may leave through this tool.
  assert.ok(!/moneyline|spread|totalLine|sportsbook|odds/i.test(JSON.stringify(baseline)));

  const withoutQuarterback = (await read({ quarterback: 50 })).structuredContent.forecast;
  assert.equal(withoutQuarterback.scenarioApplied, true);
  assert.equal(withoutQuarterback.controls.quarterback, 50);
  assert.equal(withoutQuarterback.baselinePercent, forecast.baselinePercent);
  assert.ok(Math.abs(withoutQuarterback.scenarioDeltaPoints - (-9)) <= 0.05 || withoutQuarterback.cowboysWinPercent === 5);
  const weakerOpponent = (await read({ opponentStar: 0 })).structuredContent.forecast;
  assert.ok(weakerOpponent.cowboysWinPercent > forecast.cowboysWinPercent);

  for (const [args, pattern] of [
    [{ quarterback: 150 }, /quarterback must be between 0 and 100/],
    [{ quarterback: "50" }, /quarterback must be of type number/],
    [{ qb: 50 }, /qb is not an accepted argument/],
    [{ gameId: "2026_09_DAL_PHI" }, /gameId is not an accepted argument/],
  ]) {
    const rejected = await read(args);
    assert.equal(rejected.isError, true);
    assert.match(rejected.content[0].text, pattern);
    assert.equal(rejected.structuredContent, undefined);
  }
  assert.equal(network.count, 0);
});

test("the shared rate limit returns 429 with Retry-After and leaves static discovery available", async (t) => {
  const db = await ready(t), app = await worker();
  const windowStart = Math.floor(reference / MCP_RATE_LIMIT.windowMs) * MCP_RATE_LIMIT.windowMs;
  db.sqlite.prepare("INSERT INTO ai_rate_limit_window (scope, window_start, request_count, expires_at) VALUES (?, ?, ?, ?)")
    .run(MCP_RATE_LIMIT.scope, windowStart, MCP_RATE_LIMIT.maxRequests - 1, windowStart + MCP_RATE_LIMIT.windowMs);

  assert.equal((await app.fetch(call("get_current_matchup"), db.env, ctx)).status, 200);
  const limited = await app.fetch(call("get_current_matchup"), db.env, ctx);
  assert.equal(limited.status, 429);
  const retryAfter = Number(limited.headers.get("retry-after"));
  assert.ok(retryAfter >= 1 && retryAfter <= MCP_RATE_LIMIT.windowMs / 1000);
  const body = await limited.json();
  assert.equal(body.error.code, RATE_LIMITED_ERROR);
  assert.equal(body.error.data.retryAfterSeconds, retryAfter);
  assert.equal(body.result, undefined);

  assert.equal((await app.fetch(modern("tools/list"), db.env, ctx)).status, 200);
  assert.equal((await app.fetch(modern("server/discover"), db.env, ctx)).status, 200);
  // The next aligned window admits calls again.
  t.mock.timers.setTime(windowStart + MCP_RATE_LIMIT.windowMs + 1_000);
  assert.equal((await app.fetch(call("get_source_health"), db.env, ctx)).status, 200);
});

test("usage is counted as bounded aggregates and published without personal data", async (t) => {
  const db = await ready(t), app = await worker();
  blockNetwork(t);
  await app.fetch(call("get_current_matchup", {}, { clientName: "claude-ai" }), db.env, ctx);
  await app.fetch(call("get_current_matchup", {}, { clientName: "claude-ai" }), db.env, ctx);
  await app.fetch(call("get_football_forecast", { quarterback: 500 }, { clientName: "Some New Agent 9000" }), db.env, ctx);
  await app.fetch(call("get_source_health", {}, { clientName: null, headers: { "User-Agent": "Cursor/2.4 (darwin)", "X-Forwarded-For": "203.0.113.9" } }), db.env, ctx);
  await app.fetch(legacy("tools/call", { name: "compare_players", arguments: {} }), db.env, ctx);

  const rows = db.sqlite.prepare("SELECT * FROM mcp_usage_daily ORDER BY operation, client, outcome").all();
  assert.deepEqual(rows.map((row) => [row.operation, row.client, row.outcome, row.call_count]), [
    ["compare_players", "unknown", "ok", 1],
    ["get_current_matchup", "claude", "ok", 2],
    ["get_football_forecast", "other", "invalid_arguments", 1],
    ["get_source_health", "cursor", "ok", 1],
  ]);
  assert.ok(rows.every((row) => row.surface === "public" && row.day === new Date(reference).toISOString().slice(0, 10)));
  assert.ok(!/203\.0\.113\.9|darwin|9000/.test(JSON.stringify(rows)));

  const response = await app.fetch(new Request("https://site.example/api/mcp/usage"), db.env, ctx);
  const summary = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual([summary.status, summary.totalCalls, summary.windowDays], ["available", 5, 30]);
  assert.deepEqual(summary.byOperation, { compare_players: 1, get_current_matchup: 2, get_football_forecast: 1, get_source_health: 1 });
  assert.deepEqual(summary.byClient, { unknown: 1, claude: 2, other: 1, cursor: 1 });
  assert.deepEqual(summary.byOutcome, { ok: 4, invalid_arguments: 1 });
  assert.ok(summary.limitations.some((line) => /not unique people/.test(line)));

  assert.equal((await app.fetch(new Request("https://site.example/api/mcp/usage", { method: "POST" }), db.env, ctx)).status, 405);
  assert.equal((await app.fetch(new Request("https://site.example/api/mcp/usage?day=2026-10-29"), db.env, ctx)).status, 400);
});

test("a missing usage table never breaks a tool call, and the owner path records nothing", async (t) => {
  const db = await ready(t, { usageTable: false }), app = await worker();
  const response = await app.fetch(call("get_current_matchup"), db.env, ctx);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.structuredContent.status, "verified");
  assert.equal((await (await app.fetch(new Request("https://site.example/api/mcp/usage"), db.env, ctx)).json()).status, "unavailable");

  db.calls.length = 0;
  const viaOwnerPath = await app.fetch(call("get_current_matchup", {}, { path: "/mcp" }), db.env, ctx);
  assert.equal(viaOwnerPath.status, 200);
  assert.ok(db.calls.length > 0 && db.calls.every((sql) => sql.includes("FROM football_state")));
});

test("the interface resource is listed, readable and cacheable", async () => {
  const app = await worker();
  const listed = (await (await app.fetch(modern("resources/list"), {}, ctx)).json()).result;
  assert.deepEqual(listed.resources.map((resource) => [resource.uri, resource.mimeType]), [[FORECAST_CARD_URI, UI_RESOURCE_MIME_TYPE]]);
  assert.deepEqual([listed.resultType, listed.cacheScope], ["complete", "public"]);

  const read = (await (await app.fetch(modern("resources/read", { uri: FORECAST_CARD_URI }), {}, ctx)).json()).result;
  assert.equal(read.contents.length, 1);
  assert.deepEqual([read.contents[0].uri, read.contents[0].mimeType], [FORECAST_CARD_URI, UI_RESOURCE_MIME_TYPE]);
  assert.match(read.contents[0].text, /^<!doctype html>/i);
  assert.ok(Number.isInteger(read.ttlMs) && read.cacheScope === "public");

  const missing = await (await app.fetch(modern("resources/read", { uri: "ui://road-to-six/unknown.html" }), {}, ctx)).json();
  assert.equal(missing.error.code, JSONRPC_ERROR.invalidParams);
  const templates = (await (await app.fetch(modern("resources/templates/list"), {}, ctx)).json()).result;
  assert.deepEqual(templates.resourceTemplates, []);
});
