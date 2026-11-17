// Checks the public MCP endpoint against the official TypeScript client SDKs,
// which are an independent implementation of the protocol.
//
// The SDKs are not project dependencies. Install them in any scratch folder
// and point this script at it:
//
//   npm install --prefix /tmp/mcp-sdk @modelcontextprotocol/client @modelcontextprotocol/sdk
//   node scripts/mcp-interop-check.mjs --sdk-dir /tmp/mcp-sdk --url http://127.0.0.1:8787/api/mcp
//
// The modern client runs in its three negotiation modes: the 2025 handshake,
// automatic probing, and a pin to revision 2026-07-28. Its default validator
// checks every structured result against the tool's declared output schema,
// so a schema that does not match real output fails the run.
//
// Prints a JSON report. Exits 1 when any expectation fails.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const url = new URL(argument("url", "http://127.0.0.1:8787/api/mcp"));
const sdkDir = resolve(argument("sdk-dir", "."));
const requireFromSdk = createRequire(join(sdkDir, "package.json"));
const optional = (specifier) => { try { return requireFromSdk(specifier); } catch { return null; } };
// Package manifests are not exported by the SDKs, so read them from disk.
const version = (name) => {
  try { return JSON.parse(readFileSync(join(sdkDir, "node_modules", name, "package.json"), "utf8")).version ?? null; } catch { return null; }
};

const MODERN_VERSION = "2026-07-28";
const EXPECTED_TOOLS = ["get_current_matchup", "get_player_usage", "compare_players", "get_source_health", "get_game_day_context", "get_football_forecast"];
const VALID_ARGUMENTS = { get_player_usage: { team: "DAL" }, get_football_forecast: { quarterback: 50 } };
const FORECAST_CARD_URI = "ui://road-to-six/forecast-card.html";

async function exercise(label, client, describe) {
  const checks = [];
  const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });
  const attempt = async (name, action) => {
    try { return await action(); } catch (error) { check(name, false, error instanceof Error ? error.message.slice(0, 300) : String(error)); return null; }
  };

  const connection = describe();
  check("connects and identifies the server", connection.serverName === "road-to-six-football", connection);

  const listed = await attempt("lists tools", () => client.listTools());
  if (listed) {
    check("lists exactly the public tools in catalog order", JSON.stringify(listed.tools.map((tool) => tool.name)) === JSON.stringify(EXPECTED_TOOLS));
    check("every tool declares an output schema", listed.tools.every((tool) => tool.outputSchema?.properties?.evidence));
  }

  for (const name of EXPECTED_TOOLS) {
    const result = await attempt(`calls ${name}`, () => client.callTool({ name, arguments: VALID_ARGUMENTS[name] ?? {} }));
    if (!result) continue;
    const evidence = result.structuredContent?.evidence;
    check(`calls ${name}`, result.isError !== true && evidence?.tool === name && typeof evidence?.observedAt === "string",
      { toolStatus: result.structuredContent?.status, evidenceStatus: evidence?.status, stale: evidence?.stale });
  }

  const rejected = await attempt("invalid arguments return a tool execution error", () => client.callTool({ name: "get_player_usage", arguments: { team: "PHI" } }));
  if (rejected) check("invalid arguments return a tool execution error", rejected.isError === true && /team must be one of/.test(rejected.content?.[0]?.text ?? ""));

  const unknown = await client.callTool({ name: "refresh_football", arguments: {} }).then(() => null, (error) => error);
  check("an owner tool is unknown on the public endpoint", unknown instanceof Error && /Unknown tool/.test(unknown.message));

  const resources = await attempt("lists resources", () => client.listResources());
  if (resources) check("lists the interface resource", resources.resources.some((resource) => resource.uri === FORECAST_CARD_URI));
  const card = await attempt("reads the interface resource", () => client.readResource({ uri: FORECAST_CARD_URI }));
  if (card) check("reads the interface resource", card.contents?.[0]?.mimeType === "text/html;profile=mcp-app" && /^<!doctype html>/i.test(card.contents[0].text ?? ""));

  await attempt("closes", () => client.close());
  return { label, connection, passed: checks.every((item) => item.passed), checks };
}

const report = { url: url.href, generatedAt: new Date().toISOString(), sdk: { client: version("@modelcontextprotocol/client"), classic: version("@modelcontextprotocol/sdk") }, runs: [] };
const clientInfo = { name: "road-to-six-interop-check", version: "1.0.0" };
const failedToStart = (label, error) => report.runs.push({ label, passed: false, checks: [{ name: "connects", passed: false, detail: error instanceof Error ? error.message.slice(0, 300) : String(error) }] });

const modern = optional("@modelcontextprotocol/client");
if (modern) {
  for (const [label, mode, expectedEra] of [
    ["official client, 2025 handshake (default mode)", "legacy", "legacy"],
    ["official client, automatic negotiation", "auto", "modern"],
    [`official client, pinned to ${MODERN_VERSION}`, { pin: MODERN_VERSION }, "modern"],
  ]) {
    try {
      const client = new modern.Client(clientInfo, { capabilities: {}, versionNegotiation: { mode } });
      await client.connect(new modern.StreamableHTTPClientTransport(url));
      const run = await exercise(label, client, () => ({
        serverName: client.getServerVersion()?.name ?? null,
        serverVersion: client.getServerVersion()?.version ?? null,
        era: client.getProtocolEra?.() ?? null,
        protocolVersion: client.getNegotiatedProtocolVersion?.() ?? null,
        hasInstructions: Boolean(client.getInstructions?.()),
      }));
      const eraMatches = run.connection.era === expectedEra;
      run.checks.push({ name: `negotiates the ${expectedEra} era`, passed: eraMatches, detail: run.connection.protocolVersion });
      run.passed = run.passed && eraMatches;
      report.runs.push(run);
    } catch (error) {
      failedToStart(label, error);
    }
  }
}

const classicClient = optional("@modelcontextprotocol/sdk/client/index.js");
const classicTransport = optional("@modelcontextprotocol/sdk/client/streamableHttp.js");
if (classicClient && classicTransport) {
  const label = "classic SDK client (handshake only)";
  try {
    const client = new classicClient.Client(clientInfo, { capabilities: {} });
    await client.connect(new classicTransport.StreamableHTTPClientTransport(url));
    report.runs.push(await exercise(label, client, () => ({
      serverName: client.getServerVersion()?.name ?? null, serverVersion: client.getServerVersion()?.version ?? null, era: "legacy",
    })));
  } catch (error) {
    failedToStart(label, error);
  }
}

report.passed = report.runs.length > 0 && report.runs.every((run) => run.passed);
report.summary = report.runs.map((run) => `${run.passed ? "pass" : "FAIL"}: ${run.label} (${run.checks.filter((item) => item.passed).length} of ${run.checks.length} checks)`);
if (!report.runs.length) report.summary = [`No official SDK was found under ${sdkDir}. See the header of this script.`];
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
