// Serves the built Worker on localhost so MCP clients, the conformance suite
// and the agent evaluation can call the real request path.
//
// FIXTURE EVIDENCE ONLY. The football state is the bundled snapshot, saved
// into an in-memory database, with the process clock fixed just after the
// snapshot's recorded verification time. Results prove protocol behavior and
// tool contracts. They say nothing about production freshness or uptime.
//
// Usage:
//   npm run build
//   node --import ./tests/setup-worker-runtime.mjs scripts/mcp-local-server.mjs [--port 8787] [--state ready|unavailable]

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mock } from "node:test";
import { refreshFootballState } from "../lib/football-store.mjs";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const port = Number(argument("port", "8787"));
const stateMode = argument("state", "ready");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Use a port from 1024 to 65535");
if (!["ready", "unavailable"].includes(stateMode)) throw new Error("Use --state ready or --state unavailable");

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const snapshot = JSON.parse(await read("../app/data/nfl-snapshot.json"));
const fixtureClock = Date.parse(snapshot.season.verifiedAt) + 60_000;
mock.timers.enable({ apis: ["Date"], now: fixtureClock });

const env = {};
if (stateMode === "ready") {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of ["0002_ai_runtime_governance", "0003_football_state", "0004_game_weather_cache", "0005_mcp_usage_daily"]) {
    sqlite.exec(await read(`../drizzle/${name}.sql`));
  }
  env.DB = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let values = [];
    return {
      bind(...bound) { values = bound; return this; },
      async first() { return statement.get(...values) ?? null; },
      async all() { return { results: statement.all(...values) }; },
      async run() { const outcome = statement.run(...values); return { success: true, meta: { changes: Number(outcome.changes) } }; },
    };
  } };
  await refreshFootballState(env, snapshot, { retrieve: async () => ({ snapshot }), now: () => fixtureClock });
}

// The fixture never reaches the network: weather context reports unavailable.
globalThis.fetch = async () => { throw new Error("The local fixture server makes no external calls"); };

const worker = (await import(new URL("../dist/server/index.js", import.meta.url))).default;
const context = { waitUntil() {}, passThroughOnException() {} };

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const hasBody = !["GET", "HEAD"].includes(incoming.method ?? "GET");
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method: incoming.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    const response = await worker.fetch(request, env, context);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { "Content-Type": "text/plain" });
    outgoing.end(error instanceof Error ? error.message : "Local fixture server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({
    listening: `http://127.0.0.1:${port}`,
    publicMcp: `http://127.0.0.1:${port}/api/mcp`,
    usage: `http://127.0.0.1:${port}/api/mcp/usage`,
    state: stateMode,
    fixtureClock: new Date(fixtureClock).toISOString(),
    dataVersion: snapshot.dataVersion,
    evidence: "fixture only; not production freshness",
  }));
});
