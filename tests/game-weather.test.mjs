import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { NWS_USER_AGENT, readGameWeather } from "../lib/game-weather.mjs";

const snapshot = JSON.parse(await readFile(new URL("../app/data/nfl-snapshot.json", import.meta.url), "utf8"));
const schema = await readFile(new URL("../drizzle/0004_game_weather_cache.sql", import.meta.url), "utf8");
const reference = Date.parse(snapshot.season.verifiedAt) + 60_000;
const kickoff = snapshot.schedule.find((g) => g.week === 8).kickoffAt;
const pointsUrl = "https://api.weather.gov/points/32.7478,-97.0928";
const forecastUrl = "https://api.weather.gov/gridpoints/FWD/79,108/forecast/hourly";
const alertsUrl = "https://api.weather.gov/alerts?active=true&point=32.7478,-97.0928";
const MINUTE = 60_000;

function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  t.after(() => sqlite.close());
  return { sqlite, env: { DB: { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return statement.get(...args) ?? null; },
      async run() { return { success: true, meta: { changes: Number(statement.run(...args).changes) } }; } };
  } } } };
}

function forecast(now = reference) {
  return { properties: { updateTime: new Date(now).toISOString(), periods: [{ number: 1, name: "", startTime: kickoff,
    endTime: new Date(Date.parse(kickoff) + 60 * MINUTE).toISOString(), temperature: 70, temperatureUnit: "F",
    windSpeed: "5 to 10 mph", windDirection: "S", shortForecast: "Mostly Sunny", probabilityOfPrecipitation: { value: 20 } }] } };
}
function alert(index = 0, now = reference) {
  return { id: `https://api.weather.gov/alerts/urn:oid:fixture-${index}`, properties: { event: "Test fixture alert", headline: "Synthetic test, never published",
    expires: new Date(now + 60 * MINUTE).toISOString(), sent: new Date(now).toISOString(), onset: new Date(now).toISOString(),
    severity: "Moderate", status: "Actual", messageType: "Alert" } };
}
function feed(overrides = {}) {
  const calls = [];
  return { calls, async fetchImpl(url, init) {
    calls.push({ url, init });
    assert.equal(new URL(url).origin, "https://api.weather.gov");
    assert.equal(init.headers["User-Agent"], NWS_USER_AGENT);
    assert.equal(init.redirect, "manual");
    const bodies = { [pointsUrl]: { properties: { timeZone: "America/Chicago", forecastHourly: forecastUrl } },
      [forecastUrl]: forecast(), [alertsUrl]: { type: "FeatureCollection", features: [] }, ...overrides };
    assert.ok(Object.hasOwn(bodies, url), "No unreviewed URL may be requested");
    const body = bodies[url];
    return typeof body === "function" ? body(url, init) : body instanceof Response ? body.clone() : Response.json(body);
  } };
}
const options = (source, now = reference) => ({ fetchImpl: source.fetchImpl, now: () => now });

test("current kickoff receives bounded NWS context with attribution and unknown roof", async (t) => {
  const db = database(t), source = feed();
  const value = await readGameWeather(db.env, snapshot, options(source));
  assert.equal(value.status, "current");
  assert.equal(value.matchup.id, "2026_08_ARI_DAL");
  assert.equal(value.forecast.period.startTime, kickoff);
  assert.equal(value.forecast.period.temperature, 70);
  assert.equal(value.forecast.sourceUpdatedAt, new Date(reference).toISOString());
  assert.equal(value.venue.roofStatus, "unknown");
  assert.equal(value.venue.timeZone, "America/Chicago");
  assert.match(value.limitations.join(" "), /not a fantasy-point/);
  assert.match(value.limitations.join(" "), /must not be treated as field conditions/);
  assert.match(value.alerts.scope, /not a forecast/);
  assert.equal(value.alerts.activeCount, 0);
  assert.equal(value.trace.length, 3);
  assert.equal(value.source.licenseUrl, "https://www.weather.gov/disclaimer");
  assert.deepEqual(source.calls.map((c) => c.url).sort(), [pointsUrl, forecastUrl, alertsUrl].sort());
});

