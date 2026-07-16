import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVANCE_THRESHOLD,
  calculateBetsScore,
  getBetsVerdict,
} from "../lib/bets.mjs";

test("calculates the BETS total", () => {
  assert.equal(
    calculateBetsScore({ business: 5, effort: 3, techDebt: 4, urgency: 5 }),
    17,
  );
});

test("applies the advance threshold", () => {
  assert.equal(ADVANCE_THRESHOLD, 12);
  assert.equal(getBetsVerdict(12), "ADVANCE");
  assert.equal(getBetsVerdict(11), "HOLD");
});
