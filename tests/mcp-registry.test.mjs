import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MCP_RATE_LIMIT } from "../lib/mcp-usage.mjs";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../lib/mcp-protocol.mjs";
import { MCP_SERVER_INFO, PUBLIC_TOOL_NAMES } from "../lib/mcp-tools.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const listing = JSON.parse(await read("../server.json"));
const workflow = await read("../.github/workflows/publish-mcp-registry.yml");
const guide = await read("../docs/mcp-connect.md");
const endpoint = `${MCP_SERVER_INFO.websiteUrl}api/mcp`;

test("the registry listing matches the server the code implements", () => {
  assert.equal(listing.name, "io.github.erlawler/road-to-six");
  assert.match(listing.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  assert.equal(listing.version, MCP_SERVER_INFO.version);
  assert.equal(listing.title, MCP_SERVER_INFO.title);
  assert.equal(listing.websiteUrl, MCP_SERVER_INFO.websiteUrl);
  assert.ok(listing.description.length <= 100, `description is ${listing.description.length} characters`);
  assert.match(listing.description, /Unofficial/);
  assert.deepEqual(listing.remotes, [{ type: "streamable-http", url: endpoint }]);
  assert.deepEqual(listing.repository, { url: "https://github.com/erlawler/road-to-six", source: "github" });
  assert.equal(listing.packages, undefined);
});

test("publishing is manual, gated, keyless and built only from pinned actions", () => {
  const triggers = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
  assert.match(triggers, /workflow_dispatch:/);
  for (const automatic of ["push:", "pull_request", "schedule:", "release:", "workflow_run"]) assert.ok(!triggers.includes(automatic), automatic);
  assert.ok(workflow.includes("inputs.confirm == 'publish' && github.ref == 'refs/heads/main'"));

  const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.equal(uses.length, 3);
  for (const action of uses) assert.match(action, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, action);
  assert.ok(workflow.includes("persist-credentials: false"));
  assert.ok(!workflow.includes("secrets."));
  assert.deepEqual([...workflow.matchAll(/^\s+([\w-]+): (read|write)\b/gm)].map((match) => `${match[1]}:${match[2]}`).sort(),
    ["contents:read", "contents:read", "id-token:write"]);

  // The live endpoint check and the publisher signature check both run before anything is published.
  const order = ["scripts/mcp-registry-preflight.mjs", "cosign verify-blob", "./mcp-publisher validate", "./mcp-publisher login github-oidc", "./mcp-publisher publish"].map((step) => workflow.indexOf(step));
  assert.ok(order.every((index) => index > -1));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(workflow, /MCP_PUBLISHER_VERSION: v\d+\.\d+\.\d+/);
  assert.ok(!workflow.includes("releases/latest"));
});

test("the connect guide states the same address, tools, versions and limits as the code", () => {
  assert.ok(guide.includes(`\`${endpoint}\``));
  for (const name of PUBLIC_TOOL_NAMES) assert.ok(guide.includes(`\`${name}\``), name);
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) assert.ok(guide.includes(version), version);
  assert.ok(guide.includes(`${MCP_RATE_LIMIT.maxRequests} tool calls per five minutes`));
  assert.equal(MCP_RATE_LIMIT.windowMs, 5 * 60_000);
  assert.ok(guide.includes("not affiliated with the Dallas Cowboys or the NFL"));
  assert.match(guide, /\*\*Status, [A-Z][a-z]+ \d{1,2}, \d{4}:\*\*/);
  assert.ok(!/[–—]/.test(guide + JSON.stringify(listing) + workflow));
});
