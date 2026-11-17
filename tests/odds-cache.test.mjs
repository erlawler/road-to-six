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
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json([
      {
        id: "event-1",
        commence_time: "2026-09-13T17:00:00Z",
        home_team: "New York Giants",
        away_team: "Dallas Cowboys",
        bookmakers: [
          {
            last_update: "2026-09-13T15:00:00Z",
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
                  { name: "Dallas Cowboys", price: -500 },
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
    assert.deepEqual(firstPayload.events[0].marketSportsbookCounts, { moneyline: 2, spread: 1, total: 1 });
    assert.equal(firstPayload.events[0].oldestReportedMarketUpdate, "2026-09-13T15:00:00.000Z");
    assert.equal(firstPayload.events[0].cowboysMoneyline, -105);
    assert.equal(firstPayload.events[0].opponentMoneyline, -115);
    assert.equal(
      Math.abs(firstPayload.events[0].cowboysConsensusProbability - 0.4891304347826087) < 1e-12,
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("limits HTTP cache freshness to the D1 row's remaining lifetime", async (t) => {
  const originalFetch = globalThis.fetch;
  const start = Date.parse("2026-09-07T12:00:00Z");
  t.mock.timers.enable({ apis: ["Date"], now: start });
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls += 1; throw new Error("Unexpected provider call"); };
  const expiresAt = start + 90_000;
  const cached = {
    status: "current",
    source: "The Odds API",
    fetchedAt: new Date(start - 6 * 60 * 60 * 1_000 + 90_000).toISOString(),
    retrievedAt: new Date(start - 6 * 60 * 60 * 1_000 + 90_000).toISOString(),
    // The row's expiry remains authoritative over an inconsistent payload timestamp.
    cacheExpiresAt: new Date(start + 6 * 60 * 60 * 1_000).toISOString(),
    cacheTtlHours: 6,
    cached: true,
    events: [],
  };
  const db = {
    prepare(sql) {
      const statement = {
        bind() { return statement; },
        async run() { return { success: true }; },
        async first() {
          return sql.includes("FROM odds_cache")
            ? { payload: JSON.stringify(cached), fetched_at: cached.fetchedAt, expires_at: expiresAt }
            : null;
        },
      };
      return statement;
    },
  };
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("remaining-odds-ttl", `${process.pid}-${Math.random()}`);
    const { default: worker } = await import(workerUrl.href);
    const env = { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const first = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    const payload = await first.json();
    assert.equal(first.headers.get("Cache-Control"), "public, max-age=90, s-maxage=90, must-revalidate");
    assert.equal(payload.cacheExpiresAt, new Date(expiresAt).toISOString());

    t.mock.timers.setTime(start + 89_000);
    const second = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    assert.equal(second.headers.get("Cache-Control"), "public, max-age=1, s-maxage=1, must-revalidate");

    t.mock.timers.setTime(expiresAt);
    const expired = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    assert.equal(expired.status, 503);
    assert.equal((await expired.json()).status, "configuration_required");
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test("odds failures report bounded diagnostics without leaking upstream secrets", async (t) => {
  const secret = "synthetic-provider-key-must-not-leak";
  const secretBody = { message: `https://provider.example/?apiKey=${secret}`, error_code: secret };
  const cases = [
    ["invalid key", () => Response.json({ ...secretBody, error_code: "INVALID_KEY" }, { status: 401 }), "provider_authentication_failed", 401],
    ["quota", () => Response.json({ ...secretBody, error_code: "OUT_OF_USAGE_CREDITS" }, { status: 401 }), "provider_quota_exhausted", 401],
    ["rate limit", () => Response.json(secretBody, { status: 429 }), "provider_rate_limited", 429],
    ["gateway HTML", () => new Response(secret, { status: 503 }), "provider_http_error", 503],
    ["invalid JSON", () => new Response(secret), "provider_invalid_response", 200],
    ["object body", () => Response.json(secretBody), "provider_invalid_response", 200],
    ["null event", () => Response.json([null]), "provider_invalid_response", 200],
    ["invalid event", () => Response.json([{ home_team: "Dallas Cowboys" }]), "provider_invalid_response", 200],
    ["oversized body", () => new Response(" ".repeat(2_000_001)), "provider_invalid_response", 200],
    ["timeout", () => { throw new DOMException(secret, "TimeoutError"); }, "provider_timeout", null],
    ["connection failure", () => { throw new Error(secret); }, "provider_connection_failed", null],
  ];
  for (const [name, upstream, reasonCode, upstreamStatus] of cases) {
    await t.test(name, async () => {
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = async () => { calls++; return upstream(); };
      try {
        const url = new URL("../dist/server/index.js", import.meta.url);
        url.searchParams.set("odds-diagnostic", name);
        const { default: worker } = await import(url.href);
        const env = { THE_ODDS_API_KEY: secret, DB: createD1() };
        const ctx = { waitUntil() {}, passThroughOnException() {} };
        const response = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
        const text = await response.text();
        assert.equal(response.status, 502);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("retry-after"), "60");
        assert.equal(text.includes(secret), false);
        assert.deepEqual(JSON.parse(text), { status: "upstream_unavailable", reasonCode, upstreamStatus, retryAfterSeconds: 60 });
        const cooldown = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
        assert.equal(cooldown.status, 429);
        assert.equal(calls, 1);
      } finally { globalThis.fetch = originalFetch; }
    });
  }
});

test("a valid provider response without Cowboys coverage is cached as a coverage gap", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.searchParams.get("apiKey"), "test-key");
    assert.equal(url.searchParams.get("markets"), "h2h,spreads,totals");
    assert.equal(init.redirect, "error");
    return Response.json([{ home_team: "New York Giants", away_team: "Philadelphia Eagles" }]);
  };
  try {
    const url = new URL("../dist/server/index.js", import.meta.url);
    url.searchParams.set("odds-coverage", "empty");
    const { default: worker } = await import(url.href);
    const env = { THE_ODDS_API_KEY: "  test-key\n", DB: createD1() };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const first = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    const second = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    assert.equal(first.status, 200);
    const payload = await first.json();
    assert.equal(payload.status, "current");
    assert.deepEqual(payload.events, []);
    assert.equal((await second.json()).cached, true);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("a whitespace-only odds credential makes no provider request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail("Missing credential must not reach the provider"); };
  try {
    const url = new URL("../dist/server/index.js", import.meta.url);
    url.searchParams.set("odds-credential", "blank");
    const { default: worker } = await import(url.href);
    const response = await worker.fetch(new Request("http://localhost/api/odds"), { THE_ODDS_API_KEY: " \n ", DB: createD1() }, { waitUntil() {} });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, "configuration_required");
  } finally { globalThis.fetch = originalFetch; }
});
