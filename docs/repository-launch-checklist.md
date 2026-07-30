# Repository and Portfolio Launch Checklist

**Package:** 1.0.0
**Current state:** v1.0.0 published on GitHub and publicly available through Sites
**Authority boundary:** Eric Lawler approved the GitHub push, v1.0.0 tag and release, public hosting, and signed-out production smoke test

## Release evidence

- [x] Confirm the final P0 reliability and rate-limit implementation passed build, lint, tests, and AI evaluation.
- [x] Validate one live odds response.
- [x] Validate one live Runtime AI response against all seven criteria.
- [x] Run the four-scenario live AI scorecard and record quality, latency, and estimated cost.
- [x] Re-run the owner-authenticated private smoke test against the final saved version.
- [x] Confirm the final automated test count of 73 in README and release review. Update release notes only when the release is approved.
- [x] Review the complete diff for secrets, personal data, unsupported claims, and unrelated files.

## GitHub repository presentation

- [x] Set the repository description to: `Evidence-grounded football forecasting case study demonstrating technical product management, AI evaluation, cost controls, and release governance.`
- [x] Add repository topics: `technical-product-management`, `product-management`, `frontier-ai`, `ai-evaluation`, `responsible-ai`, `explainable-ai`, `sports-analytics`, `nextjs`, `cloudflare-workers`, and `codex`.
- [ ] `[NEEDS INPUT]` Upload `public/og-market-context.png` as the repository social preview.
- [ ] `[NEEDS INPUT]` Confirm the README social card, badges, table of contents path, and local links render on GitHub.
- [ ] `[NEEDS INPUT]` Pin the repository on Eric Lawler's GitHub profile.
- [x] Confirm the public repository visibility matches Eric's launch decision.
- [x] Add the public product URL to the GitHub repository homepage and README.

## GitHub security and maintenance

- [x] Add continuous integration for audit, lint, AI evaluation, build, and tests.
- [x] Add CodeQL analysis for JavaScript and TypeScript.
- [x] Add weekly Dependabot proposals for npm and GitHub Actions.
- [ ] `[NEEDS INPUT]` Enable Dependabot alerts and Dependabot security updates in repository settings.
- [ ] `[NEEDS INPUT]` Enable secret scanning and push protection in repository settings.
- [x] Confirm CodeQL completes successfully after the workflow reaches the default branch.
- [ ] `[NEEDS INPUT]` Review the first Dependabot pull requests before merging.

## Portfolio media

- [x] Add a neutral 1200 by 630 Market Context Lab social card without official team or league marks.
- [x] Create a 20-second animated hosted walkthrough.
- [x] Add accurate frame captions and a transcript to the walkthrough.
- [x] Capture the hosted hero, scenario, AI reliability receipt, opponent-evidence, model-audit, and product-governance screenshots.
- [x] Verify that media contains no credentials, browser identity, private URLs, notification content, or participant information.
- [x] Add final media links to README and the LinkedIn launch kit.
- [ ] `[NEEDS INPUT]` Eric records and approves the optional 60 to 90 second narrated LinkedIn walkthrough.

## Research and product evidence

- [x] Preserve owner-review feedback and shipped outcomes in [Usability Research](usability-research.md).
- [x] Complete five labeled AI proxy and expert pretests without presenting them as human participant research.
- [x] Record Eric Lawler's approval to defer the five-session human study from the v1.0.0 launch gate to post-launch validation.
- [x] Preserve the limitation that v1.0.0 is not human validated.
- [ ] `[NEEDS INPUT]` Complete five privacy-safe post-launch usability sessions.
- [ ] `[NEEDS INPUT]` Document de-identified findings, product decisions, and validation results.
- [ ] `[NEEDS INPUT]` Update the case study with observed outcomes. Do not present targets as results.

## v1.0.0 publication

- [x] Set the local package version to 1.0.0.
- [x] Add [CHANGELOG](../CHANGELOG.md) and [release notes](../RELEASE_NOTES.md).
- [x] Create the `v1.0.0` tag after final approval.
- [x] Create the GitHub release from `RELEASE_NOTES.md` after final approval.
- [x] Attach the privacy-reviewed animated walkthrough and social preview to the GitHub release.
- [x] Verify the GitHub release link after publication.

## Hosted launch

- [x] Eric Lawler approved public hosting on July 29, 2026.
- [x] Internet publishing was enabled for Sites.
- [x] Codex changed Road to Six access to Anyone on the internet.
- [x] Run the signed-out success-path production smoke test for page load, odds refresh, deterministic forecast, Runtime AI, input rejection, accessibility, security headers, source links, and social metadata.
- [x] Confirm the $10 provider budget and $9.50 application cutoff remain active.
- [x] Record Sites version 13, the authenticated hosted smoke test, the public HTTP 200 result, and the signed-out production evidence in the release review.

## Rollback

If a future production smoke test fails, restore owner-only access, keep deterministic fallback active, and document the failing gate before any new release declaration.

## Post-launch P2 hardening

- [ ] Add canonical, `og:type`, `og:url`, and social-image alt metadata.
- [ ] Add `robots.txt` and `sitemap.xml`.
- [ ] Evaluate removing inline script and style allowances from the framework CSP without breaking hydration.
