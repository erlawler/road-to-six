// Browser check for the MCP Apps forecast card.
//
// Loads the card in Chromium inside a sandboxed, cross-origin iframe served
// with the extension's default restrictive Content Security Policy, drives it
// through a small host page that follows the MCP Apps message rules
// (revision 2026-01-26), and proxies the card's tool calls to a local MCP
// endpoint. This is a harness written for this project, not Claude, ChatGPT
// or another production host.
//
// Needs Playwright with Chromium available to Node, and the fixture servers:
//
//   node --import ./tests/setup-worker-runtime.mjs scripts/mcp-local-server.mjs --port 8787
//   node --import ./tests/setup-worker-runtime.mjs scripts/mcp-local-server.mjs --port 8788 --state unavailable
//   node scripts/mcp-app-view-check.mjs [--screenshots docs/media]
//
// Prints a JSON report. Exits 1 when any expectation fails.

import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const readyUrl = argument("url", "http://127.0.0.1:8787/api/mcp");
const unavailableUrl = argument("unavailable-url", "http://127.0.0.1:8788/api/mcp");
const screenshots = argument("screenshots", "");
const cardHtml = await readFile(new URL("../app/mcp/forecast-card.html", import.meta.url), "utf8");

// The default policy a host must apply when a resource declares no CSP metadata.
const DEFAULT_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'";

const hostPage = (cardOrigin) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>MCP Apps check host</title>
<style>body{margin:0;font-family:system-ui}iframe{display:block;width:100%;max-width:600px;border:0}</style></head>
<body><iframe id="view" title="Forecast card" sandbox="allow-scripts" src="${cardOrigin}/card"></iframe>
<script>
const frame = document.getElementById("view");
const state = window.__host = { fromView: [], endpoint: ${JSON.stringify(readyUrl)}, theme: new URLSearchParams(location.search).get("theme") || "light", pending: new Map(), nextId: 1000 };
const send = (message) => frame.contentWindow.postMessage(message, "*");
const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "mcp-inspector-view-check", version: "1.0.0" } };
state.callTool = async (args, endpoint = state.endpoint) => {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "get_football_forecast" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_football_forecast", arguments: args, _meta: META } }) });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
};
state.notify = (method, params) => send({ jsonrpc: "2.0", method, params });
state.request = (method, params) => new Promise((resolve) => { const id = state.nextId++; state.pending.set(id, resolve); send({ jsonrpc: "2.0", id, method, params }); });
state.frameHeight = () => frame.getBoundingClientRect().height;
window.addEventListener("message", async (event) => {
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  state.fromView.push(message);
  if (message.method === undefined) { const resolve = state.pending.get(message.id); if (resolve) { state.pending.delete(message.id); resolve(message); } return; }
  if (message.method === "ui/initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2026-01-26", hostInfo: { name: "view-check-host", version: "1.0.0" },
      hostCapabilities: { serverTools: {}, openLinks: {} }, hostContext: { theme: state.theme, displayMode: "inline" } } });
  } else if (message.method === "ui/notifications/initialized") {
    state.notify("ui/notifications/tool-input", { arguments: {} });
    state.notify("ui/notifications/tool-result", await state.callTool({}));
  } else if (message.method === "ui/notifications/size-changed") {
    frame.style.height = message.params.height + "px";
  } else if (message.method === "tools/call") {
    try { send({ jsonrpc: "2.0", id: message.id, result: await state.callTool(message.params.arguments) }); }
    catch (error) { send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: String(error.message) } }); }
  } else if (message.id !== undefined) {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
  }
});
</script></body></html>`;

// Two origins: the host page and the card, as a sandboxing host would arrange.
const listen = (handler) => new Promise((resolveServer) => {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1", () => resolveServer({ server, origin: `http://127.0.0.1:${server.address().port}` }));
});
const card = await listen((request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": DEFAULT_CSP });
  response.end(cardHtml);
});
const host = await listen((request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(hostPage(card.origin));
});

