import { validateJsonSchema } from "./json-schema-lite.mjs";
import { FORECAST_CONTROL_KEYS } from "./football-forecast-tool.mjs";
import { FORECAST_CARD_URI } from "./mcp-app-view.mjs";

// Tool catalog for the Road to Six MCP endpoints.
//
// Public tools are bounded, read-only and deterministic. Each one declares an
// input schema that is enforced as written, an output schema that its results
// are tested against, and returns one shared evidence block so an agent can
// tell how fresh and how trustworthy a value is before repeating it.

export const MCP_SERVER_INFO = Object.freeze({
  name: "road-to-six-football",
  title: "Road to Six",
  version: "3.0.0",
  description: "Deterministic, sourced evidence about the current Dallas Cowboys matchup from an unofficial fan analytics project.",
  websiteUrl: "https://road-to-six-erl.erlrickylre.chatgpt.site/",
});

export const EVIDENCE_SCHEMA_VERSION = "road-to-six-evidence-v1";

export const EDUCATIONAL_NOTICE = "Educational analytics from an unofficial fan project that is not affiliated with the Dallas Cowboys or the NFL. Not betting, wagering, or fantasy start or sit advice. Historical production is not a projection.";

export const PUBLIC_INSTRUCTIONS = "Road to Six returns deterministic, sourced evidence about the current Dallas Cowboys matchup. Every tool result includes an evidence block: check evidence.status and evidence.stale, and cite evidence.observedAt or the source times when you state a value. When a result is unavailable, say so and do not substitute other data. Player figures are historical production, not projections. The forecast tool is a football-only teaching model that excludes betting-market prices. This is an unofficial fan project for educational analysis: never present an output as a pick, betting advice, or fantasy start or sit advice.";

export const OWNER_INSTRUCTIONS = `${PUBLIC_INSTRUCTIONS} Only the Site owner may read updater status or publish football data. Do not call AI or odds endpoints.`;

const NO_ARGUMENTS = Object.freeze({ type: "object", properties: {}, additionalProperties: false });
const NULLABLE_STRING = Object.freeze({ type: ["string", "null"] });
const NULLABLE_OBJECT = Object.freeze({ type: ["object", "null"] });
const STRING_LIST = Object.freeze({ type: "array", items: { type: "string" } });

export const EVIDENCE_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  description: "Provenance and freshness for this result. Check status and stale before repeating any value as current.",
  properties: {
    schemaVersion: { const: EVIDENCE_SCHEMA_VERSION },
    tool: { type: "string" },
    status: { enum: ["ok", "degraded", "unavailable"] },
    reason: NULLABLE_STRING,
    stale: { type: "boolean", description: "True when the football snapshot is past its review window or the latest refresh did not succeed." },
    observedAt: { type: "string", description: "When this server read the saved state, in ISO 8601 UTC." },
    football: {
      type: "object",
      properties: {
        dataVersion: { type: "string" }, asOf: NULLABLE_STRING, verifiedAt: NULLABLE_STRING,
        freshness: { type: "string" }, ageDays: { type: ["integer", "null"] }, lastRefreshOutcome: { type: "string" },
      },
      required: ["dataVersion", "asOf", "verifiedAt", "freshness", "ageDays", "lastRefreshOutcome"],
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, url: { type: "string" }, license: { type: "string" } },
        required: ["name", "url", "license"],
      },
    },
    notice: { type: "string" },
  },
  required: ["schemaVersion", "tool", "status", "reason", "stale", "observedAt", "football", "sources", "notice"],
});

const withEvidence = (status, properties, required = []) => Object.freeze({
  type: "object",
  properties: { status: { enum: status }, ...properties, evidence: EVIDENCE_OUTPUT_SCHEMA },
  required: ["status", ...required, "evidence"],
});

const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

const availability = (subject) => ({
  type: "number", minimum: 0, maximum: 100,
  description: `${subject} availability percentage. 100 is the unchanged baseline.`,
});

