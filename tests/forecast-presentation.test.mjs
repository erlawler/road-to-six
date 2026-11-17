import assert from "node:assert/strict";
import test from "node:test";
import { explanationAvailability, marketAvailability } from "../lib/forecast-presentation.mjs";

test("AI is ready only after every existing verification gate passes", () => {
  for (const checking of [false, true]) for (const canExplore of [false, true]) {
    for (const current of [false, true]) for (const unverified of [false, true]) {
      const state = explanationAvailability({ checking, canExplore, current, unverified });
      assert.equal(state.reason === null, !checking && canExplore && current && !unverified);
      assert.equal(state.label === "Ready", state.reason === null);
    }
  }
});

test("unverified and stale football explain why AI is paused", () => {
  const input = { checking: false, canExplore: true, current: true, unverified: true };
  assert.match(explanationAvailability(input).reason, /could not be verified/);
  assert.match(explanationAvailability({ ...input, current: false, unverified: false }).reason, /dated snapshot/);
});

test("market status distinguishes unloaded, loading, failed, expired and quoted evidence", () => {
  const input = { requestState: "idle", paired: false, retrieved: false, snapshotPaired: false };
  assert.equal(marketAvailability(input).label, "Not loaded");
  assert.equal(marketAvailability({ ...input, requestState: "loading" }).label, "Loading");
  assert.equal(marketAvailability({ ...input, requestState: "error" }).label, "Unavailable");
  assert.equal(marketAvailability({ ...input, requestState: "expired" }).label, "Expired");
  assert.equal(marketAvailability({ ...input, snapshotPaired: true }).label, "Snapshot only");
  assert.equal(marketAvailability({ ...input, requestState: "loaded", retrieved: true }).label, "Unavailable");
  assert.equal(marketAvailability({ ...input, requestState: "loaded", retrieved: true, paired: true }).label, "Available");
  assert.equal(marketAvailability({ ...input, requestState: "loading", paired: true, retrieved: true }).label, "Loading");
});
