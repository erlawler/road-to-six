import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateForecast,
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
