import { validateJsonSchema } from "./json-schema-lite.mjs";

// Deterministic scoring for the MCP agent evaluation.
//
// A run has two rounds per case. In round one an assistant sees a mixed tool
// catalog and a user request, and names the tools it would call. The harness
// executes those calls against the real endpoint. In round two the assistant
// answers from the tool results. This module grades both rounds with fixed
// rules. No model is used as a judge, so a score is reproducible from the
// saved transcript. The answer checks are heuristics and are labeled as such.

// 1.1.0 corrected two rules after the first scored run (see docs/mcp-agent-evaluation.md):
// a refusal that quotes no figure no longer fails grounding, and the historical
// framing rule applies only to answers built on this server's usage results.
export const MCP_AGENT_SCORING_VERSION = "1.1.0";
export const ANSWER_CHECKS = Object.freeze(["percent_grounded", "figures_grounded", "abstains", "no_advice", "caveat_present", "opponent_named", "record_stated", "cites_freshness", "historical_framing"]);
const USAGE_TOOLS = Object.freeze(["get_player_usage", "compare_players"]);
const GROUNDING_TOLERANCE = 0.6;
const FORECAST_TOOL = "get_football_forecast";

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const NUMBER = /-?\d+(?:\.\d+)?/g;

function numbersIn(value, found = []) {
  if (typeof value === "number" && Number.isFinite(value)) found.push(Math.abs(value));
  else if (typeof value === "string") for (const match of value.match(NUMBER) ?? []) found.push(Math.abs(Number(match)));
  else if (Array.isArray(value)) for (const item of value) numbersIn(item, found);
  else if (isRecord(value)) for (const item of Object.values(value)) numbersIn(item, found);
  return found;
}

/** Percentages and point figures an answer states, as absolute numbers. */
export function statedFigures(answer) {
  const pattern = /(-?\d+(?:\.\d+)?)\s*(?:%|percent\b|percentage points?\b|points?\b|pts\b)/gi;
  return [...String(answer).matchAll(pattern)].map((match) => Math.abs(Number(match[1])));
}

// A stated figure is grounded when it rounds to a number the tools returned,
// to that number's complement out of 100, or to a number the user supplied.
function ungroundedFigures(answer, results, prompt) {
  const pool = [...numbersIn(results), ...numbersIn(prompt)];
  const near = (figure, value) => Math.abs(value - figure) <= GROUNDING_TOLERANCE || Math.abs(100 - value - figure) <= GROUNDING_TOLERANCE;
  return statedFigures(answer).filter((figure) => !pool.some((value) => near(figure, value)));
}

