# Release Review

**Review date:** July 27, 2026

**Release candidate:** V1.0.0 READY FOR FINAL PRIVATE REVIEW

**Public source repository:** COMPLETE

**Private hosted candidate:** PRIOR OWNER-ONLY VERSION AVAILABLE; V1.0.0 REDEPLOY PENDING

**Public hosting:** BLOCKED pending Eric Lawler's final approval

## Decision

The release candidate passes the documented product, accessibility, security, privacy, responsible-use, data-rights, trademark, live-odds, live Runtime AI, build, lint, test, AI-evaluation, and dependency-audit gates. Data-rights and trademark risks are accepted with documented limitations in the [Public Use Review](public-use-review.md); this acceptance is not legal clearance. A final private deployment smoke test and public hosting remain explicit owner gates.

The prior owner-only hosted candidate passed GitHub CI and a private smoke test. Its live odds integration returned five current Dallas events. After billing was enabled, the local integration returned one live Runtime AI response with HTTP 200 in AI mode, no fallback, and all seven contract checks passing. The v1.0.0 reliability receipt, shared anonymous rate limit, release package, repository security configuration, and four-scenario live scorecard pass the local regression. This v1.0.0 workspace has not yet been saved or deployed to the owner-only site. Public hosting remains outside the current approval.

## Gate status

