import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticFantasySnapshot } from "../lib/fantasy.mjs";
import { createFantasySimulationClient, licensedFantasyProsAdapter } from "../lib/fantasy-provider.mjs";

const context = { season: 2026, week: 8, cowboysTeam: "DAL", opponentTeam: "ARI", kickoffAt: "2026-11-01T18:00:00Z", verified: true };
const start = Date.parse("2026-10-29T02:00:00Z");

test("licensed adapter stays disabled and makes no calls", () => {
  assert.equal(licensedFantasyProsAdapter().enabled, false);
  assert.equal(licensedFantasyProsAdapter().callsMade, 0);
});

test("valid fixture cache avoids calls and expires on the configured local policy", async () => {
  let clock = start;
  const client = createFantasySimulationClient({ now: () => clock, cacheTtlMs: 60_000,
    provider: async (ctx) => ({ status: 200, snapshot: createSyntheticFantasySnapshot(ctx, clock) }) });
  assert.equal((await client.read(context)).mode, "provider_fixture");
  const second = await client.read(context);
  assert.equal(second.mode, "cache_hit");
  assert.equal(second.receipt.providerCalls, 1);
  clock += 60_000;
  const third = await client.read(context);
  assert.equal(third.mode, "provider_fixture");
  assert.equal(third.receipt.providerCalls, 2);
  assert.equal(third.receipt.transport, "simulated");
});

test("rate limits preserve last-good snapshot, suppress recommendations and respect cooldown", async () => {
  let clock = start;
  let rateLimited = false;
  const client = createFantasySimulationClient({ now: () => clock, provider: async (ctx) => rateLimited
    ? { status: 429, retryAfterSeconds: 120 } : { status: 200, snapshot: createSyntheticFantasySnapshot(ctx, clock) } });
  const first = await client.read(context);
  rateLimited = true;
  const limited = await client.read(context, { forceRefresh: true });
  assert.equal(limited.reason, "rate_limited");
  assert.equal(limited.comparison.leaders, null);
  assert.deepEqual(limited.preservedSnapshot, first.preservedSnapshot);
  assert.equal(limited.receipt.nextRetryAt, new Date(start + 120_000).toISOString());
  const blocked = await client.read(context, { forceRefresh: true });
  assert.equal(blocked.receipt.providerCalls, 2);
  const ordinary = await client.read(context);
  assert.equal(ordinary.mode, "abstained");
  assert.equal(ordinary.comparison.leaders, null);
  assert.equal(ordinary.receipt.providerCalls, 2);
  clock += 120_000;
  rateLimited = false;
  assert.equal((await client.read(context, { forceRefresh: true })).receipt.providerCalls, 3);
});

test("returned cached data cannot mutate the internal last-good snapshot", async () => {
  const client = createFantasySimulationClient({ now: () => start,
    provider: async (ctx) => ({ status: 200, snapshot: createSyntheticFantasySnapshot(ctx, start) }) });
  await client.read(context);
  const cached = await client.read(context);
  cached.preservedSnapshot.players[0].name = "Injected replacement";
  cached.comparison.leaders.cowboys.player.projectedPoints = 999;
  const next = await client.read(context);
  assert.equal(next.mode, "cache_hit");
  assert.equal(next.comparison.leaders.cowboys.player.projectedPoints, 20);
  assert.notEqual(next.preservedSnapshot.players[0].name, "Injected replacement");
});

test("a failed forced refresh cannot silently recover through an ordinary cache hit", async () => {
  let invalid = false;
  const client = createFantasySimulationClient({ now: () => start, provider: async (ctx) => {
    const snapshot = createSyntheticFantasySnapshot(ctx, start);
    if (invalid) snapshot.coverage.complete = false;
    return { status: 200, snapshot };
  } });
  await client.read(context);
  invalid = true;
  assert.equal((await client.read(context, { forceRefresh: true })).comparison.leaders, null);
  const ordinary = await client.read(context);
  assert.equal(ordinary.mode, "abstained");
  assert.equal(ordinary.receipt.providerCalls, 3);
  invalid = false;
  assert.equal((await client.read(context)).mode, "provider_fixture");
  assert.equal((await client.read(context)).mode, "cache_hit");
});

test("timeouts, upstream errors and invalid responses abstain without erasing last-good data", async () => {
  for (const failure of [() => new Promise(() => {}), async () => { throw new Error("offline"); },
    async () => ({ status: 500 }), async () => ({ status: 200, snapshot: null })]) {
    let fail = false;
    const client = createFantasySimulationClient({ now: () => start, timeoutMs: 5,
      provider: async (ctx) => fail ? failure() : { status: 200, snapshot: createSyntheticFantasySnapshot(ctx, start) } });
    await client.read(context);
    fail = true;
    const result = await client.read(context, { forceRefresh: true });
    assert.equal(result.mode, "abstained");
    assert.equal(result.comparison.leaders, null);
    assert.ok(result.preservedSnapshot);
  }
});

test("concurrent fixture requests share one provider attempt and a different week cannot use the old cache", async () => {
  let resolve;
  let calls = 0;
  const client = createFantasySimulationClient({ now: () => start, provider: (ctx) => {
    calls += 1;
    return new Promise((done) => { resolve = () => done({ status: 200, snapshot: createSyntheticFantasySnapshot(ctx, start) }); });
  } });
  const first = client.read(context);
  const second = client.read(context);
  await Promise.resolve();
  resolve();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(results[0].comparison.status, "ready_demo");
  assert.equal(results[1].comparison.status, "ready_demo");
  const next = client.read({ ...context, week: 9 });
  await Promise.resolve();
  resolve();
  await next;
  assert.equal(calls, 2);
});
