# Football data provenance and reproducibility

**Validation date:** October 29, 2026. **Status:** Source validation passed locally; hosted publication and readback are recorded separately by Sites. **Owner:** Eric Lawler.

## Source evidence

The [source manifest](../app/data/source-manifest.json) records the verified source URL, source update time, retrieval window, and expected SHA-256 for each downloaded CSV. The [normalized snapshot](../app/data/nfl-snapshot.json) includes the actual input hashes, byte sizes, row counts, coverage, and validation result. Its data version changes with the input manifest. Raw roster/player CSV files contain source fields outside product scope and are not committed; the product retains only approved public football fields.

| Input | Source update time, UTC | Input rows | SHA-256 prefix |
|---|---|---:|---|
| Schedule and historical games | 2026-10-29T14:35:17Z | 7,548 | `fb9cce03e4a1349a` |
| Weekly 2026 roster | 2026-10-29T14:12:44Z | 19,860 | `f06f231da0a09c55` |
| 2026 regular-season player totals to date | 2026-10-29T09:05:22Z | 1,691 | `e220f794c37f74bd` |
| 2026 weekly player statistics | 2026-10-29T09:05:02Z | 7,447 | `b917d0214111df215` |

All four sources were downloaded and checksummed October 29, 2026. Each input retains its actual retrieval window. GitHub release-asset digests independently matched the roster and statistics downloads. The schedule is pinned to [nflverse commit 71a12ac](https://github.com/nflverse/nfldata/commit/71a12ace57c76dd0dbf0397d80e00855375195bf). Roster and stats release assets are mutable URLs; a later download is an exact replay only if its full SHA-256 matches the manifest.

`sourceUpdatedAt` describes the source file or commit, not an individual quote or player-record update. `validatedAt` is the date of the check. `retrievedBetween` is the observed download window. `ratingsMetadata.trainedThrough` records October 26, 2026. Current-season completed games update serving ratings after preseason regression; the retrospective holdout remains fixed to the documented 2024 to 2025 window. The refresh does not add current-season outcomes to that historical comparison.

## Validation and coverage

The official [Cowboys schedule and results](https://www.dallascowboys.com/schedule/) and [NFL team record](https://www.nfl.com/teams/dallas-cowboys/) were cross-checked at **2026-10-29T15:13:32.957Z**. Dallas was 3-4-0 after the 38-21 Week 7 win at Philadelphia. Seven finals leave 10 regular-season games. The next matchup is Week 8 against Arizona, November 1 at noon CST (18:00 UTC). Week 14 is a bye. Week 18 is officially TBD; its nflverse date/time is provisional and is not offered as a confirmed forecast.

`seasonVerification` in the source manifest records those facts, primary source links, verification time, and unconfirmed kickoffs. The release validator independently compares normalized scores, record, next kickoff, and bye against that review. The data version includes this verification record as well as the input hashes. This is primary-source corroboration of the approved nflverse ingestion, not a new scraped feed or a live scoreboard. Reverify and update the record with every new final or schedule change.

The builder rejects malformed CSV widths, duplicate game IDs, conflicting same-week player IDs, duplicate season-stat player IDs, malformed numeric fields, mismatched source hashes, and inconsistent source dates. It excludes completed outcomes after the validation date. It selects the forecast season, uses actual kickoff instants to determine started weeks during runtime review, and admits week 1 preseason. It selects the latest eligible roster separately for each team and requires it to reach that team's latest scheduled game week. This permits schedule-confirmed byes without accepting a lagging team that played. Stable IDs deduplicate exact records, reject same-week conflicts, and select newer transfer records. A player omitted or inactive in a newer team roster is not revived from an older row.

Player statistics must match the selected football season and regular-season period. They join by stable ID. Opponent cards rank active roster players by current-season PPR totals, using stable ID as a deterministic tie-breaker. No prior-year substitute is allowed. Missing current-season rows remain unavailable. These totals are historical production, not weekly fantasy projections or game-day availability.

Verified October 29 coverage:

- 17 of 17 Cowboys regular-season games.
- Eight of eight featured Cowboys players.
- Four leaders for each of 14 distinct opponents, 56 cards in total.
- Season 2026, eligible roster week 7, and 2026 regular-season player totals to date. Washington and Jacksonville use week 6 because both had week 7 byes. All other displayed teams use week 7. Per-team actual and expected weeks are retained in the manifest.
- One unidentified roster row and one unidentified stats row excluded and counted. Neither leaves a featured-player or opponent-leader gap.
- 544 of 544 holdout games have paired historical moneylines.

Missing featured players, incomplete opponent cards, a lagging roster week, or missing source metadata produce `validationStatus: partial` and explicit limitations. The separate release validator rejects a partial snapshot and checks the seven-day review window against the current clock. The browser uses the same bounded review check and reports stale or unavailable evidence. See [data-freshness-policy.md](data-freshness-policy.md). No new scheduled refresh or production deployment is created by the builder.

## Recent player production and what-if evidence

The free-data showcase adds the exact [stats_player_week_2026.csv release asset](https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv) to the same atomic owner refresh. Its license is [nflverse-data CC BY 4.0](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md), consistent with the [nflverse licensing overview](https://nflverse.com/#licensing). FTN participation data is excluded. The product attributes nflverse / nflfastR, identifies its aggregation and transformations, and implies no endorsement. It uses no FantasyPros API or imagery. These are recorded statistics, not live fantasy projections.

`lib/player-usage.mjs` validates the weekly schema, required numeric fields, count bounds, stable IDs, duplicate player/game rows, completed game/team/week joins, and PPR scoring. Every known league player's weekly PPR, targets, carries, receptions, rushing yards, receiving yards, and passing yards must reconcile to the independently downloaded season totals. This includes inactive or ineligible-position players whose targets belong in the team denominator. Published asset checksums provide a separate downloaded-file integrity check. Conflicting or incomplete sources fail the whole candidate before publication; the last good D1 snapshot is retained.

The recent window is each team's last three completed regular-season games, skipping byes. Candidate membership is the verified current active roster restricted to QB, RB, WR, and TE. Former-team production for traded players participates in season reconciliation but never enters the new team's recent window. Highest total PPR selects the production leaders; all ties are retained and sorted by stable player ID. Targets and carries each have their own deterministic leaders. Per-game averages divide by three team games. Missing player rows mean no recorded production, not proof the player participated or will be available. Players without a recorded recent line cannot produce a what-if result. A missing team game or offensive coverage, fewer than three completed games, an unverified current matchup, a Dallas bye, or stale evidence produces an explicit unavailable comparison.

For bundled candidate `nflverse-2026-10-29-6f881cc9096d`, the verified current matchup is Dallas versus Arizona in Week 8. Dallas has 13 eligible candidates and Arizona has 14. Both windows cover Weeks 5 to 7: Dallas games October 8, 18, and 26; Arizona games October 11, 18, and 25. George Pickens leads Dallas with 57 recorded PPR points and 30 targets; Trey McBride leads Arizona with 61 PPR points and 32 targets. These are historical leaders for those windows, not projected Week 8 leaders. This locally validated bundle does not establish which version production has loaded.

PPR scoring awards one point per reception, one per 10 rushing/receiving yards, one per 25 passing yards, six per rushing/receiving/return touchdown, four per passing touchdown, two per two-point conversion, and minus two per interception or lost fumble, without bonuses. Half-PPR and standard change only reception value to 0.5 or 0.

The what-if lab uses transparent arithmetic:

```text
assumed targets = target share × historical team targets per game
scenario points = historical rushing standard points per carry × assumed carries
                + (historical receiving standard points per target
                   + reception value × historical receptions per target) × assumed targets
                + unchanged historical other standard points per game
```

Rushing and receiving rates include their touchdowns, two-point conversions, and lost fumbles. Passing, special-teams, and other scoring remain fixed at their historical per-game average. Inputs are finite carries from 0 to 40, target share from 0 to 1 (shown as 0 to 100%), and PPR, half-PPR, or standard scoring. A requested role without observed carries or targets abstains instead of inventing an efficiency. Reset restores the exact baseline; display rounding does not change stored assumptions. This is a sensitivity scenario holding efficiency and team passing volume constant, not a prediction, causal effect, injury assessment, opponent adjustment, or game-win forecast.

The [official nflverse schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) describes player-stat updates after game days and Wednesday night/Thursday corrections. The existing Wednesday 08:00 America/Chicago task is preserved. It can run before those corrections; source update and review times remain visible instead of implying corrections were already incorporated.

## Reproduce and verify

Obtain the four approved CSV inputs from the manifest URLs into a private scratch directory and verify their checksums. Run from the repository root, substituting actual local paths:

```bash
node scripts/build-nfl-snapshot.mjs \
  --games=/absolute/path/games.csv \
  --roster=/absolute/path/roster_weekly_2026.csv \
  --stats=/absolute/path/stats_player_reg_2026.csv \
  --weekly-stats=/absolute/path/stats_player_week_2026.csv \
  --source-metadata=app/data/source-manifest.json \
  --as-of=2026-10-29 \
  --season=2026
node scripts/validate-nfl-snapshot.mjs
```

The builder writes the normalized snapshot and [model-evaluation.json](../app/data/model-evaluation.json). It uses no wall-clock generation field, so the same input bytes, source metadata, code, and arguments produce byte-identical artifacts. A fixture run can use `--output=/absolute/path/snapshot.json`; its evaluation artifact is written alongside that file, or to `--evaluation-output`.

The release validator recomputes model parity, eligible sample counts, Brier scores, calibration bins, the evaluation hash, and snapshot metadata consistency without network access. To also verify the downloaded raw bytes, supply `--games`, `--roster`, `--stats`, and `--weeklyStats` to the validator. The builder uses `--weekly-stats`; the validator uses the manifest key `--weeklyStats`. It does not verify provider rights, new upstream changes, or deployed production state.

For a future refresh, retrieve and verify current source metadata, record a new retrieval window and expected checksums, set the actual validation date, and review changes. Do not merely change the date in the old manifest. Historical release assets may no longer yield the old bytes; the checked-in evaluation still supports independent arithmetic verification, while full historical ingestion replay then requires retained approved source bytes.

The roster, season-statistics, and weekly-statistics release assets retain the nflverse-data CC BY 4.0 attribution and underlying-rights limitation. The separate nfldata schedule source is attributed without asserting a CC BY license for that repository. [Model assumptions and limits](model-card.md) remain separate from data-quality checks. [Data and licensing review](data-licensing-spike.md) remains the governing source-use record.
