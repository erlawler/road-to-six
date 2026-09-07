const CONTROL_LABELS = Object.freeze({
  quarterback: "Dallas quarterback",
  lamb: "CeeDee Lamb",
  pickens: "George Pickens",
  williams: "Javonte Williams",
  defense: "Dallas defensive core",
  opponentStar: "Opponent production leader",
});

export function buildComparisonEvidence({ forecast, controls }) {
  const delta = forecast.scenarioDelta * 100;
  const evidence = [{
    id: "baseline_change",
    text: `Compared with all controls at 100%, Dallas moves from ${(forecast.baselineProbability * 100).toFixed(1)}% to ${(forecast.probability * 100).toFixed(1)}%, a ${delta > 0 ? "+" : ""}${delta.toFixed(1)} percentage-point change using the same market evidence.`,
  }];
  for (const [key, label] of Object.entries(CONTROL_LABELS)) {
    if (controls[key] !== 100) {
      evidence.push({
        id: `control_${key}`,
        text: `${label} participation is set to ${controls[key]}% instead of the 100% baseline. This is your scenario assumption, not a reported player condition.`,
      });
    }
  }
  evidence.push(forecast.marketImplied === null ? {
    id: "football_only",
    text: "No usable paired market probability is applied. The result uses the football component and scenario assumptions only.",
  } : {
    id: "market_weight",
    text: "The market component stays fixed in this comparison. The football component has a 20% weight, so participation changes have a smaller effect on the blended result. Probability limits can further reduce the effect.",
  });
  evidence.push({
    id: "sensitivity_limits",
    text: "Participation effects are hand-set sensitivity assumptions. They are not fitted estimates of a player's causal effect, and the displayed band is illustrative.",
  });
  return evidence;
}

export function defaultComparisonSelection(evidence) {
  return evidence.slice(0, 3).map(({ id }) => id);
}

export function validateComparisonSelection(ids, evidence) {
  return Array.isArray(ids)
    && ids.length >= 1
    && ids.length <= 3
    && ids.includes("baseline_change")
    && new Set(ids).size === ids.length
    && ids.every((id) => typeof id === "string" && evidence.some((item) => item.id === id));
}

export function selectComparisonEvidence(ids, evidence) {
  if (!validateComparisonSelection(ids, evidence)) {
    throw new Error("Comparison selection must cite one to three distinct available evidence IDs including baseline_change");
  }
  return ids.map((id) => evidence.find((item) => item.id === id));
}
