// MCP agent evaluation runner.
//
//   npm run eval:mcp
//       Offline gate. Checks the labeled cases against the tool catalog and
//       reports the catalog's context footprint. No model, no network.
//
//   npm run eval:mcp -- --packet --out round1.json [--url <ready endpoint>]
//       Writes the round-one packet for an assistant: instructions, the mixed
//       tool catalog and the user requests. Expected answers are not included.
//
//   npm run eval:mcp -- --execute round1-answers.json --ready-url <url> --unavailable-url <url> --out results.json --model-packet round2.json
//       Executes the assistant's tool calls against the real endpoint (decoys
//       return fixed sample data), saves the results, and writes the round-two
//       packet for the assistant.
//
//   npm run eval:mcp -- --score transcript.json --results results.json --out scorecard.json
//       Grades a finished run with fixed rules and writes the scorecard.
//
// The endpoints are normally the local fixture servers from
// scripts/mcp-local-server.mjs, so results are fixture evidence.

import { readFile, writeFile } from "node:fs/promises";
import { DECOY_TOOLS, MCP_AGENT_EVAL_VERSION, mcpAgentCases } from "../evals/mcp-agent-cases.mjs";
import { MCP_AGENT_SCORING_VERSION, buildModelCatalog, catalogFootprint, resultFootprint, scoreMcpAgentRun, validateCaseSet } from "../lib/mcp-agent-evaluation.mjs";
import { META_KEY, MODERN_PROTOCOL_VERSIONS } from "../lib/mcp-protocol.mjs";
import { PUBLIC_INSTRUCTIONS, PUBLIC_TOOLS } from "../lib/mcp-tools.mjs";

const has = (name) => process.argv.includes(`--${name}`);
const argument = (name) => { const index = process.argv.indexOf(`--${name}`); return index > -1 ? process.argv[index + 1] : undefined; };
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const emit = async (value) => {
  const out = argument("out"), text = `${JSON.stringify(value, null, 2)}\n`;
  if (out) { await writeFile(out, text); console.log(`Wrote ${out}`); } else process.stdout.write(text);
};
const MAX_CALLS_PER_CASE = 4;
const version = MODERN_PROTOCOL_VERSIONS[0];

async function rpc(url, method, params = {}, name) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": version, "Mcp-Method": method, ...(name ? { "Mcp-Name": name } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: {
      [META_KEY.protocolVersion]: version, [META_KEY.clientCapabilities]: {}, [META_KEY.clientInfo]: { name: "road-to-six-agent-eval", version: MCP_AGENT_EVAL_VERSION },
    } } }),
  });
  return response.json();
}

