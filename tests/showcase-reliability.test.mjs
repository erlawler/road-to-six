import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runShowcaseReliabilitySimulation } from "../lib/showcase-reliability.mjs";

test("showcase fault injection produces the expected decisions without a network call", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests += 1; throw new Error("Unexpected network request"); };
  try {
    const report = await runShowcaseReliabilitySimulation();
    assert.deepEqual(report.results.filter((item) => !item.passed), []);
    assert.equal(report.allPassed, true);
    assert.equal(report.passed, report.total);
    assert.equal(new Set(report.results.map((item) => item.id)).size, report.total);
    assert.equal(requests, 0);
    assert.equal(report.paidProviderCalls, 0);
    assert.deepEqual(report.productionTelemetry, { uptime: null, modelLatencyMs: null, factualAccuracy: null });
    for (const id of ["fantasy_truncated", "fantasy_incomplete", "fantasy_expired", "fantasy_conflicting_score", "fantasy_bye", "ai_changed_driver_evidence", "ai_valid_deterministic_fallback", "transport_429", "transport_cache_hit", "transport_context_isolation", "transport_timeout"]) {
      assert.ok(report.results.some((item) => item.id === id && item.passed), `Missing expected case: ${id}`);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("published reliability report matches the executed source fingerprint and current results", async () => {
  const root = new URL("../", import.meta.url);
  const report = JSON.parse(await readFile(new URL("app/data/reliability-report.json", root), "utf8"));
  const hash = createHash("sha256");
  for (const file of report.sourceFingerprint.files) {
    const bytes = await readFile(new URL(file, root));
    hash.update(file); hash.update("\0"); hash.update(bytes); hash.update("\0");
  }
  assert.equal(hash.digest("hex"), report.sourceFingerprint.value, "Regenerate the report after changing tested files");
  assert.deepEqual(report.results, (await runShowcaseReliabilitySimulation()).results);
  assert.ok(Number.isFinite(Date.parse(report.runAt)));
  assert.equal(report.evidenceType, "local_deterministic_simulation");
});
