import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

function localTargets(markdown) {
  return [...markdown.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)]
    .map((match) => match[1].trim().replace(/^<|>$/g, ""))
    .filter((target) => (
      !target.startsWith("#")
      && !target.startsWith("http://")
      && !target.startsWith("https://")
      && !target.startsWith("mailto:")
    ))
    .map((target) => decodeURIComponent(target.split("#")[0]));
}

test("recruiter overview exposes the technical product management story", async () => {
  const readme = await readFile(resolve(root, "README.md"), "utf8");

  assert.match(readme, /## Recruiter snapshot/);
  assert.match(readme, /## Two-minute reviewer path/);
  assert.match(readme, /## What I owned/);
  assert.match(readme, /## Key product decisions and tradeoffs/);
  assert.match(readme, /## Verified outcomes/);
  assert.match(readme, /## Frontier AI product judgment/);
  assert.match(readme, /public\/og-market-context\.png/);
  assert.match(readme, /Seventeen product and architecture decisions/);
  assert.match(readme, /reliability receipt/i);
});

test("every local README link and image resolves", async () => {
  const readmePath = resolve(root, "README.md");
  const readme = await readFile(readmePath, "utf8");

  for (const target of localTargets(readme)) {
    await assert.doesNotReject(
      access(resolve(dirname(readmePath), target)),
      `README target does not exist: ${target}`,
    );
  }
});

test("portfolio evidence set is complete and free of prohibited dash characters", async () => {
  const requiredArtifacts = [
    "CHANGELOG.md",
    "RELEASE_NOTES.md",
    ".github/dependabot.yml",
    ".github/workflows/codeql.yml",
    "docs/ai-evaluation.md",
    "docs/codex-collaboration.md",
    "docs/figma-flow.md",
    "docs/frontier-ai-architecture.md",
    "docs/linkedin-launch-kit.md",
    "docs/live-ai-scorecard.md",
    "docs/portfolio-case-study.md",
    "docs/repository-launch-checklist.md",
    "docs/usability-research.md",
    "evals/live/2026-07-27-gpt-5.6-luna.json",
    "public/og-market-context.png",
  ];

  for (const artifact of requiredArtifacts) {
    await assert.doesNotReject(access(resolve(root, artifact)), `Missing portfolio artifact: ${artifact}`);
  }

  const docs = (await readdir(resolve(root, "docs")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/${name}`);
  for (const relativePath of ["README.md", "CHANGELOG.md", "RELEASE_NOTES.md", ...docs]) {
    const content = await readFile(resolve(root, relativePath), "utf8");
    assert.doesNotMatch(content, /[\u2013\u2014]/, `${relativePath} contains a prohibited dash character`);
  }
});

test("v1 release package keeps claims and launch authority bounded", async () => {
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const liveScorecard = JSON.parse(
    await readFile(resolve(root, "evals/live/2026-07-27-gpt-5.6-luna.json"), "utf8"),
  );
  const releaseNotes = await readFile(resolve(root, "RELEASE_NOTES.md"), "utf8");
  const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
  const productBrief = await readFile(resolve(root, "docs/product-brief.md"), "utf8");
  const architecture = await readFile(resolve(root, "docs/architecture.md"), "utf8");
  const backlog = await readFile(resolve(root, "docs/mvp-backlog.md"), "utf8");

  assert.equal(packageJson.version, "1.0.0");
  assert.equal(packageJson.scripts["eval:live"], "node scripts/run-live-ai-scorecard.mjs");
  assert.match(releaseNotes, /Public hosting:.*Not approved/);
  assert.match(releaseNotes, /Git tag and GitHub release:.*Not created/);
  assert.match(changelog, /## \[1\.0\.0\] - 2026-07-27/);
  const runtime = liveScorecard.scorecard.find((row) => row.mode === "runtime");
  const deterministic = liveScorecard.scorecard.find((row) => row.mode === "deterministic");
  assert.equal(runtime?.cases, 4);
  assert.equal(runtime?.passed, 4);
  assert.equal(runtime?.passRate, 1);
  assert.equal(
    typeof runtime?.averageLatencyMs === "number" && runtime.averageLatencyMs > 0,
    true,
  );
  assert.equal(
    typeof runtime?.totalEstimatedCostUsd === "number"
      && runtime.totalEstimatedCostUsd > 0
      && runtime.totalEstimatedCostUsd < 0.1,
    true,
  );
  assert.equal(deterministic?.passed, 4);
  assert.equal(deterministic?.totalEstimatedCostUsd, 0);
  assert.equal(
    liveScorecard.scenarios.every((scenario) => (
      scenario.runtime.mode === "ai"
      && scenario.runtime.validationStatus === "passed"
      && scenario.runtime.fallbackReasonCode === null
    )),
    true,
  );
  for (const [name, content] of [
    ["product brief", productBrief],
    ["architecture", architecture],
    ["backlog", backlog],
  ]) {
    assert.doesNotMatch(content, /Market Bias Lab/, `${name} contains stale Market Bias Lab positioning`);
  }
});

test("research and static flow are reviewable without fabricated findings or screenshots", async () => {
  const research = await readFile(resolve(root, "docs/usability-research.md"), "utf8");
  const flow = await readFile(resolve(root, "docs/figma-flow.md"), "utf8");
  const launch = await readFile(resolve(root, "docs/repository-launch-checklist.md"), "utf8");

  assert.match(research, /\[NEEDS INPUT\].*Sessions have not been completed/);
  assert.match(research, /Owner review feedback to shipped outcome/);
  assert.match(flow, /flowchart TD/);
  assert.match(flow, /not presented as a Figma screenshot/);
  assert.match(launch, /\[NEEDS INPUT\].*Record a 60 to 90 second product demo/);
});
