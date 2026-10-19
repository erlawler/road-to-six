import assert from "node:assert/strict";
import test from "node:test";
import { parseGamesCommit, parseReleaseAsset } from "../lib/football-source-metadata.mjs";

const commit = "a".repeat(40), olderCommit = "b".repeat(40), digest = "c".repeat(64);
const timestamp = "2026-10-19T14:38:55Z";
const entry = (sha = commit, time = timestamp) => `<entry>
  <id>tag:github.com,2008:Grit::Commit/${sha}</id>
  <link type="text/html" rel="alternate" href="https://github.com/nflverse/nfldata/commit/${sha}"/>
  <updated>${time}</updated>
</entry>`;
const feed = (entries = entry() + entry(olderCommit, "2026-10-18T12:00:00Z")) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:github.com,2008:/nflverse/nfldata/commits/master/data/games.csv</id>
  <updated>2026-10-19T15:00:00Z</updated>${entries}
</feed>`;
const asset = (tag = "weekly_rosters", name = "roster_weekly_2026.csv", sha = digest, time = timestamp) => `<li class="Box-row">
  <a href="/nflverse/nflverse-data/releases/download/${tag}/${name}" rel="nofollow"><span>${name}</span></a>
  <span>sha256:${sha}</span>
  <clipboard-copy id="clipboard-button-sha256:${sha}" value="sha256:${sha}"></clipboard-copy>
  <relative-time datetime="${time}" class="no-wrap">${time}</relative-time>
</li>`;

test("games feed binds the first commit identifier, exact link and entry timestamp", () => {
  assert.deepEqual(parseGamesCommit(feed()), { sourceVersion: commit, sourceUpdatedAt: timestamp });
  assert.deepEqual(parseGamesCommit(feed(entry(commit, "2026-10-19T14:38:55.123Z"))), {
    sourceVersion: commit, sourceUpdatedAt: "2026-10-19T14:38:55.123Z",
  });
});

test("games feed rejects another owner, path, namespace or mismatched commit link", () => {
  for (const input of [
    feed().replace("/nflverse/nfldata/commits", "/someone/nfldata/commits"),
    feed().replace("master/data/games.csv", "master/data/other.csv"),
    feed().replace("http://www.w3.org/2005/Atom", "https://wrong.example"),
    feed().replace(`/commit/${commit}`, `/commit/${olderCommit}`),
    feed().replace(`https://github.com/nflverse/nfldata/commit/${commit}`, `https://wrong.example/nflverse/nfldata/commit/${commit}`),
    feed().replace(`Commit/${commit}`, "Commit/abcd"),
    feed().replace("</feed>", ""),
  ]) assert.throws(() => parseGamesCommit(input));
});

test("malformed latest games metadata never falls back to an older valid entry", () => {
  for (const first of [
    "<entry/>",
    entry().replace(/<id>.*<\/id>/, ""),
    entry().replace(/<updated>.*<\/updated>/, ""),
    entry().replace("</entry>", ""),
    entry().replace("</entry>", `<updated>${timestamp}</updated></entry>`),
    entry().replace("</entry>", `<id>tag:github.com,2008:Grit::Commit/${commit}</id></entry>`),
    entry().replace("</entry>", "<id>broken</entry>"),
    entry().replace("</entry>", `<link rel="alternate" href="https://github.com/nflverse/nfldata/commit/${commit}"/></entry>`),
    entry().replace(`href="https://github.com/nflverse/nfldata/commit/${commit}"`, `href="https://github.com/nflverse/nfldata/commit/${commit}" href="https://wrong.example"`),
  ]) assert.throws(() => parseGamesCommit(feed(first + entry(olderCommit))));
});

test("metadata timestamps reject invalid dates, malformed times and non-UTC offsets", () => {
  for (const invalid of ["2026-02-30T12:00:00Z", "2026-10-19T24:00:00Z", "2026-10-19T12:00:00+00:00", "2026-10-19", "invalid"]) {
    assert.throws(() => parseGamesCommit(feed(entry(commit, invalid))));
    assert.throws(() => parseReleaseAsset(asset("weekly_rosters", "roster_weekly_2026.csv", digest, invalid), "weekly_rosters", "roster_weekly_2026.csv"));
  }
});

test("release assets bind the exact asset row and preserve publication-time semantics", () => {
  for (const [tag, name] of [["weekly_rosters", "roster_weekly_2026.csv"], ["stats_player", "stats_player_reg_2026.csv"]]) {
    const html = `<ul>${asset("weekly_rosters", "roster_weekly_2025.csv", "d".repeat(64), "2025-10-19T12:00:00Z")}${asset(tag, name)}</ul>`;
    assert.deepEqual(parseReleaseAsset(html, tag, name), {
      url: `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${name}`,
      expectedSha256: digest, sourcePublishedAt: timestamp,
    });
  }
});

test("release parsing rejects unapproved paths and missing or duplicate exact assets", () => {
  for (const [tag, name] of [["other", "roster_weekly_2026.csv"], ["weekly_rosters", "stats_player_reg_2026.csv"], ["stats_player", "stats_player_week_2026.csv"], ["weekly_rosters", "roster_weekly_2026.csv?token=secret"], ["weekly_rosters", "roster_weekly_2023.csv"]]) {
    assert.throws(() => parseReleaseAsset(asset(), tag, name));
  }
  for (const html of [
    "", asset() + asset(), asset().replace("/nflverse/nflverse-data/releases", "/other/nflverse-data/releases"),
    asset().replace("roster_weekly_2026.csv\"", "roster_weekly_2025.csv\""),
    asset().replace("</li>", ""), `<li>${asset()}</li>`,
    asset().replace("</li>", '<a href="/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv">duplicate</a></li>'),
  ]) assert.throws(() => parseReleaseAsset(html, "weekly_rosters", "roster_weekly_2026.csv"));
});

test("release digest and timestamp cannot come from a neighboring asset", () => {
  const targetWithoutEvidence = '<li><a href="/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv">roster</a></li>';
  const neighbor = asset("weekly_rosters", "roster_weekly_2025.csv");
  for (const html of [
    targetWithoutEvidence + neighbor,
    asset().replaceAll(`sha256:${digest}`, "sha256:broken"),
    asset().replace(`value="sha256:${digest}"`, `value="sha256:${"d".repeat(64)}"`),
    asset().replace(/<relative-time[\s\S]*<\/relative-time>/, "") + neighbor,
    asset().replace("</li>", `<relative-time datetime="${timestamp}">${timestamp}</relative-time></li>`),
    asset().replace("</relative-time>", ""),
    asset().replace(`datetime="${timestamp}"`, `datetime="${timestamp}" datetime="2025-01-01T00:00:00Z"`),
  ]) assert.throws(() => parseReleaseAsset(html, "weekly_rosters", "roster_weekly_2026.csv"));
});
