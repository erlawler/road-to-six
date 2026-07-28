import snapshot from "../app/data/nfl-snapshot.json";
import {
  AI_BUDGET_SCHEMA_SQL,
  AI_RUN_LEDGER_INDEX_SCHEMA_SQL,
  AI_RUN_LEDGER_SCHEMA_SQL,
  ODDS_CACHE_SCHEMA_SQL,
  ODDS_REFRESH_CONTROL_SCHEMA_SQL,
} from "../db/schema";
import {
  calculateForecast,
  deterministicExplanation,
  MODEL_VERSION,
  removeVig,
  type ForecastResult,
  type ScenarioControls,
} from "../lib/forecast.mjs";
import {
  estimateTokenCostMicros,
  PROMPT_CACHE_WRITE_INPUT_MULTIPLIER,
  requestReservationMicros,
} from "../lib/ai-budget.mjs";
import { assertAIOutput } from "../lib/ai-evaluation.mjs";
import {
  AI_CONTRACT_VERSION,
  AI_EVAL_VERSION,
  AI_PROMPT_VERSION,
  buildGroundedForecastExplanationRequest,
  buildInitialForecastExplanationRequest,
  isApprovedOpenAIModel,
  type AIFallbackReasonCode,
  type AIReliabilityMode,
  type AIReliabilityReceipt,
  type AIValidationStatus,
} from "../lib/ai-contract.mjs";

type RuntimeEnv = {
  DB?: D1Database;
  THE_ODDS_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI_MONTHLY_BUDGET_USD?: string;
};

type SnapshotGame = (typeof snapshot.schedule)[number];

type BudgetReservation =
  | { ok: true; reservedMicros: number }
  | {
    ok: false;
    reasonCode: Extract<
      AIFallbackReasonCode,
      "budget_ledger_unavailable" | "budget_exhausted"
    >;
  };

type RateLimitResult =
  | { allowed: true }
  | {
    allowed: false;
    reasonCode: Extract<
      AIFallbackReasonCode,
      "rate_limit_unavailable" | "rate_limited"
    >;
    retryAfterSeconds: number;
  };

type RuntimeUsage = {
  inputTokens: number;
  outputTokens: number;
  usageUncertain: boolean;
};

type OddsCacheRow = {
  payload: string;
  fetched_at: string;
  expires_at: number;
};

type OddsCachePayload = {
  status: "current";
  source: "The Odds API";
  fetchedAt: string;
  retrievedAt: string;
  cacheExpiresAt: string;
  cacheTtlHours: number;
  cached: boolean;
  events: Array<Record<string, unknown>>;
};

type OddsRefreshControlRow = {
  lease_expires_at: number;
  cooldown_until: number;
};

type OddsRefreshLease =
  | { acquired: true; token: string }
  | {
    acquired: false;
    retryAfterSeconds: number;
    controlUnavailable: boolean;
  };