export const PUBLIC_TOOLS = Object.freeze([
  {
    name: "get_current_matchup",
    title: "Current Cowboys matchup",
    description: "Start here for any question about this week's Dallas Cowboys game. Returns the verified current league-week matchup: opponent, kickoff time, venue, stadium, season record, and when it was verified. Reports a bye week or an unavailable state instead of substituting a later game.",
    inputSchema: NO_ARGUMENTS,
    outputSchema: withEvidence(["verified", "bye", "unavailable"], {
      reason: NULLABLE_STRING, season: { type: "integer" }, week: { type: ["integer", "null"] }, game: NULLABLE_OBJECT,
      record: {
        type: "object",
        properties: { wins: { type: "integer" }, losses: { type: "integer" }, ties: { type: "integer" } },
        required: ["wins", "losses", "ties"],
      },
      verifiedAt: NULLABLE_STRING,
    }, ["reason", "season", "week", "game", "record", "verifiedAt"]),
    annotations: READ_ONLY,
  },
  {
    name: "get_player_usage",
    title: "Recent player usage for one team",
    description: "Historical player production and usage for one side of the current matchup across that team's last three completed games: PPR points, targets, carries, and per-player rows. Choose team DAL for Dallas or opponent for the verified current opponent. These are past results, not projections.",
    inputSchema: Object.freeze({
      type: "object",
      properties: { team: { type: "string", enum: ["DAL", "opponent"], description: "DAL for Dallas, or opponent for the verified current opponent." } },
      required: ["team"],
      additionalProperties: false,
    }),
    outputSchema: withEvidence(["available", "unavailable"], {
      reasons: STRING_LIST, reason: NULLABLE_STRING, team: NULLABLE_OBJECT, source: NULLABLE_OBJECT, matchup: NULLABLE_OBJECT,
    }),
    annotations: READ_ONLY,
  },
  {
    name: "compare_players",
    title: "Recent production leaders, both teams",
    description: "Side-by-side recent PPR production leaders for Dallas and the verified current opponent, including ties, data coverage, and source timestamps. Use it for who has been producing lately on both teams. Deterministic history only: no projections and no start or sit advice.",
    inputSchema: NO_ARGUMENTS,
    outputSchema: withEvidence(["available", "unavailable"], {
      reasons: STRING_LIST, reason: NULLABLE_STRING, matchup: NULLABLE_OBJECT, source: NULLABLE_OBJECT,
      teams: { type: "array", items: { type: "object" } }, leaders: { type: "array", items: { type: "object" } },
      notice: { type: "string" }, limitations: STRING_LIST,
    }),
    annotations: READ_ONLY,
  },
  {
    name: "get_source_health",
    title: "Data freshness and source health",
    description: "Data freshness and reliability for everything this server returns: the latest refresh outcome, snapshot age, per-source validation with timestamps and checksums, and coverage gaps. Use it when asked how current or trustworthy the data is. It does not report uptime, model accuracy, or cost.",
    inputSchema: NO_ARGUMENTS,
    outputSchema: withEvidence(["current", "degraded", "unavailable"], {
      observedAt: { type: "string" }, dataVersion: { type: "string" }, latestOutcome: { type: "string" },
      lastAttemptAt: NULLABLE_STRING, lastSuccessAt: NULLABLE_STRING, snapshotAgeDays: { type: ["integer", "null"] },
      sourceValidation: { type: "string" }, coverage: { type: "object" },
      trace: { type: "array", items: { type: "object" } }, limitations: STRING_LIST,
    }, ["observedAt", "dataVersion", "latestOutcome", "sourceValidation", "coverage", "trace", "limitations"]),
    annotations: READ_ONLY,
  },
  {
    name: "get_game_day_context",
    title: "Game-day weather context",
    description: "Cached National Weather Service forecast and active alerts for the verified game venue, with forecast horizon and roof limitations. Supported for the reviewed AT&T Stadium area only; other venues return unavailable. Weather is context only and changes no estimate.",
    inputSchema: NO_ARGUMENTS,
    outputSchema: withEvidence(["current", "partial", "unavailable"], {
      reason: NULLABLE_STRING, checkedAt: { type: "string" }, matchup: NULLABLE_OBJECT, venue: NULLABLE_OBJECT,
      forecast: { type: "object" }, alerts: { type: "object" }, source: { type: "object" }, limitations: STRING_LIST,
    }, ["reason", "matchup"]),
    annotations: Object.freeze({ ...READ_ONLY, openWorldHint: true }),
  },
  {
    name: "get_football_forecast",
    title: "Football-only win probability",
    description: "Football-only win probability for the Dallas Cowboys in the verified current matchup, from a transparent Elo baseline, with a driver breakdown, an illustrative uncertainty band, the model version, and holdout accuracy. Optional what-if arguments set availability percentages from 0 to 100, where 100 is the unchanged baseline; omit them for the baseline forecast. Betting-market prices are excluded by design. Educational analysis, not a pick or betting advice.",
    inputSchema: Object.freeze({
      type: "object",
      properties: {
        quarterback: availability("Dak Prescott"),
        lamb: availability("CeeDee Lamb"),
        pickens: availability("George Pickens"),
        williams: availability("Javonte Williams"),
        defense: availability("Dallas defensive core"),
        opponentStar: availability("Opponent production leader"),
      },
      additionalProperties: false,
    }),
    outputSchema: withEvidence(["available", "unavailable"], {
      schemaVersion: { type: "string" }, reasons: STRING_LIST, scope: { const: "football_only" },
      marketPricesIncluded: { const: false }, matchup: NULLABLE_OBJECT,
      forecast: {
        type: ["object", "null"],
        properties: {
          cowboysWinProbability: { type: "number", minimum: 0, maximum: 1 },
          cowboysWinPercent: { type: "number", minimum: 0, maximum: 100 },
          baselinePercent: { type: "number", minimum: 0, maximum: 100 },
          scenarioDeltaPoints: { type: "number" },
          illustrativeBandPercent: {
            type: "object", properties: { low: { type: "number" }, high: { type: "number" } }, required: ["low", "high"],
          },
          scenarioApplied: { type: "boolean" }, controls: { type: "object" },
          drivers: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, impactPoints: { type: "number" }, evidence: { type: "string" } },
              required: ["label", "impactPoints", "evidence"],
            },
          },
          modelVersion: { type: "string" }, uncertainty: STRING_LIST,
        },
        required: ["cowboysWinProbability", "cowboysWinPercent", "baselinePercent", "scenarioDeltaPoints",
          "illustrativeBandPercent", "scenarioApplied", "controls", "drivers", "modelVersion", "uncertainty"],
      },
      ratings: NULLABLE_OBJECT, evaluation: NULLABLE_OBJECT, modelCardUrl: { type: "string" },
    }, ["schemaVersion", "reasons", "scope", "marketPricesIncluded", "matchup", "forecast", "ratings", "evaluation", "modelCardUrl"]),
    annotations: READ_ONLY,
    _meta: Object.freeze({ ui: Object.freeze({ resourceUri: FORECAST_CARD_URI }) }),
  },
].map((tool) => Object.freeze(tool)));

