import assert from "node:assert/strict";
import test from "node:test";
import { buildComparisonEvidence, defaultComparisonSelection, selectComparisonEvidence, validateComparisonSelection } from "../lib/scenario-comparison.mjs";

const controls = { quarterback: 50, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 };
const forecast = { probability: 0.532, baselineProbability: 0.55, scenarioDelta: -0.018, marketImplied: 0.56 };
const evidence = buildComparisonEvidence({ forecast, controls });

test("comparison explains the final delta and includes only changed controls", () => {
  assert.match(evidence[0].text, /55\.0% to 53\.2%, a -1\.8 percentage-point change/);
  assert.ok(evidence.some(({ id }) => id === "control_quarterback"));
  assert.ok(!evidence.some(({ id }) => id === "control_lamb"));
  assert.match(evidence.find(({ id }) => id === "market_weight").text, /20% weight/);
  assert.equal(validateComparisonSelection(defaultComparisonSelection(evidence), evidence), true);
});

test("selection fails closed on missing, duplicate, invented, irrelevant and excessive citations", () => {
  for (const ids of [undefined, [], ["market_weight"], ["baseline_change", "baseline_change"], ["baseline_change", "control_lamb"], ["baseline_change", "recommend_bet"], evidence.map(({ id }) => id)]) {
    assert.equal(validateComparisonSelection(ids, evidence), false);
    assert.throws(() => selectComparisonEvidence(ids, evidence));
  }
});

test("AI can select and order grounded context without altering any text", () => {
  const ids = ["baseline_change", "sensitivity_limits", "control_quarterback"];
  assert.deepEqual(selectComparisonEvidence(ids, evidence), ids.map((id) => evidence.find((item) => item.id === id)));
  const footballOnly = buildComparisonEvidence({ forecast: { ...forecast, marketImplied: null }, controls });
  assert.ok(footballOnly.some(({ id }) => id === "football_only"));
  assert.ok(!footballOnly.some(({ id }) => id === "market_weight"));
});