type MarketEvidence = {
  source: string;
  fetchedAt: string;
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
const ODDS_REFRESH_COOLDOWN_SECONDS = 60;
const ODDS_REFRESH_COOLDOWN_MS = ODDS_REFRESH_COOLDOWN_SECONDS * 1_000;
const ODDS_REFRESH_LEASE_SECONDS = 15;
const ODDS_REFRESH_LEASE_MS = ODDS_REFRESH_LEASE_SECONDS * 1_000;
const AI_RATE_LIMIT_SCOPE = "forecast_ai_global";
const AI_RATE_LIMIT_MAX_REQUESTS = 20;
const AI_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const AI_RATE_LIMIT_WINDOW_MS = AI_RATE_LIMIT_WINDOW_SECONDS * 1_000;
const AI_RUN_LEDGER_RETENTION_DAYS = 30;
const AI_RUN_LEDGER_RETENTION_MS = AI_RUN_LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const CANONICAL_AI_DISCLAIMER =
  "Educational analytics only. This product does not recommend a bet or stake.";

const FALLBACK_REASON_MESSAGES: Record<AIFallbackReasonCode, string> = {
  ai_not_configured: "OPENAI_API_KEY is not configured",
  unsupported_model: "The configured Runtime AI model is not approved",
  rate_limit_unavailable: "The anonymous AI rate limit is unavailable",
  rate_limited: "The anonymous AI request limit was reached",
  budget_ledger_unavailable: "The monthly AI budget ledger is unavailable",
  budget_exhausted: "The monthly AI budget is exhausted",
  provider_timeout: "Runtime AI timed out",
  provider_http_error: "Runtime AI returned a provider error",
  provider_unavailable: "Runtime AI is unavailable",
  tool_contract_violation: "Runtime AI did not call the required forecast tool",
  output_parse_failed: "Runtime AI returned an unreadable structured response",
  output_validation_failed: "Runtime AI failed the grounded output evaluation",
  runtime_error: "Runtime AI was unavailable",
  request_body_too_large: "Request body is too large",
  unsupported_content_type: "Content-Type must be application/json",
  invalid_json: "Invalid JSON body",
  unknown_game: "Unknown game",
};

let memoryOddsCache: OddsCachePayload | null = null;
let memoryOddsCacheExpiresAt = 0;
let oddsRefreshAllowedAt = 0;
let oddsRefreshPromise: Promise<OddsCachePayload> | null = null;

class RuntimeAIError extends Error {
  reasonCode: AIFallbackReasonCode;
  validationStatus: AIValidationStatus;
  usageUncertain: boolean;

  constructor(
    reasonCode: AIFallbackReasonCode,
    options: {
      validationStatus?: AIValidationStatus;
      usageUncertain?: boolean;
    } = {},
  ) {
    super(reasonCode);
    this.name = "RuntimeAIError";
    this.reasonCode = reasonCode;
    this.validationStatus = options.validationStatus ?? "not_run";
    this.usageUncertain = options.usageUncertain ?? false;
  }
}

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

async function ensureRunLedgerTable(db: D1Database) {
  await db.prepare(AI_RUN_LEDGER_SCHEMA_SQL).run();
  await db.prepare(AI_RUN_LEDGER_INDEX_SCHEMA_SQL).run();
}

async function ensureOddsRefreshControlTable(db: D1Database) {
  await db.prepare(ODDS_REFRESH_CONTROL_SCHEMA_SQL).run();
}

function reliabilityReceipt(input: {
  mode: AIReliabilityMode;
  requestId: string;
  model: string;
  forecastVersion?: string;
  validationStatus: AIValidationStatus;
  startedAt: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicros?: number;
  fallbackReasonCode: AIFallbackReasonCode | null;
  sourceUpdatedAt?: string;
}): AIReliabilityReceipt {
  return {
    mode: input.mode,
    requestId: input.requestId,
    model: input.model,
    promptVersion: AI_PROMPT_VERSION,
    contractVersion: AI_CONTRACT_VERSION,
    evalVersion: AI_EVAL_VERSION,
    forecastVersion: input.forecastVersion ?? MODEL_VERSION,
    validationStatus: input.validationStatus,
    latencyMs: Math.max(0, Date.now() - input.startedAt),
    inputTokens: Math.max(0, input.inputTokens ?? 0),
    outputTokens: Math.max(0, input.outputTokens ?? 0),
    estimatedCostUsd: Math.max(0, input.estimatedCostMicros ?? 0) / 1_000_000,
    fallbackReasonCode: input.fallbackReasonCode,
    sourceUpdatedAt: input.sourceUpdatedAt ?? snapshot.asOf,
  };
}

async function writeRunLedger(env: RuntimeEnv, receipt: AIReliabilityReceipt) {
  if (!env.DB) return false;

  try {
    await ensureRunLedgerTable(env.DB);
    const retentionCutoff = new Date(Date.now() - AI_RUN_LEDGER_RETENTION_MS).toISOString();
    try {
      await env.DB
        .prepare("DELETE FROM ai_run_ledger WHERE created_at < ?")
        .bind(retentionCutoff)
        .run();
    } catch {
      // Retention cleanup is best effort and never stores personal identifiers.
    }
    try {
      await env.DB
        .prepare("DELETE FROM ai_rate_limit_window WHERE expires_at <= ?")
        .bind(Date.now())
        .run();
    } catch {
      // Cleanup runs only after a budgeted AI outcome, never on denied traffic.
    }
    await env.DB
      .prepare(`
        INSERT INTO ai_run_ledger (
          request_id,
          created_at,
          mode,
          model,
          prompt_version,
          contract_version,
          eval_version,
          forecast_version,
          validation_status,
          latency_ms,
          input_tokens,
          output_tokens,
          estimated_cost_micros,
          fallback_reason_code,
          source_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        receipt.requestId,
        new Date().toISOString(),
        receipt.mode,
        receipt.model,
        receipt.promptVersion,
        receipt.contractVersion,
        receipt.evalVersion,
        receipt.forecastVersion,
        receipt.validationStatus,
        receipt.latencyMs,
        receipt.inputTokens,
        receipt.outputTokens,
        Math.round(receipt.estimatedCostUsd * 1_000_000),
        receipt.fallbackReasonCode,
        receipt.sourceUpdatedAt,
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

async function consumeAnonymousAIRateLimit(env: RuntimeEnv): Promise<RateLimitResult> {
  if (!env.DB) {
    return {
      allowed: false,
      reasonCode: "rate_limit_unavailable",
      retryAfterSeconds: AI_RATE_LIMIT_WINDOW_SECONDS,
    };
  }

  const now = Date.now();
  const windowStart = Math.floor(now / AI_RATE_LIMIT_WINDOW_MS) * AI_RATE_LIMIT_WINDOW_MS;
  const expiresAt = windowStart + AI_RATE_LIMIT_WINDOW_MS;
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1_000));

  try {
    const result = await env.DB
      .prepare(`
        INSERT INTO ai_rate_limit_window (
          scope, window_start, request_count, expires_at
        ) VALUES (?, ?, 1, ?)
        ON CONFLICT(scope, window_start) DO UPDATE SET
          request_count = request_count + 1
        WHERE request_count < ?
        RETURNING request_count
      `)
      .bind(
        AI_RATE_LIMIT_SCOPE,
        windowStart,
        expiresAt,
        AI_RATE_LIMIT_MAX_REQUESTS,
      )
      .first<{ request_count: number }>();
    if (result) return { allowed: true };
    return {
      allowed: false,
      reasonCode: "rate_limited",
      retryAfterSeconds,
    };
  } catch {
    return {
      allowed: false,
      reasonCode: "rate_limit_unavailable",
      retryAfterSeconds,
    };
  }
}

function normalizeCachedOddsPayload(value: unknown, fallbackFetchedAt: string) {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<OddsCachePayload>;
  if (
    parsed.status !== "current"
    || parsed.source !== "The Odds API"
    || !Array.isArray(parsed.events)
  ) {
    return null;
  }
  const fetchedAt = typeof parsed.fetchedAt === "string"
    ? parsed.fetchedAt
    : typeof parsed.retrievedAt === "string"
      ? parsed.retrievedAt
      : fallbackFetchedAt;
  const retrievedAt = typeof parsed.retrievedAt === "string"
    ? parsed.retrievedAt
    : fetchedAt;
  if (!Number.isFinite(Date.parse(fetchedAt)) || !Number.isFinite(Date.parse(retrievedAt))) {
    return null;
  }
  return {
    ...parsed,
    status: "current" as const,
    source: "The Odds API" as const,
    fetchedAt,
    retrievedAt,
    cacheExpiresAt: String(parsed.cacheExpiresAt ?? ""),
    cacheTtlHours: Number(parsed.cacheTtlHours) || ODDS_CACHE_TTL_HOURS,
    cached: Boolean(parsed.cached),
    events: parsed.events,
  };
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
    const payload = normalizeCachedOddsPayload(JSON.parse(row.payload), row.fetched_at);
    if (!payload) return null;
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
      .bind(ODDS_CACHE_KEY, JSON.stringify(payload), payload.fetchedAt, expiresAt)
      .run();
  } catch {
    // The in-memory cache still prevents duplicate requests in the active worker.
  }
}

async function acquireOddsRefreshLease(env: RuntimeEnv): Promise<OddsRefreshLease> {
  if (!env.DB) {
    return {
      acquired: false,
      retryAfterSeconds: ODDS_REFRESH_COOLDOWN_SECONDS,
      controlUnavailable: true,
    };
  }

  const now = Date.now();
  const token = crypto.randomUUID();
  const leaseExpiresAt = now + ODDS_REFRESH_LEASE_MS;
  const cooldownUntil = now + ODDS_REFRESH_COOLDOWN_MS;
  try {
    await ensureOddsRefreshControlTable(env.DB);
    const acquired = await env.DB
      .prepare(`
        INSERT INTO odds_refresh_control (
          cache_key,
          lease_token,
          lease_expires_at,
          cooldown_until,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          lease_token = excluded.lease_token,
          lease_expires_at = excluded.lease_expires_at,
          cooldown_until = excluded.cooldown_until,
          updated_at = excluded.updated_at
        WHERE odds_refresh_control.lease_expires_at <= ?
          AND odds_refresh_control.cooldown_until <= ?
        RETURNING lease_token
      `)
      .bind(
        ODDS_CACHE_KEY,
        token,
        leaseExpiresAt,
        cooldownUntil,
        new Date().toISOString(),
        now,
        now,
      )
      .first<{ lease_token: string }>();
    if (acquired?.lease_token === token) {
      return { acquired: true, token };
    }

    const control = await env.DB
      .prepare(`
        SELECT lease_expires_at, cooldown_until
        FROM odds_refresh_control
        WHERE cache_key = ?
      `)
      .bind(ODDS_CACHE_KEY)
      .first<OddsRefreshControlRow>();
    const blockedUntil = Math.max(
      control?.lease_expires_at ?? now,
      control?.cooldown_until ?? now + ODDS_REFRESH_COOLDOWN_MS,
    );
    return {
      acquired: false,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1_000)),
      controlUnavailable: false,
    };
  } catch {
    return {
      acquired: false,
      retryAfterSeconds: ODDS_REFRESH_COOLDOWN_SECONDS,
      controlUnavailable: true,
    };
  }
}

async function releaseOddsRefreshLease(env: RuntimeEnv, token: string) {
  if (!env.DB) return;
  try {
    await env.DB
      .prepare(`
        UPDATE odds_refresh_control
        SET lease_token = NULL,
            lease_expires_at = 0,
            updated_at = ?
        WHERE cache_key = ? AND lease_token = ?
      `)
      .bind(new Date().toISOString(), ODDS_CACHE_KEY, token)
      .run();
  } catch {
    // The short lease expires automatically if release is unavailable.
  }
}

async function reserveBudget(env: RuntimeEnv): Promise<BudgetReservation> {
  if (!env.DB) {
    return { ok: false, reasonCode: "budget_ledger_unavailable" };
  }
  const limitMicros = budgetLimitMicros(env);
  const reservationMicros = requestReservationMicros(env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);
  if (reservationMicros > limitMicros) {
    return { ok: false, reasonCode: "budget_exhausted" };
  }

  try {
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
    return result
      ? { ok: true, reservedMicros: reservationMicros }
      : { ok: false, reasonCode: "budget_exhausted" };
  } catch {
    return { ok: false, reasonCode: "budget_ledger_unavailable" };
  }
}

async function reconcileBudget(
  env: RuntimeEnv,
  reservedMicros: number,
  usage: RuntimeUsage,
) {
  const knownUsageMicros = estimateTokenCostMicros({
    model: env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    // This is conservative for reads and covers the maximum cache-write rate.
    inputRateMultiplier: PROMPT_CACHE_WRITE_INPUT_MULTIPLIER,
  });
  const reconciledMicros = usage.usageUncertain
    ? Math.max(reservedMicros, knownUsageMicros)
    : knownUsageMicros;
  if (!env.DB) {
    return {
      estimatedCostMicros: reservedMicros,
      reconciled: false,
    };
  }

  try {
    const adjustment = reconciledMicros - reservedMicros;
    await env.DB
      .prepare(`
        UPDATE ai_monthly_budget
        SET estimated_spend_micros = MAX(0, estimated_spend_micros + ?),
            input_tokens = input_tokens + ?,
            output_tokens = output_tokens + ?,
            updated_at = ?
        WHERE month = ?
      `)
      .bind(
        adjustment,
        usage.inputTokens,
        usage.outputTokens,
        new Date().toISOString(),
        monthKey(),
      )
      .run();
    return {
      estimatedCostMicros: reconciledMicros,
      reconciled: true,
    };
  } catch {
    // The original reservation remains charged if reconciliation is unavailable.
    return {
      estimatedCostMicros: reservedMicros,
      reconciled: false,
    };
  }
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

function bundledMarketContext(game: SnapshotGame): {
  game: SnapshotGame & { marketImpliedProbability?: number | null };
  evidence: MarketEvidence;
} {
  return {
    game,
    evidence: {
      source: "Bundled nflverse market snapshot",
      fetchedAt: game.sourceUpdatedAt,
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
    return bundledMarketContext(game);
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
      fetchedAt: cached.fetchedAt,
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
    && !Array.isArray(response.usage)
    ? response.usage as Record<string, unknown>
    : null;
  const validTokenCount = (value: unknown) => (
    typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
  );
  const inputValid = validTokenCount(usage?.input_tokens);
  const outputValid = validTokenCount(usage?.output_tokens);
  return {
    inputTokens: inputValid ? Number(usage?.input_tokens) : 0,
    outputTokens: outputValid ? Number(usage?.output_tokens) : 0,
    valid: inputValid && outputValid,
  };
}

async function openAIRequest(env: RuntimeEnv, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new RuntimeAIError("provider_timeout", { usageUncertain: true });
    }
    throw new RuntimeAIError("provider_unavailable", { usageUncertain: true });
  }
  if (!response.ok) {
    throw new RuntimeAIError("provider_http_error", { usageUncertain: true });
  }
  try {
    const payload = await response.json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new RuntimeAIError("provider_unavailable", { usageUncertain: true });
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new RuntimeAIError("provider_unavailable", { usageUncertain: true });
  }
}

async function createAIExplanation(
  env: RuntimeEnv,
  game: SnapshotGame,
  controls: ScenarioControls,
  forecast: ForecastResult,
  sourceUpdatedAt: string,
  usage: RuntimeUsage,
) {
  const model = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const first = await openAIRequest(env, buildInitialForecastExplanationRequest({
    model,
    game,
    controls,
  }));
  const firstUsage = responseUsage(first);
  usage.inputTokens += firstUsage.inputTokens;
  usage.outputTokens += firstUsage.outputTokens;
  usage.usageUncertain = usage.usageUncertain || !firstUsage.valid;
  const firstOutput = Array.isArray(first.output) ? first.output : [];
  const functionCalls = firstOutput.filter(
    (item) => item && typeof item === "object" && (item as { type?: string }).type === "function_call",
  ) as Array<{
    call_id?: unknown;
    name?: unknown;
    arguments?: unknown;
  }>;
  const functionCall = functionCalls[0];
  let toolArguments: unknown = null;
  if (typeof functionCall?.arguments === "string") {
    try {
      toolArguments = JSON.parse(functionCall.arguments) as unknown;
    } catch {
      toolArguments = null;
    }
  }
  const validToolArguments = Boolean(toolArguments)
    && typeof toolArguments === "object"
    && !Array.isArray(toolArguments)
    && Object.keys(toolArguments as Record<string, unknown>).length === 0;
  if (
    functionCalls.length !== 1
    || functionCall?.name !== "get_forecast"
    || typeof functionCall.call_id !== "string"
    || functionCall.call_id.trim().length === 0
    || !validToolArguments
  ) {
    throw new RuntimeAIError("tool_contract_violation", {
      validationStatus: "failed",
    });
  }

  const second = await openAIRequest(env, buildGroundedForecastExplanationRequest({
    model,
    game,
    controls,
    firstOutput: firstOutput as Array<Record<string, unknown>>,
    callId: functionCall.call_id,
    forecast,
    sourceUpdatedAt,
  }));
  const secondUsage = responseUsage(second);
  usage.inputTokens += secondUsage.inputTokens;
  usage.outputTokens += secondUsage.outputTokens;
  usage.usageUncertain = usage.usageUncertain || !secondUsage.valid;

  let explanation: Record<string, unknown>;
  try {
    explanation = JSON.parse(extractOutputText(second)) as Record<string, unknown>;
  } catch {
    throw new RuntimeAIError("output_parse_failed", {
      validationStatus: "failed",
    });
  }
  const governedExplanation = {
    summary: `The governed forecast assigns Dallas a ${Math.round(forecast.probability * 100)}% win probability against ${game.opponentName}.`,
    drivers: explanation.drivers,
    uncertainty: explanation.uncertainty,
    disclaimer: CANONICAL_AI_DISCLAIMER,
    probability: explanation.probability,
    modelVersion: explanation.modelVersion,
    sourceUpdatedAt: explanation.sourceUpdatedAt,
  };

  let parsed: Record<string, unknown>;
  try {
    parsed = assertAIOutput({
      output: { explanation: governedExplanation },
      contract: {
        probability: forecast.probability,
        modelVersion: forecast.modelVersion,
        sourceUpdatedAt,
        expectedDrivers: forecast.drivers,
        expectedUncertainty: forecast.uncertainty,
      },
    });
  } catch {
    throw new RuntimeAIError("output_validation_failed", {
      validationStatus: "failed",
    });
  }

  return {
    ...parsed,
    mode: "ai",
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
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

async function terminalForecastResponse(
  env: RuntimeEnv,
  body: Record<string, unknown>,
  receipt: AIReliabilityReceipt,
  status = 200,
  additionalHeaders?: HeadersInit,
  persistRunLedger = true,
) {
  if (persistRunLedger) await writeRunLedger(env, receipt);
  return jsonResponse(
    { ...body, reliability: receipt },
    status,
    additionalHeaders,
  );
}

function runtimeFailure(error: unknown) {
  if (error instanceof RuntimeAIError) return error;
  return new RuntimeAIError("runtime_error");
}

async function forecastResponse(request: Request, env: RuntimeEnv) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const model = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const rejected = async (
    reasonCode: Extract<
      AIFallbackReasonCode,
      | "request_body_too_large"
      | "unsupported_content_type"
      | "invalid_json"
      | "unknown_game"
    >,
    status: number,
  ) => terminalForecastResponse(
    env,
    { error: FALLBACK_REASON_MESSAGES[reasonCode] },
    reliabilityReceipt({
      mode: "rejected",
      requestId,
      model,
      validationStatus: "not_run",
      startedAt,
      fallbackReasonCode: reasonCode,
    }),
    status,
    undefined,
    false,
  );

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_FORECAST_BODY_BYTES) {
    return rejected("request_body_too_large", 413);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return rejected("unsupported_content_type", 415);
  }
  let body: Record<string, unknown>;
  try {
    const parsedBody = await readBoundedJson(request, MAX_FORECAST_BODY_BYTES);
    if (
      !parsedBody
      || typeof parsedBody !== "object"
      || Array.isArray(parsedBody)
    ) {
      return rejected("invalid_json", 400);
    }
    body = parsedBody as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === "body_too_large") {
      return rejected("request_body_too_large", 413);
    }
    return rejected("invalid_json", 400);
  }

  const snapshotGame = getGame(body.gameId);
  if (!snapshotGame) return rejected("unknown_game", 400);
  const controls = normalizeControls(body.controls);
  const buildScenario = (
    context: Awaited<ReturnType<typeof resolveTrustedMarket>>,
  ) => {
    const forecast = makeForecast(context.game, controls);
    const fallback = deterministicExplanation({
      forecast,
      game: {
        ...context.game,
        venue: context.game.venue as "home" | "away" | "neutral",
        opponentStarName:
          snapshot.opponents[context.game.opponent as keyof typeof snapshot.opponents]
            ?.leaders[0]?.name,
      },
    });
    return {
      game: context.game,
      marketEvidence: context.evidence,
      forecast,
      fallback,
    };
  };
  const bundledScenario = buildScenario(bundledMarketContext(snapshotGame));
  const fallbackResponse = async (
    scenario: ReturnType<typeof buildScenario>,
    reasonCode: AIFallbackReasonCode,
    options: {
      validationStatus?: AIValidationStatus;
      usage?: RuntimeUsage;
      estimatedCostMicros?: number;
      retryAfterSeconds?: number;
      status?: number;
      persistRunLedger?: boolean;
    } = {},
  ) => {
    const receipt = reliabilityReceipt({
      mode: "deterministic",
      requestId,
      model,
      forecastVersion: scenario.forecast.modelVersion,
      validationStatus: options.validationStatus ?? "not_run",
      startedAt,
      inputTokens: options.usage?.inputTokens,
      outputTokens: options.usage?.outputTokens,
      estimatedCostMicros: options.estimatedCostMicros,
      fallbackReasonCode: reasonCode,
      sourceUpdatedAt: scenario.marketEvidence.retrievedAt,
    });
    const headers = options.retryAfterSeconds
      ? { "Retry-After": String(options.retryAfterSeconds) }
      : undefined;
    return terminalForecastResponse(env, {
      forecast: scenario.forecast,
      explanation: scenario.fallback,
      fallbackReason: FALLBACK_REASON_MESSAGES[reasonCode],
      marketEvidence: scenario.marketEvidence,
    }, receipt, options.status ?? 200, headers, options.persistRunLedger ?? false);
  };

  const rateLimit = await consumeAnonymousAIRateLimit(env);
  if (!rateLimit.allowed) {
    return fallbackResponse(bundledScenario, rateLimit.reasonCode, {
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      status: rateLimit.reasonCode === "rate_limited" ? 429 : 503,
    });
  }

  if (!isApprovedOpenAIModel(model)) {
    return fallbackResponse(bundledScenario, "unsupported_model");
  }

  if (!env.OPENAI_API_KEY) {
    return fallbackResponse(bundledScenario, "ai_not_configured");
  }

  const scenario = buildScenario(await resolveTrustedMarket(env, snapshotGame));
  const { game, marketEvidence, forecast } = scenario;
  const reservation = await reserveBudget(env);
  if (!reservation.ok) {
    return fallbackResponse(scenario, reservation.reasonCode);
  }

  const usage: RuntimeUsage = {
    inputTokens: 0,
    outputTokens: 0,
    usageUncertain: false,
  };
  let explanation: Record<string, unknown> | null = null;
  let failure: RuntimeAIError | null = null;
  try {
    explanation = await createAIExplanation(
      env,
      game,
      controls,
      forecast,
      marketEvidence.retrievedAt,
      usage,
    );
  } catch (error) {
    failure = runtimeFailure(error);
    usage.usageUncertain = usage.usageUncertain || failure.usageUncertain;
  }

  const reconciliation = await reconcileBudget(
    env,
    reservation.reservedMicros,
    usage,
  );
  if (failure || !explanation) {
    return fallbackResponse(scenario, failure?.reasonCode ?? "runtime_error", {
      validationStatus: failure?.validationStatus ?? "not_run",
      usage,
      estimatedCostMicros: reconciliation.estimatedCostMicros,
      persistRunLedger: true,
    });
  }

  const receipt = reliabilityReceipt({
    mode: "ai",
    requestId,
    model,
    forecastVersion: forecast.modelVersion,
    validationStatus: "passed",
    startedAt,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostMicros: reconciliation.estimatedCostMicros,
    fallbackReasonCode: null,
    sourceUpdatedAt: marketEvidence.retrievedAt,
  });
  return terminalForecastResponse(env, {
      forecast,
      explanation,
      marketEvidence,
    }, receipt);
}

async function publicBudgetStatus(env: RuntimeEnv) {
  const model = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  return {
    status: isApprovedOpenAIModel(model) && Boolean(env.OPENAI_API_KEY)
      ? "managed"
      : "unavailable",
  };
}

function publicBudgetHeaders() {
  return {
    "Cache-Control": "public, max-age=300, s-maxage=3600",
  };
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function fetchOddsPayload(env: RuntimeEnv) {
  const url = new URL("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/");
  url.searchParams.set("apiKey", env.THE_ODDS_API_KEY);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Odds provider returned status ${response.status}`);
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
      sportsbookCount: perBookCowboysProbabilities.length,
    };
  });

  const fetchedAt = new Date().toISOString();
  const expiresAt = Date.now() + ODDS_CACHE_TTL_MS;
  const payload: OddsCachePayload = {
    status: "current",
    source: "The Odds API",
    fetchedAt,
    retrievedAt: fetchedAt,
    cacheExpiresAt: new Date(expiresAt).toISOString(),
    cacheTtlHours: ODDS_CACHE_TTL_HOURS,
    cached: false,
    events: normalized,
  };
  await writeOddsCache(env, payload, expiresAt);
  return payload;
}

