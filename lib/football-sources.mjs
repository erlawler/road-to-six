import { buildFootballSnapshot } from "./football-builder.mjs";
import { validateFootballSnapshot } from "./football-validation.mjs";
import { assertData as assert, sha256 } from "./football-utils.mjs";

export const PRIMARY_URLS = ["https://www.dallascowboys.com/schedule/", "https://www.nfl.com/teams/dallas-cowboys/"];
const API = "https://api.github.com/repos/nflverse/";

export async function boundedSource(url, fetcher = fetch, maxBytes = 16_000_000, clock = Date.now) {
  const start = new Date(clock()).toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { "User-Agent": "Road-to-Six-football-updater", Accept: "application/json,text/csv,text/html" } });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxBytes) throw new Error("Football source unavailable or too large");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "", bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error("Football source exceeds size limit"); }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return { text, bytes, sha256: await sha256(text), retrievedBetween: { start, end: new Date(clock()).toISOString() } };
  } finally { clearTimeout(timer); }
}

function plainText(value) {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|#160);/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#(\d{1,6});/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : " ")
    .replace(/\s+/g, " ").trim();
}

export function verifyOfficialSeason(games, season, scheduleHtml, teamHtml, verifiedAt) {
  const text = plainText(scheduleHtml);
  assert.ok(text.includes(`Dallas Cowboys ${season} Schedule`), "Official schedule season is missing or changed");
  const regular = text.split("REGULAR SEASON")[1]?.split("PRESEASON")[0];
  assert.ok(regular, "Official regular-season schedule unavailable");
  const blocks = [...regular.matchAll(/\bWEEK\s+(\d{1,2})\b([\s\S]*?)(?=\bWEEK\s+\d{1,2}\b|$)/g)];
  assert.equal(blocks.length, 18, "Official schedule week coverage changed");
  assert.equal(new Set(blocks.map((b) => Number(b[1]))).size, 18, "Duplicate official week");
  const record = { wins: 0, losses: 0, ties: 0 };
  const completedResults = [], byeWeeks = [], unconfirmedKickoffWeeks = [];
  const upcoming = [];
  for (const [, weekText, block] of blocks) {
    const week = Number(weekText), game = games.find((g) => g.week === week);
    if (/\bBYE\b/.test(block)) { assert.ok(!game, "Feed contains a game in the official bye week"); byeWeeks.push(week); continue; }
    assert.ok(game && block.includes(game.opponentName), "Official opponent differs from feed");
    if (game.venue !== "neutral") assert.ok(new RegExp(`\\b${game.venue === "home" ? "VS" : "AT"}\\b`).test(block), "Official venue differs from feed");
    if (/\bTBD\b/.test(block)) {
      assert.equal(game.status, "scheduled", "An official TBD game cannot be final");
      unconfirmedKickoffWeeks.push(week); continue;
    }
    const day = block.match(/\b\d{2}\/\d{2}\b/)?.[0];
    assert.equal(day, game.date.slice(5).replace("-", "/"), "Official game date differs from feed");
    if (/\bFINAL\b/.test(block)) {
      const result = block.match(/\bFINAL\s+([WLT])\s+(\d{1,3})\s*-\s*(\d{1,3})\b/);
      assert.ok(result && game.status === "final", "Official final is missing from feed");
      const cowboysScore = Number(result[2]), opponentScore = Number(result[3]);
      assert.equal(game.cowboysScore, cowboysScore, "Official Dallas score differs from feed");
      assert.equal(game.opponentScore, opponentScore, "Official opponent score differs from feed");
      const outcome = cowboysScore > opponentScore ? "W" : cowboysScore < opponentScore ? "L" : "T";
      assert.equal(result[1], outcome, "Official result label differs from score");
      record[outcome === "W" ? "wins" : outcome === "L" ? "losses" : "ties"]++;
      completedResults.push({ week, cowboysScore, opponentScore });
    } else {
      assert.equal(game.status, "scheduled", "Feed final is not confirmed by official schedule");
      const time = block.match(/\b(\d{1,2}:\d{2})\s+(AM|PM)\s+(CDT|CST)\b/);
      assert.ok(time && game.kickoffAt, "Official kickoff is unconfirmed");
      const formatted = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(game.kickoffAt));
      assert.equal(formatted.replace(/\s+/g, " "), `${time[1]} ${time[2]} ${time[3]}`, "Official kickoff differs from feed");
      assert.ok(Date.parse(game.kickoffAt) > Date.parse(verifiedAt), "A started game has no verified final");
      upcoming.push(game);
    }
  }
  const nfl = plainText(teamHtml).match(/Dallas Cowboys\s+\d+(?:st|nd|rd|th)\s+NFC East\s+(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\b/);
  assert.ok(nfl, "Official NFL record is unavailable");
  assert.deepEqual(record, { wins: Number(nfl[1]), losses: Number(nfl[2]), ties: Number(nfl[3]) }, "Official team record differs from results");
  const next = upcoming.sort((a, b) => a.week - b.week)[0];
  return { verifiedAt, sources: PRIMARY_URLS, record, completedResults, nextGame: next ? { week: next.week, opponent: next.opponent, kickoffAt: next.kickoffAt } : null, byeWeeks, unconfirmedKickoffWeeks };
}

