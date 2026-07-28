# Repository and Portfolio Launch Checklist

**Package:** 1.0.0
**Current state:** Prior owner-only hosted candidate, public source repository, and local v1.0.0 candidate
**Authority boundary:** Public hosting requires Eric Lawler's explicit approval

## Release evidence

- [x] Confirm the final P0 reliability and rate-limit implementation passed build, lint, tests, and AI evaluation.
- [x] Validate one live odds response.
- [x] Validate one live Runtime AI response against all seven criteria.
- [x] Run the four-scenario live AI scorecard and record quality, latency, and estimated cost.
- [ ] `[NEEDS INPUT]` Re-run the owner-authenticated private smoke test against the final saved version.
- [x] Confirm the final automated test count of 72 in README, release review, and release notes.
- [x] Review the complete diff for secrets, personal data, unsupported claims, and unrelated files.

## GitHub repository presentation

- [ ] `[NEEDS INPUT]` Set the repository description to: `Evidence-grounded football forecasting case study demonstrating technical product management, AI evaluation, cost controls, and release governance.`
- [ ] `[NEEDS INPUT]` Add repository topics: `technical-product-management`, `product-management`, `frontier-ai`, `ai-evaluation`, `responsible-ai`, `explainable-ai`, `sports-analytics`, `nextjs`, `cloudflare-workers`, and `codex`.
- [ ] `[NEEDS INPUT]` Upload `public/og-market-context.png` as the repository social preview.
- [ ] `[NEEDS INPUT]` Confirm the README social card, badges, table of contents path, and local links render on GitHub.
- [ ] `[NEEDS INPUT]` Pin the repository on Eric Lawler's GitHub profile.
- [ ] `[NEEDS INPUT]` Confirm the repository visibility matches Eric's launch decision. Do not change visibility as part of this release preparation.

## GitHub security and maintenance

- [x] Add continuous integration for audit, lint, AI evaluation, build, and tests.
- [x] Add CodeQL analysis for JavaScript and TypeScript.
- [x] Add weekly Dependabot proposals for npm and GitHub Actions.
- [ ] `[NEEDS INPUT]` Enable Dependabot alerts and Dependabot security updates in repository settings.
- [ ] `[NEEDS INPUT]` Enable secret scanning and push protection in repository settings.
- [ ] `[NEEDS INPUT]` Confirm CodeQL completes successfully after the workflow reaches the default branch.
- [ ] `[NEEDS INPUT]` Review the first Dependabot pull requests before merging.

## Portfolio media

- [x] Add a neutral 1200 by 630 Market Context Lab social card without official team or league marks.
- [ ] `[NEEDS INPUT]` Record a 60 to 90 second product demo.
- [ ] `[NEEDS INPUT]` Add accurate captions and a transcript to the demo.
- [ ] `[NEEDS INPUT]` Capture the approved hero, scenario, AI reliability receipt, and model-audit screenshots.
- [ ] `[NEEDS INPUT]` Verify that media contains no credentials, browser identity, private URLs, notification content, or participant information.
- [ ] `[NEEDS INPUT]` Add final media links to README and the LinkedIn launch kit. Do not add placeholder links.

## Research and product evidence

- [x] Preserve owner-review feedback and shipped outcomes in [Usability Research](usability-research.md).
- [ ] `[NEEDS INPUT]` Complete five privacy-safe usability sessions.
- [ ] `[NEEDS INPUT]` Document de-identified findings, product decisions, and validation results.
- [ ] `[NEEDS INPUT]` Update the case study with observed outcomes. Do not present targets as results.

## v1.0.0 publication

- [x] Set the local package version to 1.0.0.
- [x] Add [CHANGELOG](../CHANGELOG.md) and [release notes](../RELEASE_NOTES.md).
- [ ] `[NEEDS INPUT]` Create the `v1.0.0` tag only after final approval.
- [ ] `[NEEDS INPUT]` Create the GitHub release from `RELEASE_NOTES.md` only after final approval.
- [ ] `[NEEDS INPUT]` Attach approved demo media only after privacy review.
- [ ] `[NEEDS INPUT]` Verify release links after publication.

## Hosted launch

- [ ] `[NEEDS INPUT]` Eric Lawler approves public hosting.
- [ ] `[NEEDS INPUT]` Change hosting access only after approval.
- [ ] `[NEEDS INPUT]` Run the public production smoke test for page load, odds refresh, deterministic forecast, Runtime AI, fallback, rate limiting, accessibility, security headers, source links, and social metadata.
- [ ] `[NEEDS INPUT]` Confirm the $10 provider budget and $9.50 application cutoff remain active.
- [ ] `[NEEDS INPUT]` Record the production version and smoke-test timestamp in the release review.

## Rollback

If the production smoke test fails, restore owner-only access, keep deterministic fallback active, and document the failing gate before any new release declaration.
