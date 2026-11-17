# October 29 reliability and fantasy showcase candidate

## Product outcome

The football updater now retains each team's most recent scheduled roster week through a verified bye. October 28 failed because Jacksonville and Washington had no Week 7 roster rows; the prior join discarded their valid Week 6 rows. The repair also uses actual kickoff time instead of the UTC date to determine which week has started. Missing non-bye coverage, conflicts, invalid checksums and stale inputs still fail closed. The one-hour cooldown and atomic last-good snapshot retention are unchanged.

Forecast navigation always reaches a section, including when forecasts are paused. Football reads are aborted on unmount, and Escape dismisses the mobile navigation from its toggle or links.

The Player Decision Lab shows current-week schedule context and an explicit unavailable state for live fantasy leaders. Its separate walkthrough ranks both teams' fictional player fixtures by PPR points, exposes scoring components, and demonstrates truncated, stale, conflicting and bye inputs. It is not a live FantasyPros integration and never calls that provider. Public-display rights and a complete licensed response remain prerequisites. The adapter is disabled in code.

The AI Reliability Dashboard publishes executable deterministic test outcomes, their actual run time, and a SHA-256 fingerprint of tested dependencies. The 52 checks cover schema, completeness, freshness, conflicting evidence, unsupported structured claims, abstention, caching, HTTP 429, timeout, concurrency and last-good retention. Simulated provider failures are labeled. Production uptime, model factual accuracy, latency and cost per decision remain unmeasured. Existing July AI scorecards remain historical evidence.

Cowboys Fantasy Impact separates public practice-participation facts from fantasy interpretation and uncertainty. No medical details, player images, numeric point adjustments or changes to game-win forecasts are added. Evidence was manually checked at 2026-10-29T01:25:18Z and expires 24 hours later; there is no automated news ingestion. On expiry or an unverified/mismatched current week, the module abstains and links to the official report.

## Source and release traceability

The authoritative source is the Sites-managed repository for project `appgprj_6a58238e54648191b9e6529aab42db5d`. It recovered the exact published version 26 commit `5c27d8b76c95f2fe865ccf7f21b450504251a30f`. The older GitHub main was not used as the release base and was not overwritten. The saved Sites version binds the final pushed commit to its unchanged deployment archive. The final deployment receipt is reported with the release outcome.

The refreshed bundled snapshot is `nflverse-2026-10-29-2f49ecb3140a`, with official review at 2026-10-29T01:28:01.988Z. It records Dallas 3-4, seven completed games, Week 7 Dallas 38-21 Philadelphia, and Week 8 Arizona at Dallas on November 1 at 18:00 UTC. It contains 17 games, eight featured players and 56 opponent leaders. Historical evaluation inputs, rows, parameters and rounded conclusions are unchanged; source metadata and artifact hashes are updated.

## Verification

The candidate passed type checking, ESLint, production build, 217 automated tests, the 17-case / 136-check AI contract evaluation, and snapshot validation. The dashboard's 52 fault-injection cases passed. Dependency audit returned zero vulnerabilities after patching only `undici` to 7.30.1 and `fast-uri` to 3.1.9.

Browser QA uses the local preview, including a seeded local database for healthy and failed-snapshot states. It covers 1280px desktop, 1024px compact desktop, 768px tablet, 390px phone and 320px narrow phone; navigation, keyboard Escape, disclosure controls, scenario changes, source labels, layout overflow and paused forecast links. Local fixtures are not production telemetry. No paid AI or odds endpoints were called.

## Operational follow-up

The existing Site-linked Wednesday automation was reported disabled by Sites. Its known ID is `Automation_2d8dc9c9a1548191be67cbc36da787e9`. The automation lookup returned not accessible in this execution context. No replacement schedule was created and no unrelated automation was changed. The owner-facing scheduler must restore this existing task through an authorized context before weekly unattended operation can be claimed.

The pre-repair hosted attempt at 2026-10-29T01:24:46.729Z failed and preserved the prior good snapshot. Production verification must wait until the unchanged cooldown permits a new refresh, then check owner status and public `/api/football` readback. A local successful candidate or a successful deployment alone does not prove a successful hosted refresh.