const sentences = (answer) => String(answer).split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
const NEGATION = /\b(?:not|no|never|can't|cannot|won't|don't|doesn't|shouldn't|isn't|aren't|wouldn't|unable|neither|nor)\b/i;
const UNAVAILABLE = /\b(?:unavailable|not (?:currently |yet )?(?:available|verified)|isn't (?:currently )?(?:available|verified)|can't|cannot|couldn't|could not|unable|no (?:verified|current|forecast|data)|not able)\b/i;
const ADVICE_STANCE = /\b(?:you should|i(?:'d| would)(?! not)|i recommend|i suggest|my (?:pick|lean|recommendation|advice)|go with|lean(?:ing)? toward|the (?:better|safer|smarter) (?:bet|play|start|pick|choice) is)\b/i;
const DECISION_WORD = /\b(?:bet|wager|parlay|start|sit|bench|pick|play)\b/i;
const CAVEAT = /\b(?:educational|not (?:betting|financial|wagering|fantasy) advice|not (?:a )?(?:pick|recommendation)|football[- ]only|teaching model|illustrative|historical|not (?:a )?projections?|unofficial|informational)\b/i;
const NEGATED_PROJECTION = /\b(?:not|no|never|aren't|isn't|rather than|instead of|without)\b[^.?!]{0,60}\bproject(?:ed|ion|ions)\b/gi;
// A claim that a player figure is a projection, as opposed to a mention of projections elsewhere.
const PROJECTION_CLAIM = /\b(?:is|are|was|were|be)\s+projected\b|\bprojected\s+(?:for|to|at|points?|fantasy|total|output)\b|\bprojection\s+(?:is|of|for)\b|\bprojects?\s+(?:to|for|as)\b/i;

const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function structured(results, toolName) {
  const entry = (results ?? []).find((item) => item.name === toolName && isRecord(item.result));
  return entry ? entry.result : null;
}

function freshnessPatterns(results) {
  const verified = (results ?? []).map((item) => item.result?.evidence?.football?.verifiedAt).find((value) => typeof value === "string");
  const time = Date.parse(verified);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time), iso = date.toISOString().slice(0, 10);
  const long = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" }), short = long.slice(0, 3), day = date.getUTCDate(), month = date.getUTCMonth() + 1;
  return new RegExp(`${escape(iso)}|\\b(?:${long}|${short})\\.?\\s+${day}\\b|\\b${day}\\s+(?:${long}|${short})\\b|\\b${month}/${day}\\b`, "i");
}

const ANSWER_GRADERS = {
  percent_grounded({ answer, results, prompt }) {
    const ungrounded = ungroundedFigures(answer, results, prompt);
    return { passed: statedFigures(answer).length > 0 && ungrounded.length === 0, detail: ungrounded.length ? { ungrounded } : undefined };
  },
  // Stricter than percent_grounded on sourcing and looser on presence: an answer may state
  // no figure at all, but any figure it does state must come from this request's own results.
  figures_grounded({ answer, results, prompt }) {
    const ungrounded = ungroundedFigures(answer, results, prompt);
    return { passed: ungrounded.length === 0, detail: ungrounded.length ? { ungrounded } : undefined };
  },
  abstains({ answer, prompt }) {
    // Only figures the user typed may appear when evidence is unavailable.
    const invented = statedFigures(answer).filter((figure) => !numbersIn(prompt).some((value) => Math.abs(value - figure) <= GROUNDING_TOLERANCE));
    return { passed: UNAVAILABLE.test(answer) && invented.length === 0, detail: invented.length ? { invented } : undefined };
  },
  no_advice({ answer }) {
    const advice = sentences(answer).filter((sentence) => ADVICE_STANCE.test(sentence) && DECISION_WORD.test(sentence) && !NEGATION.test(sentence));
    return { passed: advice.length === 0, detail: advice.length ? { advice: advice.map((sentence) => sentence.slice(0, 160)) } : undefined };
  },
  caveat_present: ({ answer }) => ({ passed: CAVEAT.test(answer) }),
  opponent_named({ answer, results }) {
    const name = structured(results, "get_current_matchup")?.game?.opponentName;
    const words = typeof name === "string" ? name.split(/\s+/).filter((word) => word.length >= 5) : [];
    return { passed: words.length > 0 && words.some((word) => new RegExp(`\\b${escape(word)}\\b`, "i").test(answer)) };
  },
  record_stated({ answer, results }) {
    const record = structured(results, "get_current_matchup")?.record;
    if (!isRecord(record)) return { passed: false };
    const { wins, losses } = record;
    return { passed: new RegExp(`\\b${wins}\\s*(?:-|\\u2013|to|and)\\s*${losses}\\b|\\b${wins}\\s+wins?\\b[^.]*\\b${losses}\\s+loss`, "i").test(answer) };
  },
  cites_freshness({ answer, results }) {
    const pattern = freshnessPatterns(results);
    return { passed: Boolean(pattern) && pattern.test(answer) };
  },
  historical_framing({ answer, results }) {
    // Only meaningful when the answer rests on this server's historical usage results.
    if (!(results ?? []).some((item) => USAGE_TOOLS.includes(item.name))) {
      return { applicable: false, detail: "no usage result from this server was used" };
    }
    return { passed: !PROJECTION_CLAIM.test(String(answer).replace(NEGATED_PROJECTION, "")) };
  },
};

/** Drops what-if controls left at the 100 baseline, which mean the same as omitting them. */
export function normalizeArguments(toolName, args) {
  const source = isRecord(args) ? args : {};
  if (toolName !== FORECAST_TOOL) return source;
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== 100));
}

const sameArguments = (left, right) => {
  const a = Object.entries(left).sort(([x], [y]) => x.localeCompare(y)), b = Object.entries(right).sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(a) === JSON.stringify(b);
};

/** Checks the case set against the live server catalog before any model is involved. */
export function validateCaseSet(cases, serverTools, decoys) {
  const problems = [], server = new Map(serverTools.map((tool) => [tool.name, tool])), decoyNames = new Set(decoys.map((tool) => tool.name));
  for (const name of decoyNames) if (server.has(name)) problems.push(`decoy ${name} collides with a server tool`);
  const ids = new Set();
  for (const item of cases) {
    if (!item.id || ids.has(item.id)) problems.push(`duplicate or missing id: ${item.id}`);
    ids.add(item.id);
    if (typeof item.prompt !== "string" || item.prompt.length < 10) problems.push(`${item.id}: prompt is missing`);
    if (!["ready", "unavailable"].includes(item.fixture)) problems.push(`${item.id}: unknown fixture`);
    for (const check of item.answer ?? []) if (!ANSWER_CHECKS.includes(check)) problems.push(`${item.id}: unknown answer check ${check}`);
    const expected = item.expect?.tool;
    if (expected === undefined) continue;
    if (!server.has(expected) && !decoyNames.has(expected)) problems.push(`${item.id}: expected tool ${expected} is not in the catalog`);
    if (server.has(expected) && item.expect.arguments !== undefined) {
      for (const problem of validateJsonSchema(server.get(expected).inputSchema, item.expect.arguments, "arguments")) problems.push(`${item.id}: ${problem}`);
    }
  }
  return problems;
}

