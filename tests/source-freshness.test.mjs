import assert from "node:assert/strict";
import test from "node:test";
import { footballSnapshotFreshness } from "../lib/source-freshness.mjs";

const source = {
  metadataStatus: "verified",
  sourceUpdatedAt: "2026-10-05T06:00:00Z",
  retrievedBetween: { start: "2026-10-05T09:00:00Z", end: "2026-10-05T09:01:00Z" },
};
const snapshot = () => ({
  asOf: "2026-10-05",
  manifest: {
    validatedAt: "2026-10-05", validationStatus: "passed",
    inputs: { games: structuredClone(source), roster: structuredClone(source), stats: { sourceUpdatedAt: "2026-08-13T16:51:50Z" } },
  },
});
const at = (date) => Date.parse(date);

test("football review expires at the seven-day boundary independently of historical stats", () => {
  const data = snapshot();
  assert.equal(footballSnapshotFreshness(data, at("2026-10-05T18:00:00Z")).status, "current");
  assert.equal(footballSnapshotFreshness(data, at("2026-10-12T00:00:00Z")).status, "current");
  assert.equal(footballSnapshotFreshness(data, at("2026-10-12T00:00:00.001Z")).status, "stale");
});

test("changing the validation date cannot renew old source retrievals", () => {
  const data = snapshot();
  data.asOf = data.manifest.validatedAt = "2026-10-13";
  assert.equal(footballSnapshotFreshness(data, at("2026-10-13T18:00:00Z")).status, "stale");
});

test("future, malformed, partial, and missing review evidence never claim freshness", () => {
  for (const mutate of [
    (data) => { data.asOf = data.manifest.validatedAt = "2026-10-06"; },
    (data) => { data.asOf = data.manifest.validatedAt = "2026-02-30"; },
    (data) => { data.manifest.validationStatus = "partial"; },
    (data) => { delete data.manifest.inputs.roster; },
    (data) => { data.manifest.inputs.games.retrievedBetween.end = "2026-10-06T09:00:00Z"; },
    (data) => { data.manifest.inputs.games.sourceUpdatedAt = "2026-10-05T10:00:00Z"; },
  ]) {
    const data = snapshot();
    mutate(data);
    assert.equal(footballSnapshotFreshness(data, at("2026-10-05T18:00:00Z")).status, "unavailable");
  }
  assert.equal(footballSnapshotFreshness(null).status, "unavailable");
});
