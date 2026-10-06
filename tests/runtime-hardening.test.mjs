import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MODEL_VERSION } from "../lib/forecast.mjs";

const snapshot = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const testGame = snapshot.schedule.find((game) => game.status === "scheduled" && game.kickoffAt && Date.parse(game.kickoffAt) > Date.parse(snapshot.season.verifiedAt));

const env = {
  THE_ODDS_API_KEY: "test-key",
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function loadWorker(label) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(label, `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function createD1(options = {}) {
  const calls = [];
  const ledgerRows = [];
  const reconciliations = [];
  const balances = new Map(Object.entries(options.budgetBalances ?? {}));
  const state = {
    rateAllowed: options.rateAllowed ?? true,
    reserveAllowed: options.reserveAllowed ?? true,
    spentMicros: options.spentMicros ?? 0,
    oddsLeaseAllowed: options.oddsLeaseAllowed ?? true,
    oddsControlUnavailable: options.oddsControlUnavailable ?? false,
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
          calls.push({ operation: "first", sql, values });
          if (sql.includes("FROM odds_cache")) return null;
          if (sql.includes("INSERT INTO ai_rate_limit_window")) {
            return state.rateAllowed ? { request_count: 1 } : null;
          }
          if (sql.includes("INSERT INTO odds_refresh_control")) {
            if (state.oddsControlUnavailable) throw new Error("refresh control unavailable");
            return state.oddsLeaseAllowed ? { lease_token: values[1] } : null;
          }
          if (sql.includes("FROM odds_refresh_control")) {
            return {
              lease_expires_at: Date.now() + 15_000,
              cooldown_until: Date.now() + 60_000,
            };
          }
          if (sql.includes("INSERT INTO ai_monthly_budget")) {
            if (!state.reserveAllowed) return null;
            balances.set(values[0], (balances.get(values[0]) ?? 0) + values[1]);
            return { month: values[0] };
          }
          if (sql.includes("FROM ai_monthly_budget")) {
            return {
              month: values[0] ?? "2026-07",
              estimated_spend_micros: state.spentMicros,
              request_count: 1,
              input_tokens: 0,
              output_tokens: 0,
              updated_at: "2026-08-03T09:12:39.000Z",
            };
          }
          return null;
        },
        async run() {
          calls.push({ operation: "run", sql, values });
          if (state.oddsControlUnavailable && sql.includes("odds_refresh_control")) {
            throw new Error("refresh control unavailable");
          }
          if (sql.includes("UPDATE ai_monthly_budget")) {
            reconciliations.push(values);
            const changes = options.reconcileChanges ?? (balances.has(values[4]) ? 1 : 0);
            if (changes === 1) {
              balances.set(values[4], Math.max(0, balances.get(values[4]) + values[0]));
            }
            return { success: true, meta: { changes } };
          }
          if (sql.includes("INSERT INTO ai_run_ledger")) {
            ledgerRows.push(values);
          }
          return { success: true };
        },
      };
      return statement;
    },
  };

  return { db, calls, ledgerRows, reconciliations, balances };
}

function forecastRequest(headers = {}) {
  return new Request("http://localhost/api/forecast", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      gameId: testGame.id,
      controls: {
        quarterback: 100,
        lamb: 100,
        pickens: 100,
        williams: 100,
        defense: 100,
        opponentStar: 100,
      },
    }),
  });
}

function firstAIResponse(options = {}) {
  const payload = {
    output: options.output ?? [{
      type: "function_call",
      call_id: "forecast-call-1",
      name: "get_forecast",
      arguments: "{}",
    }],
  };
  if (options.includeUsage !== false) {
    payload.usage = options.usage ?? {
      input_tokens: 100,
      output_tokens: 20,
    };
  }
  return Response.json(payload);
}

function groundedAIResponse(requestBody, options = {}) {
  const toolOutput = requestBody.input.find(
    (item) => item.type === "function_call_output",
  );
  const contract = JSON.parse(toolOutput.output);
  const explanation = {
    summary: options.summary
      ?? "The governed forecast remains an educational probability.",
    drivers: contract.forecast.drivers,
    uncertainty: contract.forecast.uncertainty,
    disclaimer: options.disclaimer
      ?? "Educational analytics only. This product does not recommend a bet or stake.",
    probability: contract.forecast.probability,
    modelVersion: contract.forecast.modelVersion,
    sourceUpdatedAt: contract.sourceUpdatedAt,
    comparisonEvidenceIds: ["baseline_change"],
  };
  if (options.extraOutput) Object.assign(explanation, options.extraOutput);
  const payload = {
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify(explanation),
      }],
    }],
  };
  if (options.includeUsage !== false) {
    payload.usage = options.usage ?? {
      input_tokens: 200,
      output_tokens: 40,
    };
  }
  return Response.json(payload);
}

test("completed, started and unconfirmed games are rejected before any provider or ledger call", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("No provider call allowed"); };
  const d1 = createD1();
  try {
    const worker = await loadWorker("not-upcoming");
    for (const [id, now] of [["2026_01_DAL_NYG", "2026-10-05T23:00:00Z"], ["2026_05_TB_DAL", "2026-10-09T00:15:00Z"], ["2026_18_DAL_WAS", "2026-10-05T23:00:00Z"]]) {
      t.mock.timers.enable({ apis: ["Date"], now: Date.parse(now) });
      const request = forecastRequest();
      const body = await request.json();
      const response = await worker.fetch(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, gameId: id }) }), { ...env, DB: d1.db, OPENAI_API_KEY: "test-key" }, ctx);
      const result = await response.json();
      assert.equal(response.status, 409);
      assert.equal(result.reliability.mode, "rejected");
      assert.equal(result.reliability.fallbackReasonCode, "game_not_upcoming");
      assert.equal(result.reliability.estimatedCostUsd, 0);
      t.mock.timers.reset();
    }
    assert.equal(calls, 0);
    assert.equal(d1.calls.length, 0);
  } finally { globalThis.fetch = originalFetch; t.mock.timers.reset(); }
});

test("reconciles a request to its reserved month when the provider finishes after UTC rollover", async (t) => {
  const originalFetch = globalThis.fetch;
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-30T23:59:59Z") });
  const d1 = createD1({ budgetBalances: { "2026-10": 200_000 } });
  let providerCalls = 0;
  globalThis.fetch = async (_input, init) => {
    providerCalls += 1;
    if (providerCalls === 1) return firstAIResponse();
    t.mock.timers.setTime(Date.parse("2026-10-01T00:00:01Z"));
    return groundedAIResponse(JSON.parse(init.body));
  };
  try {
    const worker = await loadWorker("month-rollover");
    const response = await worker.fetch(forecastRequest(), {
      ...env, DB: d1.db, OPENAI_API_KEY: "test-key",
    }, ctx);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.reliability.mode, "ai");
    assert.equal(providerCalls, 2);
    assert.equal(d1.reconciliations[0][4], "2026-09");
    assert.equal(d1.balances.get("2026-09"), 132);
    assert.equal(d1.balances.get("2026-10"), 200_000);
    assert.equal(payload.reliability.estimatedCostUsd, 0.000132);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test("keeps the conservative reservation in the receipt when reconciliation changes no row", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1({ reconcileChanges: 0 });
  let providerCalls = 0;
  globalThis.fetch = async (_input, init) => {
    providerCalls += 1;
    return providerCalls === 1 ? firstAIResponse() : groundedAIResponse(JSON.parse(init.body));
  };
  try {
    const worker = await loadWorker("zero-row-reconciliation");
    const response = await worker.fetch(forecastRequest(), {
      ...env, DB: d1.db, OPENAI_API_KEY: "test-key",
    }, ctx);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.reliability.mode, "ai");
    assert.equal(payload.reliability.estimatedCostUsd, 0.025);
    assert.equal(d1.balances.get(d1.reconciliations[0][4]), 25_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed controls before rate, budget, market, or provider work", async (t) => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls += 1; throw new Error("Unexpected provider call"); };
  try {
    const worker = await loadWorker("invalid-control-types");
    for (const controls of [
      null, [], "100", 100,
      { quarterback: { toString: null } },
      { quarterback: [] },
      { quarterback: null },
      { quarterback: "50" },
      { quarterback: true },
      { lamb: {}, receiver: 100 },
    ]) {
      await t.test(JSON.stringify(controls), async () => {
        const d1 = createD1();
        const request = new Request("http://localhost/api/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: testGame.id, controls }),
        });
        const response = await worker.fetch(request, { ...env, DB: d1.db, OPENAI_API_KEY: "test-key" }, ctx);
        const payload = await response.json();
        assert.equal(response.status, 400);
        assert.equal(payload.reliability.mode, "rejected");
        assert.equal(payload.reliability.fallbackReasonCode, "invalid_controls");
        assert.equal(payload.reliability.estimatedCostUsd, 0);
        assert.equal(d1.calls.length, 0);
      });
    }
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("defaults omitted controls and clamps finite numeric scenario values", async () => {
  const worker = await loadWorker("numeric-control-bounds");
  for (const controls of [undefined, { quarterback: -20, lamb: 120, defense: 25.5 }]) {
    const response = await worker.fetch(new Request("http://localhost/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: testGame.id, controls }),
    }), { ...env, DB: createD1().db }, ctx);
    const payload = await response.json();
    assert.equal(response.status, 200);
    const evidence = payload.forecast.drivers.find((driver) => driver.label === "Scenario contribution").evidence;
    assert.match(evidence, controls ? /Dak Prescott 0%/ : /Dak Prescott 100%/);
    assert.match(evidence, /CeeDee Lamb 100%/);
    assert.match(evidence, controls ? /defensive core 25\.5%/ : /defensive core 100%/);
  }
});

test("fails closed without shared D1 odds refresh control", async () => {
  const originalFetch = globalThis.fetch;
  let vendorCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.the-odds-api.com/")) vendorCalls += 1;
    return originalFetch(input, init);
  };

  try {
    const worker = await loadWorker("no-shared-odds-refresh-control");
    const response = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.status, "refresh_control_unavailable");
    assert.match(payload.message, /bundled nflverse market snapshot/i);
    assert.equal(Number(response.headers.get("retry-after")) > 0, true);
    assert.equal(vendorCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("throttles repeated refresh attempts after an upstream failure", async () => {
  const originalFetch = globalThis.fetch;
  let vendorCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.the-odds-api.com/")) {
      return originalFetch(input, init);
    }
    vendorCalls += 1;
    return new Response(null, { status: 503 });
  };

  try {
    const worker = await loadWorker("failed-odds-refresh");
    const d1 = createD1();
    const first = await worker.fetch(
      new Request("http://localhost/api/odds"),
      { ...env, DB: d1.db },
      ctx,
    );
    const second = await worker.fetch(
      new Request("http://localhost/api/odds"),
      { ...env, DB: d1.db },
      ctx,
    );
    const secondPayload = await second.json();

    assert.equal(first.status, 502);
    assert.equal(second.status, 429);
    assert.equal(vendorCalls, 1);
    assert.equal(secondPayload.status, "refresh_throttled");
    assert.equal(Number(second.headers.get("retry-after")) > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses a shared D1 lease before starting an odds refresh", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1();
  let vendorCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith("https://api.the-odds-api.com/")) {
      return originalFetch(input, init);
    }
    vendorCalls += 1;
    return Response.json([]);
  };

  try {
    const worker = await loadWorker("shared-odds-refresh-lease");
    const response = await worker.fetch(
      new Request("http://localhost/api/odds"),
      { ...env, DB: d1.db },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.source, "The Odds API");
    assert.equal(vendorCalls, 1);
    assert.equal(
      d1.calls.some((call) => call.sql.includes("INSERT INTO odds_refresh_control")),
      true,
    );
    assert.equal(
      d1.calls.some((call) => call.sql.includes("UPDATE odds_refresh_control")),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not call the odds provider when another isolate holds the D1 lease", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1({ oddsLeaseAllowed: false });
  let vendorCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.the-odds-api.com/")) {
      vendorCalls += 1;
    }
    return originalFetch(input, init);
  };

  try {
    const worker = await loadWorker("shared-odds-refresh-throttle");
    const response = await worker.fetch(
      new Request("http://localhost/api/odds"),
      { ...env, DB: d1.db },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 429);
    assert.equal(payload.status, "refresh_throttled");
    assert.equal(Number(response.headers.get("retry-after")) > 0, true);
    assert.equal(vendorCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not call the odds provider when shared refresh control is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1({ oddsControlUnavailable: true });
  let vendorCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.the-odds-api.com/")) {
      vendorCalls += 1;
    }
    return originalFetch(input, init);
  };

  try {
    const worker = await loadWorker("unavailable-shared-odds-refresh-control");
    const response = await worker.fetch(
      new Request("http://localhost/api/odds"),
      { ...env, DB: d1.db },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.status, "refresh_control_unavailable");
    assert.match(payload.message, /bundled nflverse market snapshot/i);
    assert.equal(vendorCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enforces the forecast body limit when Content-Length is absent", async () => {
  const worker = await loadWorker("bounded-forecast-body");
  const d1 = createD1();
  const oversizedBody = new TextEncoder().encode("x".repeat(8_193));
  const request = new Request("http://localhost/api/forecast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(oversizedBody);
        controller.close();
      },
    }),
    duplex: "half",
  });

  assert.equal(request.headers.get("content-length"), null);
  const response = await worker.fetch(request, { ...env, DB: d1.db }, ctx);
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error, "Request body is too large");
  assert.equal(payload.reliability.mode, "rejected");
  assert.equal(payload.reliability.fallbackReasonCode, "request_body_too_large");
  assert.equal(d1.ledgerRows.length, 0);
  assert.equal(
    d1.calls.some((call) => call.sql.includes("INSERT INTO ai_run_ledger")),
    false,
  );
});

test("rejects invalid JSON without writing to the per-run ledger", async () => {
  const worker = await loadWorker("invalid-json-no-ledger");
  const d1 = createD1();
  const response = await worker.fetch(
    new Request("http://localhost/api/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    { ...env, DB: d1.db },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.reliability.mode, "rejected");
  assert.equal(payload.reliability.fallbackReasonCode, "invalid_json");
  assert.equal(d1.ledgerRows.length, 0);
  assert.equal(d1.calls.length, 0);
});

test("rejects a literal null JSON body with the typed reliability receipt", async () => {
  const worker = await loadWorker("null-json-body");
  const d1 = createD1();
  const response = await worker.fetch(
    new Request("http://localhost/api/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }),
    { ...env, DB: d1.db },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid JSON body");
  assert.equal(payload.reliability.mode, "rejected");
  assert.equal(payload.reliability.fallbackReasonCode, "invalid_json");
  assert.equal(d1.calls.length, 0);
});

test("returns a validated AI reliability receipt and privacy-safe ledger row", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1();
  let aiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith("https://api.openai.com/")) {
      return originalFetch(input, init);
    }
    aiCalls += 1;
    const requestBody = JSON.parse(init.body);
    return aiCalls === 1
      ? firstAIResponse({
        usage: {
          input_tokens: 100,
          input_tokens_details: { cached_tokens: 40 },
          output_tokens: 20,
        },
      })
      : groundedAIResponse(requestBody, {
        usage: {
          input_tokens: 200,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens: 40,
        },
      });
  };

  try {
    const worker = await loadWorker("ai-reliability-success");
    const response = await worker.fetch(
      forecastRequest({
        "cf-connecting-ip": "203.0.113.42",
        "user-agent": "private-test-agent",
      }),
      {
        ...env,
        DB: d1.db,
        OPENAI_API_KEY: "server-side-test-key",
        OPENAI_MODEL: "gpt-5.6-luna",
      },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.explanation.mode, "ai");
    assert.equal(
      payload.explanation.summary,
      `The governed forecast assigns Dallas a ${Math.round(payload.forecast.probability * 100)}% win probability against ${testGame.opponentName}.`,
    );
    assert.equal(
      payload.explanation.disclaimer,
      "Educational analytics only. This product does not recommend a bet or stake.",
    );
    assert.equal(payload.fallbackReason, undefined);
    assert.equal(payload.budget, undefined);
    assert.deepEqual(
      Object.keys(payload.reliability).sort(),
      [
        "contractVersion",
        "estimatedCostUsd",
        "evalVersion",
        "fallbackReasonCode",
        "forecastVersion",
        "inputTokens",
        "latencyMs",
        "mode",
        "model",
        "outputTokens",
        "promptVersion",
        "requestId",
        "sourceUpdatedAt",
        "validationStatus",
      ].sort(),
    );
    assert.equal(payload.reliability.mode, "ai");
    assert.equal(payload.reliability.validationStatus, "passed");
    assert.equal(payload.reliability.fallbackReasonCode, null);
    assert.equal(payload.reliability.inputTokens, 300);
    assert.equal(payload.reliability.outputTokens, 60);
    assert.equal(payload.reliability.estimatedCostUsd, 0.000107);
    assert.equal(payload.reliability.forecastVersion, MODEL_VERSION);
    assert.equal(payload.reliability.sourceUpdatedAt, testGame.sourceUpdatedAt);
    assert.equal(aiCalls, 2);
    assert.equal(d1.reconciliations.length, 1);
    assert.equal(d1.ledgerRows.length, 1);
    assert.equal(
      d1.calls.some((call) => call.sql.includes("idx_ai_run_ledger_created_at")),
      true,
    );
    assert.equal(
      d1.calls.some((call) => (
        call.sql.includes("DELETE FROM ai_rate_limit_window WHERE expires_at <= ?")
      )),
      true,
    );
    const persistedValues = d1.calls.flatMap((call) => call.values);
    assert.equal(persistedValues.includes("203.0.113.42"), false);
    assert.equal(persistedValues.includes("private-test-agent"), false);
    assert.equal(
      d1.calls.some((call) => /(?:ip_address|client_ip|user_agent|prompt_text|response_body)/i.test(call.sql)),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a numeric string from the provider response", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1();
  let aiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith("https://api.openai.com/")) {
      return originalFetch(input, init);
    }
    aiCalls += 1;
    const requestBody = JSON.parse(init.body);
    return aiCalls === 1
      ? firstAIResponse()
      : groundedAIResponse(requestBody, {
        extraOutput: { probability: "0.55" },
      });
  };

  try {
    const worker = await loadWorker("reject-provider-numeric-string");
    const response = await worker.fetch(
      forecastRequest(),
      {
        ...env,
        DB: d1.db,
        OPENAI_API_KEY: "server-side-test-key",
        OPENAI_MODEL: "gpt-5.6-luna",
      },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.explanation.mode, "deterministic");
    assert.equal(payload.reliability.validationStatus, "failed");
    assert.equal(payload.reliability.fallbackReasonCode, "output_validation_failed");
    assert.equal(payload.reliability.estimatedCostUsd, 0.000132);
    assert.equal(aiCalls, 2);
    assert.equal(d1.reconciliations.length, 1);
    assert.equal(d1.ledgerRows.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("replaces provider-authored betting language with canonical server copy", async (t) => {
  const providerSummaries = [
    "Dallas is the side to support tonight.",
    "Dallas is the pick at -2.5.",
    "I like Dallas on the moneyline.",
    "Go with Dallas to cover.",
    "Ride with the Cowboys tonight.",
  ];

  for (const providerSummary of providerSummaries) {
    await t.test(providerSummary, async () => {
      const originalFetch = globalThis.fetch;
      const d1 = createD1();
      let aiCalls = 0;
      globalThis.fetch = async (input, init) => {
        if (!String(input).startsWith("https://api.openai.com/")) {
          return originalFetch(input, init);
        }
        aiCalls += 1;
        const requestBody = JSON.parse(init.body);
        return aiCalls === 1
          ? firstAIResponse()
          : groundedAIResponse(requestBody, {
            summary: providerSummary,
            disclaimer: "Consider this before placing a wager.",
            extraOutput: { recommendation: providerSummary },
          });
      };

      try {
        const worker = await loadWorker(`canonical-ai-copy-${providerSummary}`);
        const response = await worker.fetch(
          forecastRequest(),
          {
            ...env,
            DB: d1.db,
            OPENAI_API_KEY: "server-side-test-key",
            OPENAI_MODEL: "gpt-5.6-luna",
          },
          ctx,
        );
        const payload = await response.json();

        assert.equal(response.status, 200);
        assert.equal(payload.explanation.mode, "ai");
        assert.equal(
          payload.explanation.summary,
          `The governed forecast assigns Dallas a ${Math.round(payload.forecast.probability * 100)}% win probability against ${testGame.opponentName}.`,
        );
        assert.equal(payload.explanation.summary.includes(providerSummary), false);
        assert.equal(JSON.stringify(payload.explanation).includes(providerSummary), false);
        assert.equal("recommendation" in payload.explanation, false);
        assert.equal(
          payload.explanation.disclaimer,
          "Educational analytics only. This product does not recommend a bet or stake.",
        );
        assert.equal(aiCalls, 2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test("retains the full reservation when provider usage is missing or invalid", async (t) => {
  const scenarios = [
    {
      name: "missing usage",
      firstResponse: () => firstAIResponse({ includeUsage: false }),
      secondResponse: (requestBody) => groundedAIResponse(requestBody),
      expectedInputTokens: 200,
      expectedOutputTokens: 40,
    },
    {
      name: "invalid usage",
      firstResponse: () => firstAIResponse(),
      secondResponse: (requestBody) => groundedAIResponse(requestBody, {
        usage: {
          input_tokens: -1,
          output_tokens: "40",
        },
      }),
      expectedInputTokens: 100,
      expectedOutputTokens: 20,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const originalFetch = globalThis.fetch;
      const d1 = createD1();
      let aiCalls = 0;
      globalThis.fetch = async (input, init) => {
        if (!String(input).startsWith("https://api.openai.com/")) {
          return originalFetch(input, init);
        }
        aiCalls += 1;
        const requestBody = JSON.parse(init.body);
        return aiCalls === 1
          ? scenario.firstResponse()
          : scenario.secondResponse(requestBody);
      };

      try {
        const worker = await loadWorker(`uncertain-provider-usage-${scenario.name}`);
        const response = await worker.fetch(
          forecastRequest(),
          {
            ...env,
            DB: d1.db,
            OPENAI_API_KEY: "server-side-test-key",
            OPENAI_MODEL: "gpt-5.6-luna",
          },
          ctx,
        );
        const payload = await response.json();

        assert.equal(response.status, 200);
        assert.equal(payload.explanation.mode, "ai");
        assert.equal(payload.reliability.validationStatus, "passed");
        assert.equal(payload.reliability.inputTokens, scenario.expectedInputTokens);
        assert.equal(payload.reliability.outputTokens, scenario.expectedOutputTokens);
        assert.equal(payload.reliability.estimatedCostUsd, 0.025);
        assert.equal(aiCalls, 2);
        assert.equal(d1.reconciliations.length, 1);
        assert.equal(d1.reconciliations[0][0], 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test("retains the full reservation for invalid HTTP 200 provider JSON", async (t) => {
  const scenarios = [
    { name: "null", payload: null },
    { name: "array", payload: [] },
    { name: "primitive", payload: "unexpected" },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const originalFetch = globalThis.fetch;
      const d1 = createD1();
      let aiCalls = 0;
      globalThis.fetch = async (input, init) => {
        if (!String(input).startsWith("https://api.openai.com/")) {
          return originalFetch(input, init);
        }
        aiCalls += 1;
        return Response.json(scenario.payload);
      };

      try {
        const worker = await loadWorker(`invalid-provider-json-${scenario.name}`);
        const response = await worker.fetch(
          forecastRequest(),
          {
            ...env,
            DB: d1.db,
            OPENAI_API_KEY: "server-side-test-key",
            OPENAI_MODEL: "gpt-5.6-luna",
          },
          ctx,
        );
        const payload = await response.json();

        assert.equal(response.status, 200);
        assert.equal(payload.explanation.mode, "deterministic");
        assert.equal(payload.reliability.fallbackReasonCode, "provider_unavailable");
        assert.equal(payload.reliability.inputTokens, 0);
        assert.equal(payload.reliability.outputTokens, 0);
        assert.equal(payload.reliability.estimatedCostUsd, 0.025);
        assert.equal(aiCalls, 1);
        assert.equal(d1.reconciliations.length, 1);
        assert.equal(d1.reconciliations[0][0], 0);
        assert.equal(d1.ledgerRows.length, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test("requires exactly one empty get_forecast function call", async (t) => {
  const validCall = {
    type: "function_call",
    call_id: "forecast-call-1",
    name: "get_forecast",
    arguments: "{}",
  };
  const scenarios = [
    {
      name: "multiple calls",
      output: [
        validCall,
        { ...validCall, call_id: "forecast-call-2" },
      ],
    },
    {
      name: "wrong tool name",
      output: [{ ...validCall, name: "get_market" }],
    },
    {
      name: "blank call id",
      output: [{ ...validCall, call_id: "   " }],
    },
    {
      name: "nonempty arguments",
      output: [{ ...validCall, arguments: "{\"extra\":true}" }],
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const originalFetch = globalThis.fetch;
      const d1 = createD1();
      let aiCalls = 0;
      globalThis.fetch = async (input, init) => {
        if (!String(input).startsWith("https://api.openai.com/")) {
          return originalFetch(input, init);
        }
        aiCalls += 1;
        return firstAIResponse({ output: scenario.output });
      };

      try {
        const worker = await loadWorker(`tool-contract-${scenario.name}`);
        const response = await worker.fetch(
          forecastRequest(),
          {
            ...env,
            DB: d1.db,
            OPENAI_API_KEY: "server-side-test-key",
            OPENAI_MODEL: "gpt-5.6-luna",
          },
          ctx,
        );
        const payload = await response.json();

        assert.equal(response.status, 200);
        assert.equal(payload.explanation.mode, "deterministic");
        assert.equal(payload.reliability.fallbackReasonCode, "tool_contract_violation");
        assert.equal(payload.reliability.validationStatus, "failed");
        assert.equal(aiCalls, 1);
        assert.equal(d1.reconciliations.length, 1);
        assert.equal(d1.ledgerRows.length, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test("uses a typed fallback without a provider call for an unsupported model", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1();
  let aiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.openai.com/")) aiCalls += 1;
    return originalFetch(input, init);
  };

  try {
    const worker = await loadWorker("unsupported-openai-model");
    const response = await worker.fetch(
      forecastRequest(),
      {
        ...env,
        DB: d1.db,
        OPENAI_API_KEY: "server-side-test-key",
        OPENAI_MODEL: "gpt-5.6-luna-preview",
      },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.explanation.mode, "deterministic");
    assert.equal(payload.reliability.model, "gpt-5.6-luna-preview");
    assert.equal(payload.reliability.fallbackReasonCode, "unsupported_model");
    assert.equal(aiCalls, 0);
    assert.equal(
      d1.calls.some((call) => call.sql.includes("INSERT INTO ai_rate_limit_window")),
      true,
    );
    assert.equal(
      d1.calls.some((call) => call.sql.includes("INSERT INTO ai_monthly_budget")),
      false,
    );
    assert.equal(d1.ledgerRows.length, 0);
    assert.equal(
      d1.calls.some((call) => call.sql.includes("FROM odds_cache")),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gates an unconfigured AI fallback without market reads or ledger writes", async () => {
  const worker = await loadWorker("unconfigured-ai-pre-reservation");
  const d1 = createD1();
  const response = await worker.fetch(
    forecastRequest(),
    {
      ...env,
      DB: d1.db,
      OPENAI_MODEL: "gpt-5.6-luna",
    },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.explanation.mode, "deterministic");
  assert.equal(payload.reliability.fallbackReasonCode, "ai_not_configured");
  assert.equal(
    d1.calls.some((call) => call.sql.includes("INSERT INTO ai_rate_limit_window")),
    true,
  );
  assert.equal(
    d1.calls.some((call) => call.sql.includes("FROM odds_cache")),
    false,
  );
  assert.equal(d1.ledgerRows.length, 0);
});

test("does not persist a fallback when budget reservation is denied", async () => {
  const worker = await loadWorker("denied-budget-reservation");
  const d1 = createD1({ reserveAllowed: false });
  const response = await worker.fetch(
    forecastRequest(),
    {
      ...env,
      DB: d1.db,
      OPENAI_API_KEY: "server-side-test-key",
      OPENAI_MODEL: "gpt-5.6-luna",
    },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.explanation.mode, "deterministic");
  assert.equal(payload.reliability.fallbackReasonCode, "budget_exhausted");
  assert.equal(d1.ledgerRows.length, 0);
  assert.equal(
    d1.calls.some((call) => call.sql.includes("INSERT INTO ai_run_ledger")),
    false,
  );
});

test("reconciles the reservation and serves fallback after an uncertain provider failure", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1();
  let aiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith("https://api.openai.com/")) {
      return originalFetch(input, init);
    }
    aiCalls += 1;
    if (aiCalls === 1) return firstAIResponse();
    throw new TypeError("network unavailable");
  };

  try {
    const worker = await loadWorker("ai-reliability-failure");
    const response = await worker.fetch(
      forecastRequest(),
      {
        ...env,
        DB: d1.db,
        OPENAI_API_KEY: "server-side-test-key",
        OPENAI_MODEL: "gpt-5.6-luna",
      },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.explanation.mode, "deterministic");
    assert.equal(payload.reliability.mode, "deterministic");
    assert.equal(payload.reliability.fallbackReasonCode, "provider_unavailable");
    assert.equal(payload.reliability.validationStatus, "not_run");
    assert.equal(payload.reliability.inputTokens, 100);
    assert.equal(payload.reliability.outputTokens, 20);
    assert.equal(payload.reliability.estimatedCostUsd, 0.025);
    assert.equal(d1.reconciliations.length, 1);
    assert.equal(d1.ledgerRows.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps the full reservation charged after a provider non-2xx response", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1();
  let aiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith("https://api.openai.com/")) {
      return originalFetch(input, init);
    }
    aiCalls += 1;
    return Response.json(
      { error: { code: "provider_limit" } },
      { status: 429 },
    );
  };

  try {
    const worker = await loadWorker("provider-http-reservation");
    const response = await worker.fetch(
      forecastRequest(),
      {
        ...env,
        DB: d1.db,
        OPENAI_API_KEY: "server-side-test-key",
        OPENAI_MODEL: "gpt-5.6-luna",
      },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.explanation.mode, "deterministic");
    assert.equal(payload.reliability.fallbackReasonCode, "provider_http_error");
    assert.equal(payload.reliability.inputTokens, 0);
    assert.equal(payload.reliability.outputTokens, 0);
    assert.equal(payload.reliability.estimatedCostUsd, 0.025);
    assert.equal(aiCalls, 1);
    assert.equal(d1.reconciliations.length, 1);
    assert.equal(d1.reconciliations[0][0], 0);
    assert.equal(d1.ledgerRows.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rate limits anonymous AI globally without blocking the deterministic forecast", async () => {
  const originalFetch = globalThis.fetch;
  const d1 = createD1({ rateAllowed: false });
  let aiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.openai.com/")) aiCalls += 1;
    return originalFetch(input, init);
  };

  try {
    const worker = await loadWorker("anonymous-rate-limit");
    const response = await worker.fetch(
      forecastRequest(),
      {
        ...env,
        DB: d1.db,
        OPENAI_API_KEY: "server-side-test-key",
      },
      ctx,
    );
    const payload = await response.json();

    assert.equal(response.status, 429);
    assert.equal(payload.explanation.mode, "deterministic");
    assert.equal(payload.reliability.fallbackReasonCode, "rate_limited");
    assert.equal(Number(response.headers.get("retry-after")) > 0, true);
    assert.equal(payload.budget, undefined);
    assert.equal(aiCalls, 0);
    assert.equal(d1.reconciliations.length, 0);
    assert.equal(d1.ledgerRows.length, 0);
    assert.equal(
      d1.calls.some((call) => call.sql.includes("INSERT INTO ai_run_ledger")),
      false,
    );
    const rateLimitCalls = d1.calls.filter(
      (call) => call.sql.includes("ai_rate_limit_window"),
    );
    assert.equal(rateLimitCalls.length, 1);
    assert.equal(rateLimitCalls[0].operation, "first");
    assert.match(rateLimitCalls[0].sql, /INSERT INTO ai_rate_limit_window/);
    assert.doesNotMatch(rateLimitCalls[0].sql, /CREATE TABLE|DELETE FROM/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("serves a static cacheable public budget posture without reading D1", async () => {
  const worker = await loadWorker("public-budget-status");
  const d1 = createD1({ spentMicros: 1_000_000 });
  const response = await worker.fetch(
    new Request("http://localhost/api/budget"),
    {
      ...env,
      DB: d1.db,
      OPENAI_API_KEY: "server-side-test-key",
      OPENAI_MODEL: "gpt-5.6-luna",
    },
    ctx,
  );
  const payload = await response.json();

  assert.deepEqual(payload, { status: "managed" });
  assert.equal(JSON.stringify(payload).includes("spent"), false);
  assert.equal(JSON.stringify(payload).includes("requestCount"), false);
  assert.match(response.headers.get("cache-control") ?? "", /public/);
  assert.equal(response.headers.get("vary"), "Authorization");
  assert.equal(d1.calls.length, 0);
});

test("serves aggregate budget details to an authenticated operator", async () => {
  const worker = await loadWorker("operator-budget-status");
  const d1 = createD1({ spentMicros: 9_300_000 });
  const operatorToken = "operator-budget-token-value-1234567890";
  const response = await worker.fetch(
    new Request("http://localhost/api/budget", {
      headers: { Authorization: `Bearer ${operatorToken}` },
    }),
    {
      ...env,
      DB: d1.db,
      OPENAI_API_KEY: "server-side-test-key",
      OPENAI_MODEL: "gpt-5.6-luna",
      AI_MONTHLY_BUDGET_USD: "9.50",
      BUDGET_STATUS_TOKEN: operatorToken,
    },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "managed");
  assert.equal(payload.scope, "application_metered");
  assert.equal(payload.month, new Date().toISOString().slice(0, 7));
  assert.equal(payload.estimatedSpendUsd, 9.3);
  assert.equal(payload.applicationCutoffUsd, 9.5);
  assert.equal(payload.projectBudgetUsd, 10);
  assert.equal(payload.smokeTestThresholdUsd, 9.4);
  assert.equal(payload.standardForecastReservationUsd, 0.025);
  assert.equal(payload.remainingToCutoffUsd, 0.2);
  assert.equal(payload.requestCount, 1);
  assert.equal(payload.standardSmokeTestAllowed, true);
  assert.match(response.headers.get("cache-control") ?? "", /private/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("vary"), "Authorization");
  assert.equal(
    d1.calls.some((call) => call.sql.includes("FROM ai_monthly_budget")),
    true,
  );
});

test("blocks a standard smoke test at the operator threshold", async () => {
  const worker = await loadWorker("operator-budget-threshold");
  const d1 = createD1({ spentMicros: 9_400_000 });
  const operatorToken = "operator-budget-token-value-1234567890";
  const response = await worker.fetch(
    new Request("http://localhost/api/budget", {
      headers: { Authorization: `Bearer ${operatorToken}` },
    }),
    {
      ...env,
      DB: d1.db,
      OPENAI_API_KEY: "server-side-test-key",
      BUDGET_STATUS_TOKEN: operatorToken,
    },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.estimatedSpendUsd, 9.4);
  assert.equal(payload.standardSmokeTestAllowed, false);
});

test("rejects an invalid operator budget token without reading D1", async () => {
  const worker = await loadWorker("invalid-operator-budget-token");
  const d1 = createD1({ spentMicros: 1_000_000 });
  const response = await worker.fetch(
    new Request("http://localhost/api/budget", {
      headers: { Authorization: "Bearer invalid-operator-token-value-12345" },
    }),
    {
      ...env,
      DB: d1.db,
      BUDGET_STATUS_TOKEN: "operator-budget-token-value-1234567890",
    },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, { status: "unauthorized" });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(d1.calls.length, 0);
});

test("fails closed when operator budget authentication is not configured", async () => {
  const worker = await loadWorker("missing-operator-budget-token");
  const d1 = createD1({ spentMicros: 1_000_000 });
  const response = await worker.fetch(
    new Request("http://localhost/api/budget", {
      headers: { Authorization: "Bearer operator-budget-token-value-1234567890" },
    }),
    {
      ...env,
      DB: d1.db,
    },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.reasonCode, "operator_budget_status_unavailable");
  assert.equal(d1.calls.length, 0);
});

test("fails closed when the authenticated budget ledger is unavailable", async () => {
  const worker = await loadWorker("missing-operator-budget-ledger");
  const operatorToken = "operator-budget-token-value-1234567890";
  const response = await worker.fetch(
    new Request("http://localhost/api/budget", {
      headers: { Authorization: `Bearer ${operatorToken}` },
    }),
    {
      ...env,
      OPENAI_API_KEY: "server-side-test-key",
      BUDGET_STATUS_TOKEN: operatorToken,
    },
    ctx,
  );
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.reasonCode, "budget_ledger_unavailable");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("reports coarse budget unavailability for an unsupported model", async () => {
  const worker = await loadWorker("unsupported-model-budget-status");
  const d1 = createD1({ spentMicros: 1_000_000 });
  const response = await worker.fetch(
    new Request("http://localhost/api/budget"),
    {
      ...env,
      DB: d1.db,
      OPENAI_MODEL: "gpt-5.6-luna-preview",
    },
    ctx,
  );
  const payload = await response.json();

  assert.deepEqual(payload, { status: "unavailable" });
  assert.match(response.headers.get("cache-control") ?? "", /public/);
  assert.equal(d1.calls.length, 0);
});

test("redirects favicon requests to the existing SVG icon", async () => {
  const worker = await loadWorker("favicon-redirect");
  const response = await worker.fetch(
    new Request("https://road-to-six.example/favicon.ico"),
    env,
    ctx,
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://road-to-six.example/icon.svg");
  assert.match(response.headers.get("cache-control") ?? "", /max-age=86400/);
});
