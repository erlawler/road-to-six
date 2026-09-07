# Source freshness and coverage policy

**Prepared:** September 7, 2026
**Scope:** September flagship candidate; operational targets are proposed and are not evidence that a scheduled refresh exists.
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

The 7-day and 24-hour targets are product operating choices, not vendor service guarantees. A monthly health check alone does not satisfy an in-season weekly freshness target. No new automation, source subscription, or deployment is created by this policy. Builders may enforce structural and temporal consistency without enforcing these elapsed-time operating targets; release review must check both.

## Coverage decision rules

1. A provider that returns no market or only one book has a coverage limitation. Record event and market counts before diagnosing application failure.
2. A returned provider event that cannot be joined to the product's schedule requires explicit reconciliation evidence. Never guess the match.
3. A field returned correctly by the provider but discarded or mislabeled by the application is an application defect.
4. A stale football snapshot is a maintenance gap even when live odds work. Report those states separately.
5. A completed prior-season statistic may remain valid while current roster membership becomes stale. Evaluate each source category independently.

## Release evidence

For a candidate, record source URLs, upstream times when available, retrieval window, validation date, checksum, record counts, missing joins, and exact generated files. Use the model card for model evidence and the release review for command and browser results. Do not claim operational freshness from a successful build alone.
