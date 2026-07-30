# Road to Six 1.0.0

**Prepared:** July 27, 2026
**Release state:** Local candidate ready for final private deployment and review
**Public hosting:** Not approved
**Git tag and GitHub release:** Not created

Road to Six 1.0.0 is an evidence-grounded technical product management case study. It combines actual football evidence, current market context, a transparent forecast, and governed Runtime AI without turning the experience into betting advice.

## New capabilities

- **Explore weekly matchups:** Select a Dallas game and compare featured Dallas players with the selected opponent's four highest 2025 PPR producers who remain on its active 2026 roster.
- **Run named scenarios:** Adjust Dallas and opponent participation assumptions and see the deterministic probability update.
- **Inspect the evidence:** Compare football-only, market-implied, and market-aware probabilities with source freshness, model version, and uncertainty.
- **Audit the model:** Review a 544-game walk-forward holdout and the honest finding that the market-aware baseline improved on football-only Elo but did not outperform the market baseline.
- **Request a grounded explanation:** Runtime AI explains the existing probability, drivers, evidence, and uncertainty. It cannot change the calculated number or recommend a bet.
- **Review the reliability receipt:** Inspect model, prompt, output contract, evaluation version, latency, token use, estimated cost, validation status, source freshness, and fallback reason.

## Product improvements

- **More accurate positioning:** Market Context Lab replaces Market Bias Lab. Bias remains an unvalidated hypothesis because bettor-split data is intentionally excluded.
- **Clearer model language:** The audit now describes what is measured without using a contrast-template headline.
- **Safer operations:** External calls are bounded by one atomic pre-work request check, payload validation, an atomic D1 odds-refresh lease, an approved-model allowlist, the $9.50 AI cutoff, closed-set explanation output, and deterministic fallback.
- **Stronger portfolio evidence:** Release notes, usability research structure, owner-feedback traceability, a static repository user flow, and a launch checklist make product decisions easier to review.

## Verified release evidence

- Live odds returned normalized Dallas market data through the server-side integration.
- A live Runtime AI response returned HTTP 200 in AI mode with no fallback and preserved probability `0.5531549573107291`.
- The live response identified forecast model `elo-market-v1.1.0`, source date `2026-07-15`, three drivers, and three uncertainty items.
- The same seven-criterion evaluator passed all seven live checks.
- A four-scenario live scorecard passed four of four Runtime AI cases and four of four deterministic cases. Runtime AI averaged 3,568 ms and an estimated $0.013118 total across the bounded sample, with no fallbacks.
- Offline AI evaluation passed 12 of 12 expected outcomes across 84 binary checks.
- The production build, lint, 73 automated tests, and dependency audit passed.
- The product preserves deterministic forecast and explanation behavior when AI is unavailable.

## Important limitations

- This is an unofficial educational analytics project, not a betting service or recommendation.
- The prototype does not prove Cowboys popularity or market bias.
- Free data constraints limit historical market depth and refresh frequency.
- Runtime AI quality is bounded by the supplied evidence and evaluation contract.
- Data-rights and trademark review records accepted product limitations, not legal clearance.
- Public hosting remains blocked until Eric Lawler explicitly approves it.

## Review path

1. Read the [portfolio case study](docs/portfolio-case-study.md).
2. Run the scenario and inspect the AI reliability receipt.
3. Review the [model and AI evaluation](docs/ai-evaluation.md).
4. Inspect the [decision log](docs/decision-log.md) and [release review](docs/release-review.md).
5. Use the [repository launch checklist](docs/repository-launch-checklist.md) before publication.
