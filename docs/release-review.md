# Release Review

**Review date:** July 15, 2026

**Release candidate:** READY WITH EXTERNAL BLOCKERS

**Public source repository:** AUTHORIZED, BLOCKED BY GITHUB SIGN-IN

**Private hosted candidate:** COMPLETE

**Public hosting:** BLOCKED pending Eric Lawler's final approval

## Decision

The release candidate passes the product, accessibility, security, privacy, responsible-use, data-rights, trademark, build, and test gates with the documented limitations accepted in the [Public Use Review](public-use-review.md).

The deterministic product is release ready. The live odds and runtime AI gates cannot pass until their private keys are configured. GitHub creation cannot complete until the expired local GitHub session is renewed. Public hosting remains outside the current approval.

## Gate status

| Gate | Status | Evidence and remaining action |
|---|---|---|
| Product flow | COMPLETE | Game, player, opponent, market, forecast, explanation, and model-audit flows are implemented and browser verified. |
| Accessibility | COMPLETE | Browser semantic review confirmed ordered headings, named navigation, named controls, a scenario fieldset, live statuses, skip navigation, focus rules, reduced motion, and no desktop horizontal overflow. Primary text and button contrast now meet at least 4.5 to 1. This is not a formal accessibility certification. |
| Data rights | ACCEPTED WITH LIMITATIONS | nflverse attribution, source links, CC BY 4.0 license link, transformation notice, and underlying-rights limitation are documented in `NOTICE.md` and the Public Use Review. |
| Live odds | BLOCKED | The server-side adapter, timeout, error state, and bundled snapshot are verified. [NEEDS INPUT] Securely configure `THE_ODDS_API_KEY`, then validate one current response. |
| Runtime AI | BLOCKED | The Responses API tool loop, structured output, model-aware D1 ledger, $9.50 cutoff, and deterministic fallback are verified. [NEEDS INPUT] Configure a dedicated `OPENAI_API_KEY`, set the OpenAI project budget to $10, and validate one live response. |
| Cost | COMPLETE | GPT-5.6 Luna is the default. Pricing tests use current standard input and output rates. D1 reserves before each request and reconciles actual use. |
| Security and privacy | COMPLETE | No credentials were found in the repository. Secrets remain server-side. Request size, content type, numeric inputs, timeouts, CSP, HSTS, frame blocking, browser permissions, and cross-origin policies are enforced. `npm audit` found zero vulnerabilities. |
| Responsible use | COMPLETE | The interface provides probabilities and uncertainty without picks, stakes, payouts, affiliate links, sportsbook links, or wager placement. |
| Trademark and public content | ACCEPTED WITH LIMITATIONS | Official logos, player likenesses, uniforms, endorsement claims, and copied NFL content are excluded. Text references identify the subject and the non-affiliation notice is visible. A rights holder could still object. |
| GitHub | BLOCKED | Public repository creation and initial push are authorized. The local GitHub CLI session for `erlawler` is expired and must be renewed. |
| Private hosting | COMPLETE | The owner-only [Road to Six release candidate](https://road-to-six-erl.erlrickylre.chatgpt.site) is deployed. One user and no groups have access. Nonsecret model and budget settings are active. |
| Public hosting | BLOCKER | Do not change access to public or deploy a public version until Eric Lawler approves the private candidate. |

## Validation evidence

- Versioned 2026 Dallas schedule and roster snapshot with complete 2025 regular-season player production baselines
- Four opponent leaders updated from the selected weekly matchup
- Walk-forward forecast backtest on the 2024 to 2025 holdout
- Football-only, vig-adjusted market, and market-aware probabilities shown separately
- Live odds configuration-required response verified without exposing a key
- Runtime AI deterministic fallback and available D1 budget ledger verified without exposing a key
- Owner-authenticated hosted smoke test verified the page, budget endpoint, odds fallback, forecast fallback, semantic control group, and lack of horizontal overflow
- Browser semantic tree and status announcements verified on the updated release candidate
- Security headers verified on the rendered page and API routes
- Current dependency audit returned zero vulnerabilities
- Lint, production build, and 12 automated tests passed

## Remaining checklist

- [ ] Eric: renew the GitHub CLI sign-in so the public repository can be created and pushed.
- [ ] Eric: add a private free-tier The Odds API key.
- [ ] Eric: create or select a dedicated OpenAI project, set its budget to $10, and provide its key through secure secret configuration.
- [ ] Codex: validate one live odds response and one Runtime AI response after the keys are available.
- [ ] Eric: approve public hosting.
- [ ] Codex: change hosting access to public and run the production smoke test only after approval.
