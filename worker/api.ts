import snapshot from "../app/data/nfl-snapshot.json";
import { AI_BUDGET_SCHEMA_SQL } from "../db/schema";
import {
  calculateForecast,
  deterministicExplanation,
  type ForecastResult,
  type ScenarioControls,
} from "../lib/forecast.mjs";
import {
  estimateTokenCostMicros,
  requestReservationMicros,
} from "../lib/ai-budget.mjs";

type RuntimeEnv = {
  DB?: D1Database;
  THE_ODDS_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI_MONTHLY_BUDGET_USD?: string;
};

type SnapshotGame = (typeof snapshot.schedule)[number];

type BudgetRow = {
  month: string;
  estimated_spend_micros: number;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
};

const MAX_APPLICATION_BUDGET_USD = 9.5;
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const MAX_FORECAST_BODY_BYTES = 8_192;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function budgetLimitMicros(env: RuntimeEnv) {
  const configured = Number(env.AI_MONTHLY_BUDGET_USD ?? MAX_APPLICATION_BUDGET_USD);
  const bounded = Number.isFinite(configured)
    ? Math.min(MAX_APPLICATION_BUDGET_USD, Math.max(0, configured))
    : MAX_APPLICATION_BUDGET_USD;
  return Math.round(bounded * 1_000_000);
}

async function ensureBudgetTable(db: D1Database) {
  await db.prepare(AI_BUDGET_SCHEMA_SQL).run();
}

async function readBudget(env: RuntimeEnv) {
  const limitMicros = budgetLimitMicros(env);
  if (!env.DB) {
    return {
      available: false,
      month: monthKey(),
      spentUsd: 0,
      limitUsd: limitMicros / 1_000_000,
      remainingUsd: limitMicros / 1_000_000,
      requestCount: 0,
    };
  }

  await ensureBudgetTable(env.DB);
  const row = await env.DB
    .prepare("SELECT month, estimated_spend_micros, request_count, input_tokens, output_tokens FROM ai_monthly_budget WHERE month = ?")
    .bind(monthKey())
    .first<BudgetRow>();
  const spentMicros = row?.estimated_spend_micros ?? 0;

  return {
    available: true,
    month: monthKey(),
    spentUsd: spentMicros / 1_000_000,
    limitUsd: limitMicros / 1_000_000,
    remainingUsd: Math.max(0, limitMicros - spentMicros) / 1_000_000,
    requestCount: row?.request_count ?? 0,
  };
}

async function reserveBudget(env: RuntimeEnv) {
  if (!env.DB) return false;
  const limitMicros = budgetLimitMicros(env);
  const reservationMicros = requestReservationMicros(env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);
  if (reservationMicros > limitMicros) return false;
  await ensureBudgetTable(env.DB);
  const now = new Date().toISOString();
  const result = await env.DB
    .prepare(`
      INSERT INTO ai_monthly_budget (
        month, estimated_spend_micros, request_count, input_tokens, output_tokens, updated_at
      ) VALUES (?, ?, 1, 0, 0, ?)
      ON CONFLICT(month) DO UPDATE SET
        estimated_spend_micros = estimated_spend_micros + ?,
        request_count = request_count + 1,
        updated_at = ?
      WHERE estimated_spend_micros + ? <= ?
      RETURNING month
    `)
    .bind(
      monthKey(),
      reservationMicros,
      now,
      reservationMicros,
      now,
      reservationMicros,
      limitMicros,
    )
    .first<{ month: string }>();
  return result ? reservationMicros : false;
}

async function reconcileBudget(env: RuntimeEnv, reservedMicros: number, inputTokens: number, outputTokens: number) {
  if (!env.DB) return;
  const actualMicros = estimateTokenCostMicros({
    model: env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    inputTokens,
    outputTokens,
  });
  const adjustment = actualMicros - reservedMicros;
  await env.DB
    .prepare(`
      UPDATE ai_monthly_budget
      SET estimated_spend_micros = MAX(0, estimated_spend_micros + ?),
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          updated_at = ?
      WHERE month = ?
    `)
    .bind(adjustment, inputTokens, outputTokens, new Date().toISOString(), monthKey())
    .run();
}

