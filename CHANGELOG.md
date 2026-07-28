# Changelog

All notable changes to Road to Six are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Public hosting and the production smoke test remain blocked until Eric Lawler gives explicit approval.
- Five privacy-safe usability sessions and the resulting product decisions remain `[NEEDS INPUT]`.
- Captioned demo media and final GitHub release publication remain `[NEEDS INPUT]`.

## [1.0.0] - 2026-07-27

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

- The source and private candidate can be reviewed.
- No Git tag, GitHub release, public-hosting change, or production declaration is included in this local preparation.
