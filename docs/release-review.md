# Release Review

**Review date:** July 30, 2026

**Release candidate:** V1.0.0 RELEASED ON GITHUB

**Public source repository:** COMPLETE

**Hosted release:** COMPLETE, SITES VERSION 13

**Public hosting:** COMPLETE

## Decision

The release candidate passes the documented product, accessibility, security, privacy, responsible-use, data-rights, trademark, live-odds, live Runtime AI, build, lint, test, AI-evaluation, dependency-audit, and owner-authenticated hosted-smoke gates. Data-rights and trademark risks are accepted with documented limitations in the [Public Use Review](public-use-review.md); this acceptance is not legal clearance.

Usability is accepted with deferred validation. Five labeled AI proxy and expert pretests are complete, but no moderated human sessions have occurred. On July 29, 2026, Eric Lawler approved deferring the five-session human study from the v1.0.0 launch gate to post-launch validation. This is a documented release-risk acceptance, not evidence of human usability or a claim that the product is human validated.

The final source is on GitHub `main`, CI and CodeQL pass, and the `v1.0.0` tag and GitHub release are published. Sites version 13 was built from the exact tagged commit, first validated owner-only, and then published at [road-to-six-erl.erlrickylre.chatgpt.site](https://road-to-six-erl.erlrickylre.chatgpt.site). Its authenticated smoke test confirmed client hydration, live odds for 11 schedule-matched games, selected-game freshness, matchup updates, deterministic forecast behavior, Runtime AI, a passed reliability receipt, source links, and zero browser-console errors. The release-smoke Runtime AI request used `gpt-5.6-luna`, completed with no fallback in 5,429 ms, used 646 input and 450 output tokens, and had an estimated cost of $0.0035.

The signed-out production smoke test passed on July 30, 2026. An unauthenticated page request returned HTTP 200. The public odds endpoint returned 17 NFL events from The Odds API, with 11 Cowboys games matched in the interface. A Week 2 scenario applied current market data and returned a 63% Dallas probability against a 64% vig-adjusted market probability. Runtime AI returned a validated reliability receipt with no fallback, and an independent anonymous forecast request returned HTTP 200 in AI mode. Invalid game input returned HTTP 400 with zero AI cost. Accessibility markers, security headers, source links, social metadata, and zero browser-console errors were also verified.

## Gate status

| Gate | Status | Evidence and remaining action |
|---|---|---|
| Product flow | COMPLETE | Game, player, opponent, market, forecast, explanation, uncertainty, and model-audit flows are implemented. Refreshed market source and retrieval time remain visible with the forecast. |
| Accessibility | ACCEPTED WITH DEFERRED HUMAN VALIDATION | Semantic and expert proxy review confirmed ordered headings, mobile and desktop navigation, named controls, a scenario fieldset, scoped live statuses, skip navigation, keyboard operation, reduced motion, and responsive layouts. A P1 contrast issue was fixed with split light and dark tokens plus automated assertions. VoiceOver and NVDA human validation remains a post-launch recommendation and is not a v1.0.0 gate. This is not an accessibility certification. |
| Data rights | ACCEPTED WITH LIMITATIONS | nflverse attribution, source links, CC BY 4.0 license link, transformation notice, and underlying-rights limitation are documented in `NOTICE.md` and the Public Use Review. |
| Live odds | COMPLETE | The signed-out production adapter returned 17 current NFL events from The Odds API, and the interface matched 11 Cowboys games. Consensus probability is calculated within each contributing sportsbook before taking the median. A six-hour D1 cache and atomic refresh lease protect the free allowance, and the bundled snapshot remains the fallback. The interface distinguishes provider refresh success from selected-game applicability. |
| Runtime AI | COMPLETE | The offline contract gate passes 12 of 12 positive and adversarial cases across seven binary criteria. After billing was enabled, a live response returned HTTP 200 in AI mode with no fallback and passed all seven live checks. A four-scenario scorecard then passed four of four Runtime AI and four of four deterministic cases. The signed-out production receipt passed with model `gpt-5.6-luna`, 5,584 ms latency, 649 input tokens, 370 output tokens, $0.0030 estimated cost, and no fallback. |
| AI operations | COMPLETE | The interface exposes an AI reliability receipt and states that Runtime AI explained the locked probability. One atomic server-side request check limits the anonymous AI path to 20 requests per shared aligned five-minute bucket before market reads, returns `429` with `Retry-After`, and keeps denied or pre-reservation outcomes out of the run ledger. The public budget posture is static and cacheable without D1 access. The integrated build, lint, 12-case AI evaluation, 75-test suite, and dependency audit pass. |
| Cost | COMPLETE | The dedicated OpenAI project budget is confirmed at $10 and the application cutoff remains $9.50. GPT-5.6 Luna is the default. Pricing tests use current standard input and output rates. D1 reserves before each request and reconciles actual use. |
| Security and privacy | COMPLETE WITH P2 HARDENING | No credentials were found in the repository. Secrets remain server-side. Client-supplied market prices are ignored, request bytes are stream bounded, provider models are allowlisted, and anonymous AI request capacity is server enforced. The AI run ledger stores no prompt, user identity, wagering history, or raw vendor payload. `npm audit` found zero vulnerabilities after the July 27 dependency update. The framework CSP remains limited to same-origin sources but permits inline scripts and styles. Removing those allowances is tracked as non-blocking hardening. |
| Responsible use | COMPLETE | The interface provides probabilities and uncertainty without picks, stakes, payouts, affiliate links, sportsbook links, or wager placement. The server owns the summary and disclaimer and exposes only exact validated evidence fields from Runtime AI. |
| Trademark and public content | ACCEPTED WITH LIMITATIONS | Official logos, player likenesses, uniforms, endorsement claims, and copied NFL content are excluded. Text references identify the subject, educational-use language appears beside the forecast, and the full non-affiliation statement appears in the footer. A rights holder could still object. |
| Usability research | ACCEPTED WITH DEFERRED VALIDATION | Five AI proxy and expert pretests are complete. Zero of five moderated human sessions have occurred. Eric Lawler approved the v1.0.0 release with this limitation and moved human validation to post-launch research. Human findings remain `[NEEDS INPUT]`. |
| GitHub | COMPLETE | The public [erlawler/road-to-six](https://github.com/erlawler/road-to-six) repository is current. The `v1.0.0` tag and GitHub release are published. CI and CodeQL pass on the release commit, and Dependabot update workflows are active. |
| Private hosting | COMPLETE, HISTORICAL | Sites version 13 was first validated owner-only. Provider credentials remained hidden, and the owner-authenticated hosted smoke test passed before access changed. |
| Public hosting | COMPLETE | The [public Road to Six site](https://road-to-six-erl.erlrickylre.chatgpt.site) returns HTTP 200 without authentication. Signed-out page, live odds, forecast, Runtime AI, invalid-input, accessibility, security-header, source-link, social-metadata, and browser-console checks passed. |

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
- Sites version 13 passed the release smoke test with current odds for 11 schedule-matched games, Week 2 matchup switching, a 63% updated Dallas probability, and zero browser-console errors
- The release-smoke Runtime AI request passed with no fallback, 5,429 ms latency, 646 input tokens, 450 output tokens, and an estimated $0.0035 request cost
- The public root returned HTTP 200 without authentication and rendered the release title, metadata, navigation, skip link, main landmark, and level-one heading
- The signed-out odds endpoint returned HTTP 200 with 17 current NFL events from The Odds API; the interface matched 11 Cowboys games and displayed the six-hour cache posture
- The signed-out Week 2 scenario applied current market data and displayed a 63% Dallas probability against a 64% vig-adjusted market probability
- The public Runtime AI receipt passed with model `gpt-5.6-luna`, 5,584 ms latency, 649 input tokens, 370 output tokens, $0.0030 estimated cost, and no fallback
- An independent signed-out forecast request returned HTTP 200 in AI mode with probability `0.5531549573107291`, forecast model `elo-market-v1.1.0`, passed validation, and no fallback
- Invalid game input returned HTTP 400 in rejected mode with zero AI cost
- Public security headers, source links, Open Graph image, social metadata, and zero browser-console errors were verified
- The public release does not yet provide canonical, `og:type`, `og:url`, social-image alt, `robots.txt`, or `sitemap.xml` metadata. These are P2 discoverability improvements, not v1.0.0 functional or safety blockers.
- GitHub CI and CodeQL passed on the release commit
- An earlier public-access attempt was rejected by the workspace internet-publishing policy and returned HTTP 401. The setting was subsequently enabled, public access was applied, and the signed-out production smoke test passed.
- An intermediate private deployment exposed a missing-client-assets packaging error; the full `dist` archive was rebuilt and the succeeding private version passed hydration and interaction checks
- Browser semantic tree and status announcements verified on the updated release candidate
- Security headers verified on the rendered page and API routes
- Current dependency audit returned zero vulnerabilities
- Production build, lint, all 75 automated tests, the 12-case AI evaluation, and the dependency audit passed

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
- [x] Eric: accept deferred human validation as a documented v1.0.0 limitation.
- [x] Codex: confirm CI, CodeQL, and Dependabot workflows after the configuration reached the default branch.
- [ ] `[NEEDS INPUT]` Eric: complete five moderated human sessions as post-launch validation.
- [x] Eric: approve the final GitHub push, tag, and release.
- [x] Eric: approve public hosting.
- [x] Workspace administrator: enable internet publishing for Sites.
- [x] Codex: change hosting access to public and run the signed-out success-path production smoke test.
