# Road to Six Agent Guide

## Goal

Build a public technical product management portfolio artifact that demonstrates evidence traceability, transparent prioritization, scenario planning, measurement, and release governance.

## Product boundaries

- Treat all product data as synthetic unless its source, license status, and as-of date are documented.
- Approved public data scope includes player, roster, schedule, game, moneyline, spread, total, and line movement from sources with $0 vendor cost.
- Do not add bettor splits, paid sports-data feeds, or paid historical odds without a new approved decision.
- Do not add player medical, contract, private, or nonpublic data.
- Do not use official Dallas Cowboys or NFL logos, marks, player likenesses, or uniform designs.
- Keep the unofficial fan project disclaimer visible.
- Position every forecast as educational analytics, never as personalized betting advice.
- Do not produce picks, stake sizes, expected-payout claims, sportsbook links, or wager placement.
- Runtime AI may return a probability only by calling the approved versioned probability function and preserving its result.
- Runtime AI explanations must name evidence, uncertainty, model version, and source freshness.
- Runtime AI must use a dedicated OpenAI project with a $10 monthly maximum, stop application calls at $9.50, and serve the deterministic fallback after the cutoff.

## Repository map

- `app/`: product interface and fixtures
- `lib/`: deterministic scoring logic
- `docs/`: product, architecture, measurement, and delivery artifacts
- `tests/`: scoring and rendered product checks
- `.agents/skills/`: repeatable Codex workflows for this repository
- `.github/`: CI and constrained Codex review configuration

## Commands

```bash
npm run dev
npm run lint
npm run build
npm test
```

## Engineering expectations

- Preserve the deterministic 12 out of 20 BETS advance threshold unless a documented product decision changes it.
- Keep scoring functions small and test covered.
- Use accessible labels, visible focus states, semantic headings, and reduced motion support.
- Keep public exploration anonymous. Do not add authentication or personal-data persistence without a new approved architecture decision.
- External data and AI dependencies must follow ADR 007 through ADR 013 and the data licensing spike.
- Keep all credentials server-side and enforce cost, cache, timeout, and fallback controls.
- Never commit credentials. Reference environment variable names only.

## Done when

- The requested behavior is visible in the product.
- Relevant tests, lint, and build pass.
- Public facts have official citations and changing facts include an as-of date.
- Privacy, security, accessibility, and trademark checks are complete.
- Generated text, comments, and documents contain no em dash or en dash characters.
