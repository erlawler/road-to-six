# Product Brief: Road to Six Market Bias Lab

**Status:** IMPLEMENTED LOCALLY  
**Owner:** Eric Lawler  
**Product type:** Public technical product management portfolio prototype  
**Audience:** Hiring managers, technical product leaders, football fans, and product peers

## One-line answer

Road to Six is an unofficial Dallas Cowboys forecasting and market-bias lab that combines real football evidence, free betting-line data, and transparent scenario analysis.

## Why this product

Football and betting conversations often jump from a result to a confident prediction without showing the evidence, assumptions, uncertainty, or market context. Road to Six turns that ambiguity into a product workflow:

1. Select a Dallas Cowboys game and relevant Cowboys and opponent player signals.
2. Review sourced football evidence, including the opponent's top four production leaders, with freshness timestamps.
3. Review consensus moneyline, spreads, totals, and available line movement.
4. Review line movement and the vig-adjusted implied market probability.
5. Change scenario assumptions and calculate football-only and market-aware probabilities.
6. Use cost-capped runtime AI to explain the probability, forecast drivers, evidence, and uncertainty.

The product name is grounded in the Dallas Cowboys' five Super Bowl championships and the goal of a sixth. Historical references are supported by the [Dallas Cowboys](https://www.dallascowboys.com/news/super-powers-what-the-cowboys-can-take-from-the-1992-team) and [Pro Football Hall of Fame](https://www.profootballhof.com/teams/dallas-cowboys).

## User and job to be done

**Primary user:** A hiring manager or technical product leader evaluating product judgment.

**Secondary user:** A football fan who wants to explore how different assumptions affect priorities.

**Job to be done:** When I question a Cowboys forecast or market narrative, help me inspect the football evidence, lines, spreads, market movement, and assumptions so I can understand the probability and uncertainty without receiving betting advice.

## Product principles

- **Evidence before prediction:** A forecast is not shown without source, timestamp, and model version.
- **Evidence before confidence:** Every initiative names its supporting evidence and data status.
- **Assumptions are controls:** Users can change inputs and immediately see the effect.
- **AI calculates through trusted tools:** Runtime AI calls a versioned probability function and returns the calculated result unchanged.
- **AI explains, people decide:** AI explains drivers, evidence, and uncertainty without recommending a bet.
- **Governance is product work:** Accessibility, privacy, security, and trademark review are release criteria.

## MVP scope

- Public, anonymous, responsive web experience
- Real Dallas Cowboys players, rosters, schedules, and game statistics from approved sources
- Current or versioned moneyline, spreads, totals, and line-status context
- Football-only and market-aware win probabilities
- Scenario controls for five Cowboys signals and the selected opponent's top 2025 PPR producer
- Four opponent production cards that update with the selected weekly matchup
- Runtime AI explanation with structured drivers, evidence, and uncertainty
- Model version, data freshness, source attribution, calibration, and responsible-use notice
- Public product, architecture, backlog, measurement, and decision artifacts

## Non-goals

- Personalized betting advice, picks, stake sizing, or expected-payout recommendations
- Sportsbook affiliate links or wager placement
- Live in-game wagering or automated line trading
- Player medical, contract, private, or nonpublic information
- Official team analysis or endorsement
- User accounts, saved scenarios, or gated exploration
- Bettor ticket percentages, money percentages, and paid sports-data feeds
- Unlicensed logos, headshots, player likenesses, or scraped NFL.com content

## Success measures

| Metric | MVP target | Why it matters |
|---|---:|---|
| Scenario start rate | 70% | Tests whether the value proposition is clear. |
| Forecast completion | 60% | Measures end-to-end scenario completion. |
| Evidence traceability | 100% | Protects forecast integrity. |
| Probability tool fidelity | 100% | AI output must match the versioned probability function. |
| Forecast calibration | Reported for every model release | Makes forecast quality observable. |
| Data freshness labeling | 100% | Prevents stale lines or statistics from appearing current. |
| Accessibility gate closure | 100% before public launch | Makes inclusion a release condition. |
| Responsible-use notice | 100% of market-analysis views | Keeps the product educational. |
| Sports-data cost | $0 per month | Preserves a sustainable portfolio operating model. |
| Runtime AI cost | No more than $10 per month | Makes the public AI feature financially predictable. |

Targets are hypotheses for a portfolio prototype. They are not measured results.

## BETS decision

| Dimension | Score | Rationale |
|---|---:|---|
| Business impact | 5 | Demonstrates the complete technical product management loop. |
| Effort | 2 | Data integration, model validation, runtime AI, and licensing add meaningful work. |
| Tech debt | 3 | External vendors and model operations require adapters, caching, and fallbacks. |
| Stakeholder urgency | 5 | The approved expansion is the primary differentiator for the public portfolio. |

**Total: 15 out of 20. Verdict: ADVANCE.**

The weakest dimension is effort. Improve it with staged free-data adapters, a small first model, and a capped AI endpoint with deterministic fallback. Public anonymous access keeps privacy and authentication scope bounded.

## Risks and controls

| Risk | Control |
|---|---|
| Trademark confusion | Unofficial disclaimer, no official marks, no player likenesses. |
| Unlicensed data reuse | Require a source, license label, and public-display approval before enabling a feed. |
| Stale or mismatched records | Show source timestamps, normalize identifiers, and fail closed when joins are uncertain. |
| Black box forecast | Publish feature definitions, model version, backtest, Brier score, and calibration. |
| AI invents a probability | Require a probability-function tool call, validate the response schema, and preserve a deterministic fallback. |
| Betting advice perception | Use educational language and prohibit picks, stake sizes, payout claims, and wager links. |
| Portfolio becomes a coding demo only | Keep PRD, metrics, decisions, backlog, and release gate first class. |

## Launch decision

The local Market Bias Lab MVP is complete and validated with a deterministic no-key mode. Public GitHub publication remains blocked until Eric explicitly approves it, public-display rights are signed off, the free odds key is validated, the OpenAI project maximum is configured, and final public content review is complete.
