import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSUMED_LEGACY_VERSION, JSONRPC_ERROR, LEGACY_PROTOCOL_VERSIONS, META_KEY, MODERN_PROTOCOL_VERSIONS,
  SUPPORTED_PROTOCOL_VERSIONS, cacheableResult, classifyRequest, completeResult, decodeHeaderValue, errorBody,
  negotiateLegacyVersion,
} from "../lib/mcp-protocol.mjs";

const MODERN = MODERN_PROTOCOL_VERSIONS[0];
const meta = (overrides = {}) => ({
  [META_KEY.protocolVersion]: MODERN,
  [META_KEY.clientCapabilities]: {},
  [META_KEY.clientInfo]: { name: "unit-client", version: "1.0.0" },
  ...overrides,
});
const classify = (method, params, headers = {}) => classifyRequest({ jsonrpc: "2.0", id: 1, method, params }, new Headers(headers));
const modernHeaders = (method, extra = {}) => ({ "MCP-Protocol-Version": MODERN, "Mcp-Method": method, ...extra });

test("requests without version information are served as the assumed legacy revision", () => {
  assert.deepEqual(classify("tools/list"), { era: "legacy", version: ASSUMED_LEGACY_VERSION, clientName: null });
  assert.deepEqual(classify("tools/list", undefined, { "MCP-Protocol-Version": "2025-06-18" }), { era: "legacy", version: "2025-06-18", clientName: null });
  assert.equal(classify("initialize", { protocolVersion: "2025-11-25" }).era, "legacy");
});

test("a well-formed modern request is accepted statelessly with its self-reported client name", () => {
  const result = classify("tools/list", { _meta: meta() }, modernHeaders("tools/list"));
  assert.equal(result.era, "modern");
  assert.equal(result.version, MODERN);
  assert.equal(result.clientName, "unit-client");
  assert.deepEqual(result.clientCapabilities, {});
  const long = classify("tools/list", { _meta: meta({ [META_KEY.clientInfo]: { name: "x".repeat(500), version: "1" } }) }, modernHeaders("tools/list"));
  assert.equal(long.clientName.length, 80);
  const anonymous = classify("tools/list", { _meta: meta({ [META_KEY.clientInfo]: undefined }) }, modernHeaders("tools/list"));
  assert.equal(anonymous.clientName, null);
});

test("unsupported versions return the specification's error with the supported list", () => {
  for (const result of [
    classify("tools/list", undefined, { "MCP-Protocol-Version": "1900-01-01" }),
    classify("tools/list", { _meta: meta({ [META_KEY.protocolVersion]: "2099-01-01" }) }, { "MCP-Protocol-Version": "2099-01-01", "Mcp-Method": "tools/list" }),
    // A handshake-era version is not valid in modern per-request metadata.
    classify("tools/list", { _meta: meta({ [META_KEY.protocolVersion]: "2025-11-25" }) }, { "MCP-Protocol-Version": "2025-11-25", "Mcp-Method": "tools/list" }),
  ]) {
    assert.equal(result.error.status, 400);
    assert.equal(result.error.code, JSONRPC_ERROR.unsupportedProtocolVersion);
    assert.deepEqual(result.error.data.supported, [...SUPPORTED_PROTOCOL_VERSIONS]);
    assert.equal(typeof result.error.data.requested, "string");
  }
  assert.equal(JSONRPC_ERROR.unsupportedProtocolVersion, -32022);
});

test("missing required request metadata is rejected as invalid params", () => {
  const noMeta = classify("tools/list", {}, modernHeaders("tools/list"));
  assert.deepEqual([noMeta.error.status, noMeta.error.code], [400, JSONRPC_ERROR.invalidParams]);
  const noCapabilities = classify("tools/list", { _meta: meta({ [META_KEY.clientCapabilities]: undefined }) }, modernHeaders("tools/list"));
  assert.deepEqual([noCapabilities.error.status, noCapabilities.error.code], [400, JSONRPC_ERROR.invalidParams]);
  const wrongType = classify("tools/list", { _meta: meta({ [META_KEY.protocolVersion]: 20260728 }) }, modernHeaders("tools/list"));
  assert.deepEqual([wrongType.error.status, wrongType.error.code], [400, JSONRPC_ERROR.invalidParams]);
});

