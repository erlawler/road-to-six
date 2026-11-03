import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { runShowcaseReliabilitySimulation } from "../lib/showcase-reliability.mjs";

const root = new URL("../", import.meta.url);
// Hash the suite and its executed dependency graph, excluding this generated
// report. The Git revision is the base, since packaging creates the release
// commit after checks; the fingerprint binds the results to tested file bytes.
const files = [
  "evals/ai-explanation-cases.mjs",
  "lib/ai-contract.mjs",
  "lib/ai-evaluation.mjs",
  "lib/fantasy.mjs",
  "lib/fantasy-provider.mjs",
  "lib/scenario-comparison.mjs",
  "lib/showcase-reliability.mjs",
  "lib/source-freshness.mjs",
  "scripts/build-reliability-report.mjs",
].sort();
const hash = createHash("sha256");
for (const file of files) {
  const bytes = await readFile(new URL(file, root));
  hash.update(file); hash.update("\0"); hash.update(bytes); hash.update("\0");
}
let baseCommit = null;
try { baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); }
catch { /* A source fingerprint still identifies a source archive without Git. */ }
const report = {
  ...await runShowcaseReliabilitySimulation(),
  runAt: new Date().toISOString(),
  baseCommit,
  sourceFingerprint: { algorithm: "sha256", value: hash.digest("hex"), files },
  verificationScope: "The fingerprint identifies tested source files. baseCommit is the checkout baseline, not a deployment assertion. The saved Sites version identifies the final release commit.",
};
await writeFile(new URL("app/data/reliability-report.json", root), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, total: report.total, allPassed: report.allPassed, runAt: report.runAt, sourceFingerprint: report.sourceFingerprint.value }));
if (!report.allPassed) {
  console.error(JSON.stringify(report.results.filter((item) => !item.passed), null, 2));
  process.exitCode = 1;
}
