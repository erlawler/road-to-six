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
  assert.match(readme, /public\/og-market-bias\.jpg/);
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
    "docs/ai-evaluation.md",
    "docs/codex-collaboration.md",
    "docs/frontier-ai-architecture.md",
    "docs/linkedin-launch-kit.md",
    "docs/portfolio-case-study.md",
  ];

  for (const artifact of requiredArtifacts) {
    await assert.doesNotReject(access(resolve(root, artifact)), `Missing portfolio artifact: ${artifact}`);
  }

  const docs = (await readdir(resolve(root, "docs")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/${name}`);
  for (const relativePath of ["README.md", ...docs]) {
    const content = await readFile(resolve(root, relativePath), "utf8");
    assert.doesNotMatch(content, /[\u2013\u2014]/, `${relativePath} contains a prohibited dash character`);
  }
});
