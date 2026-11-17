import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FORECAST_CONTROL_KEYS, MODEL_CARD_URL } from "../lib/football-forecast-tool.mjs";
import { FORECAST_CARD_URI, UI_RESOURCES, UI_RESOURCE_MIME_TYPE, readUiResource } from "../lib/mcp-app-view.mjs";
import { FORECAST_CARD_HTML } from "../lib/mcp-app-view-html.mjs";
import { EDUCATIONAL_NOTICE, findPublicTool } from "../lib/mcp-tools.mjs";
import { renderViewModule } from "../scripts/build-mcp-app-view.mjs";

const source = (await readFile(new URL("../app/mcp/forecast-card.html", import.meta.url), "utf8")).trimEnd();

test("the generated card module matches its reviewed HTML source", async () => {
  assert.equal(FORECAST_CARD_HTML, source);
  assert.equal(await readFile(new URL("../lib/mcp-app-view-html.mjs", import.meta.url), "utf8"), await renderViewModule());
});

test("the card is self-contained and cannot load, send or store anything on its own", () => {
  assert.match(source, /^<!doctype html>\n<html lang="en">/);
  assert.ok(Buffer.byteLength(source) < 24_000);
  // The only absolute address is the model card link, opened through the host.
  assert.deepEqual([...new Set(source.match(/https?:\/\/[^\s"'<>)]+/g))], [MODEL_CARD_URL]);
  for (const forbidden of [
    /<script[^>]+src=/i, /<link\b/i, /<img\b/i, /<iframe\b/i, /<object\b/i, /<embed\b/i, /@import/i, /url\(/i,
    /\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\beval\(/, /new Function/,
    /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /localStorage/, /sessionStorage/, /document\.cookie/,
  ]) assert.ok(!forbidden.test(source), String(forbidden));
  assert.ok(!/[–—]/.test(source));
});

test("the card follows the MCP Apps message rules for a view", () => {
  for (const marker of [
    '"2026-01-26"', '"ui/initialize"', '"ui/notifications/initialized"', '"ui/notifications/tool-input"',
    '"ui/notifications/tool-result"', '"ui/notifications/tool-cancelled"', '"ui/notifications/host-context-changed"',
    '"ui/notifications/size-changed"', '"ui/resource-teardown"', '"tools/call"', '"ui/update-model-context"', '"ui/open-link"',
    "appCapabilities", "appInfo", "hostCapabilities?.serverTools", "event.source !== host",
  ]) assert.ok(source.includes(marker), marker);
  assert.ok(source.includes('const TOOL_NAME = "get_football_forecast"'));
  assert.equal(findPublicTool("get_football_forecast")._meta.ui.resourceUri, FORECAST_CARD_URI);
});

test("the card's controls match the tool's inputs and meet the project's accessibility rules", () => {
  const inputs = [...source.matchAll(/<input id="(c-[A-Za-z]+)" name="([A-Za-z]+)" type="range" min="0" max="100" step="5" value="100">/g)];
  assert.deepEqual(inputs.map((match) => match[2]), [...FORECAST_CONTROL_KEYS]);
  assert.deepEqual(Object.keys(findPublicTool("get_football_forecast").inputSchema.properties), [...FORECAST_CONTROL_KEYS]);
  for (const [, id] of inputs) {
    assert.ok(source.includes(`<label for="${id}">`), id);
    assert.ok(source.includes(`<output for="${id}">`), id);
  }
  for (const marker of ["<title>", 'aria-live="polite"', 'aria-labelledby="title"', ":focus-visible", "prefers-reduced-motion: reduce", "color-scheme: light dark"]) {
    assert.ok(source.includes(marker), marker);
  }
  assert.ok(source.includes("unofficial fan project"));
  assert.ok(EDUCATIONAL_NOTICE.startsWith("Educational analytics from an unofficial fan project"));
});

test("the interface resource is described and served with the extension's content type", () => {
  assert.equal(UI_RESOURCE_MIME_TYPE, "text/html;profile=mcp-app");
  assert.deepEqual(UI_RESOURCES.map((resource) => [resource.uri, resource.mimeType]), [[FORECAST_CARD_URI, UI_RESOURCE_MIME_TYPE]]);
  assert.match(FORECAST_CARD_URI, /^ui:\/\//);
  const [contents] = readUiResource(FORECAST_CARD_URI);
  assert.deepEqual([contents.uri, contents.mimeType, contents.text], [FORECAST_CARD_URI, UI_RESOURCE_MIME_TYPE, source]);
  // No content security metadata is declared, so hosts apply the restrictive default policy.
  assert.equal(contents._meta.ui.csp, undefined);
  assert.equal(readUiResource("ui://road-to-six/other.html"), null);
  assert.equal(readUiResource(undefined), null);
});