function normalizeControls(input: unknown): ScenarioControls {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const bound = (value: unknown) => {
    const parsed = Number(value ?? 100);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
  };
  return {
    quarterback: bound(source.quarterback),
    lamb: bound(source.lamb ?? source.receiver),
    pickens: bound(source.pickens),
    williams: bound(source.williams),
    defense: bound(source.defense),
    opponentStar: bound(source.opponentStar),
  };
}

function getGame(gameId: unknown) {
  return snapshot.schedule.find((game) => game.id === gameId) ?? null;
}

function withMarketOverride(game: SnapshotGame, input: unknown) {
  if (!input || typeof input !== "object") return game;
  const market = input as Record<string, unknown>;
  const safeNumber = (value: unknown, fallback: number | null) => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && Math.abs(parsed) <= 10_000 ? parsed : fallback;
  };
  return {
    ...game,
    cowboysMoneyline: safeNumber(market.cowboysMoneyline, game.cowboysMoneyline),
    opponentMoneyline: safeNumber(market.opponentMoneyline, game.opponentMoneyline),
    cowboysSpread: safeNumber(market.cowboysSpread, game.cowboysSpread),
    totalLine: safeNumber(market.totalLine, game.totalLine),
  };
}

function makeForecast(game: SnapshotGame, controls: ScenarioControls) {
  const opponent = snapshot.opponents[game.opponent as keyof typeof snapshot.opponents];
  return calculateForecast({
    game: {
      ...game,
      venue: game.venue as "home" | "away" | "neutral",
      opponentStarName: opponent?.leaders[0]?.name,
    },
    ratings: snapshot.ratings,
    controls,
  });
}

function extractOutputText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "output_text") {
        return String((part as { text?: unknown }).text ?? "");
      }
    }
  }
  return "";
}

function responseUsage(response: Record<string, unknown>) {
  const usage = response.usage && typeof response.usage === "object"
    ? response.usage as Record<string, unknown>
    : {};
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
  };
}

async function openAIRequest(env: RuntimeEnv, body: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }
  return await response.json() as Record<string, unknown>;
}

async function createAIExplanation(env: RuntimeEnv, game: SnapshotGame, controls: ScenarioControls, forecast: ForecastResult) {
  const model = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const tool = {
    type: "function",
    name: "get_forecast",
    description: "Return the versioned probability result that must be used without alteration.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  };
  const input = [
    {
      role: "system",
      content: "Explain an educational football forecast. Call get_forecast before explaining. Never recommend a bet, stake, payout, sportsbook, or action. Name evidence and uncertainty.",
    },
    {
      role: "user",
      content: `Explain the Dallas scenario for Week ${game.week} against ${game.opponentName}. The scenario assumptions are ${JSON.stringify(controls)}.`,
    },
  ];

  const first = await openAIRequest(env, {
    model,
    input,
    tools: [tool],
    tool_choice: { type: "function", name: "get_forecast" },
    max_output_tokens: 300,
    store: false,
  });
  const firstOutput = Array.isArray(first.output) ? first.output : [];
  const functionCall = firstOutput.find(
    (item) => item && typeof item === "object" && (item as { type?: string }).type === "function_call",
  ) as { call_id?: string } | undefined;
  if (!functionCall?.call_id) throw new Error("The forecast tool was not called");

  const second = await openAIRequest(env, {
    model,
    input: [
      ...input,
      ...firstOutput,
      {
        type: "function_call_output",
        call_id: functionCall.call_id,
        output: JSON.stringify(forecast),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "forecast_explanation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            drivers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  evidence: { type: "string" },
                  impact: { type: "string" },
                },
                required: ["label", "evidence", "impact"],
                additionalProperties: false,
              },
            },
            uncertainty: { type: "array", items: { type: "string" } },
            disclaimer: { type: "string" },
          },
          required: ["summary", "drivers", "uncertainty", "disclaimer"],
          additionalProperties: false,
        },
      },
    },
    max_output_tokens: 500,
    store: false,
  });

  const parsed = JSON.parse(extractOutputText(second));
  const firstUsage = responseUsage(first);
  const secondUsage = responseUsage(second);
  return {
    explanation: { ...parsed, mode: "ai" },
    inputTokens: firstUsage.inputTokens + secondUsage.inputTokens,
    outputTokens: firstUsage.outputTokens + secondUsage.outputTokens,
  };
}

