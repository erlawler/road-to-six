# Free-data showcase release candidate, October 29, 2026

This candidate extends the existing Road to Six site and preserves version 27 reliability behavior, public identity, and the Wednesday 08:00 America/Chicago refresh schedule. The authoritative release source is the Sites repository. The older public GitHub mirror is not a record of this candidate.

## Implemented behavior

- The current verified Cowboys matchup selects historical PPR production leaders from each team's last three completed games. All active-roster QB, RB, WR and TE candidates are compared; ties remain visible. No player is described as a projection leader.
- The weekly statistics input is validated atomically with games, rosters and season totals. Every known league player's weekly totals reconcile with the independent season aggregate. Failed or incomplete refreshes retain the saved snapshot and withhold current usage conclusions.
- The reliability control tower exposes the latest saved outcome, source hashes, coverage and one recorded duration when available. It does not invent uptime, failure rate, latency distributions, cost history or model accuracy. The existing 52 simulated checks remain separately labeled.
- The what-if lab calculates hypothetical carries and target share with historical efficiency under PPR, half PPR or standard scoring. Bounds, blank inputs and unsupported roles abstain; reset and player changes restore baseline assumptions.
- NWS hourly forecasts and active alerts are cached behind a shared D1 lease. This MVP supports the reviewed AT&T Stadium area. Other venues abstain. Retractable-roof position is unknown, so outside weather is not described as on-field conditions and creates no point adjustment.
- Five bounded public read tools expose current matchup, player usage, leader comparison, source health and game-day context. The existing football refresh remains owner-only. The tool interface is deterministic evidence access, not AI inference.

## Source and rights

Selected nflverse-data weekly statistics are attributed under CC BY 4.0. FTN data is excluded. NWS uses a named User-Agent and open public data; venue coordinates are attributed to a public-domain coordinate dataset. No new credential, OAuth connection, paid endpoint, FantasyPros integration, image reuse or private league data is introduced.

The existing Wednesday morning schedule may precede NFL Wednesday-night/Thursday corrections. Source update and retrieval timestamps remain visible. The schedule is unchanged.

## Validation record

The candidate was checked with TypeScript, ESLint, the production build, the complete unit/integration suite, 17 offline AI cases covering 136 binary checks, 52 simulated reliability cases, data validation and the npm dependency audit. Final exact test counts and commit/deployment identifiers are recorded in the release receipt after packaging.

Browser QA covers real leaders, bounded and blank scenario inputs, reception scoring changes, player changes, reset, absent individual production, repeated/interrupted navigation, mobile menu closing and Escape, all anchor targets, and widths 320, 390, 768, 1024 and 1280. A local failed-refresh fixture confirmed unavailable current comparisons and weather while preserving the saved snapshot and evidence trace. Local fixture state was restored.

A local Worker integration check identified unsupported fetch redirect mode. The NWS adapter uses manual redirects with explicit rejection of all redirect responses; it does not follow third-party destinations. Real NWS retrieval and cache reuse must also pass on the deployed Worker before this feature is called live.

## Release gates

Packaging must push the exact tested source, save a version and deploy it to the same site. The post-deployment owner refresh must validate and atomically publish all four football inputs. Public API, MCP and rendered-site readback must verify the new source version and current weather or disclose a concrete remaining failure. Historical test success alone does not establish production recovery.
