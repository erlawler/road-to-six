# MVP Backlog: Market Bias Lab Expansion

**Implementation status:** PRIVATE PREVIEW COMPLETE. External-key validation, final data-rights approval, and publication remain open. Scores assume one sport, Cowboys-only views, daily or event-based refreshes, and no authentication.

## Prioritization rule

BETS uses Business impact, Effort, Tech debt, and Stakeholder urgency. Effort and Tech debt are inverse scores, so higher is better. Items scoring 12 or higher advance.

## P0: Data and licensing gate

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Real data makes the portfolio artifact credible. |
| Effort | 3 | Source review and vendor confirmation require focused work. |
| Tech debt | 5 | A license gate prevents unsupported feeds from entering the product. |
| Stakeholder urgency | 5 | All forecast work depends on an approved data boundary. |

**Total: 18 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort.

Acceptance criteria:

- [x] Complete initial data and licensing spike.
- [x] Confirm The Odds API free-tier quota, allowed user-facing analytical display, and refresh cadence.
- [x] Record attribution, freshness, retention, and redistribution rules per source.
- [x] Keep every paid sports-data feed out of the MVP.

## P0: Football and market data adapters

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Powers real players, games, lines, spreads, and totals. |
| Effort | 3 | Requires adapters, identifier joins, validation, and caching. |
| Tech debt | 4 | Adapter boundaries reduce vendor coupling. |
| Stakeholder urgency | 5 | Required for the approved showcase. |

**Total: 17 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort.

Acceptance criteria:

- [x] Load approved Cowboys roster, schedule, player, and team statistics.
- [x] Join every scheduled opponent's active 2026 roster to complete 2025 production and rank four weekly matchup leaders.
- [x] Load moneyline, spread, total, and source update times where available.
- [x] Limit refreshes and stored snapshots to the free source allowance.
- [x] Normalize event, team, and player identifiers with failure reporting.
- [x] Store a versioned attributed snapshot without committing raw vendor data.
- [x] Keep every vendor API key server-side.
- [ ] Validate the live free-odds call with an account key.

## P0: Probability forecast

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Converts evidence and scenarios into the primary user outcome. |
| Effort | 2 | Requires model design, leakage prevention, backtesting, and calibration. |
| Tech debt | 4 | A versioned function is testable and replaceable. |
| Stakeholder urgency | 5 | Central to the approved product direction. |

**Total: 16 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort.

Acceptance criteria:

- [x] Return football-only and market-aware win probabilities.
- [x] Use vig-adjusted moneyline as the market probability input and show spread, total, and line status as context.
- [x] Compare the result with vig-adjusted implied market probability.
- [x] Report confidence band, model version, data timestamp, Brier score, and calibration error.
- [x] Evaluate on a 2024 to 2025 holdout after the 2019 to 2023 development window.
- [x] Support named scenarios for Dak Prescott, CeeDee Lamb, George Pickens, Javonte Williams, the defensive core, and the selected opponent's top producer.

## P0: Runtime AI forecast explanation

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Demonstrates grounded runtime AI and technical product judgment. |
| Effort | 3 | Requires function calling, structured output, evaluation, and fallback behavior. |
| Tech debt | 3 | Adds vendor cost and nondeterministic failure modes. |
| Stakeholder urgency | 4 | Differentiates the portfolio after the probability function works. |

**Total: 15 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort and Tech debt.

Acceptance criteria:

- [x] Require the AI to call the versioned probability function.
- [x] Return the calculated probability unchanged.
- [x] Explain drivers, cited evidence, missing data, and uncertainty.
- [x] Reject betting recommendations, stake sizing, payout claims, and sportsbook links.
- [x] Set `store: false` and bound input and output tokens.
- [ ] Use a dedicated OpenAI project with a $10 monthly maximum.
- [x] Stop application AI at $9.50 per calendar month through a D1 ledger.
- [x] Fall back to a deterministic explanation when the AI call fails or the budget is exhausted.
- [ ] Validate the live Responses API function-call loop with an OpenAI project key.

## P0: Public market exploration

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Lets recruiters and fans experience the product immediately. |
| Effort | 4 | Anonymous read-only exploration avoids account workflows. |
| Tech debt | 5 | No identity store or authorization matrix is required. |
| Stakeholder urgency | 5 | Public access is essential to the portfolio goal. |

**Total: 19 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort.

Acceptance criteria:

- [x] No sign-in is required for any MVP scenario.
- [x] No personal information or betting behavior is collected.
- [x] Show lines, spreads, totals, and line status only with source and timestamp.
- [x] Show responsible-use language beside every market forecast.
- [x] Show a data-unavailable state instead of stale or fabricated values.