test("mirrored headers must be present and match the body", () => {
  const cases = [
    classify("tools/list", { _meta: meta() }, {}),
    classify("tools/list", { _meta: meta() }, { "MCP-Protocol-Version": "2025-06-18", "Mcp-Method": "tools/list" }),
    classify("tools/list", { _meta: meta() }, { "MCP-Protocol-Version": MODERN }),
    classify("tools/list", { _meta: meta() }, modernHeaders("tools/call")),
    classify("tools/call", { name: "get_current_matchup", _meta: meta() }, modernHeaders("tools/call")),
    classify("tools/call", { name: "get_current_matchup", _meta: meta() }, modernHeaders("tools/call", { "Mcp-Name": "refresh_football" })),
    classify("tools/call", { name: "get_current_matchup", _meta: meta() }, modernHeaders("tools/call", { "Mcp-Name": "=?base64?!!!?=" })),
    classify("resources/read", { uri: "ui://road-to-six/forecast-card.html", _meta: meta() }, modernHeaders("resources/read", { "Mcp-Name": "ui://other" })),
  ];
  for (const result of cases) assert.deepEqual([result.error.status, result.error.code], [400, JSONRPC_ERROR.headerMismatch]);
  assert.equal(JSONRPC_ERROR.headerMismatch, -32020);

  const missingName = classify("tools/call", { _meta: meta() }, modernHeaders("tools/call", { "Mcp-Name": "x" }));
  assert.deepEqual([missingName.error.status, missingName.error.code], [400, JSONRPC_ERROR.invalidParams]);
});

test("matching names are accepted in plain and Base64 header forms", () => {
  const plain = classify("tools/call", { name: "get_current_matchup", _meta: meta() }, modernHeaders("tools/call", { "Mcp-Name": "get_current_matchup" }));
  assert.equal(plain.era, "modern");
  const uri = "ui://road-to-six/forecast-card.html";
  const encoded = `=?base64?${Buffer.from(uri, "utf8").toString("base64")}?=`;
  assert.equal(classify("resources/read", { uri, _meta: meta() }, modernHeaders("resources/read", { "Mcp-Name": encoded })).era, "modern");
  assert.equal(classify("resources/read", { uri, _meta: meta() }, modernHeaders("resources/read", { "Mcp-Name": uri })).era, "modern");
});

test("header values decode per the transport's Base64 sentinel rule", () => {
  assert.equal(decodeHeaderValue("us-west1"), "us-west1");
  assert.equal(decodeHeaderValue("=?base64?SGVsbG8sIOS4lueVjA==?="), "Hello, 世界");
  assert.equal(decodeHeaderValue("=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?="), "=?base64?literal?=");
  assert.equal(decodeHeaderValue("=?base64?/w==?="), null);
  assert.equal(decodeHeaderValue(undefined), null);
});

test("results carry the fields the current revision requires", () => {
  const info = { name: "server", version: "1.0.0" };
  const complete = completeResult({ content: [] }, info);
  assert.equal(complete.resultType, "complete");
  assert.deepEqual(complete._meta[META_KEY.serverInfo], info);
  const cached = cacheableResult({ tools: [] }, info, 300_000);
  assert.deepEqual([cached.resultType, cached.ttlMs, cached.cacheScope], ["complete", 300_000, "public"]);
  assert.deepEqual(errorBody(7, -32601, "Method not found"), { jsonrpc: "2.0", id: 7, error: { code: -32601, message: "Method not found" } });
  assert.equal(errorBody(undefined, -32700, "Invalid").id, null);
});

test("the legacy handshake answers with a revision the server supports", () => {
  for (const version of LEGACY_PROTOCOL_VERSIONS) assert.equal(negotiateLegacyVersion(version), version);
  assert.equal(negotiateLegacyVersion("2026-07-28"), LEGACY_PROTOCOL_VERSIONS[0]);
  assert.equal(negotiateLegacyVersion(undefined), LEGACY_PROTOCOL_VERSIONS[0]);
});
