# Changelog

All notable changes to Road to Six are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Canonical, Open Graph URL and type, and social-image alt metadata for public sharing and discovery.
- Public `robots.txt` and one-page `sitemap.xml` files that keep application APIs out of crawler scope.
- An optional moderated usability research kit with privacy-safe consent, tasks, scoring, notes, and completion evidence.
- Five synthetic ideal-persona usability simulations with modeled task scores, prioritized hypotheses, and an explicit no-human-research-claim boundary.
- A seven-pull-request Dependabot review with compatibility risk and merge recommendations.
- An optimized 1200 by 630 JPEG social-preview asset.

### Changed

- Eric Lawler accepted the transparent AI persona evidence package as the completed portfolio gate. No human testing is claimed, and moderated human research is optional future work.
- Pinned Road to Six on Eric Lawler's public GitHub profile.
- Configured the optimized Market Context Lab image as the GitHub repository social preview.

### Security

- Tightened the page content security policy to deny unspecified sources, forms, frames, media, workers, inline event-handler scripts, and inline style elements.
- Retained only the framework inline-script allowance and the dynamic probability-ring style attribute required by the current runtime, with the tradeoff documented in ADR 018.
- Protected `main` with an active no-bypass GitHub ruleset requiring pull requests, strict CI and CodeQL checks, resolved review threads, squash merges, and linear history while blocking force pushes and deletion.
- Enabled Dependabot vulnerability alerts and security-update proposals. Confirmed secret scanning and push protection remain enabled, with zero open dependency or secret alerts.

### Planned

- The optional narrated LinkedIn walkthrough remains `[NEEDS INPUT]`.
- Product adoption analytics remain outside v1.0.0.

## [1.0.0] - 2026-07-29

### Added

- Weekly Dallas matchup selection with sourced 2026 roster and schedule data.
- Complete 2025 regular-season baselines for featured Dallas players and four matchup-aware opponent leaders.
- Scenario controls for Dak Prescott, CeeDee Lamb, George Pickens, Javonte Williams, the defensive core, and the selected opponent's top producer.
- Transparent football-only, market-implied, and market-aware probability views.
- Walk-forward model audit with Brier scores, calibration error, and an explicit no-edge conclusion.
- Server-side current odds normalization, six-hour caching, and bundled-data fallback.
- Grounded Runtime AI explanations with evidence, uncertainty, source freshness, policy validation, cost controls, and deterministic fallback.
- An AI reliability receipt for model, prompt, contract, evaluation, latency, token, cost, source, validation, and fallback evidence.
- Automated AI evaluations for positive, adversarial, responsible-use, and fallback behavior.
- A sanitized four-scenario live AI scorecard comparing contract quality, latency, and estimated cost with the deterministic baseline.
- Product brief, architecture, decision log, measurement plan, data-rights review, public-use review, case study, and Codex collaboration record.
- CodeQL workflow and Dependabot configuration for ongoing repository security maintenance.
- Privacy-safe usability test plan, owner-feedback traceability table, repository launch checklist, and static Mermaid user flow.
- Neutral Market Context Lab social preview without official team or league marks.

### Changed

- Reframed the product from Market Bias Lab to Market Context Lab because the available data cannot establish bettor popularity or market bias.
- Rewrote the model-audit headline to describe the comparison directly.
- Promoted the local package version to 1.0.0 for release preparation.
- Updated release evidence after the live Runtime AI provider gate passed all seven evaluation criteria.

### Security

- Kept provider credentials server-side and excluded local environment files from source control.
- Added one-statement request limiting before market reads, static cacheable budget posture, payload validation, budget, cache, atomic refresh-lease, approved-model, closed-set explanation, and fallback controls around external integrations.
- Added automated dependency auditing, CodeQL analysis, and weekly dependency update proposals.

### Release boundary

- Eric Lawler approved the final source push, `v1.0.0` tag and GitHub release, public hosting, and signed-out production smoke test on July 29, 2026.
- At initial release, moderated human research was deferred. The later owner decision recorded under Unreleased accepted transparent AI persona validation as the completed portfolio gate and retained human research as optional future work.
- The source, tag, GitHub release, and Sites version 13 are public. The signed-out production smoke test passed on July 30, 2026.