## P1: Market movement comparison

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 4 | Makes the forecast comparison analytically distinctive. |
| Effort | 3 | Requires consistent snapshots and backtesting. |
| Tech debt | 4 | Uses the same free odds adapter as the core forecast. |
| Stakeholder urgency | 4 | Strengthens the narrative after the core probability works. |

**Total: 15 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort. Improve it by using one daily market snapshot and one completed season where adequate free snapshots exist.

Acceptance criteria:

- [x] Compare football-only probability with market-aware probability.
- [x] Display spread, total, vig-adjusted implied probability, and line-status limitations.
- [ ] Test association with forecast error and closing-spread performance when the data supports it.
- [x] Do not infer Cowboys popularity or gambler sentiment without supporting evidence.
- [x] Show a limitation when historical line movement is unavailable under the free allowance.

## Superseded readiness prototype foundation

This section records the original local prototype that established the interaction and governance patterns. The finished Market Bias Lab now replaces its synthetic scenario interface with sourced game, player, and market evidence.

## P0: Readiness overview

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Communicates the portfolio value in the first viewport. |
| Effort | 4 | Used static prototype indicators and one responsive page. |
| Tech debt | 5 | Adds no persistence or external dependency. |
| Stakeholder urgency | 5 | Required for any usable demo. |

**Total: 19 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort. Keep the first viewport focused.

Acceptance criteria:

- [x] Explain the product in one sentence.
- [x] Show an illustrative readiness signal.
- [x] Label the prototype as unofficial and illustrative.
- [x] Provide a clear path into the scenario lab.

## P0: Scenario lab

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Demonstrates assumption management and product strategy. |
| Effort | 4 | Three local scenarios require limited state. |
| Tech debt | 5 | Scenarios remain declarative fixtures. |
| Stakeholder urgency | 4 | Differentiates the product from a static dashboard. |

**Total: 18 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort and Stakeholder urgency. Limit the MVP to three scenarios.

Acceptance criteria:

- [x] Offer balanced, offense-first, and defensive-depth scenarios.
- [x] Explain what each scenario emphasizes.
- [x] Update the readiness signal without reloading.

## P0: Transparent initiative scoring

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Makes prioritization logic visible and interactive. |
| Effort | 3 | Requires a scoring engine, controls, and tests. |
| Tech debt | 5 | Centralized deterministic logic is easy to maintain. |
| Stakeholder urgency | 5 | Core proof of technical product management skill. |

**Total: 18 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort. Keep BETS as the only MVP framework.

Acceptance criteria:

- [x] Display four 0 to 5 dimensions.
- [x] Recalculate the total immediately.
- [x] Apply the 12 out of 20 threshold.
- [x] Test ADVANCE and HOLD outcomes.

## P0: Release gate and decision brief

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Shows delivery governance and executive communication. |
| Effort | 3 | Requires dynamic state and concise content rules. |
| Tech debt | 4 | The gate remains local but needs future ownership. |
| Stakeholder urgency | 4 | Completes the end-to-end product story. |

**Total: 16 out of 20. Verdict: ADVANCE.** Weakest dimension: Effort. Use five clear gates and one brief format.

Acceptance criteria:

- [x] Show five release checks.
- [x] Let the visitor change gate state.
- [x] Reflect the selected scenario and initiative in the brief.
- [x] State the next action when a gate remains open.

## P1: Public portfolio operations

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 4 | Makes the build method and quality evidence inspectable. |
| Effort | 4 | Mostly documentation and automation configuration. |
| Tech debt | 5 | Codifies repeatable review expectations. |
| Stakeholder urgency | 4 | Needed before publication, not before local use. |

**Total: 17 out of 20. Verdict: ADVANCE.** Weakest dimension: Business impact and Stakeholder urgency. Complete after the interactive slice.

Acceptance criteria:

- [x] Add product brief, architecture, measurement, and decision documents.
- [x] Add repository-specific Codex instructions.
- [x] Add CI for lint, build, and tests.
- [x] Add a manual, read-only Codex review workflow.
- [ ] Complete final accessibility review before public publication.
- [ ] Complete final trademark and public content review before publication.

## P2: Deferred

- Saved scenario links
- Comparison history
- Product analytics instrumentation
- Public deployment
- Authentication and user profiles
- Wager placement or sportsbook integrations
- Bettor ticket percentages and money percentages
- Paid sports-data feeds and paid historical odds