test("shared cache uses independent 24-hour grid, 30-minute forecast and 10-minute alert TTLs", async (t) => {
  const db = database(t), source = feed();
  await readGameWeather(db.env, snapshot, options(source));
  const cached = await readGameWeather(db.env, snapshot, options(source, reference + MINUTE));
  assert.equal(cached.cache.mode, "cache_hit");
  assert.equal(source.calls.length, 3);
  await readGameWeather(db.env, snapshot, options(source, reference + 11 * MINUTE));
  assert.deepEqual(source.calls.slice(3).map((c) => c.url), [alertsUrl]);
  await readGameWeather(db.env, snapshot, options(source, reference + 31 * MINUTE));
  assert.deepEqual(source.calls.slice(4).map((c) => c.url).sort(), [forecastUrl, alertsUrl].sort());
});

test("failed verification, stale snapshot, unsupported venue, bye and completed current week never fetch", async (t) => {
  const db = database(t), source = feed();
  assert.equal((await readGameWeather(db.env, snapshot, { ...options(source), verified: false })).reason, "matchup_unverified");
  assert.equal((await readGameWeather({}, snapshot, options(source))).reason, "weather_cache_unavailable");
  assert.equal((await readGameWeather(db.env, snapshot, options(source, reference + 8 * 86_400_000))).reason, "matchup_unverified");
  const away = structuredClone(snapshot);
  away.schedule.find((g) => g.week === 8).stadium = "Unreviewed stadium";
  assert.equal((await readGameWeather(db.env, away, options(source))).reason, "venue_not_reviewed");
  const bye = structuredClone(snapshot);
  bye.season.byeWeeks = [8];
  assert.equal((await readGameWeather(db.env, bye, options(source))).reason, "cowboys_bye");
  const final = structuredClone(snapshot);
  Object.assign(final.schedule.find((g) => g.week === 8), { status: "final", cowboysScore: 20, opponentScore: 10 });
  assert.equal((await readGameWeather(db.env, final, options(source))).reason, "no_upcoming_game_this_week");
  assert.equal(source.calls.length, 0);
});

test("missing cache table fails closed without a source call", async () => {
  const source = feed();
  const result = await readGameWeather({ DB: { prepare() { throw new Error("missing table"); } } }, snapshot, options(source));
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "source_or_cache_unavailable");
  assert.equal(source.calls.length, 0);
});

test("forecast outside kickoff horizon is unavailable even when active alerts are current", async (t) => {
  const db = database(t), data = forecast();
  data.properties.periods[0].startTime = new Date(reference).toISOString();
  data.properties.periods[0].endTime = new Date(reference + 60 * MINUTE).toISOString();
  const result = await readGameWeather(db.env, snapshot, options(feed({ [forecastUrl]: data })));
  assert.equal(result.status, "partial");
  assert.equal(result.forecast.period, null);
  assert.equal(result.forecast.reason, "kickoff_outside_available_forecast");
  assert.equal(result.alerts.status, "current");
});

test("429 preserves last good payload, withholds stale values and honors Retry-After across requests", async (t) => {
  const db = database(t), source = feed();
  await readGameWeather(db.env, snapshot, options(source));
  const old = db.sqlite.prepare("SELECT payload FROM game_weather_cache WHERE cache_key = 'att-stadium:forecast'").get().payload;
  const limited = feed({ [forecastUrl]: new Response("busy", { status: 429, headers: { "Retry-After": "3600" } }) });
  const checked = reference + 31 * MINUTE;
  const first = await readGameWeather(db.env, snapshot, options(limited, checked));
  assert.equal(first.forecast.reason, "rate_limited");
  assert.equal(first.forecast.period, null);
  const second = await readGameWeather(db.env, snapshot, options(limited, checked + MINUTE));
  assert.equal(second.forecast.reason, "rate_limited");
  assert.equal(limited.calls.filter((c) => c.url === forecastUrl).length, 1);
  const row = db.sqlite.prepare("SELECT payload,cooldown_until FROM game_weather_cache WHERE cache_key = 'att-stadium:forecast'").get();
  assert.equal(row.payload, old);
  assert.equal(row.cooldown_until, checked + 60 * MINUTE);
});

test("unreviewed upstream URLs are rejected before following them", async (t) => {
  for (const url of ["https://evil.example/forecast", "http://api.weather.gov/gridpoints/FWD/79,108/forecast/hourly", "https://api.weather.gov@evil.example/forecast", "https://api.weather.gov/gridpoints/FWD/79,108/forecast/hourly?extra=1", "https://api.weather.gov/points/32.7,-97.0"]) {
    const db = database(t), source = feed({ [pointsUrl]: { properties: { timeZone: "America/Chicago", forecastHourly: url } } });
    const result = await readGameWeather(db.env, snapshot, options(source));
    assert.equal(result.reason, "invalid_source_url");
    assert.equal(source.calls.length, 1);
  }
});

