# Model card: elo-market-v1.2.0

**Status:** Local release candidate. This model version has not been deployed by the flagship improvement work. **Owner:** Eric Lawler. **Purpose:** educational, inspectable scenario analysis for an unofficial fan showcase.

## What the model calculates

The shared implementation is [forecast.mjs](../lib/forecast.mjs). Elo team strength starts at 1500, uses a 400-point logistic scale, gives 55 Elo points to the home venue and zero to a neutral venue, and updates after each completed regular-season game. The update uses K=18 and a log score-margin multiplier capped at 2.2. Ratings retain 75% of their distance from 1500 between seasons. The builder explicitly advances ratings to the forecast season once, even before that season's first completed game.

Football-only probability adds six hand-set scenario sensitivities to the Elo baseline and bounds the result to 5% to 95%. Reducing participation by 100 percentage points changes the unconstrained football estimate by -18 points for quarterback, -6 for Lamb, -4.5 for Pickens, -3.5 for Williams, and -7 for the defensive core; reducing the opponent leader adds 8 points. These coefficients are product assumptions, not estimated causal effects, validated availability forecasts, or medical reports. Player production statistics provide context and leader selection; they do not determine the coefficients.

When a valid market probability is available, the final result is 20% football and 80% market, bounded to 5% to 95%. Without a valid market, it equals football-only. The adapter's median of independently de-vigged paired sportsbook probabilities is preferred. Spread and total remain evidence, without being counted again in the probability.

## Explanation arithmetic

`baselineProbability` uses the same game, ratings, venue, and market with all controls at 100. `scenarioDelta` is the current final probability minus that baseline. It is a signed difference in probability units; multiply by 100 for percentage points.

Drivers form an ordered waterfall from 50%:

1. **Football baseline contribution:** clamped football baseline minus 50%.
2. **Market blend contribution:** unchanged-control blended baseline minus football baseline, if a market exists.
3. **Scenario contribution:** final probability minus unchanged-control blended baseline.

Driver impacts are percentage points. Their sum plus 50% equals the final result, including when probability bounds apply. The UI rounds for display; the API and evaluator preserve full precision. A -18-point football sensitivity becomes -3.6 final points when a market is present and no clamp intervenes.

The displayed band is illustrative: plus or minus 8 percentage points with a market, or 11 without, bounded to 5% to 95%. It is not an empirically calibrated confidence interval and has no coverage guarantee.

## Evaluation and limits

The [snapshot builder](../scripts/build-nfl-snapshot.mjs) uses the same Elo and probability functions as production. Chronological rating warm-up begins in 1999; the documented model-development window is 2019 to 2023. The reported retrospective holdout is 2024 to 2025, with 544 completed regular-season games and 544 eligible market pairs. Elo predictions are calculated before each outcome updates ratings. Games later than the artifact validation date are excluded. Ties receive an outcome score of 0.5, consistent with Elo scoring, rather than being treated as a binary win.

| Retrospective metric | Value |
|---|---:|
| Football-only Brier | 0.220 |
| Market-aware Brier | 0.207 |
| Market-only Brier | 0.206 |
| Weighted 10-bin calibration error | 0.063 |

Lower Brier is better. The blend does not beat the market benchmark. Exact predictions, inputs to the shared scorer, and outcomes are in [model-evaluation.json](../app/data/model-evaluation.json); calibration bins with sample sizes are in [nfl-snapshot.json](../app/data/nfl-snapshot.json). Sparse bins, including a one-game upper bin, cannot establish stable calibration. No confidence interval or significance claim is made for these metrics.

Historical market CSV rows do not include independently archived quote timestamps. This is a retrospective historical-price benchmark, not proof of performance at a fixed pregame lead time. The evaluation uses default scenario controls and does not validate the hand-set intervention magnitudes. Live odds consensus and historical moneyline sources also differ. A prospective, timestamped 2026 evaluation is a proposed next experiment, not an implemented or observed result.

## Version changes and gates

Version 1.2.0 fixes forecast-season regression, aligns neutral-venue replay with production, and makes displayed contributions reconcile. Correct neutral handling slightly worsens unrounded Brier values while leaving the three-decimal display unchanged; the change is for model integrity, not a claim of improved predictive accuracy. The refreshed roster also changes some opponent leaders.

Run `node scripts/validate-nfl-snapshot.mjs` for the checked-in artifact gate. The test suite additionally covers every saved holdout row through the production scorer, season transitions, neutral venues, driver reconciliation, source checksums, temporal filtering, and roster joins. Passing these checks demonstrates consistency and reproducibility, not future forecasting skill.

NFL/nflverse source and license limitations remain documented in [data-provenance.md](data-provenance.md) and [data-licensing-spike.md](data-licensing-spike.md). No model output is a pick, stake recommendation, payout claim, or personalized betting advice.
