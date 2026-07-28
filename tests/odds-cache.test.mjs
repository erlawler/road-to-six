import assert from "node:assert/strict";
import test from "node:test";

function createD1() {
  return {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...nextValues) {
          values = nextValues;
          return statement;
        },
        async first() {
          if (sql.includes("FROM odds_cache")) return null;
          if (sql.includes("INSERT INTO odds_refresh_control")) {
            return { lease_token: values[1] };
          }
          return null;
        },
        async run() {
          return { success: true };
        },
      };
      return statement;
    },
  };
}

test("normalizes per-book consensus and reuses the six-hour odds cache", async () => {
  const originalFetch = globalThis.fetch;
  let vendorCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.the-odds-api.com/")) {
      return originalFetch(input, init);
    }
    vendorCalls += 1;
    return Response.json([
      {
        id: "event-1",
        commence_time: "2026-09-13T17:00:00Z",
        home_team: "New York Giants",
        away_team: "Dallas Cowboys",
        bookmakers: [
          {
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Dallas Cowboys", price: -110 },
                  { name: "New York Giants", price: -110 },
                ],
              },
              {
                key: "spreads",
                outcomes: [{ name: "Dallas Cowboys", point: -2.5 }],
              },
              {
                key: "totals",
                outcomes: [{ name: "Over", point: 48.5 }],
              },
            ],
          },
          {
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Dallas Cowboys", price: -105 },
                ],
              },
            ],
          },
          {
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Dallas Cowboys", price: 100 },
                  { name: "New York Giants", price: -120 },
                ],
              },
            ],
          },
        ],
      },
    ]);
  };

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("odds-cache", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const env = {
      THE_ODDS_API_KEY: "test-key",
      DB: createD1(),
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    };
    const ctx = { waitUntil() {}, passThroughOnException() {} };

    const first = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    const second = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    const firstPayload = await first.json();
    const secondPayload = await second.json();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(vendorCalls, 1);
    assert.equal(firstPayload.cached, false);
    assert.equal(secondPayload.cached, true);
    assert.equal(firstPayload.cacheTtlHours, 6);
    assert.equal(firstPayload.source, "The Odds API");
    assert.equal(Number.isFinite(Date.parse(firstPayload.fetchedAt)), true);
    assert.equal(firstPayload.retrievedAt, firstPayload.fetchedAt);
    assert.equal(firstPayload.events[0].sportsbookCount, 2);
    assert.equal(
      Math.abs(firstPayload.events[0].cowboysConsensusProbability - 0.4891304347826087) < 1e-12,
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
