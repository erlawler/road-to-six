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
  assert.match(readme, /Twenty product, architecture, and release-governance decisions/);
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
    "docs/demo-media.md",
    "docs/dependabot-review-2026-07-30.md",
    "docs/figma-flow.md",
    "docs/frontier-ai-architecture.md",
    "docs/linkedin-launch-kit.md",
    "docs/live-ai-scorecard.md",
    "docs/portfolio-case-study.md",
    "docs/repository-launch-checklist.md",
    "docs/synthetic-persona-sessions.md",
    "docs/usability-research.md",
    "docs/usability-session-kit.md",
    "evals/live/2026-07-27-gpt-5.6-luna.json",
    "docs/media/01-owner-preview-hero.png",
    "docs/media/02-runtime-ai-receipt.png",
    "docs/media/03-weekly-opponent-evidence.png",
    "docs/media/04-model-audit.png",
    "docs/media/05-product-governance.png",
    "docs/media/road-to-six-demo.webp",
    "public/og-market-context.png",
    "public/og-market-context.jpg",
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
  assert.match(releaseNotes, /Public hosting:.*Published/);
  assert.match(releaseNotes, /Git tag and GitHub release:.*(?:Authorized|Created)/);
  assert.match(changelog, /## \[1\.0\.0\] - 2026-07-29/);
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
  for (const [name, content] of [
    ["release notes", releaseNotes],
    ["product brief", productBrief],
    ["architecture", architecture],
    ["backlog", backlog],
  ]) {
    assert.doesNotMatch(
      content,
      /(?:public hosting|public access).*(?:blocked|pending)/i,
      `${name} contains stale public launch status`,
    );
  }
});

test("GitHub completion evidence records security controls and dependency review", async () => {
  const launch = await readFile(resolve(root, "docs/repository-launch-checklist.md"), "utf8");
  const dependabotReview = await readFile(
    resolve(root, "docs/dependabot-review-2026-07-30.md"),
    "utf8",
  );

  assert.match(launch, /\[x\] Pin the repository on Eric Lawler's GitHub profile/);
  assert.match(launch, /\[x\] Enable Dependabot alerts and Dependabot security updates/);
  assert.match(launch, /\[x\] Enable secret scanning and push protection/);
  assert.match(launch, /\[x\] Review the first seven Dependabot pull requests without merging/);
  assert.match(dependabotReview, /No dependency pull request was merged, closed, or modified/);
  assert.match(dependabotReview, /Open Dependabot vulnerability alerts \| 0/);
  assert.match(dependabotReview, /Open secret-scanning alerts \| 0/);
  assert.match(dependabotReview, /TypeScript 5\.9\.3 to 7\.0\.2/);
  assert.match(dependabotReview, /Defer until the lint toolchain supports TypeScript 7/);
});

test("AI persona validation is complete without claiming human research", async () => {
  const research = await readFile(resolve(root, "docs/usability-research.md"), "utf8");
  const simulations = await readFile(resolve(root, "docs/synthetic-persona-sessions.md"), "utf8");
  const sessionKit = await readFile(resolve(root, "docs/usability-session-kit.md"), "utf8");
  const flow = await readFile(resolve(root, "docs/figma-flow.md"), "utf8");
  const launch = await readFile(resolve(root, "docs/repository-launch-checklist.md"), "utf8");

  assert.match(research, /Portfolio evidence gate:\*\* COMPLETE/);
  assert.match(research, /No human usability testing has been conducted or claimed/);
  assert.match(research, /Moderated human research may be pursued later, but it is not required/);
  assert.match(research, /do not support claims of human usability testing/);
  assert.match(research, /Owner review feedback to shipped outcome/);
  assert.match(simulations, /SYNTHETIC PERSONA SIMULATION\. NOT HUMAN RESEARCH\./);
  assert.match(simulations, /Portfolio gate status:\*\* COMPLETE/);
  assert.match(simulations, /Human testing:\*\* Not conducted or claimed/);
  assert.match(simulations, /52 of 60/);
  assert.match(simulations, /do not represent observed participant behavior/);
  assert.match(sessionKit, /OPTIONAL FUTURE WORK/);
  assert.match(sessionKit, /Five real moderated sessions/);
  assert.match(sessionKit, /Notes consent: yes or no/);
  assert.match(sessionKit, /Runtime AI calculates or changes the probability/);
  assert.match(sessionKit, /Raw recordings, names, contact information, and identifiable notes must not be committed/);
  assert.match(flow, /flowchart TD/);
  assert.match(flow, /not presented as a Figma screenshot/);
  assert.match(launch, /20-second animated hosted walkthrough/);
  assert.match(launch, /\[NEEDS INPUT\].*optional 60 to 90 second narrated LinkedIn walkthrough/);
  assert.doesNotMatch(research, /\[NEEDS INPUT\].*(human|moderated|participant)/i);
  assert.doesNotMatch(launch, /\[NEEDS INPUT\].*(human|moderated|usability session)/i);
});