async function forecastResponse(request: Request, env: RuntimeEnv) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_FORECAST_BODY_BYTES) {
    return jsonResponse({ error: "Request body is too large" }, 413);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json" }, 415);
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const snapshotGame = getGame(body.gameId);
  if (!snapshotGame) return jsonResponse({ error: "Unknown game" }, 400);
  const game = withMarketOverride(snapshotGame, body.market);
  const controls = normalizeControls(body.controls);
  const forecast = makeForecast(game, controls);
  const fallback = deterministicExplanation({
    forecast,
    game: {
      ...game,
      venue: game.venue as "home" | "away" | "neutral",
      opponentStarName: snapshot.opponents[game.opponent as keyof typeof snapshot.opponents]?.leaders[0]?.name,
    },
  });

  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ forecast, explanation: fallback, fallbackReason: "OPENAI_API_KEY is not configured", budget: await readBudget(env) });
  }

  const reservedMicros = await reserveBudget(env);
  if (!reservedMicros) {
    return jsonResponse({ forecast, explanation: fallback, fallbackReason: "Monthly AI budget is unavailable or exhausted", budget: await readBudget(env) });
  }

  try {
    const ai = await createAIExplanation(env, game, controls, forecast);
    await reconcileBudget(env, reservedMicros, ai.inputTokens, ai.outputTokens);
    return jsonResponse({ forecast, explanation: ai.explanation, budget: await readBudget(env) });
  } catch {
    return jsonResponse({ forecast, explanation: fallback, fallbackReason: "Runtime AI was unavailable", budget: await readBudget(env) });
  }
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function oddsResponse(env: RuntimeEnv) {
  if (!env.THE_ODDS_API_KEY) {
    return jsonResponse({ status: "configuration_required", message: "Using the bundled nflverse market snapshot until a free odds key is configured." }, 503);
  }

  const url = new URL("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/");
  url.searchParams.set("apiKey", env.THE_ODDS_API_KEY);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return jsonResponse({ status: "upstream_unavailable" }, 502);
  const events = await response.json() as Array<Record<string, unknown>>;
  const dallasEvents = events.filter(
    (event) => event.home_team === "Dallas Cowboys" || event.away_team === "Dallas Cowboys",
  );

  const normalized = dallasEvents.map((event) => {
    const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers as Array<Record<string, unknown>> : [];
    const cowboysMoneylines: number[] = [];
    const opponentMoneylines: number[] = [];
    const cowboysSpreads: number[] = [];
    const totals: number[] = [];

    for (const bookmaker of bookmakers) {
      const markets = Array.isArray(bookmaker.markets) ? bookmaker.markets as Array<Record<string, unknown>> : [];
      for (const market of markets) {
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes as Array<Record<string, unknown>> : [];
        if (market.key === "h2h") {
          for (const outcome of outcomes) {
            const price = Number(outcome.price);
            if (!Number.isFinite(price)) continue;
            if (outcome.name === "Dallas Cowboys") cowboysMoneylines.push(price);
            else opponentMoneylines.push(price);
          }
        }
        if (market.key === "spreads") {
          for (const outcome of outcomes) {
            const point = Number(outcome.point);
            if (outcome.name === "Dallas Cowboys" && Number.isFinite(point)) cowboysSpreads.push(point);
          }
        }
        if (market.key === "totals") {
          const point = Number(outcomes.find((outcome) => outcome.name === "Over")?.point);
          if (Number.isFinite(point)) totals.push(point);
        }
      }
    }

    return {
      id: event.id,
      commenceTime: event.commence_time,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      cowboysMoneyline: median(cowboysMoneylines),
      opponentMoneyline: median(opponentMoneylines),
      cowboysSpread: median(cowboysSpreads),
      total: median(totals),
      sportsbookCount: bookmakers.length,
    };
  });

  return jsonResponse({ status: "current", source: "The Odds API", events: normalized });
}

export async function handleApiRequest(request: Request, env: RuntimeEnv) {
  const url = new URL(request.url);
  if (url.pathname === "/api/forecast" && request.method === "POST") {
    return forecastResponse(request, env);
  }
  if (url.pathname === "/api/odds" && request.method === "GET") {
    return oddsResponse(env);
  }
  if (url.pathname === "/api/budget" && request.method === "GET") {
    return jsonResponse(await readBudget(env));
  }
  return jsonResponse({ error: "Not found" }, 404);
}
