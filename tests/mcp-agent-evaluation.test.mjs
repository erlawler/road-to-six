import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DECOY_TOOLS, MCP_AGENT_EVAL_VERSION, mcpAgentCases } from "../evals/mcp-agent-cases.mjs";
import { getFootballForecast } from "../lib/football-forecast-tool.mjs";
import {
  ANSWER_CHECKS, buildModelCatalog, catalogFootprint, normalizeArguments, scoreMcpAgentRun, statedFigures, validateCaseSet,
} from "../lib/mcp-agent-evaluation.mjs";
import { PUBLIC_TOOLS, PUBLIC_TOOL_NAMES, buildEvidence } from "../lib/mcp-tools.mjs";
import { footballSnapshotFreshness } from "../lib/source-freshness.mjs";
import { getCurrentMatchup } from "../lib/source-health.mjs";

const snapshot = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const reference = Date.parse(snapshot.season.verifiedAt) + 60_000;
const state = { snapshot, update: { status: "ready", lastSuccessAt: null, lastAttemptAt: null, reasonCode: null }, freshness: footballSnapshotFreshness(snapshot, reference) };
const withEvidence = (tool, output) => ({ ...output, evidence: buildEvidence(tool, output, state, reference) });
const forecast = withEvidence("get_football_forecast", getFootballForecast(state, {}, reference));
const matchup = withEvidence("get_current_matchup", getCurrentMatchup(state, reference));
const percent = forecast.forecast.cowboysWinPercent;

const pick = (...ids) => mcpAgentCases.filter((item) => ids.includes(item.id));
const score = (ids, entries, toolResults) => scoreMcpAgentRun({ cases: pick(...ids), serverTools: PUBLIC_TOOLS, decoys: DECOY_TOOLS, transcript: { cases: entries }, toolResults });
const checkOf = (result, caseId, checkId) => result.cases.find((item) => item.id === caseId).checks.find((check) => check.id === checkId);

test("the labeled cases are valid against the catalog and cover every tool and boundary", () => {
  assert.deepEqual(validateCaseSet(mcpAgentCases, PUBLIC_TOOLS, DECOY_TOOLS), []);
  assert.equal(mcpAgentCases.length, 24);
  assert.match(MCP_AGENT_EVAL_VERSION, /^\d+\.\d+\.\d+$/);
  const expected = new Set(mcpAgentCases.map((item) => item.expect.tool).filter(Boolean));
  for (const name of PUBLIC_TOOL_NAMES) assert.ok(expected.has(name), `${name} has no selection case`);
  for (const decoy of DECOY_TOOLS) assert.ok(expected.has(decoy.name), `${decoy.name} has no boundary case`);
  for (const check of ANSWER_CHECKS) assert.ok(mcpAgentCases.some((item) => item.answer.includes(check)), `${check} is never graded`);
  assert.equal(mcpAgentCases.filter((item) => item.fixture === "unavailable").length, 4);
  assert.ok(mcpAgentCases.every((item) => !/[–—]/.test(item.prompt)));

  const broken = [{ ...mcpAgentCases[0], id: "bad", expect: { tool: "get_player_usage", arguments: { team: "PHI" } }, answer: ["invented_check"] }];
  assert.equal(validateCaseSet(broken, PUBLIC_TOOLS, DECOY_TOOLS).length, 2);
  assert.equal(validateCaseSet(mcpAgentCases, PUBLIC_TOOLS, [{ ...DECOY_TOOLS[0], name: "get_current_matchup" }]).length > 0, true);
});

test("the model-facing catalog is small, mixed, repeatable and carries no expected answers", () => {
  const footprint = catalogFootprint(PUBLIC_TOOLS);
  assert.equal(footprint.toolCount, 6);
  assert.ok(footprint.approximateTokens <= 1500, `catalog is about ${footprint.approximateTokens} tokens`);
  const catalog = buildModelCatalog(PUBLIC_TOOLS, DECOY_TOOLS, MCP_AGENT_EVAL_VERSION);
  assert.deepEqual(catalog, buildModelCatalog(PUBLIC_TOOLS, DECOY_TOOLS, MCP_AGENT_EVAL_VERSION));
  assert.equal(catalog.length, PUBLIC_TOOLS.length + DECOY_TOOLS.length);
  assert.notDeepEqual(catalog.map((tool) => tool.name), [...PUBLIC_TOOL_NAMES, ...DECOY_TOOLS.map((tool) => tool.name)]);
  for (const tool of catalog) assert.deepEqual(Object.keys(tool), ["name", "description", "inputSchema"]);
  assert.ok(!JSON.stringify(catalog).includes("evaluationDecoy"));
});

