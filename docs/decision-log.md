# Decision Log

## ADR 001: Use Road to Six as the portfolio concept

**Status:** DECIDED

**Decision:** Build an unofficial Dallas Cowboys championship readiness lab focused on product decisions, not outcome prediction.

**Why:** The sports theme is memorable, while scenario planning, evidence traceability, and release governance directly demonstrate technical product management skills.

## ADR 002: Use synthetic data in the MVP

**Status:** SUPERSEDED by ADR 007

**Decision:** Use clearly labeled synthetic performance values and evidence descriptions.

**Why:** This keeps the demo reproducible and avoids licensing, freshness, medical, contract, and factual accuracy risk.

## ADR 003: Keep prioritization deterministic

**Status:** DECIDED

**Decision:** Sum four visible BETS inputs and advance scores of 12 or higher.

**Why:** Visitors can inspect the logic, change assumptions, and reproduce the outcome.

## ADR 004: No runtime AI in the first slice

**Status:** SUPERSEDED by ADR 008

**Decision:** Use Codex to build and review the product, but generate the in-product brief from deterministic state.

**Why:** The first slice demonstrates responsible AI judgment by keeping AI out of a decision path that does not need it.

## ADR 005: No authentication or persistence

**Status:** DECIDED

**Decision:** Keep the MVP anonymous with no user accounts or saved user state. Permit only an aggregate monthly AI-cost ledger.

**Why:** Accounts do not improve the core portfolio job and would add privacy, security, and maintenance cost.

## ADR 006: Keep publication separate from local completion

**Status:** DECIDED

**Decision:** Finish and validate the local repository before any public GitHub or hosted release.

**Why:** Publication requires a final public content, accessibility, security, and trademark review.

## ADR 007: Add sourced football and market data

**Status:** SUPERSEDED by ADR 011

**Historical decision:** The first expansion proposal included licensed bettor-split data. ADR 011 replaced that proposal with a $0 sports-data boundary and explicitly excluded bettor splits.

**Why:** Real data materially improves portfolio credibility and enables a testable Cowboys market-bias hypothesis. Every feed requires source attribution, freshness metadata, and public-display approval.

## ADR 008: Add runtime AI with a probability tool

**Status:** DECIDED

**Decision:** Runtime AI must call a versioned probability function, preserve its result, and explain forecast drivers, evidence, and uncertainty through a structured response.

**Why:** This demonstrates runtime AI while keeping probability logic testable, reproducible, and evaluable. A deterministic fallback remains available when AI fails or exceeds the cost limit.

## ADR 009: Keep market analysis educational

**Status:** DECIDED

**Decision:** Show market context and calculated probabilities, but prohibit picks, stake sizing, expected-payout claims, affiliate links, and wager placement.

**Why:** The product demonstrates analysis and responsible product design without becoming a betting-advice service.

## ADR 010: Keep the experience public and anonymous

**Status:** DECIDED

**Decision:** Do not require authentication for the Market Bias Lab MVP.

**Why:** Immediate public exploration serves the portfolio job, avoids collecting personal or wagering data, and preserves implementation focus for data quality and forecast governance.

## ADR 011: Cap AI cost and use only free sports data

**Status:** DECIDED

**Decision:** Keep sports-data vendor cost at $0, exclude bettor splits and paid historical odds, and cap runtime AI at $10 per month. Use a dedicated OpenAI project with a $10 maximum, stop application AI at $9.50, and serve the deterministic explanation after the cutoff.

**Why:** The free data path preserves the portfolio value while making Eric's personal operating cost predictable. The application remains available even when the AI budget is exhausted.

## ADR 012: Ship a transparent baseline before a complex model

**Status:** DECIDED

**Decision:** Use walk-forward Elo as the football baseline and a predeclared 20% football to 80% vig-adjusted market blend. Evaluate on the 2024 to 2025 holdout after the 2019 to 2023 development window. Display spread, total, and line status as evidence without double counting them in the probability.

**Why:** The baseline is reproducible, auditable, and honest about its performance. It improves on football-only Elo but does not claim to beat the market.

## ADR 013: Add matchup-aware player scenarios

**Status:** DECIDED

**Decision:** Expand the versioned forecast controls to Dak Prescott, CeeDee Lamb, George Pickens, Javonte Williams, the defensive core, and the selected opponent's top 2025 PPR producer. For each scheduled opponent, join its active 2026 roster to complete 2025 regular-season stats and show the top four PPR production leaders.

**Why:** Weekly opponent evidence makes the game selector materially useful, while named controls let visitors test more football assumptions without introducing medical claims or opaque AI scoring.
