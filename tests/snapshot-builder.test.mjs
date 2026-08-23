import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("snapshot builder requires an explicit source validation date", () => {
  const result = spawnSync(process.execPath, ["scripts/build-nfl-snapshot.mjs"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--as-of=YYYY-MM-DD/);
});

test("snapshot builder derives the holdout label from completed evaluation seasons", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "road-to-six-snapshot-"));
  context.after(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const gamesPath = join(fixtureRoot, "games.csv");
  const rosterPath = join(fixtureRoot, "roster.csv");
  const statsPath = join(fixtureRoot, "stats.csv");
  const outputPath = join(fixtureRoot, "snapshot.json");
  await Promise.all([
    writeFile(
      gamesPath,
      [
        "season,game_type,home_score,away_score,gameday,game_id,home_team,away_team,home_moneyline,away_moneyline,week,location,spread_line,total_line,stadium,gametime",
        "2025,REG,24,17,2025-09-07,2025_01_NYG_PHI,NYG,PHI,-120,110,1,Home,2.5,44.5,Test Stadium,12:00",
        "2026,REG,21,20,2026-09-13,2026_01_DAL_NYG,DAL,NYG,-110,100,1,Home,1.5,43.5,Test Stadium,19:20",
        "",
      ].join("\n"),
      "utf8",
    ),
    writeFile(
      rosterPath,
      "week,game_type,status,team,full_name,position,gsis_id,jersey_number,years_exp\n",
      "utf8",
    ),
    writeFile(
      statsPath,
      "season,season_type,player_id,player_display_name,position\n2025,REG,fixture,Fixture Player,QB\n",
      "utf8",
    ),
  ]);

  const result = spawnSync(process.execPath, [
    "scripts/build-nfl-snapshot.mjs",
    `--games=${gamesPath}`,
    `--roster=${rosterPath}`,
    `--stats=${statsPath}`,
    `--output=${outputPath}`,
    "--as-of=2026-08-23",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(snapshot.backtest.seasons, "2025 to 2026 holdout");
  assert.equal(snapshot.backtest.games, 2);
});
