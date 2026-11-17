// Preflight for listing the public MCP endpoint in the official MCP Registry.
//
// A registry record is public and permanent (a version can be marked deleted
// later, but its metadata is never removed), and the registry requires the
// remote URL to be publicly reachable. This script refuses to continue unless
// server.json is consistent with the code and the live endpoint answers as
// the listed version with current data.
//
//   node scripts/mcp-registry-preflight.mjs                 checks the URL in server.json
//   node scripts/mcp-registry-preflight.mjs --url <url>     checks another deployment
//   node scripts/mcp-registry-preflight.mjs --allow-stale   accepts a stale football snapshot
//
// Prints a JSON report. Exits 1 when any check fails.

import { readFile } from "node:fs/promises";
import { META_KEY, MODERN_PROTOCOL_VERSIONS } from "../lib/mcp-protocol.mjs";
import { MCP_SERVER_INFO, PUBLIC_TOOL_NAMES } from "../lib/mcp-tools.mjs";

const listing = JSON.parse(await readFile(new URL("../server.json", import.meta.url), "utf8"));
const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
};
const url = argument("url") ?? listing.remotes?.[0]?.url;
const allowStale = process.argv.includes("--allow-stale");
const version = MODERN_PROTOCOL_VERSIONS[0];
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });

check("listing name uses the repository owner's GitHub namespace", listing.name === "io.github.erlawler/road-to-six", listing.name);
check("listing version matches the server version in code", listing.version === MCP_SERVER_INFO.version, [listing.version, MCP_SERVER_INFO.version]);
check("listing description fits the registry's 100 character limit", typeof listing.description === "string" && listing.description.length <= 100, listing.description?.length);
check("listing has exactly one Streamable HTTP remote on HTTPS", listing.remotes?.length === 1 && listing.remotes[0].type === "streamable-http" && /^https:\/\/[^/]+\/api\/mcp$/.test(listing.remotes[0].url), listing.remotes);

async function rpc(method, params = {}, name) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": version, "Mcp-Method": method, ...(name ? { "Mcp-Name": name } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: {
      [META_KEY.protocolVersion]: version, [META_KEY.clientCapabilities]: {},
      [META_KEY.clientInfo]: { name: "road-to-six-registry-preflight", version: "1.0.0" },
    } } }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json() };
}

try {
  const discover = await rpc("server/discover");
  const info = discover.body.result?._meta?.[META_KEY.serverInfo];
  check("the endpoint answers discovery without sign-in", discover.status === 200 && discover.body.result?.supportedVersions?.includes(version), discover.status);
  check("the live server is the listed version", info?.name === MCP_SERVER_INFO.name && info?.version === listing.version, info);

  const tools = await rpc("tools/list");
  check("the live catalog is exactly the public tools", JSON.stringify(tools.body.result?.tools?.map((tool) => tool.name)) === JSON.stringify(PUBLIC_TOOL_NAMES));

  const health = await rpc("tools/call", { name: "get_source_health", arguments: {} }, "get_source_health");
  const evidence = health.body.result?.structuredContent?.evidence;
  check("a tool call returns an evidence block", health.status === 200 && evidence?.tool === "get_source_health", health.status);
  check(allowStale ? "football data freshness (stale accepted by flag)" : "football data is current, not stale",
    allowStale || evidence?.stale === false, { stale: evidence?.stale, status: evidence?.status, reason: evidence?.reason, dataVersion: evidence?.football?.dataVersion });
} catch (error) {
  check("the endpoint is reachable", false, error instanceof Error ? error.message.slice(0, 300) : String(error));
}

const passed = checks.every((item) => item.passed);
console.log(JSON.stringify({ url, checkedAt: new Date().toISOString(), passed, checks }, null, 2));
process.exit(passed ? 0 : 1);
