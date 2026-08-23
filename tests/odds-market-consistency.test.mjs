import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateForecast } from "../lib/forecast.mjs";
import {
  applyLiveMarket,
  findCowboysScheduleGame,
  forecastMarketEvidenceAction,
  marketFromOddsEvent,
} from "../lib/odds-market.mjs";

const snapshot = JSON.parse(
  await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"),
);

test("matches every current Cowboys night game to its Central schedule date", () => {
  const rolloverEvents = [
    ["2026-09-14T00:20:00Z", "New York Giants", "2026_01_DAL_NYG"],
    ["2026-10-09T00:15:00Z", "Tampa Bay Buccaneers", "2026_05_TB_DAL"],
    ["2026-10-19T00:20:00Z", "Green Bay Packers", "2026_06_DAL_GB"],
    ["2026-10-27T00:15:00Z", "Philadelphia Eagles", "2026_07_DAL_PHI"],
    ["2026-12-08T01:15:00Z", "Seattle Seahawks", "2026_13_DAL_SEA"],
    ["2026-12-28T01:20:00Z", "Jacksonville Jaguars", "2026_16_JAX_DAL"],
  ];

  for (const [commenceTime, opponentName, expectedGameId] of rolloverEvents) {
    const game = findCowboysScheduleGame(snapshot.schedule, {
      commenceTime,
      homeTeam: "Dallas Cowboys",
      awayTeam: opponentName,
    });

    assert.notEqual(commenceTime.slice(0, 10), game?.date);
    assert.equal(game?.id, expectedGameId);
  }
});

test("uses the same normalized market inputs for the client and server forecast", () => {
  const game = snapshot.schedule[0];
  const event = {
    commenceTime: "2026-09-14T00:20:00Z",
    homeTeam: "New York Giants",
    awayTeam: "Dallas Cowboys",
    cowboysMoneyline: -145,
    opponentMoneyline: 125,
    cowboysSpread: -2.5,
    total: 48.5,
    cowboysConsensusProbability: 0.612345,
    sportsbookCount: 5,
  };
  const market = marketFromOddsEvent(event, game);
  const effectiveGame = applyLiveMarket(game, market);
  const forecast = calculateForecast({
    game: {
      ...effectiveGame,
      venue: effectiveGame.venue,
    },
    ratings: snapshot.ratings,
    controls: {
      quarterback: 100,
      lamb: 100,
      pickens: 100,
      williams: 100,
      defense: 100,
      opponentStar: 100,
    },
  });

  assert.equal(effectiveGame.marketImpliedProbability, 0.612345);
  assert.equal(effectiveGame.sportsbookCount, 5);
  assert.equal(forecast.marketImplied, 0.612345);
  assert.match(
    forecast.drivers.find((driver) => driver.label === "Market consensus")?.evidence ?? "",
    /Median of 5 independently vig-adjusted sportsbook probabilities/,
  );
});

test("clears live market state when the forecast API reports bundled evidence", () => {
  const liveAction = forecastMarketEvidenceAction({
    source: "The Odds API",
    retrievedAt: "2026-08-23T19:07:56.106Z",
    cached: true,
    market: {
      cowboysMoneyline: -145,
      opponentMoneyline: 125,
      cowboysSpread: -2.5,
      totalLine: 48.5,
      marketImpliedProbability: 0.612345,
      sportsbookCount: 5,
    },
  });
  const bundledAction = forecastMarketEvidenceAction({
    source: "Bundled nflverse market snapshot",
    market: {
      cowboysMoneyline: -148,
      opponentMoneyline: 124,
    },
  });

  assert.equal(liveAction.action, "apply");
  assert.equal(liveAction.market.marketImpliedProbability, 0.612345);
  assert.equal(liveAction.market.sportsbookCount, 5);
  assert.deepEqual(bundledAction, { action: "clear" });
});

test("the forecast API uses a next-day UTC event as current market evidence", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedAt = new Date().toISOString();
  const oddsPayload = {
    status: "current",
    source: "The Odds API",
    fetchedAt,
    retrievedAt: fetchedAt,
    cacheExpiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    cacheTtlHours: 6,
    cached: true,
    events: [{
      commenceTime: "2026-09-14T00:20:00Z",
      homeTeam: "New York Giants",
      awayTeam: "Dallas Cowboys",
      cowboysMoneyline: -145,
      opponentMoneyline: 125,
      cowboysSpread: -2.5,
      total: 48.5,
      cowboysConsensusProbability: 0.612345,
      sportsbookCount: 5,
    }],
  };
  const db = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...nextValues) {
          values = nextValues;
          return statement;
        },
        async first() {
          if (sql.includes("FROM odds_cache")) {
            return {
              payload: JSON.stringify(oddsPayload),
              fetched_at: fetchedAt,
              expires_at: Date.now() + 60 * 60 * 1_000,
            };
          }
          if (sql.includes("INSERT INTO ai_rate_limit_window")) {
            return { request_count: 1 };
          }
          if (sql.includes("INSERT INTO ai_monthly_budget")) {
            return { month: new Date().toISOString().slice(0, 7) };
          }
          return null;
        },
        async run() {
          return { success: true, values };
        },
      };
      return statement;
    },
  };

  globalThis.fetch = async (input) => {
    if (String(input).startsWith("https://api.openai.com/")) {
      return new Response(null, { status: 503 });
    }
    return originalFetch(input);
  };

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("market-rollover", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/api/forecast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId: "2026_01_DAL_NYG",
          controls: {
            quarterback: 100,
            lamb: 100,
            pickens: 100,
            williams: 100,
            defense: 100,
            opponentStar: 100,
          },
        }),
      }),
      {
        DB: db,
        OPENAI_API_KEY: "server-side-test-key",
        OPENAI_MODEL: "gpt-5.6-luna",
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.reliability.fallbackReasonCode, "provider_http_error");
    assert.equal(payload.marketEvidence.source, "The Odds API");
    assert.equal(payload.marketEvidence.market.marketImpliedProbability, 0.612345);
    assert.equal(payload.marketEvidence.market.sportsbookCount, 5);
    assert.equal(payload.forecast.marketImplied, 0.612345);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
