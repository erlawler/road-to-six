import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function serveBuiltAsset(request) {
  const pathname = new URL(request.url).pathname;
  const assetUrl = new URL(`../dist/client${pathname}`, import.meta.url);
  const contentType = pathname.endsWith(".xml")
    ? "application/xml; charset=utf-8"
    : pathname.endsWith(".txt")
      ? "text/plain; charset=utf-8"
      : "application/octet-stream";

  try {
    return new Response(await readFile(assetUrl), {
      status: 200,
      headers: { "content-type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "http://localhost/"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: serveBuiltAsset,
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

test("light and dark focus colors meet WCAG contrast thresholds", () => {
  assert.ok(contrastRatio("0b56a8", "ffffff") >= 4.5);
  assert.ok(contrastRatio("0b56a8", "e8edf2") >= 4.5);
  assert.ok(contrastRatio("0b56a8", "f4f6f8") >= 4.5);
  assert.ok(contrastRatio("83b9ff", "020813") >= 3);
  assert.ok(contrastRatio("83b9ff", "061a35") >= 3);
});

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
  assert.match(html, /Weekly matchup\. Real baselines\./);
  assert.match(html, /George Pickens participation/);
  assert.match(html, /Javonte Williams participation/);
  assert.match(html, /New York Giants/);
  assert.match(html, /Jaxson Dart/);
  assert.match(html, /Refresh odds/);
  assert.match(html, /Uncertainty to keep in view/);
  assert.match(html, /The Odds API current markets/);
  assert.match(html, /Illustrative uncertainty band/);
  assert.match(html, /Product strategy, architecture, risk, and release owned by Eric Lawler\. Implemented with Code\./);
  assert.match(html, /Review the case/);
  assert.match(html, /top four stat producers from its active 2026 roster/);
  assert.match(html, /#(?:<!-- -->)?1(?:<!-- -->)? rank/);
  assert.match(html, /2024-2025/);
  assert.match(html, /<span class="sr-only">2024 to 2025<\/span>/);
  assert.match(html, /an AI cutoff/);
  assert.match(html, /Road to SB # Six/);
  assert.match(html, /aria-label="Road to Super Bowl Six"/);
  assert.match(html, /Ownership and strategy by Eric Lawler\. Implemented with Codex\./);
  assert.match(html, /Product judgment, made inspectable/);
  assert.match(html, /12 of 12 expected outcomes detected/);
  assert.match(html, /four-scenario live scorecard passed four of four Runtime AI/);
  assert.match(html, /Reset scenario/);
  assert.match(html, /Binary checks/);
  assert.match(html, /AI explains but does not invent probability/);
  assert.match(html, /Read the case study/);
  assert.match(html, /Inspect the AI evaluation/);
  assert.doesNotMatch(html, /Monthly runtime AI safety limit/);
  assert.doesNotMatch(html, /Market Bias Lab|benchmark, not an oracle|PPR rank|Review the product case|Weekly matchup\. 2025 baselines/);
  assert.doesNotMatch(html, /live structured response remains a separate provider gate/i);
  assert.doesNotMatch(html, />Cost<|>Brand</);
  assert.match(html, /Educational probability, not a recommended bet/);
  assert.doesNotMatch(html, /All performance data shown is synthetic and illustrative/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("publishes canonical metadata and a tightened content security policy", async () => {
  const response = await render();
  const csp = response.headers.get("content-security-policy") ?? "";
  const html = await response.text();

  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/road-to-six-erl\.erlrickylre\.chatgpt\.site\/"\/>/i,
  );
  assert.match(html, /<meta property="og:type" content="website"\/>/i);
  assert.match(
    html,
    /<meta property="og:url" content="https:\/\/road-to-six-erl\.erlrickylre\.chatgpt\.site\/"\/>/i,
  );
  assert.match(html, /<meta property="og:image:alt" content="Road to Six technical product management case study/i);
  assert.match(html, /<meta name="twitter:image:alt" content="Road to Six technical product management case study/i);

  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /img-src 'self'/);
  assert.match(csp, /media-src 'none'/);
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /style-src 'self'/);
  assert.match(csp, /style-src-elem 'self'/);
  assert.match(csp, /style-src-attr 'unsafe-inline'/);
  assert.match(csp, /worker-src 'none'/);
  assert.doesNotMatch(csp, /img-src 'self' data:/);
  assert.doesNotMatch(csp, /style-src 'self' 'unsafe-inline'/);
});

test("publishes search crawler directives without exposing API routes", async () => {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    render("/robots.txt"),
    render("/sitemap.xml"),
  ]);
  const [robots, sitemap] = await Promise.all([
    robotsResponse.text(),
    sitemapResponse.text(),
  ]);

  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get("content-type") ?? "", /^text\/plain\b/i);
  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get("content-type") ?? "", /^(?:application|text)\/xml\b/i);

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(
    robots,
    /^Sitemap: https:\/\/road-to-six-erl\.erlrickylre\.chatgpt\.site\/sitemap\.xml$/m,
  );
  assert.match(
    sitemap,
    /<loc>https:\/\/road-to-six-erl\.erlrickylre\.chatgpt\.site\/<\/loc>/,
  );
  assert.match(sitemap, /<lastmod>2026-07-30<\/lastmod>/);
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
