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
  assert.match(html, /<title>Road to Six \| Cowboys Market Bias Lab<\/title>/i);
  assert.match(html, /Football evidence meets market reality/);
  assert.match(html, /Interactive forecast/);
  assert.match(html, /Model audit/);
  assert.match(html, /Dak Prescott/);
  assert.match(html, /Weekly matchup\. 2025 baselines\./);
  assert.match(html, /George Pickens participation/);
  assert.match(html, /Javonte Williams participation/);
  assert.match(html, /New York Giants/);
  assert.match(html, /Jaxson Dart/);
  assert.match(html, /Refresh odds/);
  assert.doesNotMatch(html, /Monthly runtime AI safety limit/);
  assert.doesNotMatch(html, />Cost<|>Brand</);
  assert.match(html, /Educational probability, not a recommended bet/);
  assert.doesNotMatch(html, /All performance data shown is synthetic and illustrative/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("forecast API preserves the deterministic fallback", async () => {
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
      }),
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.explanation.mode, "deterministic");
  assert.equal(payload.forecast.modelVersion, "elo-market-v1.1.0");
  assert.equal(payload.forecast.probability > 0 && payload.forecast.probability < 1, true);
  assert.match(payload.fallbackReason, /OPENAI_API_KEY/);
});

test("removes disposable starter content", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Road to Six/);
  assert.match(layout, /Road to Six \| Cowboys Market Bias Lab/);
  assert.match(packageJson, /"name": "road-to-six"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app\/_sites-preview", templateRoot)));
});
