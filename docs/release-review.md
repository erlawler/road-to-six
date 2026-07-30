# Release Review

**Review date:** July 29, 2026

**Release candidate:** V1.0.0 DEPLOYED FOR OWNER-ONLY REVIEW

**Public source repository:** EARLIER VERSION AVAILABLE; FINAL PUSH BLOCKED

**Private hosted candidate:** COMPLETE

**Public hosting:** BLOCKED pending Eric Lawler's final approval

## Decision

The release candidate passes the documented product, accessibility, security, privacy, responsible-use, data-rights, trademark, live-odds, live Runtime AI, build, lint, test, AI-evaluation, dependency-audit, and owner-authenticated hosted-smoke gates. Data-rights and trademark risks are accepted with documented limitations in the [Public Use Review](public-use-review.md); this acceptance is not legal clearance. Five AI proxy and expert pretests are complete, but they do not replace the five moderated human sessions in the research plan.

The v1.0.0 owner-only preview is saved and deployed with one allowed user and no groups. The authenticated smoke test confirmed client hydration, live odds, selected-game freshness, matchup updates, deterministic forecast behavior, Runtime AI, a passed reliability receipt, scenario reset, source links, and zero browser-console errors. The hosted Runtime AI request completed with no fallback in 5,087 ms at an estimated $0.0032. The smoke test also caught an incomplete client-asset archive in an intermediate private version; the complete `dist` archive was rebuilt, redeployed, and retested before handoff. Public hosting, the final GitHub push, a version tag, and a GitHub release remain outside the current approval.

## Gate status