function oddsCacheHeaders() {
  return {
    "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=3600",
  };
}

async function oddsResponse(env: RuntimeEnv) {
  const cached = await readOddsCache(env);
  if (cached) return jsonResponse(cached, 200, oddsCacheHeaders());

  if (!env.THE_ODDS_API_KEY) {
    return jsonResponse({
      status: "configuration_required",
      message: "Using the bundled nflverse market snapshot until a free odds key is configured.",
    }, 503);
  }

  if (!env.DB) {
    return jsonResponse({
      status: "refresh_control_unavailable",
      message: "Using the bundled nflverse market snapshot because shared refresh control is unavailable.",
      retryAfterSeconds: ODDS_REFRESH_COOLDOWN_SECONDS,
    }, 503, {
      "Retry-After": String(ODDS_REFRESH_COOLDOWN_SECONDS),
    });
  }

  const now = Date.now();
  const joinedRefresh = Boolean(oddsRefreshPromise);
  if (!oddsRefreshPromise && now < oddsRefreshAllowedAt) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oddsRefreshAllowedAt - now) / 1_000),
    );
    return jsonResponse({
      status: "refresh_throttled",
      message: "A market refresh was attempted recently. Try again after the cooldown.",
      retryAfterSeconds,
    }, 429, {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  if (!oddsRefreshPromise) {
    let leaseToken: string | null = null;
    const lease = await acquireOddsRefreshLease(env);
    if (!lease.acquired) {
      const refreshedCache = await readOddsCache(env);
      if (refreshedCache) {
        return jsonResponse(refreshedCache, 200, oddsCacheHeaders());
      }
      const status = lease.controlUnavailable
        ? "refresh_control_unavailable"
        : "refresh_throttled";
      return jsonResponse({
        status,
        message: lease.controlUnavailable
          ? "Using the bundled nflverse market snapshot because shared refresh control is unavailable."
          : "A market refresh is active or cooling down.",
        retryAfterSeconds: lease.retryAfterSeconds,
      }, lease.controlUnavailable ? 503 : 429, {
        "Retry-After": String(lease.retryAfterSeconds),
      });
    }
    leaseToken = lease.token;
    oddsRefreshAllowedAt = now + ODDS_REFRESH_COOLDOWN_MS;
    oddsRefreshPromise = fetchOddsPayload(env).finally(async () => {
      if (leaseToken) await releaseOddsRefreshLease(env, leaseToken);
      oddsRefreshPromise = null;
    });
  }

  try {
    const payload = await oddsRefreshPromise;
    return jsonResponse(
      joinedRefresh ? { ...payload, cached: true } : payload,
      200,
      oddsCacheHeaders(),
    );
  } catch {
    return jsonResponse({
      status: "upstream_unavailable",
      retryAfterSeconds: ODDS_REFRESH_COOLDOWN_SECONDS,
    }, 502, {
      "Retry-After": String(ODDS_REFRESH_COOLDOWN_SECONDS),
    });
  }
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
    return jsonResponse(
      await publicBudgetStatus(env),
      200,
      publicBudgetHeaders(),
    );
  }
  return jsonResponse({ error: "Not found" }, 404);
}