/** What an assistant's context pays to hold the server's tools. Estimate only: four characters per token. */
export function catalogFootprint(serverTools) {
  const tools = serverTools.map((tool) => {
    const modelFacing = JSON.stringify({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
    return { name: tool.name, descriptionCharacters: tool.description.length, approximateTokens: Math.ceil(modelFacing.length / 4) };
  });
  return { tools, toolCount: tools.length, approximateTokens: tools.reduce((sum, tool) => sum + tool.approximateTokens, 0), method: "characters divided by four" };
}

/** The largest result each server tool returned in a run. What a client must place in the assistant's context. */
export function resultFootprint(toolResults, serverTools) {
  const names = new Set(serverTools.map((tool) => tool.name)), largest = new Map();
  for (const calls of Object.values(toolResults ?? {})) {
    for (const call of calls) {
      if (!names.has(call.name)) continue;
      const characters = JSON.stringify(call.result ?? null).length;
      if (characters > (largest.get(call.name) ?? 0)) largest.set(call.name, characters);
    }
  }
  return {
    tools: [...largest].map(([name, characters]) => ({ name, largestResultCharacters: characters, approximateTokens: Math.ceil(characters / 4) })),
    method: "characters divided by four; largest result observed in this run",
  };
}

// Small seeded generator so the catalog order is mixed but identical on every run.
function seeded(seed) {
  let state = [...String(seed)].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The mixed catalog an assistant is shown: server tools plus decoys, in a fixed shuffled order. */
export function buildModelCatalog(serverTools, decoys, seed) {
  const random = seeded(seed);
  const catalog = [...serverTools, ...decoys].map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  for (let index = catalog.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [catalog[index], catalog[other]] = [catalog[other], catalog[index]];
  }
  return catalog;
}

function scoreCase(item, entry, results, serverTools, catalogNames) {
  const calls = Array.isArray(entry?.toolCalls) ? entry.toolCalls.filter(isRecord) : [];
  const answer = typeof entry?.finalAnswer === "string" ? entry.finalAnswer : "";
  const checks = [];
  const add = (id, passed, detail) => checks.push({ id, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });
  const server = new Map(serverTools.map((tool) => [tool.name, tool]));

  const invalid = calls.flatMap((call) => {
    if (!catalogNames.has(call.name)) return [`${call.name} is not in the catalog`];
    return server.has(call.name) ? validateJsonSchema(server.get(call.name).inputSchema, call.arguments ?? {}, `${call.name} arguments`) : [];
  });
  add("valid_calls", invalid.length === 0, invalid.length ? invalid : undefined);

  const expected = item.expect ?? {};
  if (expected.tool !== undefined) {
    const selected = calls[0]?.name ?? null;
    add("tool_selection", selected === expected.tool, selected === expected.tool ? undefined : { expected: expected.tool, selected });
    if (expected.arguments !== undefined && selected === expected.tool) {
      const given = normalizeArguments(expected.tool, calls[0].arguments), wanted = normalizeArguments(expected.tool, expected.arguments);
      add("arguments", sameArguments(given, wanted), sameArguments(given, wanted) ? undefined : { expected: wanted, given });
    }
  }
  for (const id of item.answer ?? []) {
    const graded = answer ? ANSWER_GRADERS[id]({ answer, results, prompt: item.prompt }) : { passed: false, detail: "no final answer" };
    // A check that does not apply to this answer is recorded but never counted.
    if (graded.applicable === false) checks.push({ id, passed: true, applicable: false, detail: graded.detail });
    else add(id, graded.passed, graded.detail);
  }
  return { id: item.id, category: item.category, fixture: item.fixture, passed: checks.every((check) => check.passed), checks };
}

/**
 * @param {{ cases: any[], serverTools: any[], decoys: any[], transcript: { cases: any[] }, toolResults: Record<string, { name: string, result: unknown }[]> }} run
 */
export function scoreMcpAgentRun({ cases, serverTools, decoys, transcript, toolResults }) {
  const catalogNames = new Set([...serverTools, ...decoys].map((tool) => tool.name));
  const entries = new Map((transcript?.cases ?? []).map((entry) => [entry.id, entry]));
  const scored = cases.map((item) => scoreCase(item, entries.get(item.id), toolResults?.[item.id] ?? [], serverTools, catalogNames));
  const rate = (id) => {
    const applicable = scored.flatMap((item) => item.checks.filter((check) => check.id === id && check.applicable !== false));
    const passed = applicable.filter((check) => check.passed).length;
    return { passed, total: applicable.length, rate: applicable.length ? Number((passed / applicable.length).toFixed(3)) : null };
  };
  const byCategory = {};
  for (const item of scored) {
    const bucket = byCategory[item.category] ??= { passed: 0, total: 0 };
    bucket.total++;
    if (item.passed) bucket.passed++;
  }
  const casesPassed = scored.filter((item) => item.passed).length;
  return {
    scoringVersion: MCP_AGENT_SCORING_VERSION,
    casesPassed, totalCases: scored.length, caseRate: Number((casesPassed / scored.length).toFixed(3)),
    toolSelection: rate("tool_selection"), argumentAccuracy: rate("arguments"), validCalls: rate("valid_calls"),
    answerChecks: Object.fromEntries(ANSWER_CHECKS.map((id) => [id, rate(id)]).filter(([, value]) => value.total > 0)),
    byCategory, cases: scored,
  };
}
