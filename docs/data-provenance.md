# Football data provenance and reproducibility

**Validation date:** October 6, 2026. **Status:** Source validation passed. **Owner:** Eric Lawler. Deployment provenance is recorded separately by Sites.

## Source evidence

The [source manifest](../app/data/source-manifest.json) records the verified source URL, source update time, retrieval window, and expected SHA-256 for each downloaded CSV. The [normalized snapshot](../app/data/nfl-snapshot.json) includes the actual input hashes, byte sizes, row counts, coverage, and validation result. Its data version changes with the input manifest. Raw roster/player CSV files contain source fields outside product scope and are not committed; the product retains only approved public football fields.

| Input | Source update time, UTC | Input rows | SHA-256 prefix |
|---|---|---:|---|
| Schedule and historical games | 2026-10-06T23:05:13Z | 7,548 | `c665b32f6a386ac1` |
| Weekly 2026 roster | 2026-10-06T14:11:27Z | 13,004 | `fa51a2fbf2b59970` |
| 2026 regular-season player totals to date | 2026-10-06T15:55:17Z | 1,519 | `0ce6b0bc6c08448a` |

All three sources were downloaded and checksummed October 6, 2026. Each input retains its actual retrieval window. GitHub release-asset digests independently matched the roster and statistics downloads. The schedule is pinned to [nflverse commit 85de476](https://github.com/nflverse/nfldata/commit/85de4762b6f41624f46ff2680a4af7a46e22ab6c). Roster and stats release assets are mutable URLs; a later download is an exact replay only if its full SHA-256 matches the manifest.

`sourceUpdatedAt` describes the source file or commit, not an individual quote or player-record update. `validatedAt` is the date of the check. `retrievedBetween` is the observed download window. `ratingsMetadata.trainedThrough` records October 4, 2026. Current-season completed games update serving ratings after preseason regression; the retrospective holdout remains fixed to the documented 2024 to 2025 window. The refresh does not add current-season outcomes to that historical comparison.

## Validation and coverage

The official [Cowboys schedule and results](https://www.dallascowboys.com/schedule/) and [NFL team record](https://www.nfl.com/teams/dallas-cowboys/) were cross-checked at **2026-10-06T23:41:16.127Z**. Dallas was 2-2-0: losses 20-28 at New York and 31-34 against Baltimore, wins 37-20 against Washington and 34-30 at Houston. Four finals leave 13 regular-season games. The next matchup is Week 5 against Tampa Bay, October 8 at 7:15 p.m. CDT (October 9 at 00:15 UTC). Week 14 is a bye. Week 18 is officially TBD; its nflverse date/time is provisional and is not offered as a confirmed forecast.

`seasonVerification` in the source manifest records those facts, primary source links, verification time, and unconfirmed kickoffs. The release validator independently compares normalized scores, record, next kickoff, and bye against that review. The data version includes this verification record as well as the input hashes. This is primary-source corroboration of the approved nflverse ingestion, not a new scraped feed or a live scoreboard. Reverify and update the record with every new final or schedule change.

The builder rejects malformed CSV widths, duplicate game IDs, conflicting same-week player IDs, duplicate season-stat player IDs, malformed numeric fields, mismatched source hashes, and inconsistent source dates. It excludes completed outcomes after the validation date. It selects the forecast season, uses only roster weeks that have started, and admits week 1 preseason. Within the latest eligible week it deduplicates identical stable player IDs, then filters active status. It does not revive a prior-week active record when a newer row is inactive or missing.

Player statistics must match the selected football season and regular-season period. They join by stable ID. Opponent cards rank active roster players by current-season PPR totals, using stable ID as a deterministic tie-breaker. No prior-year substitute is allowed. Missing current-season rows remain unavailable. The [official Cowboys statistics](https://www.dallascowboys.com/team/stats/) and [active roster](https://www.dallascowboys.com/team/players-roster/) corroborated the featured-player evidence on October 6, including Prescott's 1,065 passing yards and Lamb's 37 receptions for 498 yards.

Verified October 6 coverage:

- 17 of 17 Cowboys regular-season games.
- Eight of eight featured Cowboys players.
- Four leaders for each of 14 distinct opponents, 56 cards in total.
- Season 2026, roster week 4, and 2026 regular-season player totals to date.
- One unidentified roster row and one unidentified stats row excluded and counted. Neither leaves a featured-player or opponent-leader gap.
- 544 of 544 holdout games have paired historical moneylines.

Missing featured players, incomplete opponent cards, a lagging roster week, or missing source metadata produce `validationStatus: partial` and explicit limitations. The separate release validator rejects a partial snapshot and checks the seven-day review window against the current clock. The browser uses the same bounded review check and reports stale or unavailable evidence. See [data-freshness-policy.md](data-freshness-policy.md). No new scheduled refresh or production deployment is created by the builder.

## Reproduce and verify

Obtain the three approved CSV inputs from the manifest URLs into a private scratch directory and verify their checksums. Run from the repository root, substituting actual local paths:

```bash
node scripts/build-nfl-snapshot.mjs \
  --games=/absolute/path/games.csv \
  --roster=/absolute/path/roster_weekly_2026.csv \
  --stats=/absolute/path/stats_player_reg_2026.csv \
  --source-metadata=app/data/source-manifest.json \
  --as-of=2026-10-06 \
  --season=2026
node scripts/validate-nfl-snapshot.mjs
```

The builder writes the normalized snapshot and [model-evaluation.json](../app/data/model-evaluation.json). It uses no wall-clock generation field, so the same input bytes, source metadata, code, and arguments produce byte-identical artifacts. A fixture run can use `--output=/absolute/path/snapshot.json`; its evaluation artifact is written alongside that file, or to `--evaluation-output`.

The release validator recomputes model parity, eligible sample counts, Brier scores, calibration bins, the evaluation hash, and snapshot metadata consistency without network access. To also verify the downloaded raw bytes, supply `--games`, `--roster`, and `--stats` to the validator. It does not verify provider rights, new upstream changes, or deployed production state.

For a future refresh, retrieve and verify current source metadata, record a new retrieval window and expected checksums, set the actual validation date, and review changes. Do not merely change the date in the old manifest. Historical release assets may no longer yield the old bytes; the checked-in evaluation still supports independent arithmetic verification, while full historical ingestion replay then requires retained approved source bytes.

Sources retain the documented CC BY 4.0 repository attribution and underlying-rights limitation. [Model assumptions and limits](model-card.md) remain separate from data-quality checks. [Data and licensing review](data-licensing-spike.md) remains the governing source-use record.