export const OWNER_TOOLS = Object.freeze([
  {
    name: "football_update_status",
    title: "Football updater status",
    description: "Read Road to Six football verification status and current season facts. Owner only.",
    inputSchema: NO_ARGUMENTS,
    annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, openWorldHint: false }),
  },
  {
    name: "refresh_football",
    title: "Refresh football snapshot",
    description: "Refresh and atomically publish this Site's football snapshot from fixed approved free sources. Retains the last good snapshot on failure. Never calls paid AI or odds providers. Owner only; repeated calls within one hour do not refetch.",
    inputSchema: NO_ARGUMENTS,
    annotations: Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }),
  },
].map((tool) => Object.freeze(tool)));

export const PUBLIC_TOOL_NAMES = Object.freeze(PUBLIC_TOOLS.map((tool) => tool.name));

export function findPublicTool(name) {
  return PUBLIC_TOOLS.find((tool) => tool.name === name) ?? null;
}

/** Enforces a tool's declared input schema. Returns actionable problems for the calling model. */
export function validateToolArguments(tool, args) {
  return validateJsonSchema(tool.inputSchema, args, "arguments").map((problem) => problem
    .replace(/^arguments\.(\w+) is not an accepted property$/, "$1 is not an accepted argument for this tool")
    .replace(/^arguments\./, ""));
}

const OK_STATES = new Set(["verified", "bye", "available", "current"]);
const DEGRADED_STATES = new Set(["degraded", "partial"]);

/**
 * Builds the shared evidence block for a public tool result.
 *
 * @param {string} tool
 * @param {Record<string, any>} output The tool's own result.
 * @param {{ snapshot: Record<string, any>, update: { status: string, reasonCode?: string | null }, freshness: { status: string, ageDays: number | null, message?: string } }} state
 * @param {number} now
 * @param {{ name: string, url: string, license: string }[]} [extraSources]
 */
export function buildEvidence(tool, output, state, now, extraSources = []) {
  const { snapshot, update, freshness } = state;
  const own = typeof output?.status === "string" ? output.status : "unavailable";
  const status = OK_STATES.has(own) ? "ok" : DEGRADED_STATES.has(own) ? "degraded" : "unavailable";
  const reason = typeof output?.reason === "string" ? output.reason
    : Array.isArray(output?.reasons) && typeof output.reasons[0] === "string" ? output.reasons[0] : null;
  // A result that is not fully usable always says why, even when the tool's
  // own output carries no reason field.
  const fallbackReason = ["failed", "unavailable"].includes(update.status)
    ? `The saved football state is ${update.status}${update.reasonCode ? ` (${update.reasonCode})` : ""}; only the last good snapshot is available.`
    : freshness.status !== "current" ? String(freshness.message ?? "The football snapshot is past its review window.")
    : "Some evidence is incomplete. See this result's limitations and trace.";
  const source = ({ name, url, license }) => ({ name: String(name), url: String(url), license: String(license) });
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    tool,
    status,
    reason: status === "ok" ? null : reason ?? fallbackReason,
    stale: freshness.status !== "current" || ["failed", "unavailable"].includes(update.status),
    observedAt: new Date(now).toISOString(),
    football: {
      dataVersion: String(snapshot.dataVersion),
      asOf: typeof snapshot.asOf === "string" ? snapshot.asOf : null,
      verifiedAt: typeof snapshot.season?.verifiedAt === "string" ? snapshot.season.verifiedAt : null,
      freshness: String(freshness.status),
      ageDays: Number.isInteger(freshness.ageDays) ? freshness.ageDays : null,
      lastRefreshOutcome: String(update.status),
    },
    sources: [...extraSources, ...(Array.isArray(snapshot.sources) ? snapshot.sources : [])].map(source),
    notice: EDUCATIONAL_NOTICE,
  };
}

/** Extracts the what-if controls a caller supplied to the forecast tool. */
export function forecastScenario(args) {
  return Object.fromEntries(FORECAST_CONTROL_KEYS.filter((key) => typeof args?.[key] === "number").map((key) => [key, args[key]]));
}