| Gate | Status | Evidence and remaining action |
|---|---|---|
| Product flow | COMPLETE | Game, player, opponent, market, forecast, explanation, uncertainty, and model-audit flows are implemented. Refreshed market source and retrieval time remain visible with the forecast. |
| Accessibility | COMPLETE FOR PRIVATE REVIEW | Semantic and expert proxy review confirmed ordered headings, mobile and desktop navigation, named controls, a scenario fieldset, scoped live statuses, skip navigation, keyboard operation, reduced motion, and responsive layouts. A P1 contrast issue was fixed with split light and dark tokens plus automated assertions. VoiceOver and NVDA human validation remains recommended before public launch. This is not an accessibility certification. |
| Data rights | ACCEPTED WITH LIMITATIONS | nflverse attribution, source links, CC BY 4.0 license link, transformation notice, and underlying-rights limitation are documented in `NOTICE.md` and the Public Use Review. |
| Live odds | COMPLETE | The authenticated hosted adapter returned a cached current response from The Odds API with 11 schedule-matched Cowboys games. Consensus probability is calculated within each contributing sportsbook before taking the median. A six-hour D1 cache and atomic refresh lease protect the free allowance, and the bundled snapshot remains the fallback. The interface now distinguishes provider refresh success from selected-game applicability. |
| Runtime AI | COMPLETE | The offline contract gate passes 12 of 12 positive and adversarial cases across seven binary criteria. After billing was enabled, a live response returned HTTP 200 in AI mode with no fallback and passed all seven live checks. A four-scenario scorecard then passed four of four Runtime AI and four of four deterministic cases. Runtime AI averaged 3,568 ms and an estimated $0.013118 total with no fallbacks in this bounded sample. |
| AI operations | COMPLETE | The interface exposes an AI reliability receipt and states that Runtime AI explained the locked probability. One atomic server-side request check limits the anonymous AI path to 20 requests per shared aligned five-minute bucket before market reads, returns `429` with `Retry-After`, and keeps denied or pre-reservation outcomes out of the run ledger. The public budget posture is static and cacheable without D1 access. The integrated build, lint, 12-case AI evaluation, 73-test suite, and dependency audit pass. |
| Cost | COMPLETE | The dedicated OpenAI project budget is confirmed at $10 and the application cutoff remains $9.50. GPT-5.6 Luna is the default. Pricing tests use current standard input and output rates. D1 reserves before each request and reconciles actual use. |
| Security and privacy | COMPLETE | No credentials were found in the repository. Secrets remain server-side. Client-supplied market prices are ignored, request bytes are stream bounded, provider models are allowlisted, and anonymous AI request capacity is server enforced. The AI run ledger stores no prompt, user identity, wagering history, or raw vendor payload. `npm audit` found zero vulnerabilities after the July 27 dependency update. |
| Responsible use | COMPLETE | The interface provides probabilities and uncertainty without picks, stakes, payouts, affiliate links, sportsbook links, or wager placement. The server owns the summary and disclaimer and exposes only exact validated evidence fields from Runtime AI. |
| Trademark and public content | ACCEPTED WITH LIMITATIONS | Official logos, player likenesses, uniforms, endorsement claims, and copied NFL content are excluded. Text references identify the subject, educational-use language appears beside the forecast, and the full non-affiliation statement appears in the footer. A rights holder could still object. |
| GitHub | CONFIGURED LOCALLY; FINAL PUSH BLOCKED | The public [erlawler/road-to-six](https://github.com/erlawler/road-to-six) repository contains earlier validated history. The final v1.0.0 changes, media, and evidence remain local until Eric approves a push. CodeQL and Dependabot configurations are included locally. `[NEEDS INPUT]` Confirm both operate after the final configuration reaches the default branch. |
| Private hosting | COMPLETE | The [owner-only Road to Six site](https://road-to-six-erl.erlrickylre.chatgpt.site) contains v1.0.0. One user and no groups have access, provider credentials remain hidden, and the owner-authenticated hosted smoke test passed. |
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
- The owner-authenticated hosted check returned 11 current schedule-matched Cowboys games from The Odds API without exposing the key
- One live Runtime AI response returned HTTP 200 in AI mode with no fallback and passed the same seven contract checks used by the offline evaluation
- The live response preserved probability `0.5531549573107291`, forecast model `elo-market-v1.1.0`, source date `2026-07-15`, three drivers, and three uncertainty items
- The sanitized four-scenario scorecard passed every Runtime AI and deterministic case; Runtime AI averaged 3,568 ms and an estimated $0.013118 total without fallback
- The AI reliability receipt exposes model, prompt, contract, evaluation, forecast, latency, token, estimated-cost, source, validation, and fallback evidence
- The server enforces a shared anonymous limit of 20 AI requests per aligned five-minute bucket and returns `429` with `Retry-After` after exhaustion
- The current owner-authenticated smoke test verified the technical product case, ownership line, visible uncertainty, selected-game freshness, current cached odds source, retrieval timestamp, 11 matched games, scenario reset, and zero browser-console errors
- One current hosted Runtime AI request passed with no fallback, 5,087 ms latency, 649 input tokens, 397 output tokens, and an estimated $0.0032 request cost
- An intermediate private deployment exposed a missing-client-assets packaging error; the full `dist` archive was rebuilt and the succeeding private version passed hydration and interaction checks
- Browser semantic tree and status announcements verified on the updated release candidate
- Security headers verified on the rendered page and API routes
- Current dependency audit returned zero vulnerabilities
- Production build, lint, all 73 automated tests, the 12-case AI evaluation, and the dependency audit passed

## Remaining checklist

- [x] Eric: add a private free-tier The Odds API key.
- [x] Eric: confirm the dedicated OpenAI project budget is $10.
- [x] Eric: provide its key through secure secret configuration.
- [x] Eric: enable API billing or prepaid credit for the dedicated OpenAI project.
- [x] Codex: validate one live odds response.
- [x] Codex: validate one Runtime AI response after billing became available.
- [x] Codex: deploy the July 27 optimized build to the owner-only site and run its private smoke test.
- [x] Codex: complete the final v1.0.0 integrated regression and record the exact test count.
- [x] Codex: save and deploy the final v1.0.0 private candidate and rerun the owner-authenticated smoke test.
- [x] Codex: complete five labeled AI proxy and expert pretests and incorporate accepted P0 and P1 fixes.
- [x] Codex: capture hosted screenshots, animated walkthrough, captions, and privacy review.
- [ ] `[NEEDS INPUT]` Codex: confirm CodeQL and Dependabot after the configuration reaches the default branch.
- [ ] `[NEEDS INPUT]` Eric: complete five moderated human sessions if maintaining the documented human-research launch gate.
- [ ] `[NEEDS INPUT]` Eric: approve the final GitHub push, tag, and release.
- [ ] Eric: approve public hosting.
- [ ] Codex: change hosting access to public and run the production smoke test only after approval.
