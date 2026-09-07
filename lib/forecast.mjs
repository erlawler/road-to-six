export const MODEL_VERSION = "elo-market-v1.2.0";
export const MODEL_PARAMETERS = Object.freeze({
  footballWeightWithMarket: 0.2,
  preseasonRetention: 0.75,
  homeFieldElo: 55,
  eloScale: 400,
  eloK: 18,
  maxMarginMultiplier: 2.2,
});
export const FOOTBALL_WEIGHT_WITH_MARKET = MODEL_PARAMETERS.footballWeightWithMarket;
export const DEFAULT_CONTROLS = Object.freeze({
  quarterback: 100, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100,
});

export function clampProbability(value) {
  return Math.min(0.95, Math.max(0.05, value));
}

export function moneylineToImplied(moneyline) {
  if (!Number.isFinite(moneyline) || moneyline === 0) return null;
  return moneyline > 0 ? 100 / (moneyline + 100) : -moneyline / (-moneyline + 100);
}

export function removeVig(cowboysMoneyline, opponentMoneyline) {
  const cowboysRaw = moneylineToImplied(cowboysMoneyline);
  const opponentRaw = moneylineToImplied(opponentMoneyline);
  if (cowboysRaw === null || opponentRaw === null) return null;
  return cowboysRaw / (cowboysRaw + opponentRaw);
}

function safeMarketProbability(value) {
  return Number.isFinite(value) && value > 0 && value < 1 ? value : null;
}

export function eloWinProbability(cowboysElo, opponentElo, venue) {
  const venueAdjustment = venue === "home" ? MODEL_PARAMETERS.homeFieldElo
    : venue === "away" ? -MODEL_PARAMETERS.homeFieldElo : 0;
  const difference = cowboysElo + venueAdjustment - opponentElo;
  return 1 / (1 + 10 ** (-difference / MODEL_PARAMETERS.eloScale));
}

export function advanceRatingsSeason(ratings, fromSeason, toSeason) {
  if (!Number.isInteger(fromSeason) || !Number.isInteger(toSeason) || toSeason < fromSeason) {
    throw new Error("Ratings require ordered integer seasons");
  }
  const retention = MODEL_PARAMETERS.preseasonRetention ** (toSeason - fromSeason);
  return Object.fromEntries(Object.entries(ratings).map(([team, rating]) => [team, 1500 + (rating - 1500) * retention]));
}

// Shared by production and chronological replay. Scenario coefficients are hand-set assumptions.
export function calculateProbabilities({ footballBaseline, scenarioAdjustment = 0, marketImplied = null }) {
  const baseFootball = clampProbability(footballBaseline);
  const footballOnly = clampProbability(footballBaseline + scenarioAdjustment);
  const market = safeMarketProbability(marketImplied);
  const blend = (football) => market === null ? football
    : clampProbability(FOOTBALL_WEIGHT_WITH_MARKET * football + (1 - FOOTBALL_WEIGHT_WITH_MARKET) * market);
  const baselineProbability = blend(baseFootball);
  const probability = blend(footballOnly);
  return { baseFootball, footballOnly, marketImplied: market, baselineProbability, probability, scenarioDelta: probability - baselineProbability };
}

function availabilityAdjustment(controls) {
  const quarterback = ((controls.quarterback ?? 100) - 100) * 0.0018;
  const lamb = ((controls.lamb ?? controls.receiver ?? 100) - 100) * 0.0006;
  const pickens = ((controls.pickens ?? 100) - 100) * 0.00045;
  const williams = ((controls.williams ?? 100) - 100) * 0.00035;
  const defense = ((controls.defense ?? 100) - 100) * 0.0007;
  const opponentStar = (100 - (controls.opponentStar ?? 100)) * 0.0008;
  return quarterback + lamb + pickens + williams + defense + opponentStar;
}