| Gate | Status | Evidence and remaining action |
|---|---|---|
| Product flow | COMPLETE | Game, player, opponent, market, forecast, explanation, uncertainty, and model-audit flows are implemented. Refreshed market source and retrieval time remain visible with the forecast. |
| Accessibility | COMPLETE | Semantic review confirmed ordered headings, mobile and desktop navigation, named controls, a scenario fieldset, scoped live statuses, skip navigation, focus rules, reduced motion, and responsive layouts. Primary text and button contrast meet at least 4.5 to 1. This is not a formal accessibility certification. |
| Data rights | ACCEPTED WITH LIMITATIONS | nflverse attribution, source links, CC BY 4.0 license link, transformation notice, and underlying-rights limitation are documented in `NOTICE.md` and the Public Use Review. |
| Live odds | COMPLETE | The server-side adapter returned a current normalized response from The Odds API with five Dallas events. Consensus probability is calculated within each contributing sportsbook before taking the median. A six-hour D1 cache and atomic refresh lease protect the free allowance, and the bundled snapshot remains the fallback. |
| Runtime AI | COMPLETE | The offline contract gate passes 12 of 12 positive and adversarial cases across seven binary criteria. After billing was enabled, a live response returned HTTP 200 in AI mode with no fallback and passed all seven live checks. A four-scenario scorecard then passed four of four Runtime AI and four of four deterministic cases. Runtime AI averaged 3,568 ms and an estimated $0.013118 total with no fallbacks in this bounded sample. |
| AI operations | COMPLETE | The interface exposes an AI reliability receipt. One atomic server-side request check limits the anonymous AI path to 20 requests per shared aligned five-minute bucket before market reads, returns `429` with `Retry-After`, and keeps denied or pre-reservation outcomes out of the run ledger. The public budget posture is static and cacheable without D1 access. The integrated build, lint, 12-case AI evaluation, 72-test suite, and dependency audit pass. |
| Cost | COMPLETE | The dedicated OpenAI project budget is confirmed at $10 and the application cutoff remains $9.50. GPT-5.6 Luna is the default. Pricing tests use current standard input and output rates. D1 reserves before each request and reconciles actual use. |
| Security and privacy | COMPLETE | No credentials were found in the repository. Secrets remain server-side. Client-supplied market prices are ignored, request bytes are stream bounded, provider models are allowlisted, and anonymous AI request capacity is server enforced. The AI run ledger stores no prompt, user identity, wagering history, or raw vendor payload. `npm audit` found zero vulnerabilities after the July 27 dependency update. |
| Responsible use | COMPLETE | The interface provides probabilities and uncertainty without picks, stakes, payouts, affiliate links, sportsbook links, or wager placement. The server owns the summary and disclaimer and exposes only exact validated evidence fields from Runtime AI. |
| Trademark and public content | ACCEPTED WITH LIMITATIONS | Official logos, player likenesses, uniforms, endorsement claims, and copied NFL content are excluded. Text references identify the subject, educational-use language appears beside the forecast, and the full non-affiliation statement appears in the footer. A rights holder could still object. |
| GitHub | CONFIGURED | The public [erlawler/road-to-six](https://github.com/erlawler/road-to-six) repository contains validated release history, CI, security guidance, source attribution, and release documentation. CodeQL and Dependabot configurations are included locally. `[NEEDS INPUT]` Confirm both operate after the configuration reaches the default branch. |
| Private hosting | PRIOR CANDIDATE COMPLETE; V1.0.0 PENDING | The [owner-only Road to Six site](https://road-to-six-erl.erlrickylre.chatgpt.site) contains the prior deployed candidate. One user and no groups have access, provider credentials remain hidden, and its prior owner-authenticated page, budget, and current-odds smoke checks returned HTTP 200. `[NEEDS INPUT]` Save and deploy the current v1.0.0 workspace, then repeat the owner-authenticated smoke test before final approval. |
| Public hosting | BLOCKER | Do not change access to public or deploy a public version until Eric Lawler approves the private candidate. |

## Validation evidence

- Versioned 2026 Dallas schedule and roster snapshot with complete 2025 regular-season player production baselines
- Four opponent leaders updated from the selected weekly matchup
- Walk-forward forecast backtest on the 2024 to 2025 holdout
- Football-only, vig-adjusted market, and market-aware probabilities shown separately
- Live market source and retrieval time remain visible after refresh
- Successful six-hour D1 cache persistence models The Odds API usage at 372 credits in a 31-day month; upstream and persistence failures remain monitored
- Vig is removed within each sportsbook before calculating median consensus probability
- Runtime AI evaluation preserves probability, model version, source time, exact driver labels, evidence, impacts, and uncertainty while rejecting actionable betting guidance
- Offline AI evaluation passed 12 of 12 expected outcomes across two positive and ten adversarial cases, seven criteria, and 84 binary checks
- Duplicate integration requests are disabled in the interface while work is in progress
- Mobile section navigation remains available below the desktop breakpoint
- Local and current owner-authenticated hosted checks returned five current Dallas events from The Odds API without exposing the key
- One live Runtime AI response returned HTTP 200 in AI mode with no fallback and passed the same seven contract checks used by the offline evaluation
- The live response preserved probability `0.5531549573107291`, forecast model `elo-market-v1.1.0`, source date `2026-07-15`, three drivers, and three uncertainty items
- The sanitized four-scenario scorecard passed every Runtime AI and deterministic case; Runtime AI averaged 3,568 ms and an estimated $0.013118 total without fallback
- The AI reliability receipt exposes model, prompt, contract, evaluation, forecast, latency, token, estimated-cost, source, validation, and fallback evidence
- The server enforces a shared anonymous limit of 20 AI requests per aligned five-minute bucket and returns `429` with `Retry-After` after exhaustion
- The current owner-authenticated smoke test verified the technical product case, visible uncertainty, $9.50 budget limit, current cached odds source, retrieval timestamp, and five Dallas events
- Browser semantic tree and status announcements verified on the updated release candidate
- Security headers verified on the rendered page and API routes
- Current dependency audit returned zero vulnerabilities
- Production build, lint, all 72 automated tests, the 12-case AI evaluation, and the dependency audit passed

## Remaining checklist

- [x] Eric: add a private free-tier The Odds API key.
- [x] Eric: confirm the dedicated OpenAI project budget is $10.
- [x] Eric: provide its key through secure secret configuration.
- [x] Eric: enable API billing or prepaid credit for the dedicated OpenAI project.
- [x] Codex: validate one live odds response.
- [x] Codex: validate one Runtime AI response after billing became available.
- [x] Codex: deploy the July 27 optimized build to the owner-only site and run its private smoke test.
- [x] Codex: complete the final v1.0.0 integrated regression and record the exact test count.
- [ ] `[NEEDS INPUT]` Codex: confirm CodeQL and Dependabot after the configuration reaches the default branch.
- [ ] `[NEEDS INPUT]` Codex: save and deploy the final v1.0.0 private candidate and rerun the owner-authenticated smoke test.
- [ ] Eric: approve public hosting.
- [ ] Codex: change hosting access to public and run the production smoke test only after approval.
