# Source freshness and coverage policy

**Updated:** October 5, 2026
**Scope:** Football review freshness is enforced in release validation and browser status. No scheduled source refresh exists.
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

`npm run data:validate` now rejects a snapshot when the oldest of its validation date (UTC midnight), schedule retrieval, and roster retrieval is more than seven days old. Missing, future, partial, or inconsistent review evidence fails closed. The browser shares this check and reevaluates it each minute; changing only the validation date cannot renew old retrieval evidence. The completed 2025 statistical baseline is deliberately excluded from the seven-day review-age test. Its checksum and provenance remain validated separately. Source review is not a claim that every provider record changed that day, and a live odds refresh never renews football review evidence. The selected-game 24-hour pre-kickoff review remains an operator responsibility.

## Current season and scenario behavior

The current-season view retains completed scores and computes the actual record only from verified finals. Forecast choices contain upcoming games with confirmed kickoff times. A kickoff that has passed without a verified final marks the record incomplete and pauses scenarios; elapsed time never creates a win, loss, or tie. The API also rejects final, started, and unconfirmed games before provider or ledger calls. The site is not a live scoreboard.

The next Cowboys matchup is distinct from the league calendar week, which runs Tuesday through Monday. During a Cowboys bye, the bye is explicit and the next-game scenario names its later week. After the regular season, there is no fallback to a completed-game forecast. NFLverse Eastern kickoff times are converted with the date's actual DST offset.

Scenarios are held in memory only. On page load the next eligible matchup and baseline controls are selected. Manual matchup changes retain Dallas assumptions, label them as custom, and reset the opponent control. A data-version, week, or automatic matchup transition invalidates the prior AI response and clears old controls with a visible explanation. The clock is checked each minute and on focus, visibility, and page restoration. The 100% baseline is a hypothetical participation assumption, never a claim about current player availability.

## Ongoing refresh proposal, not enabled

No source-content refresh job exists in this repository or Site. CI validates checked-in data on PRs and main pushes; the scheduled CodeQL run scans code. The separate monthly health check can detect maintenance gaps but does not ingest and publish current football content. The six-hour odds cache only updates markets on demand and cannot update game results, rosters, ratings, or the default scenario.

The minimum maintenance loop is a verified football rebuild after each Cowboys final and a schedule check within 24 hours of the next kickoff, including bye weeks and flex changes. An unattended experience needs a content refresh pipeline that downloads approved free inputs, verifies the official record and next matchup, rebuilds ratings and snapshots, passes the existing checks, and publishes only the reviewed candidate. Changing a date or creating a reminder alone cannot make the site current.

Proposed recurring preparation, requiring owner approval: every day at 8:00 a.m. America/Chicago during the regular season, check free source publication metadata and primary schedule/results; prepare a tested PR when content changes and flag missing results or inconsistent sources. No paid AI tests or odds calls. The morning after every game captures the normal result refresh; a failed or delayed source check must remain visible. Confirm the owner, end date, and approval/publication path before enabling it. Automatic merging, deployment, credentials, or broader access would require separate authorization. No schedule or recurring job is created by this change.

## Coverage decision rules

1. A provider that returns no market or only one book has a coverage limitation. Record event and market counts before diagnosing application failure.
2. A returned provider event that cannot be joined to the product's schedule requires explicit reconciliation evidence. Never guess the match.
3. A field returned correctly by the provider but discarded or mislabeled by the application is an application defect.
4. A stale football snapshot is a maintenance gap even when live odds work. Report those states separately.
5. A completed prior-season statistic may remain valid while current roster membership becomes stale. Evaluate each source category independently.

## Release evidence

For a candidate, record source URLs, upstream times when available, retrieval window, validation date, checksum, record counts, missing joins, and exact generated files. Use the model card for model evidence and the release review for command and browser results. Do not claim operational freshness from a successful build alone.
