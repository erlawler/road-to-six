import { calculateForecast, DEFAULT_CONTROLS } from "./forecast.mjs";
import { getCurrentMatchup } from "./source-health.mjs";

// Football-only forecast evidence for agent clients.
//
// The site blends this football estimate with licensed market prices. The MCP
// tool deliberately does not: the market data license covers display inside
// the analytical interface, not redistribution as a standalone feed (see
// NOTICE.md and docs/data-licensing-spike.md). This module therefore never
// reads moneylines, spreads, totals or the odds cache.

export const FORECAST_TOOL_SCHEMA_VERSION = "football-forecast-v1";
export const FORECAST_CONTROL_KEYS = Object.freeze(["quarterback", "lamb", "pickens", "williams", "defense", "opponentStar"]);
export const MODEL_CARD_URL = "https://github.com/erlawler/road-to-six/blob/main/docs/model-card.md";

// The shared driver text describes the site's blended view. This tool has no
// market input, so the clause is restated for the football-only estimate.
const BLENDED_VIEW_CLAUSE = " Final probability change with market evidence held fixed.";
const FOOTBALL_ONLY_CLAUSE = " Final change in the football-only estimate.";

const round = (value, digits) => Number(value.toFixed(digits));
const percent = (probability) => round(probability * 100, 1);
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function evaluationContext(backtest) {
  if (!backtest || !finite(backtest.footballOnlyBrier) || !finite(backtest.marketBaselineBrier)) return null;
  return {
    holdout: String(backtest.seasons ?? "unspecified"),
    games: Number.isInteger(backtest.games) ? backtest.games : null,
    footballOnlyBrier: backtest.footballOnlyBrier,
    marketBaselineBrier: backtest.marketBaselineBrier,
    note: backtest.footballOnlyBrier > backtest.marketBaselineBrier
      ? "Retrospective holdout; lower Brier is better. The football-only baseline was less accurate than market prices. Treat it as a transparent teaching model, not a predictive edge."
      : "Retrospective holdout; lower Brier is better. No future forecasting skill is claimed.",
  };
}

function unavailable(reasons, matchup) {
  return {
    schemaVersion: FORECAST_TOOL_SCHEMA_VERSION, status: "unavailable", reasons, scope: "football_only",
    marketPricesIncluded: false, matchup, forecast: null, ratings: null, evaluation: null, modelCardUrl: MODEL_CARD_URL,
  };
}

/**
 * @param {{ snapshot: Record<string, any>, update: { status: string }, freshness: { status: string } }} state
 * @param {Partial<Record<string, number>>} [scenario] Availability percentages, 0 to 100. Missing keys stay at 100.
 * @param {number} [now]
 */
export function getFootballForecast(state, scenario = {}, now = Date.now()) {
  const { snapshot } = state;
  const current = getCurrentMatchup(state, now);
  if (current.status !== "verified" || !current.game) {
    return unavailable([current.reason ?? "A verified current-week matchup is unavailable."], null);
  }
  const game = snapshot.schedule.find((item) => item.id === current.game.id);
  const dallas = snapshot.ratings?.DAL, opponent = snapshot.ratings?.[current.game.opponent];
  const matchup = {
    season: current.season, week: current.week, opponent: current.game.opponent,
    opponentName: current.game.opponentName, kickoffAt: current.game.kickoffAt, venue: current.game.venue,
  };
  if (!game || !finite(dallas) || !finite(opponent)) {
    return unavailable(["Verified team ratings are unavailable for this matchup."], matchup);
  }

  const controls = { ...DEFAULT_CONTROLS };
  for (const key of FORECAST_CONTROL_KEYS) if (finite(scenario?.[key])) controls[key] = scenario[key];

  // Market fields are removed before the shared probability function runs.
  const forecast = calculateForecast({
    game: {
      opponent: game.opponent, venue: game.venue,
      opponentStarName: snapshot.opponents?.[game.opponent]?.leaders?.[0]?.name,
      marketImpliedProbability: null, cowboysMoneyline: undefined, opponentMoneyline: undefined, sportsbookCount: 0,
    },
    ratings: snapshot.ratings, controls,
  });

  return {
    schemaVersion: FORECAST_TOOL_SCHEMA_VERSION, status: "available", reasons: [], scope: "football_only",
    marketPricesIncluded: false, matchup,
    forecast: {
      cowboysWinProbability: round(forecast.probability, 4),
      cowboysWinPercent: percent(forecast.probability),
      baselinePercent: percent(forecast.baselineProbability),
      scenarioDeltaPoints: round(forecast.scenarioDelta * 100, 1),
      illustrativeBandPercent: { low: percent(forecast.confidenceLow), high: percent(forecast.confidenceHigh) },
      scenarioApplied: FORECAST_CONTROL_KEYS.some((key) => controls[key] !== DEFAULT_CONTROLS[key]),
      controls,
      drivers: forecast.drivers.map((driver) => ({
        label: driver.label, impactPoints: round(driver.impact, 1),
        evidence: driver.evidence.replace(BLENDED_VIEW_CLAUSE, FOOTBALL_ONLY_CLAUSE),
      })),
      modelVersion: forecast.modelVersion,
      uncertainty: [
        "Football-only estimate. Betting-market prices are excluded from this tool by design; the Road to Six site shows the market-aware view.",
        ...forecast.uncertainty.filter((statement) => !/market/i.test(statement)),
      ],
    },
    ratings: {
      dallas: Math.round(dallas), opponent: Math.round(opponent),
      trainedThrough: snapshot.ratingsMetadata?.trainedThrough ?? null,
    },
    evaluation: evaluationContext(snapshot.backtest),
    modelCardUrl: MODEL_CARD_URL,
  };
}