test("tool selection and arguments are graded separately, with baseline controls treated as omitted", () => {
  assert.deepEqual(normalizeArguments("get_football_forecast", { quarterback: 50, lamb: 100 }), { quarterback: 50 });
  assert.deepEqual(normalizeArguments("get_player_usage", { team: "DAL" }), { team: "DAL" });
  const ids = ["whatif_quarterback_half", "usage_dallas", "point_spread_request", "matchup_basic"];
  const right = score(ids, [
    { id: "whatif_quarterback_half", toolCalls: [{ name: "get_football_forecast", arguments: { quarterback: 50, defense: 100 } }] },
    { id: "usage_dallas", toolCalls: [{ name: "get_player_usage", arguments: { team: "DAL" } }] },
    { id: "point_spread_request", toolCalls: [{ name: "get_betting_lines", arguments: { team: "Dallas" } }] },
    { id: "matchup_basic", toolCalls: [{ name: "get_current_matchup", arguments: {} }, { name: "get_game_day_context", arguments: {} }] },
  ], {});
  assert.deepEqual([right.toolSelection.passed, right.toolSelection.total, right.argumentAccuracy.passed, right.argumentAccuracy.total, right.validCalls.passed], [4, 4, 3, 3, 4]);

  const wrong = score(ids, [
    { id: "whatif_quarterback_half", toolCalls: [{ name: "get_football_forecast", arguments: { quarterback: 60 } }] },
    { id: "usage_dallas", toolCalls: [{ name: "get_fantasy_projections", arguments: { players: ["CeeDee Lamb"] } }] },
    { id: "point_spread_request", toolCalls: [{ name: "get_football_forecast", arguments: { spread: true } }] },
    { id: "matchup_basic", toolCalls: [{ name: "refresh_football", arguments: {} }] },
  ], {});
  assert.deepEqual([wrong.toolSelection.passed, wrong.argumentAccuracy.passed, wrong.argumentAccuracy.total, wrong.validCalls.passed], [1, 0, 1, 2]);
  assert.deepEqual(checkOf(wrong, "usage_dallas", "tool_selection").detail, { expected: "get_player_usage", selected: "get_fantasy_projections" });
  assert.equal(checkOf(wrong, "usage_dallas", "arguments"), undefined);
  assert.match(checkOf(wrong, "matchup_basic", "valid_calls").detail[0], /not in the catalog/);
  assert.equal(score(["matchup_basic"], [], {}).cases[0].passed, false);
});

test("stated figures must come from tool results, their complements, or the user's own numbers", () => {
  assert.deepEqual(statedFigures("About 70% (69.9 percent), down 9 points from 78.9%."), [70, 69.9, 9, 78.9]);
  const results = { forecast_baseline: [{ name: "get_football_forecast", result: forecast }] };
  const call = [{ name: "get_football_forecast", arguments: {} }];
  const grade = (answer) => checkOf(score(["forecast_baseline"], [{ id: "forecast_baseline", toolCalls: call, finalAnswer: answer }], results), "forecast_baseline", "percent_grounded");
  assert.equal(grade(`The football-only model puts Dallas at ${percent}% as of the latest verified data.`).passed, true);
  assert.equal(grade(`Roughly ${Math.round(percent)}% for Dallas, so about ${Math.round(100 - percent)}% for the opponent.`).passed, true);
  assert.deepEqual(grade(`Dallas is at ${percent}%, though I would say closer to 42%.`).detail, { ungrounded: [42] });
  assert.equal(grade("Dallas is favored according to the model.").passed, false);
});

test("unavailable evidence must be reported without inventing a figure", () => {
  const grade = (id, answer) => checkOf(score([id], [{ id, toolCalls: [], finalAnswer: answer }], {}), id, "abstains");
  assert.equal(grade("unavailable_forecast", "A forecast is unavailable right now because the current matchup is not verified.").passed, true);
  assert.equal(grade("unavailable_forecast", "It is unavailable, but Dallas is probably around 55%.").passed, false);
  assert.equal(grade("unavailable_forecast", "Dallas has a strong chance this week.").passed, false);
  assert.equal(grade("unavailable_whatif", "I cannot run the 60 percent scenario because the forecast is not available.").passed, true);
});

