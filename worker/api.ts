import snapshot from "../app/data/nfl-snapshot.json";
import { AI_BUDGET_SCHEMA_SQL, ODDS_CACHE_SCHEMA_SQL } from "../db/schema";
import {
  calculateForecast,
  deterministicExplanation,
  removeVig,
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

type OddsCacheRow = {
  payload: string;
  fetched_at: string;
  expires_at: number;
};

type OddsCachePayload = {
  status: "current";
  source: "The Odds API";
  retrievedAt: string;
  cacheExpiresAt: string;
  cacheTtlHours: number;
  cached: boolean;
  events: Array<Record<string, unknown>>;
};

type MarketEvidence = {
  source: string;
  retrievedAt: string;
  cached: boolean;
  market: {
    cowboysMoneyline: number | null;
    opponentMoneyline: number | null;
    cowboysSpread: number | null;
    totalLine: number | null;
    marketImpliedProbability: number | null;
    sportsbookCount: number;
  };
};

const MAX_APPLICATION_BUDGET_USD = 9.5;
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const MAX_FORECAST_BODY_BYTES = 8_192;
const ODDS_CACHE_KEY = "nfl-us-h2h-spreads-totals";
const ODDS_CACHE_TTL_HOURS = 6;
const ODDS_CACHE_TTL_MS = ODDS_CACHE_TTL_HOURS * 60 * 60 * 1_000;

let memoryOddsCache: OddsCachePayload | null = null;
let memoryOddsCacheExpiresAt = 0;

function jsonResponse(body: unknown, status = 200, additionalHeaders?: HeadersInit) {
  const headers = new Headers(additionalHeaders);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, {
    status,
    headers,
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

async function ensureOddsCacheTable(db: D1Database) {
  await db.prepare(ODDS_CACHE_SCHEMA_SQL).run();
}

async function readOddsCache(env: RuntimeEnv) {
  const now = Date.now();
  if (memoryOddsCache && memoryOddsCacheExpiresAt > now) {
    return { ...memoryOddsCache, cached: true };
  }
  if (!env.DB) return null;

  try {
    await ensureOddsCacheTable(env.DB);
    const row = await env.DB
      .prepare("SELECT payload, fetched_at, expires_at FROM odds_cache WHERE cache_key = ?")
      .bind(ODDS_CACHE_KEY)
      .first<OddsCacheRow>();
    if (!row || row.expires_at <= now) return null;
    const payload = JSON.parse(row.payload) as OddsCachePayload;
    memoryOddsCache = payload;
    memoryOddsCacheExpiresAt = row.expires_at;
    return { ...payload, cached: true };
  } catch {
    return null;
  }
}

async function writeOddsCache(env: RuntimeEnv, payload: OddsCachePayload, expiresAt: number) {
  memoryOddsCache = payload;
  memoryOddsCacheExpiresAt = expiresAt;
  if (!env.DB) return;

  try {
    await ensureOddsCacheTable(env.DB);
    await env.DB
      .prepare(`
        INSERT INTO odds_cache (cache_key, payload, fetched_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload = excluded.payload,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `)
      .bind(ODDS_CACHE_KEY, JSON.stringify(payload), payload.retrievedAt, expiresAt)
      .run();
  } catch {
    // The in-memory cache still prevents duplicate requests in the active worker.
  }
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
    // A 25 percent input premium safely covers any cache-write pricing.
    inputTokens: Math.ceil(inputTokens * 1.25),
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

function safeMarketNumber(value: unknown, fallback: number | null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 10_000 ? parsed : fallback;
}

function safeProbability(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : null;
}

async function resolveTrustedMarket(env: RuntimeEnv, game: SnapshotGame): Promise<{
  game: SnapshotGame & { marketImpliedProbability?: number | null };
  evidence: MarketEvidence;
}> {
  const cached = await readOddsCache(env);
  const event = cached?.events.find((candidate) => {
    const eventDate = String(candidate.commenceTime ?? "").slice(0, 10);
    const homeTeam = String(candidate.homeTeam ?? "");
    const awayTeam = String(candidate.awayTeam ?? "");
    const opponentName = homeTeam === "Dallas Cowboys" ? awayTeam : homeTeam;
    return eventDate === game.date && opponentName === game.opponentName;
  });

  if (!cached || !event) {
    return {
      game,
      evidence: {
        source: "Bundled nflverse market snapshot",
        retrievedAt: game.sourceUpdatedAt,
        cached: true,
        market: {
          cowboysMoneyline: game.cowboysMoneyline,
          opponentMoneyline: game.opponentMoneyline,
          cowboysSpread: game.cowboysSpread,
          totalLine: game.totalLine,
          marketImpliedProbability: null,
          sportsbookCount: 0,
        },
      },
    };
  }

  const market = {
    cowboysMoneyline: safeMarketNumber(event.cowboysMoneyline, game.cowboysMoneyline),
    opponentMoneyline: safeMarketNumber(event.opponentMoneyline, game.opponentMoneyline),
    cowboysSpread: safeMarketNumber(event.cowboysSpread, game.cowboysSpread),
    totalLine: safeMarketNumber(event.total, game.totalLine),
    marketImpliedProbability: safeProbability(event.cowboysConsensusProbability),
    sportsbookCount: Math.max(0, Number(event.sportsbookCount) || 0),
  };

  return {
    game: { ...game, ...market },
    evidence: {
      source: cached.source,
      retrievedAt: cached.retrievedAt,
      cached: cached.cached,
      market,
    },
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

function validateAIExplanation(
  value: unknown,
  forecast: ForecastResult,
  sourceUpdatedAt: string,
) {
  if (!value || typeof value !== "object") throw new Error("AI explanation must be an object");
  const parsed = value as Record<string, unknown>;
  const probability = Number(parsed.probability);
  if (!Number.isFinite(probability) || Math.abs(probability - forecast.probability) > 1e-9) {
    throw new Error("AI explanation changed the forecast probability");
  }
  if (parsed.modelVersion !== forecast.modelVersion) {
    throw new Error("AI explanation changed the model version");
  }
  if (parsed.sourceUpdatedAt !== sourceUpdatedAt) {
    throw new Error("AI explanation changed the source timestamp");
  }

  const drivers = Array.isArray(parsed.drivers) ? parsed.drivers : [];
  const uncertainty = Array.isArray(parsed.uncertainty) ? parsed.uncertainty : [];
  if (!drivers.length || !uncertainty.length) {
    throw new Error("AI explanation omitted evidence or uncertainty");
  }
  const policyText = [
    parsed.summary,
    ...drivers.flatMap((driver) => driver && typeof driver === "object"
      ? [(driver as Record<string, unknown>).label, (driver as Record<string, unknown>).evidence]
      : []),
    ...uncertainty,
  ].map(String).join(" ");
  if (/\b(best bet|bet on|wager on|you should|we recommend|place a bet|stake|parlay|lock of the week)\b/i.test(policyText)) {
    throw new Error("AI explanation contained prohibited betting guidance");
  }

  return parsed;
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

async function createAIExplanation(
  env: RuntimeEnv,
  game: SnapshotGame,
  controls: ScenarioControls,
  forecast: ForecastResult,
  sourceUpdatedAt: string,
) {
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
      content: "Explain an educational football forecast. Call get_forecast before explaining. Preserve the exact probability, model version, and source timestamp returned by the tool. Never recommend a bet, stake, payout, sportsbook, or action. Name evidence and uncertainty.",
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
        output: JSON.stringify({ forecast, sourceUpdatedAt }),
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
            probability: { type: "number" },
            modelVersion: { type: "string" },
            sourceUpdatedAt: { type: "string" },
          },
          required: [
            "summary",
            "drivers",
            "uncertainty",
            "disclaimer",
            "probability",
            "modelVersion",
            "sourceUpdatedAt",
          ],
          additionalProperties: false,
        },
      },
    },
    max_output_tokens: 500,
    store: false,
  });

  const parsed = validateAIExplanation(
    JSON.parse(extractOutputText(second)),
    forecast,
    sourceUpdatedAt,
  );
  const firstUsage = responseUsage(first);
  const secondUsage = responseUsage(second);
  return {
    explanation: { ...parsed, mode: "ai" },
    inputTokens: firstUsage.inputTokens + secondUsage.inputTokens,
    outputTokens: firstUsage.outputTokens + secondUsage.outputTokens,
  };
}

async function readBoundedJson(request: Request, maxBytes: number) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
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
    body = await readBoundedJson(request, MAX_FORECAST_BODY_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "body_too_large") {
      return jsonResponse({ error: "Request body is too large" }, 413);
    }
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const snapshotGame = getGame(body.gameId);
  if (!snapshotGame) return jsonResponse({ error: "Unknown game" }, 400);
  const { game, evidence: marketEvidence } = await resolveTrustedMarket(env, snapshotGame);
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
    return jsonResponse({
      forecast,
      explanation: fallback,
      fallbackReason: "OPENAI_API_KEY is not configured",
      marketEvidence,
      budget: await readBudget(env),
    });
  }

  const reservedMicros = await reserveBudget(env);
  if (!reservedMicros) {
    return jsonResponse({
      forecast,
      explanation: fallback,
      fallbackReason: "Monthly AI budget is unavailable or exhausted",
      marketEvidence,
      budget: await readBudget(env),
    });
  }

  try {
    const ai = await createAIExplanation(env, game, controls, forecast, marketEvidence.retrievedAt);
    await reconcileBudget(env, reservedMicros, ai.inputTokens, ai.outputTokens);
    return jsonResponse({
      forecast,
      explanation: ai.explanation,
      marketEvidence,
      budget: await readBudget(env),
    });
  } catch {
    return jsonResponse({
      forecast,
      explanation: fallback,
      fallbackReason: "Runtime AI was unavailable",
      marketEvidence,
      budget: await readBudget(env),
    });
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

  const cached = await readOddsCache(env);
  if (cached) {
    return jsonResponse(cached, 200, {
      "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=3600",
    });
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

  const normalized: Array<Record<string, unknown>> = dallasEvents.map((event) => {
    const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers as Array<Record<string, unknown>> : [];
    const opponentTeam = event.home_team === "Dallas Cowboys" ? event.away_team : event.home_team;
    const cowboysMoneylines: number[] = [];
    const opponentMoneylines: number[] = [];
    const perBookCowboysProbabilities: number[] = [];
    const cowboysSpreads: number[] = [];
    const totals: number[] = [];

    for (const bookmaker of bookmakers) {
      const markets = Array.isArray(bookmaker.markets) ? bookmaker.markets as Array<Record<string, unknown>> : [];
      let bookCowboysMoneyline: number | null = null;
      let bookOpponentMoneyline: number | null = null;
      for (const market of markets) {
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes as Array<Record<string, unknown>> : [];
        if (market.key === "h2h") {
          for (const outcome of outcomes) {
            const price = Number(outcome.price);
            if (!Number.isFinite(price)) continue;
            if (outcome.name === "Dallas Cowboys") {
              cowboysMoneylines.push(price);
              bookCowboysMoneyline = price;
            } else if (outcome.name === opponentTeam) {
              opponentMoneylines.push(price);
              bookOpponentMoneyline = price;
            }
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
      const bookProbability = removeVig(bookCowboysMoneyline, bookOpponentMoneyline);
      if (bookProbability !== null) perBookCowboysProbabilities.push(bookProbability);
    }

    return {
      id: event.id,
      commenceTime: event.commence_time,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      cowboysMoneyline: median(cowboysMoneylines),
      opponentMoneyline: median(opponentMoneylines),
      cowboysConsensusProbability: median(perBookCowboysProbabilities),
      cowboysSpread: median(cowboysSpreads),
      total: median(totals),
      sportsbookCount: bookmakers.length,
    };
  });

  const retrievedAt = new Date().toISOString();
  const expiresAt = Date.now() + ODDS_CACHE_TTL_MS;
  const payload: OddsCachePayload = {
    status: "current",
    source: "The Odds API",
    retrievedAt,
    cacheExpiresAt: new Date(expiresAt).toISOString(),
    cacheTtlHours: ODDS_CACHE_TTL_HOURS,
    cached: false,
    events: normalized,
  };
  await writeOddsCache(env, payload, expiresAt);

  return jsonResponse(payload, 200, {
    "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=3600",
  });
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