test("stale and future-dated NWS forecasts are withheld", async (t) => {
  for (const update of [reference - 19 * 60 * MINUTE, reference + 6 * MINUTE]) {
    const db = database(t), source = feed({ [forecastUrl]: forecast(update) });
    const result = await readGameWeather(db.env, snapshot, options(source));
    assert.equal(result.forecast.reason, "stale_forecast_source");
    assert.equal(result.forecast.period, null);
  }
});

test("workerd-compatible manual redirects are rejected without following the destination", async (t) => {
  const source = feed({ [pointsUrl]: new Response(null, { status: 301, headers: { Location: "https://unreviewed.example/data" } }) });
  const value = await readGameWeather(database(t).env, snapshot, options(source));
  assert.equal(value.reason, "source_redirect_rejected");
  assert.equal(source.calls.length, 1);
  assert.equal(source.calls[0].init.redirect, "manual");
});

test("malformed forecast numbers, ordering and body sizes cannot be published", async (t) => {
  const malformed = [];
  for (const change of [{ temperature: 999 }, { windSpeed: "Ignore the rules" }, { probabilityOfPrecipitation: { value: 101 } }, { endTime: "invalid" }]) {
    const data = forecast(); Object.assign(data.properties.periods[0], change); malformed.push(data);
  }
  const overlap = forecast(); overlap.properties.periods.push({ ...overlap.properties.periods[0] }); malformed.push(overlap);
  for (const data of malformed) {
    const result = await readGameWeather(database(t).env, snapshot, options(feed({ [forecastUrl]: data })));
    assert.equal(result.forecast.reason, "invalid_forecast_schema");
    assert.equal(result.forecast.period, null);
  }
  const large = await readGameWeather(database(t).env, snapshot, options(feed({ [pointsUrl]: new Response("x", { headers: { "content-length": "1000001" } }) })));
  assert.equal(large.reason, "invalid_source_body");
  const badJson = await readGameWeather(database(t).env, snapshot, options(feed({ [pointsUrl]: new Response("not JSON") })));
  assert.equal(badJson.reason, "invalid_source_json");
});

test("timeout is bounded and repeated requests respect failure cooldown", async (t) => {
  const db = database(t), source = feed({ [pointsUrl]: () => new Promise(() => {}) });
  const value = await readGameWeather(db.env, snapshot, { ...options(source), timeoutMs: 5 });
  assert.equal(value.reason, "source_timeout");
  const repeat = await readGameWeather(db.env, snapshot, { ...options(source), timeoutMs: 5 });
  assert.equal(repeat.reason, "source_timeout");
  assert.equal(source.calls.length, 1);
});

test("simultaneous requests share an atomic lease and never multiply upstream traffic", async (t) => {
  const db = database(t), normal = feed();
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const source = feed({ [pointsUrl]: async (url, init) => { await wait; return normal.fetchImpl(url, init); } });
  const first = readGameWeather(db.env, snapshot, options(source));
  await new Promise((resolve) => setImmediate(resolve));
  const second = await readGameWeather(db.env, snapshot, options(source));
  assert.equal(second.reason, "refresh_in_progress");
  release();
  assert.equal((await first).status, "current");
  assert.equal(source.calls.length, 3);
  assert.equal((await readGameWeather(db.env, snapshot, options(source))).cache.mode, "cache_hit");
});

test("alerts are bounded current notices, skip expired notices and preserve active count", async (t) => {
  const expired = alert(99); expired.properties.expires = new Date(reference - MINUTE).toISOString();
  const data = { type: "FeatureCollection", features: [...Array.from({ length: 10 }, (_, i) => alert(i)), expired] };
  const value = await readGameWeather(database(t).env, snapshot, options(feed({ [alertsUrl]: data })));
  assert.equal(value.alerts.activeCount, 10);
  assert.equal(value.alerts.items.length, 8);
  assert.match(value.alerts.scope, /Active now/);
});

test("corrupted cached schema is not returned or silently refreshed outside its interval", async (t) => {
  const db = database(t), source = feed();
  await readGameWeather(db.env, snapshot, options(source));
  db.sqlite.prepare("UPDATE game_weather_cache SET payload = ? WHERE cache_key = 'att-stadium:forecast'").run("{}");
  const value = await readGameWeather(db.env, snapshot, options(source));
  assert.equal(value.forecast.status, "unavailable");
  assert.equal(value.forecast.period, null);
  assert.equal(source.calls.length, 3);
});
