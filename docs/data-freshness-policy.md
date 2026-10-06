# Source freshness and coverage policy

**Updated:** October 5, 2026
**Scope:** Football freshness is enforced by the authenticated hosted updater, shared data reader, forecast API, and browser. See [weekly update operations](weekly-football-updates.md) for activation and verification requirements.
**Owner:** Eric Lawler owns source review and release acceptance. Codex can prepare source comparisons and validated candidate artifacts within authorized scope.

## Interpret timestamps correctly

Use upstream publication or commit time only when recorded by the source. Use retrieval time for the download or provider response and validation time for the application's checks. Neither retrieval nor validation proves that upstream content changed on that date. The [source manifest and provenance](data-provenance.md) define inheritance and the exact evidence captured by the candidate builder.

| Source category | Candidate operating expectation | User-facing limitation and action |
|---|---|---|
| NFL schedule | Review at least every 7 days during the season; verify a selected game's date and venue within 24 hours before kickoff when demonstrating or releasing a forecast for it. | Show the validated date. After 7 days, describe it as a dated schedule snapshot. A changed matchup, time, or venue requires source reconciliation before calling it current. |
| Active roster and opponent leaders | Validate roster membership at least every 7 days during the season and after a known roster-source update that changes a featured player or selected opponent. | Say active as of the validation date. Past the target, mark roster membership as needing refresh. If a join fails, expose missing coverage instead of silently substituting a player. |
| Complete 2025 player production | A completed-season baseline does not expire every 7 days. Recheck official source revisions with the roster refresh and preserve the season, checksum, and validation evidence. | Label the data as complete 2025 production. Do not call it current-season form. Missing prior-season production is a coverage gap, not automatically an application failure. |
| Ratings and backtest | Rebuild only from a documented model/data release; preserve the development window, holdout window, source evidence, and model version. | The historical holdout validates its stated baseline and inputs. It does not validate manually assigned player sensitivity coefficients or future-season accuracy. |
| Current moneyline, spread, and total | Apply only supported, matched markets within the six-hour cache lifetime. Preserve provider timestamps, retrieval time, cache expiry, event match, and market-specific sportsbook counts. | One participating book is a single-source price. Missing spreads, totals, or paired moneylines must be explicit. Expired or unmatched data must not be described as current or multi-book consensus. |
| Archived market snapshot | Retain only with its captured date and baseline label. It has no current-market freshness guarantee. | Show baseline or unavailable state distinctly. A fallback is evidence of availability design, not evidence of current odds. |

The 7-day and 24-hour targets are product operating choices, not vendor service guarantees. A monthly health check alone does not satisfy an in-season weekly freshness target. No new automation, source subscription, or deployment is created by this policy.

`npm run data:validate` validates the immutable bundled fallback at its recorded verification time, including hashes, joins, model calculations, and official evidence consistency. It makes no claim that this fallback is current today. Every hosted refresh uses the same validator with the actual current time and rejects stale, future, incomplete, or conflicting evidence before publication. The public page and forecast API read the same D1 version; a failed data read is visible and cannot silently renew the source dates. Precise review and retrieval timestamps determine the seven-day window for hosted data, avoiding premature expiration at UTC midnight. Legacy bundled data retains its conservative date-only age. Completed 2025 player statistics remain explicitly historical.

## Current season and scenario behavior

The current-season view retains completed scores and computes the actual record only from verified finals. Forecast choices contain upcoming games with confirmed kickoff times. A kickoff that has passed without a verified final marks the record incomplete and pauses scenarios; elapsed time never creates a win, loss, or tie. The API also rejects final, started, and unconfirmed games before provider or ledger calls. The site is not a live scoreboard.

The next Cowboys matchup is distinct from the league calendar week, which runs Tuesday through Monday. During a Cowboys bye, the bye is explicit and the next-game scenario names its later week. After the regular season, there is no fallback to a completed-game forecast. NFLverse Eastern kickoff times are converted with the date's actual DST offset.

Scenarios are held in memory only. On page load the next eligible matchup and baseline controls are selected. Manual matchup changes retain Dallas assumptions, label them as custom, and reset the opponent control. A data-version, week, or automatic matchup transition invalidates the prior AI response and clears old controls with a visible explanation. The clock is checked each minute and on focus, visibility, and page restoration. The 100% baseline is a hypothetical participation assumption, never a claim about current player availability.

## Weekly hosted refresh

The approved cadence is Wednesday at 8 a.m. America/Chicago, using a Site-linked cloud task and the owner-only football updater. The supported connection, controlled update/readback, and saved schedule must be verified before calling it enabled. Its source and publication operations require no Mac and no paid AI or odds calls. The separate monthly health check is preserved.

On success the updater atomically replaces the football snapshot and verification evidence in D1. On failure it retains the last good payload and successful timestamp, records failure status, and notifies the owner. Public readers see dated evidence and a warning. The updater validates all final scores, actual record, remaining schedule, official next kickoff, bye/TBD weeks, roster coverage, and rating calculations. Scenario controls remain hypothetical and cannot change actual results.

Wednesday-only operation means weekend results may remain pending until Wednesday. A kickoff that has passed without a verified final pauses scenarios. The site is not a live scoreboard, injury report, or automatic current-season player-performance model. The 24-hour pre-kickoff recommendation for a demonstration remains separate from the owner's chosen weekly cadence; no extra daily schedule is implied.

## Coverage decision rules

1. A provider that returns no market or only one book has a coverage limitation. Record event and market counts before diagnosing application failure.
2. A returned provider event that cannot be joined to the product's schedule requires explicit reconciliation evidence. Never guess the match.
3. A field returned correctly by the provider but discarded or mislabeled by the application is an application defect.
4. A stale football snapshot is a maintenance gap even when live odds work. Report those states separately.
5. A completed prior-season statistic may remain valid while current roster membership becomes stale. Evaluate each source category independently.

## Release evidence

For a candidate, record source URLs, upstream times when available, retrieval window, validation date, checksum, record counts, missing joins, and exact generated files. Use the model card for model evidence and the release review for command and browser results. Do not claim operational freshness from a successful build alone.