export function calculateForecast({ game, ratings, controls = DEFAULT_CONTROLS }) {
  const opponentElo = ratings[game.opponent] ?? 1500;
  const footballBaseline = eloWinProbability(ratings.DAL ?? 1500, opponentElo, game.venue);
  const adapterMarketProbability = safeMarketProbability(game.marketImpliedProbability);
  const marketImplied = adapterMarketProbability ?? removeVig(game.cowboysMoneyline, game.opponentMoneyline);
  const result = calculateProbabilities({ footballBaseline, scenarioAdjustment: availabilityAdjustment(controls), marketImplied });
  const confidenceWidth = marketImplied === null ? 0.11 : 0.08;

  // Ordered waterfall from 50%: football baseline, market blend, then the actual scenario delta.
  // Preserve full precision so contributions reconcile even when a probability clamp applies.
  const drivers = [{
    label: "Football baseline contribution",
    impact: (result.baseFootball - 0.5) * 100,
    evidence: `Walk-forward Elo ratings: DAL ${Math.round(ratings.DAL ?? 1500)}, ${game.opponent} ${Math.round(opponentElo)}. Contribution starts from 50%.`,
  }];
  if (marketImplied !== null) {
    const pairedSportsbookCount = Math.max(0, Math.floor(Number(game.sportsbookCount) || 0));
    drivers.push({
      label: "Market blend contribution",
      impact: (result.baselineProbability - result.baseFootball) * 100,
      evidence: `${adapterMarketProbability === null
        ? `Vig-adjusted implied Cowboys probability from ${game.cowboysMoneyline} and ${game.opponentMoneyline} moneylines.`
        : `Median of ${pairedSportsbookCount} independently vig-adjusted sportsbook probabilities.`} Effect of the 80% market blend on the unchanged-control baseline, including probability bounds.`,
    });
  }
  drivers.push({
    label: "Scenario contribution",
    impact: result.scenarioDelta * 100,
    evidence: `Hand-set sensitivity assumptions: Dak Prescott ${controls.quarterback ?? 100}%, CeeDee Lamb ${controls.lamb ?? controls.receiver ?? 100}%, George Pickens ${controls.pickens ?? 100}%, Javonte Williams ${controls.williams ?? 100}%, defensive core ${controls.defense ?? 100}%, ${game.opponentStarName ?? "opponent production leader"} ${controls.opponentStar ?? 100}%. Final probability change with market evidence held fixed.`,
  });

  return {
    probability: result.probability,
    baselineProbability: result.baselineProbability,
    scenarioDelta: result.scenarioDelta,
    footballOnly: result.footballOnly,
    marketImplied,
    confidenceLow: clampProbability(result.probability - confidenceWidth),
    confidenceHigh: clampProbability(result.probability + confidenceWidth),
    modelVersion: MODEL_VERSION,
    drivers,
    uncertainty: [
      "The model is a transparent showcase baseline, not a production wagering model. The displayed uncertainty band is illustrative, not an empirically calibrated confidence interval.",
      marketImplied === null
        ? "No current market price is available, so the market-aware result equals the football-only result."
        : "Opening or snapshot prices can change before kickoff.",
      "Player controls use hand-set sensitivity coefficients, not measured causal effects or medical or availability reports. Player statistics provide context and do not determine those coefficients.",
    ],
  };
}

export function deterministicExplanation({ forecast, game }) {
  const probability = Math.round(forecast.probability * 100);
  const marketComparison = forecast.marketImplied === null
    ? "No market probability is available for comparison."
    : `The vig-adjusted market probability is ${Math.round(forecast.marketImplied * 100)}%.`;
  return {
    mode: "deterministic",
    summary: `The model assigns Dallas a ${probability}% win probability against ${game.opponentName}. ${marketComparison}`,
    drivers: forecast.drivers,
    uncertainty: forecast.uncertainty,
    disclaimer: "Educational analytics only. This product does not recommend a bet or stake.",
  };
}