export async function retrieveFootballCandidate(fallback, fetcher = fetch, clock = Date.now) {
  // Season rollover is an explicit source/model decision, not an automatic assumption.
  const season = fallback.season.year;
  const json = async (url) => JSON.parse((await boundedSource(url, fetcher, 3_000_000, clock)).text);
  const [commits, rosterRelease, statsRelease] = await Promise.all([
    json(`${API}nfldata/commits?path=data/games.csv&per_page=1`),
    json(`${API}nflverse-data/releases/tags/weekly_rosters`),
    json(`${API}nflverse-data/releases/tags/stats_player`),
  ]);
  const commit = commits?.[0];
  assert.match(commit?.sha, /^[a-f0-9]{40}$/);
  const descriptors = {
    games: { url: `https://raw.githubusercontent.com/nflverse/nfldata/${commit.sha}/data/games.csv`, sourceVersion: commit.sha, sourceUpdatedAt: commit.commit?.committer?.date },
  };
  for (const [key, release, name, tag] of [
    ["roster", rosterRelease, `roster_weekly_${season}.csv`, "weekly_rosters"],
    ["stats", statsRelease, `stats_player_reg_${fallback.manifest.coverage.playerBaselineSeason}.csv`, "stats_player"],
  ]) {
    const asset = release.assets?.find((entry) => entry.name === name);
    assert.ok(asset?.updated_at, "Approved source asset is unavailable");
    descriptors[key] = { url: `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${name}`, sourceUpdatedAt: asset.updated_at, ...(asset.digest?.startsWith("sha256:") ? { expectedSha256: asset.digest.slice(7) } : {}) };
  }
  const downloaded = await Promise.all(["games", "roster", "stats"].map((key) => boundedSource(descriptors[key].url, fetcher, 16_000_000, clock)));
  const primary = await Promise.all(PRIMARY_URLS.map((url) => boundedSource(url, fetcher, 2_000_000, clock)));
  const reviewedAt = new Date(clock()).toISOString(), asOf = reviewedAt.slice(0, 10);
  const metadata = { validatedAt: asOf, reviewedAt, inputs: {} };
  for (const [index, key] of ["games", "roster", "stats"].entries()) {
    const raw = downloaded[index], descriptor = descriptors[key];
    if (descriptor.expectedSha256) assert.equal(raw.sha256, descriptor.expectedSha256, "Published source digest differs from download");
    metadata.inputs[key] = { ...descriptor, expectedSha256: raw.sha256, retrievedBetween: raw.retrievedBetween };
  }
  const args = { gamesText: downloaded[0].text, rosterText: downloaded[1].text, statsText: downloaded[2].text, snapshotAsOf: asOf, forecastSeason: season, metadata };
  // Build once to establish the feed schedule, then confirm all finals and kickoff times.
  const preliminary = await buildFootballSnapshot(args);
  metadata.seasonVerification = verifyOfficialSeason(preliminary.snapshot.schedule, season, primary[0].text, primary[1].text, reviewedAt);
  metadata.seasonVerification.evidence = primary.map((source, index) => ({ url: PRIMARY_URLS[index], sha256: source.sha256, retrievedBetween: source.retrievedBetween }));
  const candidate = await buildFootballSnapshot(args);
  await validateFootballSnapshot(candidate.snapshot, metadata, candidate.evaluationText, clock());
  return { snapshot: candidate.snapshot, metadata };
}

export async function footballContentHash(snapshot) {
  return sha256(JSON.stringify({ season: snapshot.season.year, schedule: snapshot.schedule.map(({ id, week, date, kickoffAt, status, cowboysScore, opponentScore, opponent, venue }) => ({ id, week, date, kickoffAt, status, cowboysScore, opponentScore, opponent, venue })), players: snapshot.players, opponents: snapshot.opponents, ratings: snapshot.ratings }));
}