if (has("packet")) {
  // Use what the endpoint actually serves when one is given, so the evaluation covers the deployed catalog.
  const url = argument("url");
  const serverTools = url ? (await rpc(url, "tools/list")).result.tools : PUBLIC_TOOLS;
  const serverInstructions = url ? (await rpc(url, "server/discover")).result.instructions : PUBLIC_INSTRUCTIONS;
  await emit({
    evalVersion: MCP_AGENT_EVAL_VERSION,
    round: 1,
    role: "You are a general-purpose assistant. The tools below come from several connected servers. For each numbered request, decide which tools you would call first to help the user, exactly as you would in a real conversation. Treat every request as a separate conversation with no memory of the others. Call no tool when none fits.",
    serverInstructions: { server: "road-to-six-football", text: serverInstructions },
    tools: buildModelCatalog(serverTools, DECOY_TOOLS, MCP_AGENT_EVAL_VERSION),
    requests: mcpAgentCases.map(({ id, prompt }) => ({ id, prompt })),
    responseFormat: { cases: [{ id: "<request id>", toolCalls: [{ name: "<tool name>", arguments: {} }] }] },
  });
} else if (has("execute")) {
  const round1 = await readJson(argument("execute"));
  const urls = { ready: argument("ready-url"), unavailable: argument("unavailable-url") };
  if (!urls.ready || !urls.unavailable) throw new Error("Give --ready-url and --unavailable-url");
  const serverNames = new Set(PUBLIC_TOOLS.map((tool) => tool.name)), decoys = new Map(DECOY_TOOLS.map((tool) => [tool.name, tool]));
  const entries = new Map((round1.cases ?? []).map((entry) => [entry.id, entry]));
  const toolResults = {}, requests = [];
  for (const item of mcpAgentCases) {
    const calls = (entries.get(item.id)?.toolCalls ?? []).slice(0, MAX_CALLS_PER_CASE);
    const executed = [];
    for (const call of calls) {
      if (serverNames.has(call.name)) {
        const body = await rpc(urls[item.fixture], "tools/call", { name: call.name, arguments: call.arguments ?? {} }, call.name);
        const result = body.error ? { protocolError: body.error.message } : body.result.isError ? { toolError: body.result.content?.[0]?.text } : body.result.structuredContent;
        executed.push({ name: call.name, arguments: call.arguments ?? {}, result });
      } else if (decoys.has(call.name)) {
        executed.push({ name: call.name, arguments: call.arguments ?? {}, result: decoys.get(call.name).result });
      } else {
        executed.push({ name: call.name, arguments: call.arguments ?? {}, result: { protocolError: `Unknown tool: ${String(call.name).slice(0, 64)}` } });
      }
    }
    toolResults[item.id] = executed;
    requests.push({ id: item.id, prompt: item.prompt, toolResults: executed });
  }
  // The assistant's round-two packet is written compactly and holds each result once.
  const modelPacket = argument("model-packet");
  if (modelPacket) {
    await writeFile(modelPacket, JSON.stringify({
      evalVersion: MCP_AGENT_EVAL_VERSION,
      round: 2,
      role: "Here are the results of the tools you chose for each request. Write the reply you would give the user for each one, using only these results and the request itself. Treat every request as a separate conversation. Keep each reply under 120 words.",
      requests,
      responseFormat: { cases: [{ id: "<request id>", finalAnswer: "<your reply to the user>" }] },
    }));
    console.log(`Wrote ${modelPacket}`);
  }
  await emit({ evalVersion: MCP_AGENT_EVAL_VERSION, executedAt: new Date().toISOString(), endpoints: urls, toolResults });
} else if (has("score")) {
  const transcript = await readJson(argument("score"));
  const results = await readJson(argument("results"));
  const score = scoreMcpAgentRun({ cases: mcpAgentCases, serverTools: PUBLIC_TOOLS, decoys: DECOY_TOOLS, transcript, toolResults: results.toolResults });
  await emit({
    schemaVersion: "1.0.0", generatedAt: new Date().toISOString(), evalVersion: MCP_AGENT_EVAL_VERSION,
    subject: transcript.subject ?? null, method: transcript.method ?? null, limits: transcript.limits ?? [],
    catalog: catalogFootprint(PUBLIC_TOOLS), resultFootprint: resultFootprint(results.toolResults, PUBLIC_TOOLS),
    decoyTools: DECOY_TOOLS.map((tool) => tool.name), ...score,
  });
  console.error(`${score.casesPassed} of ${score.totalCases} cases passed; tool selection ${score.toolSelection.passed} of ${score.toolSelection.total}; arguments ${score.argumentAccuracy.passed} of ${score.argumentAccuracy.total}`);
} else {
  const problems = validateCaseSet(mcpAgentCases, PUBLIC_TOOLS, DECOY_TOOLS);
  const byCategory = {};
  for (const item of mcpAgentCases) byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  const footprint = catalogFootprint(PUBLIC_TOOLS);
  const summary = {
    evalVersion: MCP_AGENT_EVAL_VERSION, scoringVersion: MCP_AGENT_SCORING_VERSION,
    suitePassed: problems.length === 0 && footprint.approximateTokens <= 1500,
    totalCases: mcpAgentCases.length, casesByCategory: byCategory, decoyTools: DECOY_TOOLS.length,
    catalog: footprint, catalogBudgetTokens: 1500, problems,
    note: "Offline gate only. It checks the cases and catalog, not any assistant's behavior. Dated model runs are saved under evals/mcp.",
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.suitePassed) process.exitCode = 1;
}
