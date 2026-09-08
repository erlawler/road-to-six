# September 7 flagship reliability candidate

**State:** LOCAL VALIDATION COMPLETE, UNDEPLOYED CANDIDATE
**Branch:** `codex/flagship-reliability-2026-09-07`
**Production boundary:** Sites version 16, main commit `57b170f`
**Candidate commit:** The reviewed pull-request head containing this record; base `57b170fd3b26a731e22c5897d4a718b69d840deb`
**Candidate versions:** Forecast `elo-market-v1.2.0`; prompt and contract `1.1.0`; evaluation `1.1.0`
**Review owner:** Eric Lawler

This record separates the September audit and candidate improvements from the [historical July release review](release-review.md). A local build, green test, draft branch, or saved document does not mean the public site changed. No merge, release, deployment, access change, or research recruitment is recorded here.

## Problem and resulting candidate behavior

The September audit found that displayed driver effects did not reconcile with the blended forecast, source freshness and provenance needed clearer treatment, and current-state showcase claims had drifted from dated release evidence. The production AI integration demonstrated tool orchestration but did not establish additional user value beyond deterministic evidence.

The candidate makes scenario changes explainable, current and historical evidence distinguishable, source limitations inspectable, and reviewer claims traceable to the right validation window.

## Candidate release notes

These changes are implemented and locally validated. They have not been deployed.

- **Explain the change:** Display the deterministic baseline, resulting probability, and final percentage-point change with contributions that reconcile to the result.
- **Inspect source quality:** Refresh and validate approved football data, capture source provenance, distinguish validation from upstream update time, and expose coverage limitations.
- **Bound the AI experiment:** Allow AI to select and order 1 to 3 approved what-changed evidence IDs. The application renders canonical fact cards; the model cannot write new factual clauses or change probabilities, drivers, evidence, uncertainty, or source versions. Keep the deterministic selection available.
- **Protect runtime integrity:** Reject malformed controls before provider or ledger work, reconcile spend to the reservation month, verify the affected budget row, and expire cache headers at the actual source-cache deadline. Live values never inherit bundled fields; only valid paired quotes contribute to consensus.
- **Improve engineering checks:** Add an explicit typecheck gate alongside lint, tests, AI evaluation, build, and dependency review.
- **Make the showcase easier to review:** Add a 90-second demonstration, correct stale persistence and provenance claims, date historical AI evidence, and prepare a five-session comparison protocol with no fabricated user results.

## Validation record

| Gate | Status | Evidence required before completion |
|---|---|---|
| Candidate scope and exact diff | COMPLETE locally | Isolated branch from verified current main 57b170f; original August checkout preserved; final diff reviewed |
| Typecheck | PASS, September 7 at 21:28 UTC | `npm run typecheck`; strict TypeScript now required in CI |
| Lint | PASS, September 7 at 21:28 UTC | `npm run lint` |
| Automated tests | PASS, September 7 at 21:28:41 UTC | `npm test`:139 tests passed, 0 failed; regressions cover month rollover, incomplete markets, malformed controls, model parity, provenance, grounded selection and scorecard false passes |
| AI contract evaluation | PASS, September 7 at 21:25 UTC | `npm run eval`:17 of 17 cases,2 positive and 15 adversarial,8 criteria,136 checks; no paid calls |
| Production build | PASS, September 7 at 21:28 UTC | Clean production build executed by `npm test` |
| Dependency review | PASS, September 7 at 21:25 UTC | `npm audit --audit-level=high`:0 vulnerabilities across all severity levels. Browserslist 4.28.9 and fflate 0.7.5 replace affected transitive versions |
| Source refresh and provenance | PASS, September 7 at 21:25 UTC | `npm run data:validate`;17 games,8 featured players,56 opponent leaders,544 paired evaluation rows; rawCSV SHA256 verification and byte-identical rebuild tests passed. One unidentified roster row and one stats row excluded and counted |
| Local browser and accessibility | PASS for bounded checks, September 7 at 21:24 UTC | Desktop render;390 px mobile page width 390 px and nav content 352 px within 352 px; preset 56.3% to 54.5% (-1.8 pp); keyboard slider 50% to 60%; fallback receipt 0 tokens / $0; warning/error log empty. Mobile visual review and semantic/focus/contrast tests passed. No screen-reader certification or field performance claim |
| Candidate live AI | NOT VALIDATED | A separately authorized, budget-gated candidate call and receipt if required for release; production smoke evidence cannot validate new candidate behavior |
| Human comparison | NOT RUN | Five voluntary sessions if commissioned; no recruitment, consent collection, or human results currently exist |
| Provider billing | VERIFY | Authenticated read-only provider evidence; application ledger and declared project budget are distinct |
| Publication | NOT REQUESTED BY THIS RECORD | Exact release candidate, existing user authorization scope, and source-system readback; do not infer publication from local validation |

## Research and product decisions

The [five-session protocol](usability-session-kit.md) compares deterministic default context against AI selection from the same canonical facts. It tests relevance and comprehension, not prose quality or predictive improvement. The primary decision is whether the extra selection step is useful enough to justify latency, cost, and maintenance.

No usage analytics or personal-data persistence is added by the protocol. The [measurement plan](measurement-plan.md) retains adoption hypotheses, defines a provisional latency target, and separates offline contract checks from observed user outcomes. The [freshness policy](data-freshness-policy.md) defines operational expectations without claiming that refresh automation has been implemented.

## Operational details

The AI selection extension retains the same two provider calls. Output ceilings are 300 and 1,200 tokens so expanded immutable evidence fits; the reservation calculation includes both ceilings. The Luna minimum remains $0.025. No additional paid live call was made during implementation. The source age indicator applies the weekly review policy, and active live markets expire locally without automatic provider retries.

The live-scorecard runner now recomputes forecast fields from this checkout and observed market inputs, checks receipt versions and usage, and rejects incomplete market coverage. It remains a future authorized live test, not evidence that this candidate has run against the provider. [The research protocol](usability-session-kit.md) is ready for Eric to commission when desired; no human outcomes are claimed.

## Remaining evidence limits

- A bounded AI sample cannot establish provider uptime or population latency.
- Source freshness labels and manifests are not legal clearance for underlying data rights.
- The historical model comparison does not demonstrate a wagering edge or validate illustrative player sensitivities.
- Local candidate validation does not establish production deployment, and synthetic research does not establish human usability.
