import assert from "node:assert/strict";
import test from "node:test";

const env = {
  THE_ODDS_API_KEY: "test-key",
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function loadWorker(label) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(label, `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

test("coalesces concurrent cold odds refreshes", async () => {
  const originalFetch = globalThis.fetch;
  let vendorCalls = 0;
  let releaseVendor;
  let markVendorStarted;
  const vendorStarted = new Promise((resolve) => {
    markVendorStarted = resolve;
  });
  const vendorGate = new Promise((resolve) => {
    releaseVendor = resolve;
  });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.the-odds-api.com/")) {
      return originalFetch(input, init);
    }
    vendorCalls += 1;
    markVendorStarted();
    await vendorGate;
    return Response.json([]);
  };

  try {
    const worker = await loadWorker("concurrent-odds-refresh");
    const firstPromise = worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    await vendorStarted;
    const secondPromise = worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    releaseVendor();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    const [firstPayload, secondPayload] = await Promise.all([first.json(), second.json()]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(vendorCalls, 1);
    assert.equal(firstPayload.source, "The Odds API");
    assert.equal(secondPayload.source, "The Odds API");
    assert.equal(firstPayload.cached, false);
    assert.equal(secondPayload.cached, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("throttles repeated refresh attempts after an upstream failure", async () => {
  const originalFetch = globalThis.fetch;
  let vendorCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.the-odds-api.com/")) {
      return originalFetch(input, init);
    }
    vendorCalls += 1;
    return new Response(null, { status: 503 });
  };

  try {
    const worker = await loadWorker("failed-odds-refresh");
    const first = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    const second = await worker.fetch(new Request("http://localhost/api/odds"), env, ctx);
    const secondPayload = await second.json();

    assert.equal(first.status, 502);
    assert.equal(second.status, 429);
    assert.equal(vendorCalls, 1);
    assert.equal(secondPayload.status, "refresh_throttled");
    assert.equal(Number(second.headers.get("retry-after")) > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enforces the forecast body limit when Content-Length is absent", async () => {
  const worker = await loadWorker("bounded-forecast-body");
  const oversizedBody = new TextEncoder().encode("x".repeat(8_193));
  const request = new Request("http://localhost/api/forecast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(oversizedBody);
        controller.close();
      },
    }),
    duplex: "half",
  });

  assert.equal(request.headers.get("content-length"), null);
  const response = await worker.fetch(request, env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error, "Request body is too large");
});
