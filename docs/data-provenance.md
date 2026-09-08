# Football data provenance and reproducibility

**Validation date:** September 7, 2026. **Status:** Local release candidate. **Owner:** Eric Lawler. This refresh has not been deployed by the flagship improvement work.

## Source evidence

The [source manifest](../app/data/source-manifest.json) records the verified source URL, source update time, retrieval window, and expected SHA-256 for each downloaded CSV. The [normalized snapshot](../app/data/nfl-snapshot.json) includes the actual input hashes, byte sizes, row counts, coverage, and validation result. Its data version changes with the input manifest. Raw roster/player CSV files contain source fields outside product scope and are not committed; the product retains only approved public football fields.

| Input | Source update time, UTC | Input rows | SHA-256 prefix |
|---|---|---:|---|
| Schedule and historical games | September 7, 08:15:12 | 7,548 | `68f2b4d7e7f7fa5` |
| Weekly 2026 roster | September 6, 11:28:09 | 2,946 | `5ec59c5228198f57` |
| Complete 2025 regular-season player stats | August 13, 16:51:50 | 2,020 | `aaa8559478dd8d585` |

All three files were retrieved during the verified September 7 window from 09:02 to 09:11 UTC. No exact per-file retrieval timestamp is claimed. The schedule is pinned to [nflverse commit e2a169b](https://github.com/nflverse/nfldata/commit/e2a169b41f56fb027ca894c930ab75b699a12e68). Roster and stats release assets are mutable URLs; a later download is an exact replay only if its full SHA-256 matches the manifest.

`sourceUpdatedAt` describes the source file or commit, not an individual quote or player-record update. `validatedAt` is the date of the check. `retrievedBetween` is the observed download window. `ratingsMetadata.trainedThrough` separately records January 4, 2026, the final completed 2025 regular-season game used for ratings. The preseason regression prepares those ratings for season 2026; it does not imply that 2026 games have been observed.

## Validation and coverage

The builder rejects malformed CSV widths, duplicate game IDs, conflicting same-week player IDs, duplicate season-stat player IDs, malformed numeric fields, mismatched source hashes, and inconsistent source dates. It excludes completed outcomes after the validation date. It selects the forecast season, uses only roster weeks that have started, and admits week 1 preseason. Within the latest eligible week it deduplicates identical stable player IDs, then filters active status. It does not revive a prior-week active record when a newer row is inactive or missing.

The player baseline must be from a prior season whose listed regular-season schedule is complete by the validation date. Player statistics join by stable ID. Opponent cards rank active roster players with prior-season statistics by PPR, using stable ID as a deterministic tie-breaker.

Verified September 7 coverage:

- 17 of 17 Cowboys regular-season games.
- Eight of eight featured Cowboys players.
- Four leaders for each of 14 distinct opponents, 56 cards in total.
- Season 2026, roster week 1, and complete 2025 player baselines.
- One unidentified roster row and one unidentified stats row excluded and counted. Neither leaves a featured-player or opponent-leader gap.
- 544 of 544 holdout games have paired historical moneylines.

Missing featured players, incomplete opponent cards, a lagging roster week, or missing source metadata produce `validationStatus: partial` and explicit limitations. The separate release validator rejects a partial snapshot. Source metadata and completeness are not a timer-based freshness guarantee; the proposed operating targets are in [data-freshness-policy.md](data-freshness-policy.md). No new scheduled refresh or production deployment is created by the builder.

## Reproduce and verify

Obtain the three approved CSV inputs from the manifest URLs into a private scratch directory and verify their checksums. Run from the repository root, substituting actual local paths:

```bash
node scripts/build-nfl-snapshot.mjs \
  --games=/absolute/path/games.csv \
  --roster=/absolute/path/roster_weekly_2026.csv \
  --stats=/absolute/path/stats_player_reg_2025.csv \
  --source-metadata=app/data/source-manifest.json \
  --as-of=2026-09-07 \
  --season=2026
node scripts/validate-nfl-snapshot.mjs
```

The builder writes the normalized snapshot and [model-evaluation.json](../app/data/model-evaluation.json). It uses no wall-clock generation field, so the same input bytes, source metadata, code, and arguments produce byte-identical artifacts. A fixture run can use `--output=/absolute/path/snapshot.json`; its evaluation artifact is written alongside that file, or to `--evaluation-output`.

The release validator recomputes model parity, eligible sample counts, Brier scores, calibration bins, the evaluation hash, and snapshot metadata consistency without network access. To also verify the downloaded raw bytes, supply `--games`, `--roster`, and `--stats` to the validator. It does not verify provider rights, new upstream changes, or deployed production state.

For a future refresh, retrieve and verify current source metadata, record a new retrieval window and expected checksums, set the actual validation date, and review changes. Do not merely change the date in the old manifest. Historical release assets may no longer yield the old bytes; the checked-in evaluation still supports independent arithmetic verification, while full historical ingestion replay then requires retained approved source bytes.

Sources retain the documented CC BY 4.0 repository attribution and underlying-rights limitation. [Model assumptions and limits](model-card.md) remain separate from data-quality checks. [Data and licensing review](data-licensing-spike.md) remains the governing source-use record.
