export const MODEL_VERSION = "elo-market-v1.1.0";
export const FOOTBALL_WEIGHT_WITH_MARKET = 0.2;

export function clampProbability(value) {
  return Math.min(0.95, Math.max(0.05, value));
}

export function moneylineToImplied(moneyline) {
  if (!Number.isFinite(moneyline) || moneyline === 0) return null;
  return moneyline > 0
    ? 100 / (moneyline + 100)
    : -moneyline / (-moneyline + 100);
}

export function removeVig(cowboysMoneyline, opponentMoneyline) {
  const cowboysRaw = moneylineToImplied(cowboysMoneyline);
  const opponentRaw = moneylineToImplied(opponentMoneyline);
  if (cowboysRaw === null || opponentRaw === null) return null;
  return cowboysRaw / (cowboysRaw + opponentRaw);
}

export function eloWinProbability(cowboysElo, opponentElo, venue) {
  const venueAdjustment = venue === "home" ? 55 : venue === "away" ? -55 : 0;
  const difference = cowboysElo + venueAdjustment - opponentElo;
  return 1 / (1 + 10 ** (-difference / 400));
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

export function calculateForecast({ game, ratings, controls }) {
  const opponentElo = ratings[game.opponent] ?? 1500;
  const baseFootball = eloWinProbability(ratings.DAL ?? 1500, opponentElo, game.venue);
  const adjustment = availabilityAdjustment(controls);
  const footballOnly = clampProbability(baseFootball + adjustment);
  const marketImplied = removeVig(game.cowboysMoneyline, game.opponentMoneyline);
  const marketAware = marketImplied === null
    ? footballOnly
    : clampProbability(
        FOOTBALL_WEIGHT_WITH_MARKET * footballOnly
          + (1 - FOOTBALL_WEIGHT_WITH_MARKET) * marketImplied,
      );
  const confidenceWidth = marketImplied === null ? 0.11 : 0.08;

  const drivers = [
    {
      label: "Team strength baseline",
      impact: Math.round((baseFootball - 0.5) * 1000) / 10,
      evidence: `Walk-forward Elo ratings: DAL ${Math.round(ratings.DAL ?? 1500)}, ${game.opponent} ${Math.round(opponentElo)}.`,
    },
    {
      label: "Scenario availability",
      impact: Math.round(adjustment * 1000) / 10,
      evidence: `User assumptions: Dak Prescott ${controls.quarterback}%, CeeDee Lamb ${controls.lamb ?? controls.receiver ?? 100}%, George Pickens ${controls.pickens ?? 100}%, Javonte Williams ${controls.williams ?? 100}%, defensive core ${controls.defense}%, ${game.opponentStarName ?? "opponent production leader"} ${controls.opponentStar ?? 100}%.`,
    },
  ];

  if (marketImplied !== null) {
    drivers.push({
      label: "Market consensus",
      impact: Math.round((marketImplied - footballOnly) * 1000) / 10,
      evidence: `Vig-adjusted implied Cowboys probability from ${game.cowboysMoneyline} and ${game.opponentMoneyline} moneylines.`,
    });
  }

  return {
    probability: marketAware,
    footballOnly,
    marketImplied,
    confidenceLow: clampProbability(marketAware - confidenceWidth),
    confidenceHigh: clampProbability(marketAware + confidenceWidth),
    modelVersion: MODEL_VERSION,
    drivers,
    uncertainty: [
      "The model is a transparent portfolio baseline, not a production wagering model.",
      marketImplied === null
        ? "No current market price is available, so the market-aware result equals the football-only result."
        : "Opening or snapshot prices can change before kickoff.",
      "Player controls are user assumptions and are not medical or availability reports.",
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
