import { assertData as assert } from "./football-utils.mjs";

const GAMES_FEED_ID = "tag:github.com,2008:/nflverse/nfldata/commits/master/data/games.csv";

function attribute(tag, name) {
  const matches = [...tag.matchAll(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "g"))];
  assert.equal(matches.length, 1, "Source metadata attribute is missing or duplicated");
  return matches[0][2];
}

function elementText(block, name) {
  const matches = [...block.matchAll(new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}\\s*>`, "g"))];
  assert.equal(matches.length, 1, "Source metadata element is missing or duplicated");
  assert.equal((block.match(new RegExp(`<${name}\\b`, "g")) ?? []).length, 1, "Source metadata element is malformed");
  assert.equal((block.match(new RegExp(`</${name}\\s*>`, "g")) ?? []).length, 1, "Source metadata element is malformed");
  return matches[0][1].trim();
}

function utcTimestamp(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, "Source metadata timestamp must be UTC");
  const parsed = Date.parse(value);
  assert.ok(Number.isFinite(parsed), "Source metadata timestamp is invalid");
  assert.equal(new Date(parsed).toISOString(), value.includes(".") ? value : value.replace("Z", ".000Z"), "Source metadata timestamp is invalid");
  return value;
}

export function parseGamesCommit(atom) {
  assert.ok(typeof atom === "string", "Games commit feed is unavailable");
  const feed = atom.match(/^\s*(?:<\?xml[^?]*\?>\s*)?(<feed\b[^>]*>)([\s\S]*)<\/feed>\s*$/);
  assert.ok(feed && (atom.match(/<feed\b/g) ?? []).length === 1, "Games commit feed is malformed");
  assert.equal((atom.match(/<\/feed>/g) ?? []).length, 1, "Games commit feed is malformed");
  assert.equal(attribute(feed[1], "xmlns"), "http://www.w3.org/2005/Atom", "Games commit feed namespace changed");
  const first = /<entry\b[^>]*>/.exec(feed[2]);
  assert.ok(first && !/\/\s*>$/.test(first[0]), "Latest games commit entry is unavailable");
  assert.equal(elementText(feed[2].slice(0, first.index), "id"), GAMES_FEED_ID, "Games commit feed path changed");
  const start = first.index + first[0].length;
  const end = feed[2].indexOf("</entry>", start);
  assert.ok(end >= start, "Latest games commit entry is malformed");
  const entry = feed[2].slice(start, end);
  assert.ok(!/<entry\b/.test(entry), "Latest games commit entry is malformed");
  const id = elementText(entry, "id").match(/^tag:github\.com,2008:Grit::Commit\/([a-f0-9]{40})$/);
  assert.ok(id, "Latest games commit identifier is invalid");
  const links = [...entry.matchAll(/<link\b[^>]*>/g)].map(([tag]) => ({ href: attribute(tag, "href"), rel: attribute(tag, "rel") }));
  assert.equal(links.filter((link) => link.rel === "alternate" && link.href === `https://github.com/nflverse/nfldata/commit/${id[1]}`).length, 1,
    "Latest games commit link differs from its identifier");
  assert.equal(links.filter((link) => link.rel === "alternate").length, 1, "Latest games commit link is duplicated");
  return { sourceVersion: id[1], sourceUpdatedAt: utcTimestamp(elementText(entry, "updated")) };
}

export function parseReleaseAsset(html, tag, name) {
  const approvedName = tag === "weekly_rosters" ? /^roster_weekly_(\d{4})\.csv$/
    : tag === "stats_player" ? /^stats_player_reg_(\d{4})\.csv$/ : null;
  const season = approvedName && typeof name === "string" ? name.match(approvedName)?.[1] : null;
  assert.ok(season && Number(season) >= 2024, "Release asset path is not approved");
  assert.ok(typeof html === "string", "Release asset metadata is unavailable");
  const path = `/nflverse/nflverse-data/releases/download/${tag}/${name}`;
  const rows = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/g)].map((match) => match[1]);
  assert.equal(rows.length, (html.match(/<li\b/g) ?? []).length, "Release asset rows are malformed");
  assert.equal(rows.length, (html.match(/<\/li\s*>/g) ?? []).length, "Release asset rows are malformed");
  const matches = rows.map((row) => ({ row, links: [...row.matchAll(/<a\b[^>]*>/g)].map(([link]) => attribute(link, "href")) }))
    .filter(({ links }) => links.includes(path));
  assert.equal(matches.length, 1, "Approved release asset is missing or duplicated");
  const { row, links } = matches[0];
  assert.equal(links.filter((link) => link === path).length, 1, "Approved release asset link is duplicated");
  const digests = [...row.matchAll(/sha256:([^\s"'<>]+)/g)].map((match) => match[1]);
  assert.ok(digests.length > 0 && digests.every((value) => /^[a-f0-9]{64}$/.test(value)), "Release asset digest is missing or malformed");
  assert.equal(new Set(digests).size, 1, "Release asset digests conflict");
  const times = [...row.matchAll(/(<relative-time\b[^>]*>)[^<]*<\/relative-time\s*>/g)];
  assert.equal(times.length, 1, "Release asset publication timestamp is missing or duplicated");
  assert.equal((row.match(/<relative-time\b/g) ?? []).length, 1, "Release asset publication timestamp is malformed");
  return { url: `https://github.com${path}`, expectedSha256: digests[0], sourcePublishedAt: utcTimestamp(attribute(times[0][1], "datetime")) };
}
