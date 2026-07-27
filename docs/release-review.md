# Release Review

**Review date:** July 27, 2026

**Release candidate:** READY WITH RUNTIME AI BILLING BLOCKER

**Public source repository:** COMPLETE

**Private hosted candidate:** COMPLETE

**Public hosting:** BLOCKED pending Eric Lawler's final approval

## Decision

The release candidate passes the product, accessibility, security, privacy, responsible-use, data-rights, trademark, build, and test gates with the documented limitations accepted in the [Public Use Review](public-use-review.md).

The deterministic product and live odds integration are release ready. Runtime AI reached OpenAI successfully but the provider returned `insufficient_quota`, so the live AI gate remains blocked until API billing or prepaid credit is enabled for the dedicated project. Public hosting remains outside the current approval.

## Gate status

| Gate | Status | Evidence and remaining action |
|---|---|---|
| Product flow | COMPLETE | Game, player, opponent, market, forecast, explanation, uncertainty, and model-audit flows are implemented. Refreshed market source and retrieval time remain visible with the forecast. |
| Accessibility | COMPLETE | Semantic review confirmed ordered headings, mobile and desktop navigation, named controls, a scenario fieldset, scoped live statuses, skip navigation, focus rules, reduced motion, and responsive layouts. Primary text and button contrast meet at least 4.5 to 1. This is not a formal accessibility certification. |
| Data rights | ACCEPTED WITH LIMITATIONS | nflverse attribution, source links, CC BY 4.0 license link, transformation notice, and underlying-rights limitation are documented in `NOTICE.md` and the Public Use Review. |
| Live odds | COMPLETE | The server-side adapter returned a current normalized response from The Odds API with five Dallas events. Consensus probability is calculated within each sportsbook before taking the median. A six-hour D1 cache protects the free allowance, and the bundled snapshot remains the fallback. |
| Runtime AI | BLOCKED | The key is configured as a hidden hosted secret. The Responses API request reached OpenAI, but OpenAI returned `insufficient_quota`. [NEEDS INPUT] Enable API billing or prepaid credit for the dedicated project, then validate one structured live explanation. The $9.50 application cutoff and deterministic fallback remain active. |
| Cost | COMPLETE | The dedicated OpenAI project budget is confirmed at $10 and the application cutoff remains $9.50. GPT-5.6 Luna is the default. Pricing tests use current standard input and output rates. D1 reserves before each request and reconciles actual use. |
| Security and privacy | COMPLETE | No credentials were found in the repository. Secrets remain server-side. Client-supplied market prices are ignored, request bytes are stream bounded, AI output is contract and policy validated, and the existing browser and network controls remain enforced. `npm audit` found zero vulnerabilities after the July 27 dependency update. |
| Responsible use | COMPLETE | The interface provides probabilities and uncertainty without picks, stakes, payouts, affiliate links, sportsbook links, or wager placement. |
| Trademark and public content | ACCEPTED WITH LIMITATIONS | Official logos, player likenesses, uniforms, endorsement claims, and copied NFL content are excluded. Text references identify the subject and the non-affiliation notice is visible. A rights holder could still object. |
| GitHub | COMPLETE | The public [erlawler/road-to-six](https://github.com/erlawler/road-to-six) repository contains the validated release history, CI, security guidance, source attribution, and release documentation. |
| Private hosting | COMPLETE | The owner-only [Road to Six release candidate](https://road-to-six-erl.erlrickylre.chatgpt.site) is deployed. One user and no groups have access. Provider credentials are stored as hidden secrets, and the model and budget settings are active. |
| Public hosting | BLOCKER | Do not change access to public or deploy a public version until Eric Lawler approves the private candidate. |

## Validation evidence

- Versioned 2026 Dallas schedule and roster snapshot with complete 2025 regular-season player production baselines
- Four opponent leaders updated from the selected weekly matchup
- Walk-forward forecast backtest on the 2024 to 2025 holdout
- Football-only, vig-adjusted market, and market-aware probabilities shown separately
- Live market source and retrieval time remain visible after refresh
- Six-hour D1 cache limits continuous The Odds API usage to 372 credits in a 31-day month
- Vig is removed within each sportsbook before calculating median consensus probability
- Runtime AI schema validation preserves probability, model version, and source time and rejects actionable betting guidance
- Duplicate integration requests are disabled in the interface while work is in progress
- Mobile section navigation remains available below the desktop breakpoint
- Local and owner-authenticated hosted checks returned five current Dallas events from The Odds API without exposing the key
- Local and hosted Runtime AI requests reached the configured integration but could not complete while OpenAI returned `insufficient_quota`; the deterministic fallback and D1 budget ledger remained available
- The owner-authenticated hosted smoke test verified the page, budget endpoint, current odds response, deterministic forecast fallback, semantic control group, and lack of horizontal overflow
- Browser semantic tree and status announcements verified on the updated release candidate
- Security headers verified on the rendered page and API routes
- Current dependency audit returned zero vulnerabilities
- Lint, production build, and 14 automated tests passed

## Remaining checklist

- [x] Eric: add a private free-tier The Odds API key.
- [x] Eric: confirm the dedicated OpenAI project budget is $10.
- [x] Eric: provide its key through secure secret configuration.
- [x] Codex: validate one live odds response.
- [ ] Eric: enable API billing or prepaid credit for the dedicated OpenAI project.
- [ ] Codex: validate one Runtime AI response after OpenAI quota is available.
- [ ] Eric: approve public hosting.
- [ ] Codex: change hosting access to public and run the production smoke test only after approval.
