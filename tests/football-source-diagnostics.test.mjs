import assert from "node:assert/strict";
import test from "node:test";
import { boundedSource, retrieveFootballCandidate } from "../lib/football-sources.mjs";
import { sha256 } from "../lib/football-utils.mjs";

const url = "https://source.example/private?token=secret";
const reference = Date.parse("2026-10-18T19:00:00Z");
const clock = () => reference;

test("successful downloads retain exact text, byte count, digest and retrieval interval", async () => {
  const body = "Dallas \u2605";
  const result = await boundedSource(url, async () => new Response(body), 100, clock, "games");
  assert.deepEqual(result, {
    text: body, bytes: new TextEncoder().encode(body).byteLength, sha256: await sha256(body),
    retrievedBetween: { start: new Date(reference).toISOString(), end: new Date(reference).toISOString() },
  });
});

test("HTTP errors identify the source and status, cancel the body, and omit upstream details", async () => {
  for (const status of [403, 404, 429, 503]) {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    await assert.rejects(boundedSource(url, async () => new Response(body, { status, statusText: "secret" }), 100, clock, "gamesMetadata"),
      { message: `nflverse games metadata: HTTP ${status}` });
    assert.equal(cancelled, true);
  }
});

test("missing and declared oversized bodies have distinct errors", async () => {
  await assert.rejects(boundedSource(url, async () => new Response(null, { status: 204 }), 100, clock, "record"),
    { message: "Official NFL team record: response body is missing" });
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(boundedSource(url, async () => new Response(body, { headers: { "content-length": "101" } }), 100, clock, "roster"),
    { message: "nflverse roster feed: declared size exceeds 100-byte size limit" });
  assert.equal(cancelled, true);
});

test("streaming size limit still cancels the download even when cancellation rejects", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("123456")); },
    cancel() { cancelled = true; throw new Error("secret cancellation detail"); },
  });
  await assert.rejects(boundedSource(url, async () => new Response(body), 5, clock, "stats"),
    { message: "nflverse player stats feed: download exceeds 5-byte size limit" });
  assert.equal(cancelled, true);
});

test("pending cancellation cannot prevent HTTP or size errors from returning", { timeout: 1000 }, async () => {
  for (const [options, reason] of [
    [{ status: 503 }, "HTTP 503"],
    [{ headers: { "content-length": "6" } }, "declared size exceeds 5-byte size limit"],
    [{}, "download exceeds 5-byte size limit"],
  ]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("123456")); },
      cancel() { cancelled = true; return new Promise(() => {}); },
    });
    await assert.rejects(boundedSource(url, async () => new Response(body, options), 5, clock, "games"),
      { message: `nflverse games feed: ${reason}` });
    assert.equal(cancelled, true);
  }
});

test("network and response-stream errors never disclose upstream exception text or URLs", async () => {
  const fetchers = [
    async () => { throw new Error(`Failed at ${url}`); },
    async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(`Failed at ${url}`)); } })),
  ];
  for (const fetcher of fetchers) {
    await assert.rejects(boundedSource(url, fetcher, 100, clock, "schedule"),
      { message: "Official Cowboys schedule: request or response stream failed" });
  }
  await assert.rejects(boundedSource(url, fetchers[0], 100, clock, url),
    { message: "Football source: request or response stream failed" });
});

test("the existing 25-second deadline aborts the request and reports a safe timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  const fetcher = async (_, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error(`Timeout at ${url}`)), { once: true }));
  };
  const result = boundedSource(url, fetcher, 100, clock, "schedule");
  const rejected = assert.rejects(result, { message: "Official Cowboys schedule: request timed out after 25 seconds" });
  t.mock.timers.tick(24_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(signal.aborted, true);
});

test("all eight approved requests report their own source label", async () => {
  const commit = "a".repeat(40);
  const api = "https://api.github.com/repos/nflverse/";
  const fixtures = new Map([
    [`${api}nfldata/commits?path=data/games.csv&per_page=1`, ["nflverse games metadata", [{ sha: commit, commit: { committer: { date: new Date(reference).toISOString() } } }]]],
    [`${api}nflverse-data/releases/tags/weekly_rosters`, ["nflverse roster metadata", { assets: [{ name: "roster_weekly_2026.csv", updated_at: new Date(reference).toISOString() }] }]],
    [`${api}nflverse-data/releases/tags/stats_player`, ["nflverse player stats metadata", { assets: [{ name: "stats_player_reg_2026.csv", updated_at: new Date(reference).toISOString() }] }]],
    [`https://raw.githubusercontent.com/nflverse/nfldata/${commit}/data/games.csv`, ["nflverse games feed", ""]],
    ["https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv", ["nflverse roster feed", ""]],
    ["https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_2026.csv", ["nflverse player stats feed", ""]],
    ["https://www.dallascowboys.com/schedule/", ["Official Cowboys schedule", ""]],
    ["https://www.nfl.com/teams/dallas-cowboys/", ["Official NFL team record", ""]],
  ]);
  for (const [failedUrl, [label]] of fixtures) {
    const fetcher = async (requestedUrl) => {
      assert.ok(fixtures.has(requestedUrl), "Only approved sources may be requested");
      if (requestedUrl === failedUrl) return new Response("private upstream detail", { status: 503 });
      const value = fixtures.get(requestedUrl)[1];
      return new Response(typeof value === "string" ? value : JSON.stringify(value));
    };
    await assert.rejects(retrieveFootballCandidate({ season: { year: 2026 } }, fetcher, clock),
      { message: `${label}: HTTP 503` });
  }
});
