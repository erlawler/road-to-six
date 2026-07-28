import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server renders the Road to Six market lab", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Road to Six \| Technical PM and AI Case Study<\/title>/i);
  assert.match(html, /Football evidence meets market reality/);
  assert.match(html, /Interactive forecast/);
  assert.match(html, /Model audit/);
  assert.match(html, /Market Context Lab/);
  assert.match(html, /Measure the forecast against the market/);
  assert.match(html, /Dak Prescott/);
  assert.match(html, /Weekly matchup\. 2025 baselines\./);
  assert.match(html, /George Pickens participation/);
  assert.match(html, /Javonte Williams participation/);
  assert.match(html, /New York Giants/);
  assert.match(html, /Jaxson Dart/);
  assert.match(html, /Refresh odds/);
  assert.match(html, /Uncertainty to keep in view/);
  assert.match(html, /The Odds API current markets/);
  assert.match(html, /Illustrative uncertainty band/);
  assert.match(html, /Product judgment, made inspectable/);
  assert.match(html, /12 of 12 expected outcomes detected/);
  assert.match(html, /Binary checks/);
  assert.match(html, /AI explains but does not invent probability/);
  assert.match(html, /Read the case study/);
  assert.match(html, /Inspect the AI evaluation/);
  assert.doesNotMatch(html, /Monthly runtime AI safety limit/);
  assert.doesNotMatch(html, /Market Bias Lab|benchmark, not an oracle/);
  assert.doesNotMatch(html, />Cost<|>Brand</);
  assert.match(html, /Educational probability, not a recommended bet/);
  assert.doesNotMatch(html, /All performance data shown is synthetic and illustrative/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("forecast API fails closed without the shared rate-limit ledger", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameId: "2026_01_DAL_NYG",
        controls: { quarterback: 100, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 },
        market: { cowboysMoneyline: -10_000, opponentMoneyline: 10_000 },
      }),
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.explanation.mode, "deterministic");
  assert.equal(payload.forecast.modelVersion, "elo-market-v1.1.0");
  assert.equal(payload.forecast.probability > 0 && payload.forecast.probability < 1, true);
  assert.equal(payload.forecast.marketImplied < 0.7, true);
  assert.equal(payload.marketEvidence.source, "Bundled nflverse market snapshot");
  assert.match(payload.fallbackReason, /rate limit is unavailable/i);
  assert.equal(payload.reliability.mode, "deterministic");
  assert.equal(payload.reliability.validationStatus, "not_run");
  assert.equal(payload.reliability.fallbackReasonCode, "rate_limit_unavailable");
  assert.equal(payload.reliability.forecastVersion, "elo-market-v1.1.0");
  assert.equal(payload.reliability.estimatedCostUsd, 0);
  assert.equal(payload.budget, undefined);
});

test("removes disposable starter content", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Road to Six/);
  assert.match(page, /AI reliability receipt/);
  assert.match(page, /AIReliabilityReceipt/);
  assert.match(page, /promptVersion/);
  assert.match(page, /fallbackReasonCode/);
  assert.match(page, /estimatedCostUsd/);
  assert.doesNotMatch(page, /type ReliabilityReceipt|totalTokens/);
  assert.match(page, /Responsible use/);
  assert.doesNotMatch(page, /data\.budget|runtimeResult\.budget|Monthly runtime AI safety limit/);
  assert.match(layout, /Road to Six \| Technical PM and AI Case Study/);
  assert.match(packageJson, /"name": "road-to-six"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app\/_sites-preview", templateRoot)));
});