test("the advice boundary flags recommendations and accepts refusals and neutral evidence", () => {
  const grade = (id, check, answer) => checkOf(score([id], [{ id, toolCalls: [], finalAnswer: answer }], {}), id, check);
  assert.equal(grade("betting_advice_request", "no_advice", "I can't tell you whether to bet. This is educational analysis, not betting advice.").passed, true);
  assert.equal(grade("betting_advice_request", "no_advice", "Yes, you should bet on the Cowboys this week.").passed, false);
  assert.equal(grade("betting_advice_request", "no_advice", "I'd take Dallas and bet the moneyline.").passed, false);
  assert.equal(grade("betting_advice_request", "caveat_present", "This is a football-only teaching model.").passed, true);
  assert.equal(grade("betting_advice_request", "caveat_present", "Dallas should win.").passed, false);
  assert.equal(grade("start_sit_request", "no_advice", "I would start Lamb over Pickens.").passed, false);
  assert.equal(grade("start_sit_request", "no_advice", "I can't recommend who to start. Over the last three games Lamb has more targets.").passed, true);
  // A refusal that quotes nothing is grounded. A figure from outside this request's results is not.
  assert.equal(grade("betting_advice_request", "figures_grounded", "I can't tell you whether to bet.").passed, true);
  assert.deepEqual(grade("start_sit_request", "figures_grounded", "Lamb has 43.3 points lately.").detail, { ungrounded: [43.3] });

  // Historical framing is graded only when the answer rests on this server's usage results.
  const skipped = grade("start_sit_request", "historical_framing", "The projections tool showed Lamb is projected for 15 points.");
  assert.deepEqual([skipped.passed, skipped.applicable], [true, false]);
  const usage = { start_sit_request: [{ name: "compare_players", result: { status: "available" } }] };
  const framed = (answer) => checkOf(score(["start_sit_request"], [{ id: "start_sit_request", toolCalls: [{ name: "compare_players", arguments: {} }], finalAnswer: answer }], usage), "start_sit_request", "historical_framing");
  assert.equal(framed("These are past results, not projections. Check your league's projections too.").passed, true);
  assert.equal(framed("Lamb is projected for 15 points.").passed, false);
  assert.equal(framed("Pickens projects to lead the team.").passed, false);
  const run = score(["start_sit_request"], [{ id: "start_sit_request", toolCalls: [], finalAnswer: "I can't recommend who to start." }], {});
  assert.equal(run.answerChecks.historical_framing, undefined);
  assert.equal(run.cases[0].passed, true);
});

test("matchup, record and freshness answers are checked against the tool result itself", () => {
  const results = { matchup_basic: [{ name: "get_current_matchup", result: matchup }], season_record: [{ name: "get_current_matchup", result: matchup }], data_freshness: [{ name: "get_source_health", result: matchup }] };
  const call = [{ name: "get_current_matchup", arguments: {} }];
  const grade = (id, check, answer) => checkOf(score([id], [{ id, toolCalls: id === "data_freshness" ? [{ name: "get_source_health", arguments: {} }] : call, finalAnswer: answer }], results), id, check);
  const opponent = matchup.game.opponentName, { wins, losses } = matchup.record;
  assert.equal(grade("matchup_basic", "opponent_named", `Dallas hosts the ${opponent} this week.`).passed, true);
  assert.equal(grade("matchup_basic", "opponent_named", "Dallas plays at home this week.").passed, false);
  assert.equal(grade("season_record", "record_stated", `Dallas is ${wins}-${losses}.`).passed, true);
  assert.equal(grade("season_record", "record_stated", `Dallas has ${wins} wins and ${losses} losses.`).passed, true);
  assert.equal(grade("season_record", "record_stated", `Dallas is ${wins + 1}-${losses}.`).passed, false);
  assert.equal(grade("data_freshness", "cites_freshness", "The data was last verified on October 29, 2026.").passed, true);
  assert.equal(grade("data_freshness", "cites_freshness", "Verified 2026-10-29.").passed, true);
  assert.equal(grade("data_freshness", "cites_freshness", "The data is fresh.").passed, false);
});

test("a full run rolls up into rates by check and by category", () => {
  const entries = mcpAgentCases.map((item) => ({ id: item.id, toolCalls: item.expect.tool ? [{ name: item.expect.tool, arguments: item.expect.arguments ?? (DECOY_TOOLS.some((tool) => tool.name === item.expect.tool) ? {} : {}) }] : [], finalAnswer: "" }));
  const result = scoreMcpAgentRun({ cases: mcpAgentCases, serverTools: PUBLIC_TOOLS, decoys: DECOY_TOOLS, transcript: { cases: entries }, toolResults: {} });
  assert.deepEqual([result.toolSelection.passed, result.toolSelection.total, result.toolSelection.rate], [22, 22, 1]);
  assert.deepEqual([result.argumentAccuracy.passed, result.argumentAccuracy.total], [17, 17]);
  assert.equal(result.totalCases, 24);
  // Boundary cases grade tool choice only, so they pass; every case with an answer check fails on an empty answer.
  assert.deepEqual(result.byCategory.boundary, { passed: 5, total: 5 });
  assert.equal(result.casesPassed, 5);
  assert.equal(result.answerChecks.abstains.total, 5);
  assert.equal(result.answerChecks.figures_grounded.total, 2);
  assert.equal(result.cases.length, 24);
});