const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });
const browser = await chromium.launch();
const problems = [], requests = [];

async function open(theme, viewport = { width: 640, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme });
  const page = await context.newPage();
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) problems.push(message.text().slice(0, 200)); });
  page.on("pageerror", (error) => problems.push(String(error).slice(0, 200)));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`${host.origin}/?theme=${theme}`);
  const view = page.frameLocator("#view");
  await view.locator("#result:not([hidden])").waitFor({ timeout: 15_000 });
  return { context, page, view };
}

try {
  const { context, page, view } = await open("light");
  const expected = (await page.evaluate(() => window.__host.callTool({}))).structuredContent;
  const text = (id) => view.locator(`#${id}`).innerText();

  check("renders the baseline forecast from the tool result", await text("percent") === `${expected.forecast.cowboysWinPercent.toFixed(1)}%`, await text("percent"));
  check("names the verified matchup", (await text("title")).includes(expected.matchup.opponentName) && (await text("title")).includes(`Week ${expected.matchup.week}`), await text("title"));
  check("lists the model's drivers", await view.locator("#drivers li").count() === expected.forecast.drivers.length);
  const chips = await view.locator("#chips li").allInnerTexts();
  check("shows data version and read time", chips.some((chip) => chip.includes(expected.evidence.football.dataVersion)) && chips.some((chip) => chip.startsWith("Read ")), chips);
  check("keeps the unofficial fan project notice visible", (await text("notice")).includes("unofficial fan project") && await view.locator("#notice").isVisible());
  check("labels every control", await view.locator("input[type=range]").evaluateAll((inputs) => inputs.length === 6 && inputs.every((input) => input.labels.length === 1 && input.nextElementSibling.tagName === "OUTPUT")));
  check("announces updates politely", await view.locator("#status").getAttribute("aria-live") === "polite");

  const sent = () => page.evaluate(() => window.__host.fromView);
  const methods = async () => (await sent()).map((message) => message.method).filter(Boolean);
  check("performs the handshake in order", (await methods()).indexOf("ui/initialize") === 0 && (await methods()).includes("ui/notifications/initialized"));
  const initialize = (await sent()).find((message) => message.method === "ui/initialize");
  check("declares app info, capabilities and protocol version", initialize.params.protocolVersion === "2026-01-26" && initialize.params.appInfo.name && typeof initialize.params.appCapabilities === "object", initialize.params);
  const sizes = (await sent()).filter((message) => message.method === "ui/notifications/size-changed");
  check("reports its size so the host can fit the frame", sizes.length > 0 && sizes.at(-1).params.height > 200 && Math.abs(await page.evaluate(() => window.__host.frameHeight()) - sizes.at(-1).params.height) <= 1, sizes.at(-1)?.params);
  if (screenshots) { await mkdir(resolve(screenshots), { recursive: true }); await page.locator("#view").screenshot({ path: resolve(screenshots, "mcp-forecast-card-baseline.png") }); }

  // What-if: the person moves a slider, the card asks the host to call the tool.
  await view.locator("#c-quarterback").evaluate((input) => { input.value = "50"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  const scenario = (await page.evaluate(() => window.__host.callTool({ quarterback: 50 }))).structuredContent;
  await view.locator("#percent").filter({ hasText: `${scenario.forecast.cowboysWinPercent.toFixed(1)}%` }).waitFor({ timeout: 10_000 });
  const toolCalls = (await sent()).filter((message) => message.method === "tools/call");
  check("asks the host to call the forecast tool with only the changed control", toolCalls.length === 1 && toolCalls[0].params.name === "get_football_forecast" && JSON.stringify(toolCalls[0].params.arguments) === JSON.stringify({ quarterback: 50 }), toolCalls.map((call) => call.params));
  check("shows the scenario result and its change from baseline", (await text("summary")).includes(`${scenario.forecast.scenarioDeltaPoints.toFixed(1)} points`), await text("summary"));
  await page.waitForFunction(() => window.__host.fromView.some((message) => message.method === "ui/update-model-context"), null, { timeout: 5_000 }).catch(() => {});
  const contextUpdate = (await sent()).find((message) => message.method === "ui/update-model-context");
  check("shares the scenario with the assistant's context", contextUpdate?.params.content[0].text.includes(`${scenario.forecast.cowboysWinPercent.toFixed(1)}%`) && contextUpdate.params.content[0].text.includes("not betting advice"));
  if (screenshots) await page.locator("#view").screenshot({ path: resolve(screenshots, "mcp-forecast-card-scenario.png") });

  await view.locator("#reset").click();
  await view.locator("#percent").filter({ hasText: `${expected.forecast.cowboysWinPercent.toFixed(1)}%` }).waitFor({ timeout: 10_000 });
  check("reset returns every control to the baseline", await view.locator("#c-quarterback").inputValue() === "100" && await text("percent") === `${expected.forecast.cowboysWinPercent.toFixed(1)}%`);

  // A tool execution error from the server is shown as written.
  await page.evaluate(() => window.__host.notify("ui/notifications/tool-result", { isError: true, content: [{ type: "text", text: "Invalid arguments for get_football_forecast: quarterback must be between 0 and 100. No data was read." }] }));
  check("shows a tool execution error instead of a number", (await text("message")).includes("quarterback must be between 0 and 100") && !(await view.locator("#result").isVisible()));

  // Unavailable evidence must replace the number, never sit beside it.
  const unavailable = await page.evaluate((endpoint) => window.__host.callTool({}, endpoint), unavailableUrl);
  await page.evaluate((result) => window.__host.notify("ui/notifications/tool-result", result), unavailable);
  await view.locator("#message").filter({ hasText: "No forecast is available" }).waitFor({ timeout: 5_000 });
  check("abstains visibly when evidence is unavailable", !(await view.locator("#result").isVisible()) && !(await view.locator("#controls").isVisible()) && (await view.locator("#chips li").allInnerTexts()).includes("Stale data"), await text("message"));
  if (screenshots) await page.locator("#view").screenshot({ path: resolve(screenshots, "mcp-forecast-card-unavailable.png") });

  await page.evaluate(() => window.__host.notify("ui/notifications/tool-cancelled", { reason: "user" }));
  check("reports a cancelled request", (await text("message")).includes("cancelled"));
  const teardown = await page.evaluate(() => window.__host.request("ui/resource-teardown", { reason: "check complete" }));
  check("answers the teardown request", teardown.result && Object.keys(teardown.result).length === 0 && !teardown.error);
  const unknown = await page.evaluate(() => window.__host.request("ui/not-a-method", {}));
  check("rejects an unknown host request", unknown.error?.code === -32601);
  await context.close();

  const dark = await open("dark", { width: 390, height: 900 });
  check("renders in a dark, phone-width host", await dark.view.locator("#percent").innerText() === `${expected.forecast.cowboysWinPercent.toFixed(1)}%`);
  if (screenshots) await dark.page.locator("#view").screenshot({ path: resolve(screenshots, "mcp-forecast-card-dark-narrow.png") });
  await dark.context.close();

  const external = [...new Set(requests.filter((url) => !url.startsWith("http://127.0.0.1:")))];
  check("makes no request outside the local harness", external.length === 0, external);
  check("raises no console errors, warnings or policy violations", problems.length === 0, problems);
} catch (error) {
  check("completes the browser run", false, error instanceof Error ? error.message.slice(0, 400) : String(error));
} finally {
  await browser.close();
  card.server.close();
  host.server.close();
}

const passed = checks.every((item) => item.passed);
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(), harness: "project-written host page, Chromium via Playwright", appProtocolVersion: "2026-01-26",
  contentSecurityPolicy: DEFAULT_CSP, passed, summary: `${checks.filter((item) => item.passed).length} of ${checks.length} checks passed`, checks,
}, null, 2));
process.exit(passed ? 0 : 1);
