import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateForecast,
  calculateProbabilities,
  DEFAULT_CONTROLS,
  advanceRatingsSeason,
  eloWinProbability,
  moneylineToImplied,
  removeVig,
} from "../lib/forecast.mjs";

const game = {
  opponent: "NYG",
  opponentName: "New York Giants",
  venue: "away",
  cowboysMoneyline: -135,
  opponentMoneyline: 114,
};

test("converts American moneylines and removes vig", () => {
  assert.equal(Number(moneylineToImplied(-135).toFixed(3)), 0.574);
  assert.equal(Number(moneylineToImplied(114).toFixed(3)), 0.467);
  assert.equal(Number(removeVig(-135, 114).toFixed(3)), 0.551);
});

test("returns bounded football and market probabilities", () => {
  const forecast = calculateForecast({
    game,
    ratings: { DAL: 1457.3, NYG: 1360.4 },
    controls: { quarterback: 100, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 },
  });

  assert.equal(forecast.probability > 0 && forecast.probability < 1, true);
  assert.equal(forecast.footballOnly > 0 && forecast.footballOnly < 1, true);
  assert.equal(forecast.marketImplied > 0 && forecast.marketImplied < 1, true);
  assert.equal(forecast.confidenceLow < forecast.probability, true);
  assert.equal(forecast.confidenceHigh > forecast.probability, true);
});

test("uses the per-book consensus probability when the trusted adapter supplies one", () => {
  const forecast = calculateForecast({
    game: {
      ...game,
      marketImpliedProbability: 0.61,
      sportsbookCount: 4,
    },
    ratings: { DAL: 1457.3, NYG: 1360.4 },
    controls: { quarterback: 100, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 },
  });

  assert.equal(forecast.marketImplied, 0.61);
  assert.match(forecast.drivers.find((driver) => driver.label === "Market blend contribution")?.evidence ?? "", /Median of 4 independently vig-adjusted sportsbook probabilities/);
});

test("quarterback participation materially changes the scenario", () => {
  const healthy = calculateForecast({
    game,
    ratings: { DAL: 1457.3, NYG: 1360.4 },
    controls: { quarterback: 100, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 },
  });
  const unavailable = calculateForecast({
    game,
    ratings: { DAL: 1457.3, NYG: 1360.4 },
    controls: { quarterback: 0, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 },
  });

  assert.equal(unavailable.footballOnly < healthy.footballOnly, true);
  assert.equal(unavailable.probability < healthy.probability, true);
});

test("Cowboys skill players and the opponent leader change the scenario in the expected direction", () => {
  const baseline = calculateForecast({
    game: { ...game, opponentStarName: "Opponent leader" },
    ratings: { DAL: 1457.3, NYG: 1360.4 },
    controls: { quarterback: 100, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 100 },
  });
  const cowboysReduced = calculateForecast({
    game: { ...game, opponentStarName: "Opponent leader" },
    ratings: { DAL: 1457.3, NYG: 1360.4 },
    controls: { quarterback: 100, lamb: 100, pickens: 0, williams: 0, defense: 100, opponentStar: 100 },
  });
  const opponentReduced = calculateForecast({
    game: { ...game, opponentStarName: "Opponent leader" },
    ratings: { DAL: 1457.3, NYG: 1360.4 },
    controls: { quarterback: 100, lamb: 100, pickens: 100, williams: 100, defense: 100, opponentStar: 0 },
  });

  assert.equal(cowboysReduced.footballOnly < baseline.footballOnly, true);
  assert.equal(opponentReduced.footballOnly > baseline.footballOnly, true);
});


test("season advancement applies exactly one regression per season and never mutates input", () => {
  const ratings = { DAL: 1600, NYG: 1400 };
  assert.deepEqual(advanceRatingsSeason(ratings, 2025, 2026), { DAL: 1575, NYG: 1425 });
  assert.deepEqual(advanceRatingsSeason(ratings, 2026, 2026), ratings);
  assert.deepEqual(advanceRatingsSeason(ratings, 2024, 2026), { DAL: 1556.25, NYG: 1443.75 });
  assert.deepEqual(ratings, { DAL: 1600, NYG: 1400 });
  assert.throws(() => advanceRatingsSeason(ratings, 2026, 2025), /ordered integer seasons/);
});

test("neutral venues have no home advantage in the shared probability kernel", () => {
  assert.equal(eloWinProbability(1500, 1500, "neutral"), 0.5);
  assert.equal(calculateProbabilities({ footballBaseline: eloWinProbability(1500, 1500, "neutral") }).probability, 0.5);
});

test("baseline comparison and additive impacts reconcile across markets, scenarios, and clamps", () => {
  for (const marketImpliedProbability of [null, 0.0001, 0.4, 0.9999]) {
    for (const ratings of [{ DAL: 1457, NYG: 1360 }, { DAL: 900, NYG: 2100 }, { DAL: 2100, NYG: 900 }]) {
      for (const controls of [DEFAULT_CONTROLS, { ...DEFAULT_CONTROLS, quarterback: 0 }, { ...DEFAULT_CONTROLS, quarterback: 0, lamb: 0, pickens: 0, williams: 0, defense: 0, opponentStar: 0 }]) {
        const currentGame = { ...game, marketImpliedProbability, cowboysMoneyline: null, opponentMoneyline: null };
        const baseline = calculateForecast({ game: currentGame, ratings, controls: DEFAULT_CONTROLS });
        const changed = calculateForecast({ game: currentGame, ratings, controls });
        assert.equal(changed.baselineProbability, baseline.probability);
        assert.equal(changed.scenarioDelta, changed.probability - baseline.probability);
        assert.ok(Math.abs(0.5 + changed.drivers.reduce((sum, driver) => sum + driver.impact, 0) / 100 - changed.probability) < 1e-12);
        assert.equal(changed.drivers.find((driver) => driver.label === "Scenario contribution").impact, changed.scenarioDelta * 100);
      }
    }
  }
});

test("quarterback driver reports the actual final blend effect, not the unweighted sensitivity", () => {
  const baseline = calculateForecast({ game, ratings: { DAL: 1457, NYG: 1360 }, controls: DEFAULT_CONTROLS });
  const changed = calculateForecast({ game, ratings: { DAL: 1457, NYG: 1360 }, controls: { ...DEFAULT_CONTROLS, quarterback: 0 } });
  assert.ok(Math.abs(changed.scenarioDelta * 100 + 3.6) < 1e-10);
  assert.equal(changed.baselineProbability, baseline.probability);
  assert.match(changed.uncertainty.join(" "), /hand-set sensitivity coefficients/);
  assert.match(changed.uncertainty.join(" "), /illustrative/);
});
