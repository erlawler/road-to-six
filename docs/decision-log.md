# Decision Log

## ADR 001: Use Road to Six as the skills-showcase concept

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

**Why:** Accounts do not improve the core showcase job and would add privacy, security, and maintenance cost.

## ADR 006: Keep publication separate from local completion

**Status:** DECIDED

**Decision:** Finish and validate the local repository before any public GitHub or hosted release.

**Why:** Publication requires a final public content, accessibility, security, and trademark review.

## ADR 007: Add sourced football and market data

**Status:** SUPERSEDED by ADR 011

**Historical decision:** The first expansion proposal included licensed bettor-split data. ADR 011 replaced that proposal with a $0 sports-data boundary and explicitly excluded bettor splits.

**Why:** Real data materially improves showcase credibility and makes the relationship between football evidence and market prices inspectable. The later $0 data decision means Cowboys popularity and market bias are not testable in this release. Every feed still requires source attribution, freshness metadata, and public-display approval.

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

**Decision:** Do not require authentication for the Market Context Lab MVP.

**Why:** Immediate public exploration serves the showcase job, avoids collecting personal or wagering data, and preserves implementation focus for data quality and forecast governance.

## ADR 011: Cap AI cost and use only free sports data

**Status:** DECIDED

**Decision:** Keep sports-data vendor cost at $0, exclude bettor splits and paid historical odds, and cap runtime AI at $10 per month. Use a dedicated OpenAI project with a $10 maximum, stop application AI at $9.50, and serve the deterministic explanation after the cutoff.

**Why:** The free data path preserves the showcase value while making Eric's personal operating cost predictable. The application remains available even when the AI budget is exhausted.

## ADR 012: Ship a transparent baseline before a complex model

**Status:** DECIDED

**Decision:** Use walk-forward Elo as the football baseline and a predeclared 20% football to 80% vig-adjusted market blend. Evaluate on the 2024 to 2025 holdout after the 2019 to 2023 development window. Display spread, total, and line status as evidence without double counting them in the probability.

**Why:** The baseline is reproducible, auditable, and honest about its performance. It improves on football-only Elo but does not claim to beat the market.

## ADR 013: Add matchup-aware player scenarios

**Status:** DECIDED

**Decision:** Expand the versioned forecast controls to Dak Prescott, CeeDee Lamb, George Pickens, Javonte Williams, the defensive core, and the selected opponent's top 2025 PPR producer. For each scheduled opponent, join its active 2026 roster to complete 2025 regular-season stats and show the top four PPR production leaders.

**Why:** Weekly opponent evidence makes the game selector materially useful, while named controls let visitors test more football assumptions without introducing medical claims or opaque AI scoring.

## ADR 014: Treat AI evaluations as product requirements

**Status:** DECIDED

**Decision:** Define seven binary runtime-AI criteria covering probability, model version, source freshness, evidence, uncertainty, responsible use, and deterministic fallback. Run positive and adversarial cases locally and in CI without requiring a live provider call.

**Why:** A schema proves shape, not product quality. Binary evaluations make the AI contract inspectable, reproducible, and connected to user trust. A separate live structured response subsequently passed the same seven criteria after provider billing was enabled.

## ADR 015: Make product ownership and limitations explicit

**Status:** DECIDED

**Decision:** Lead the repository and product experience with the problem, Eric's ownership, key tradeoffs, verified evidence, Codex collaboration model, and current limitations. Keep adoption targets separate from observed outcomes.

**Why:** A technical product management and frontier AI showcase should demonstrate judgment and accountability, not only implementation breadth. Clear ownership and honest limitations make the evidence easier for product, AI, engineering, and analytics practitioners to evaluate.

## ADR 016: Position the product as Market Context Lab

**Status:** DECIDED

**Decision:** Replace Market Bias Lab positioning with Market Context Lab. Treat Cowboys popularity and market bias as unvalidated hypotheses unless a future, licensed dataset can test bettor behavior directly.

**Why:** Current moneyline, spread, total, and forecast evidence can show agreement or disagreement, but it cannot explain bettor motivation. The product claim must stay narrower than the data.

## ADR 017: Make Runtime AI operations inspectable

**Status:** DECIDED

**Decision:** Protect the anonymous AI path with a shared limit of 20 requests per aligned five-minute bucket. Record bounded operational metadata for each run and display a reliability receipt containing model, prompt, contract, evaluation, forecast, latency, token, estimated-cost, source, validation, and fallback evidence. Do not store prompts, user identity, wagering history, or raw vendor data.

**Why:** A public AI feature needs observable quality, failure, and cost controls. The shared limit protects the budget without expanding authentication or personal-data scope, while the receipt turns AI operations into reviewable product evidence.

## ADR 018: Harden public discovery and browser policy after launch

**Status:** DECIDED

**Decision:** Publish canonical and social-link metadata, a crawler policy, and a one-page sitemap. Tighten the browser content security policy to deny all unspecified resources, inline event-handler scripts, forms, frames, media, workers, and inline style elements. Retain inline framework scripts and the probability ring's inline style attribute until the runtime supports a tested nonce path without weakening availability or cache behavior.

**Why:** Public discovery metadata makes the showcase easier to index and share, while an explicit compatibility-tested CSP reduces browser attack surface. Retaining only the two runtime-required allowances is safer than either leaving broad allowances in place or breaking hydration through an untested all-or-nothing policy.

## ADR 019: Protect the public default branch

**Status:** DECIDED

**Decision:** Protect `refs/heads/main` with an active GitHub repository ruleset and no bypass actors. Require an up-to-date pull request, the `validate` and `Analyze JavaScript and TypeScript` checks, resolved review threads, squash merge, and linear history. Block deletion and non-fast-forward updates. Keep required approvals at zero for the solo-maintainer workflow.

**Why:** A public showcase should make its release controls inspectable after launch. The ruleset prevents direct or destructive changes to the published source while preserving a practical feature-branch and automated-check workflow for a solo owner.

## ADR 020: Accept transparent AI persona validation as the showcase gate

**Status:** DECIDED

**Decision:** Treat five labeled AI proxy and expert pretests plus five transparent synthetic ideal-persona simulations as the completed showcase evidence gate. Preserve their task evidence, score traceability, owner decisions, and automated or hosted validation. Do not describe the work as human research, observed behavior, accessibility certification, or human usability validation. Keep the moderated research protocol as optional future work rather than a release or showcase completion dependency.

**Why:** The showcase job is to demonstrate product judgment, evidence discipline, AI governance, and release ownership. A clearly bounded AI persona evaluation supports that job without fabricating participants or leaving the project indefinitely incomplete. The explicit claim boundary protects credibility while retaining a safe protocol if observed human evidence becomes valuable later.

## ADR 021: Position Road to Six as a skills showcase

**Status:** DECIDED

**Decision:** Use skills-first framing throughout. Position the public repository for technical product management, AI product, platform, engineering, analytics, and football-product peers. Remove social-post drafts and publication tasks. Keep external social posting and profile updates outside the repository and outside the authorized product workflow.

Document OpenAI as the deployed Runtime AI provider. Present Anthropic only as an example of a modern LLM platform to which the contract-first controls could transfer after separate implementation, pricing, evaluation, and release approval.

**Why:** The owner is presenting completed product work and capabilities. Skills-first positioning keeps the evidence useful to peers and practitioners while preserving truthful provider boundaries and preventing an unapproved social-publication path.
