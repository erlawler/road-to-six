import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
const snapshot = JSON.parse(readFileSync(new URL("../app/data/nfl-snapshot.json", import.meta.url)));
const ctx = { waitUntil() {}, passThroughOnException() {} };
const names = ["get_current_matchup", "get_player_usage", "compare_players", "get_source_health", "get_game_day_context"];
const req = (method, params) => new Request("https://site.example/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
const worker = async () => (await import(new URL(`../dist/server/index.js?showcase=${Math.random()}`, import.meta.url))).default;

test("MCP discovers bounded read-only evidence tools while keeping refresh owner-only", async () => {
  const app = await worker();
  const discovery = await (await app.fetch(req("server/discover"), {}, ctx)).json();
  assert.deepEqual(discovery.result.supportedVersions, ["2026-07-28"]);
  const listed = await (await app.fetch(req("tools/list"), {}, ctx)).json();
  for (const name of names) {
    const tool = listed.result.tools.find((item) => item.name === name);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  assert.equal((await app.fetch(req("tools/call", { name: "refresh_football", arguments: {} }), {}, ctx)).status, 403);
});

test("public evidence rejects URL injection, unknown teams and non-string teams before DB or network", async () => {
  const app = await worker(); let reads = 0, requests = 0;
  const env = { DB: { prepare() { reads++; throw new Error("Unexpected DB read"); } } };
  const previous = globalThis.fetch; globalThis.fetch = async () => { requests++; throw new Error("Unexpected network"); };
  try {
    for (const [name, args] of [["get_source_health", { url: "https://evil.example/" }], ["get_player_usage", { team: "PHI" }], ["get_player_usage", { team: ["DAL"] }], ["compare_players", { ids: ["guessed"] }]]) {
      const body = await (await app.fetch(req("tools/call", { name, arguments: args }), env, ctx)).json();
      assert.equal(body.error.code, -32602);
    }
    assert.equal(reads, 0); assert.equal(requests, 0);
  } finally { globalThis.fetch = previous; }
});

test("read tools return public source state without owner identity or paid provider calls", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(snapshot.season.verifiedAt) + 1000 });
  const app = await worker(); let requests = 0;
  const previous = globalThis.fetch; globalThis.fetch = async () => { requests++; throw new Error("Unexpected paid or external call"); };
  try {
    const env = { FOOTBALL_UPDATER_OWNER_EMAIL: "private-owner@example.com", OPENAI_API_KEY: "secret", THE_ODDS_API_KEY: "secret" };
    for (const name of names) {
      const body = await (await app.fetch(req("tools/call", { name, arguments: name === "get_player_usage" ? { team: "DAL" } : {} }), env, ctx)).json();
      assert.ok(body.result.structuredContent);
      assert.ok(!JSON.stringify(body).includes("private-owner"));
      assert.ok(!JSON.stringify(body).includes("secret"));
    }
    assert.equal(requests, 0);
  } finally { globalThis.fetch = previous; mock.timers.reset(); }
});

test("showcase endpoint is read-only and does not accept arbitrary source parameters", async () => {
  const app = await worker();
  assert.equal((await app.fetch(new Request("https://site.example/api/showcase", { method: "POST" }), {}, ctx)).status, 405);
  assert.equal((await app.fetch(new Request("https://site.example/api/showcase?url=https://evil.example"), {}, ctx)).status, 400);
});

test("ready public usage and health reads return the verified saved version without external calls", async () => {
  const reference = Date.parse(snapshot.manifest.reviewedAt) + 60_000;
  mock.timers.enable({ apis: ["Date"], now: reference });
  const app = await worker(); let networkCalls = 0;
  const previous = globalThis.fetch; globalThis.fetch = async () => { networkCalls++; throw new Error("Unexpected network"); };
  const env = { DB: { prepare(sql) {
    assert.ok(sql.includes("FROM football_state"));
    return { async first() { return { payload: JSON.stringify(snapshot), data_version: snapshot.dataVersion,
      last_attempt_at: new Date(reference - 2000).toISOString(), last_success_at: new Date(reference - 1000).toISOString(), last_error: null }; } };
  } }, FOOTBALL_UPDATER_OWNER_EMAIL: "private-owner@example.com", OPENAI_API_KEY: "never-use-this" };
  try {
    for (const name of names.slice(0, 4)) {
      const response = await app.fetch(req("tools/call", { name, arguments: name === "get_player_usage" ? { team: "opponent" } : {} }), env, ctx);
      const body = await response.json(), output = body.result.structuredContent;
      assert.ok(output);
      if (name === "get_current_matchup") assert.equal(output.status, "verified");
      if (["get_player_usage", "compare_players"].includes(name)) assert.equal(output.status, "available");
      if (name === "get_source_health") { assert.equal(output.status, "current"); assert.equal(output.dataVersion, snapshot.dataVersion); }
      assert.ok(!JSON.stringify(body).includes("private-owner"));
    }
    assert.equal(networkCalls, 0);
  } finally { globalThis.fetch = previous; mock.timers.reset(); }
});
