export const MODERN_PROTOCOL_VERSIONS: readonly string[];
export const LEGACY_PROTOCOL_VERSIONS: readonly string[];
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[];
export const ASSUMED_LEGACY_VERSION: string;
export const JSONRPC_ERROR: Readonly<{
  parseError: -32700; invalidRequest: -32600; methodNotFound: -32601; invalidParams: -32602; internalError: -32603;
  headerMismatch: -32020; missingRequiredClientCapability: -32021; unsupportedProtocolVersion: -32022;
}>;
export const RATE_LIMITED_ERROR: 429;
export const META_KEY: Readonly<{ protocolVersion: string; clientInfo: string; clientCapabilities: string; serverInfo: string }>;

export type ServerInfo = { name: string; title?: string; version: string; description?: string; websiteUrl?: string };
export type RequestClass =
  | { era: "legacy"; version: string | null; clientName: null; error?: undefined }
  | { era: "modern"; version: string; clientName: string | null; clientCapabilities: Record<string, unknown>; error?: undefined }
  | { era?: undefined; error: { status: number; code: number; message: string; data?: unknown } };

export function decodeHeaderValue(value: unknown): string | null;
export function classifyRequest(message: { method?: unknown; params?: unknown }, headers: { get(name: string): string | null }): RequestClass;
export function negotiateLegacyVersion(requested: unknown): string;
export function completeResult<T extends Record<string, unknown>>(body: T, serverInfo: ServerInfo): T & { resultType: "complete"; _meta: Record<string, unknown> };
export function cacheableResult<T extends Record<string, unknown>>(body: T, serverInfo: ServerInfo, ttlMs: number, cacheScope?: "public" | "private"): T & { resultType: "complete"; _meta: Record<string, unknown>; ttlMs: number; cacheScope: "public" | "private" };
export function errorBody(id: string | number | null | undefined, code: number, message: string, data?: unknown): { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };
