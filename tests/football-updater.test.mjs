import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { readFootballState, refreshFootballState } from "../lib/football-store.mjs";
import { verifyOfficialSeason, boundedSource, footballContentHash } from "../lib/football-sources.mjs";
import { DEFAULT_CONTROLS } from "../lib/forecast.mjs";
import { footballSnapshotFreshness } from "../lib/source-freshness.mjs";

const fallback = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const schema = await readFile(new URL("../drizzle/0003_football_state.sql", import.meta.url), "utf8");
const reference = Date.parse("2026-10-06T13:00:00Z");

function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  t.after(() => sqlite.close());
  const calls = [];
  return { sqlite, calls, env: { DB: { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    return { bind(...values) { args = values; return this; }, async first() { calls.push(sql); return statement.get(...args) ?? null; }, async run() { calls.push(sql); const r = statement.run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } };
  } } } };
}

function officialSchedule(snapshot = fallback) {
  let html = `<h1>Dallas Cowboys ${snapshot.season.year} Schedule</h1><h2>REGULAR SEASON</h2>`;
  for (let week = 1; week <= 18; week++) {
    const game = snapshot.schedule.find((g) => g.week === week);
    if (!game) { html += `<div>WEEK ${week} BYE</div>`; continue; }
    const result = game.status === "final" ? `FINAL ${game.cowboysScore > game.opponentScore ? "W" : game.cowboysScore < game.opponentScore ? "L" : "T"} ${game.cowboysScore} - ${game.opponentScore}`
      : game.kickoffAt ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(game.kickoffAt)) : "TBD";
    html += `<div>WEEK ${week} ${game.date.slice(5).replace("-", "/")} ${result} ${game.venue === "away" ? "AT" : "VS"} ${game.opponentName}</div>`;
  }
  return `${html}<h2>PRESEASON</h2>`;
}

test("official verification checks every final, kickoff, record, bye and TBD week", () => {
  const result = verifyOfficialSeason(fallback.schedule, 2026, officialSchedule(), "Dallas Cowboys 3rd NFC East 2 - 2 - 0", new Date(reference).toISOString());
  assert.deepEqual(result.record, { wins: 2, losses: 2, ties: 0 });
  assert.equal(result.completedResults.length, 4);
  assert.equal(result.nextGame.week, 5);
  assert.deepEqual(result.byeWeeks, [14]);
  assert.deepEqual(result.unconfirmedKickoffWeeks, [18]);
  for (const [schedule, nfl] of [
    [officialSchedule().replace("34 - 30", "34 - 31"), "Dallas Cowboys 3rd NFC East 2 - 2 - 0"],
    [officialSchedule().replace("7:15 PM CDT", "8:15 PM CDT"), "Dallas Cowboys 3rd NFC East 2 - 2 - 0"],
    [officialSchedule().replace("Tampa Bay Buccaneers", "Wrong opponent"), "Dallas Cowboys 3rd NFC East 2 - 2 - 0"],
    [officialSchedule(), "Dallas Cowboys 3rd NFC East 3 - 1 - 0"],
    ["Source unavailable", "Dallas Cowboys 3rd NFC East 2 - 2 - 0"],
  ]) assert.throws(() => verifyOfficialSeason(fallback.schedule, 2026, schedule, nfl, new Date(reference).toISOString()));
  assert.throws(() => verifyOfficialSeason(fallback.schedule, 2026, officialSchedule(), "Dallas Cowboys 3rd NFC East 2 - 2 - 0", fallback.schedule[4].kickoffAt), /started game/);
});

test("source retrieval rejects HTTP errors and oversized streaming bodies", async () => {
  await assert.rejects(boundedSource("https://source.example", async () => new Response("Unavailable", { status: 503 })));
  await assert.rejects(boundedSource("https://source.example", async () => new Response("123456"), 5), /size limit/);
});

test("atomic publication is idempotent and concurrent calls fetch once", async (t) => {
  const db = database(t);
  let calls = 0;
  let release;
  const pause = new Promise((resolve) => { release = resolve; });
  const retrieve = async () => { calls++; await pause; return { snapshot: fallback }; };
  const first = refreshFootballState(db.env, fallback, { retrieve, now: () => reference });
  await new Promise((resolve) => setImmediate(resolve));
  const second = await refreshFootballState(db.env, fallback, { retrieve, now: () => reference });
  assert.equal(second.status, "already_checked_or_running");
  release();
  const published = await first;
  assert.equal(published.status, "published");
  assert.equal(published.materialChange, false);
  assert.equal(published.state.snapshot.dataVersion, fallback.dataVersion);
  const again = await refreshFootballState(db.env, fallback, { retrieve, now: () => reference + 1000 });
  assert.equal(again.status, "already_checked_or_running");
  assert.equal(calls, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM football_state").get().n, 1);
});

test("failed source validation retains exact last good data and verification time", async (t) => {
  const db = database(t);
  await refreshFootballState(db.env, fallback, { retrieve: async () => ({ snapshot: fallback }), now: () => reference });
  const before = db.sqlite.prepare("SELECT payload, last_success_at FROM football_state").get();
  await assert.rejects(refreshFootballState(db.env, fallback, { retrieve: async () => { throw new Error("Official score mismatch"); }, now: () => reference + 3_600_001 }), /last successful snapshot retained/);
  const after = db.sqlite.prepare("SELECT payload, last_success_at, last_error FROM football_state").get();
  assert.equal(after.payload, before.payload);
  assert.equal(after.last_success_at, before.last_success_at);
  assert.equal(after.last_error, "football_refresh_failed");
  const read = await readFootballState(db.env, fallback);
  assert.equal(read.update.status, "failed");
  assert.equal(read.snapshot.season.verifiedAt, fallback.season.verifiedAt);
});

test("an expired publication lease cannot overwrite the last good snapshot", async (t) => {
  const db = database(t);
  let clock = reference;
  await assert.rejects(refreshFootballState(db.env, fallback, { retrieve: async () => { clock += 120_001; return { snapshot: fallback }; }, now: () => clock }), /lease expired/);
  assert.equal(db.sqlite.prepare("SELECT payload FROM football_state").get().payload, null);
});

test("database failure serves the dated fallback with an unavailable status", async () => {
  const state = await readFootballState({ DB: { prepare() { throw new Error("Database unavailable"); } } }, fallback);
  assert.deepEqual(state.snapshot, fallback);
  assert.equal(state.update.status, "unavailable");
});

test("material-change detection ignores verification-only and market quote changes", async () => {
  const changed = structuredClone(fallback);
  changed.asOf = "2026-10-06";
  changed.season.verifiedAt = "2026-10-06T13:00:00Z";
  changed.schedule[4].cowboysMoneyline = -220;
  assert.equal(await footballContentHash(changed), await footballContentHash(fallback));
  changed.schedule[0].cowboysScore++;
  assert.notEqual(await footballContentHash(changed), await footballContentHash(fallback));
});

test("precise weekly verification does not expire at UTC midnight", () => {
  const data = structuredClone(fallback);
  data.asOf = data.manifest.validatedAt = "2026-10-07";
  data.manifest.reviewedAt = "2026-10-07T13:00:00Z";
  for (const key of ["games", "roster"]) data.manifest.inputs[key].retrievedBetween = { start: "2026-10-07T12:59:55Z", end: "2026-10-07T13:00:00Z" };
  assert.equal(footballSnapshotFreshness(data, Date.parse("2026-10-14T12:59:59Z")).status, "current");
  assert.equal(footballSnapshotFreshness(data, Date.parse("2026-10-14T13:00:00.001Z")).status, "stale");
});

async function worker() { return (await import("../dist/server/index.js")).default; }
function mcpRequest(name, headers = {}, args = {}) {
  return new Request("https://site.example/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
}
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("anonymous, other-owner, missing configuration and service-only writers are blocked before database access", async (t) => {
  const db = database(t), app = await worker();
  for (const headers of [{}, { "oai-authenticated-user-email": "other@example.com", "oai-authenticated-user-id": "other" }, { "OAI-Sites-Authorization": "Bearer service-token" }]) {
    const response = await app.fetch(mcpRequest("refresh_football", headers), { ...db.env, FOOTBALL_UPDATER_OWNER_EMAIL: "owner@example.com" }, ctx);
    assert.equal(response.status, 403);
  }
  assert.equal((await app.fetch(mcpRequest("refresh_football", { "oai-authenticated-user-email": "owner@example.com", "oai-authenticated-user-id": "owner" }), db.env, ctx)).status, 403);
  assert.equal(db.calls.length, 0);
});

test("owner readback works, extra updater arguments are rejected, and discovery contains no private data", async (t) => {
  const db = database(t), app = await worker();
  const headers = { "oai-authenticated-user-email": "owner@example.com", "oai-authenticated-user-id": "owner" };
  const env = { ...db.env, FOOTBALL_UPDATER_OWNER_EMAIL: "owner@example.com" };
  const read = await app.fetch(mcpRequest("football_update_status", headers), env, ctx);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).result.structuredContent.dataVersion, fallback.dataVersion);
  const invalid = await app.fetch(mcpRequest("refresh_football", headers, { url: "https://arbitrary.example" }), env, ctx);
  assert.equal((await invalid.json()).error.code, -32602);
  const discover = await app.fetch(new Request("https://site.example/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) }), env, ctx);
  assert.deepEqual((await discover.json()).result.tools.map((tool) => tool.name), ["football_update_status", "refresh_football"]);
});

test("server-rendered page and public reader use the same stored snapshot, with no public write route", async (t) => {
  const db = database(t), app = await worker();
  const updated = structuredClone(fallback);
  updated.dataVersion = "verified-test-version";
  updated.schedule[3].cowboysScore = 29;
  await refreshFootballState(db.env, fallback, { retrieve: async () => ({ snapshot: updated }), now: () => reference });
  const state = await app.fetch(new Request("https://site.example/api/football"), db.env, ctx);
  assert.equal(state.headers.get("X-Football-Data-Version"), updated.dataVersion);
  assert.equal((await state.json()).snapshot.schedule[3].cowboysScore, 29);
  const page = await app.fetch(new Request("https://site.example/", { headers: { accept: "text/html" } }), db.env, ctx);
  const html = await page.text();
  assert.ok(html.includes("Dallas: <!-- -->1<!-- -->-<!-- -->3<!-- -->-<!-- -->0</strong>"));
  assert.equal(page.headers.get("cache-control"), "no-store");
  const denied = await app.fetch(new Request("https://site.example/api/football", { method: "POST" }), db.env, ctx);
  assert.equal(denied.status, 405);
});


test("dated, mismatched, failed and unavailable football state rejects paid work before budget or provider access", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: reference });
  const db = database(t), app = await worker();
  await refreshFootballState(db.env, fallback, { retrieve: async () => ({ snapshot: fallback }), now: () => reference });
  let providerCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { providerCalls++; throw new Error("Provider must not run"); });
  const gameId = fallback.schedule.find((game) => game.status === "scheduled" && game.kickoffAt).id;
  const request = (dataVersion = fallback.dataVersion) => new Request("https://site.example/api/forecast", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId, dataVersion, controls: DEFAULT_CONTROLS }),
  });
  const check = async (environment, version, code) => {
    db.calls.length = 0;
    const response = await app.fetch(request(version), { ...environment, OPENAI_API_KEY: "test-key" }, ctx);
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.reliability.fallbackReasonCode, code);
    assert.equal(result.reliability.estimatedCostUsd, 0);
    assert.ok(db.calls.every((sql) => sql.includes("SELECT") && sql.includes("FROM football_state")));
  };
  await check(db.env, "old-version", "football_version_changed");
  db.sqlite.prepare("UPDATE football_state SET last_error = 'football_refresh_failed'").run();
  await check(db.env, fallback.dataVersion, "football_snapshot_stale");
  const stale = structuredClone(fallback);
  stale.manifest.reviewedAt = "2026-09-01T13:00:00Z";
  db.sqlite.prepare("UPDATE football_state SET last_error = NULL, payload = ?").run(JSON.stringify(stale));
  await check(db.env, fallback.dataVersion, "football_snapshot_stale");
  await check({ DB: { prepare() { throw new Error("Storage unavailable"); } } }, fallback.dataVersion, "football_snapshot_stale");
  assert.equal(providerCalls, 0);
});
