// Model Context Protocol helpers shared by the owner and public endpoints.
//
// Modern requests follow revision 2026-07-28: stateless, with the protocol
// version and client capabilities carried in every request's _meta and
// mirrored into HTTP headers. Legacy requests (the initialize handshake used
// by revision 2025-11-25 and earlier) remain supported, which makes this a
// dual-era server in the specification's terms.
//
// Specification: https://modelcontextprotocol.io/specification/2026-07-28

export const MODERN_PROTOCOL_VERSIONS = Object.freeze(["2026-07-28"]);
export const LEGACY_PROTOCOL_VERSIONS = Object.freeze(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]);
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS]);

// Revisions before 2025-06-18 did not define the MCP-Protocol-Version header.
// The transport allows treating a request without it as 2025-03-26.
export const ASSUMED_LEGACY_VERSION = "2025-03-26";

export const JSONRPC_ERROR = Object.freeze({
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  missingRequiredClientCapability: -32021,
  unsupportedProtocolVersion: -32022,
});

// Application-defined code, allocated outside the JSON-RPC reserved range as
// the specification asks for errors it does not define.
export const RATE_LIMITED_ERROR = 429;

export const META_KEY = Object.freeze({
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
});

// Methods whose params carry a name or URI that the transport mirrors into
// the Mcp-Name header.
const NAMED_METHODS = Object.freeze({ "tools/call": "name", "resources/read": "uri", "prompts/get": "name" });

const BASE64_SENTINEL = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/;

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Decodes a mirrored header value. Returns null when the Base64 form is malformed. */
export function decodeHeaderValue(value) {
  if (typeof value !== "string") return null;
  const match = BASE64_SENTINEL.exec(value);
  if (!match) return value;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function rejection(status, code, message, data) {
  return { error: { status, code, message, ...(data === undefined ? {} : { data }) } };
}

function unsupportedVersion(requested) {
  return rejection(400, JSONRPC_ERROR.unsupportedProtocolVersion, "Unsupported protocol version", {
    supported: [...SUPPORTED_PROTOCOL_VERSIONS],
    requested: String(requested).slice(0, 64),
  });
}

/**
 * Decides which protocol era a request belongs to and validates the modern
 * request metadata. Never throws.
 *
 * @param {{ method?: unknown, params?: unknown }} message Parsed JSON-RPC request.
 * @param {{ get(name: string): string | null }} headers Request headers.
 */
export function classifyRequest(message, headers) {
  const header = (name) => {
    const value = headers.get(name);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const method = typeof message?.method === "string" ? message.method : "";
  const params = isRecord(message?.params) ? message.params : null;
  const meta = params && isRecord(params._meta) ? params._meta : null;
  const headerVersion = header("mcp-protocol-version");
  const metaVersion = meta ? meta[META_KEY.protocolVersion] : undefined;

  // The handshake negotiates its own version in the request body.
  if (method === "initialize") return { era: "legacy", version: null, clientName: null };

  if (metaVersion === undefined) {
    if (headerVersion === null) return { era: "legacy", version: ASSUMED_LEGACY_VERSION, clientName: null };
    if (LEGACY_PROTOCOL_VERSIONS.includes(headerVersion)) return { era: "legacy", version: headerVersion, clientName: null };
    if (!MODERN_PROTOCOL_VERSIONS.includes(headerVersion)) return unsupportedVersion(headerVersion);
    return rejection(400, JSONRPC_ERROR.invalidParams,
      `Missing required _meta field ${META_KEY.protocolVersion}`);
  }

  if (typeof metaVersion !== "string") {
    return rejection(400, JSONRPC_ERROR.invalidParams, `${META_KEY.protocolVersion} must be a string`);
  }
  if (headerVersion === null) {
    return rejection(400, JSONRPC_ERROR.headerMismatch, "The MCP-Protocol-Version header is required");
  }
  if (headerVersion !== metaVersion) {
    return rejection(400, JSONRPC_ERROR.headerMismatch,
      "The MCP-Protocol-Version header does not match the protocol version in the request body");
  }
  if (!MODERN_PROTOCOL_VERSIONS.includes(metaVersion)) return unsupportedVersion(metaVersion);
  if (!isRecord(meta[META_KEY.clientCapabilities])) {
    return rejection(400, JSONRPC_ERROR.invalidParams,
      `Missing required _meta field ${META_KEY.clientCapabilities}`);
  }

  const headerMethod = header("mcp-method");
  if (headerMethod === null) return rejection(400, JSONRPC_ERROR.headerMismatch, "The Mcp-Method header is required");
  if (headerMethod !== method) {
    return rejection(400, JSONRPC_ERROR.headerMismatch, "The Mcp-Method header does not match the request method");
  }

  const nameField = NAMED_METHODS[method];
  if (nameField) {
    const expected = params[nameField];
    if (typeof expected !== "string" || !expected) {
      return rejection(400, JSONRPC_ERROR.invalidParams, `params.${nameField} is required`);
    }
    const rawName = header("mcp-name");
    if (rawName === null) return rejection(400, JSONRPC_ERROR.headerMismatch, "The Mcp-Name header is required");
    if (decodeHeaderValue(rawName) !== expected) {
      return rejection(400, JSONRPC_ERROR.headerMismatch, `The Mcp-Name header does not match params.${nameField}`);
    }
  }

  const clientInfo = meta[META_KEY.clientInfo];
  const clientName = isRecord(clientInfo) && typeof clientInfo.name === "string" ? clientInfo.name.slice(0, 80) : null;
  return { era: "modern", version: metaVersion, clientName, clientCapabilities: meta[META_KEY.clientCapabilities] };
}

/** Chooses the handshake version for a legacy initialize request. */
export function negotiateLegacyVersion(requested) {
  return LEGACY_PROTOCOL_VERSIONS.includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0];
}

/** Wraps a result with the fields revision 2026-07-28 requires on every result. */
export function completeResult(body, serverInfo) {
  return { ...body, resultType: "complete", _meta: { ...(body?._meta ?? {}), [META_KEY.serverInfo]: serverInfo } };
}

/** Adds the caching hints required on discovery, list and resource read results. */
export function cacheableResult(body, serverInfo, ttlMs, cacheScope = "public") {
  return { ...completeResult(body, serverInfo), ttlMs, cacheScope };
}

export function errorBody(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}
