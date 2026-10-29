import { cowboysSeasonState } from "./season-state.mjs";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MAX_BYTES = 1_000_000;
const POINT_TTL = 24 * HOUR;
const FORECAST_TTL = 30 * MINUTE;
const ALERT_TTL = 10 * MINUTE;
const FAILURE_COOLDOWN = 10 * MINUTE;
const SOURCE_MAX_AGE = 18 * HOUR;
export const NWS_USER_AGENT = "RoadToSix/1.0 (https://road-to-six-erl.erlrickylre.chatgpt.site/)";
export const WEATHER_SOURCE = Object.freeze({
  name: "NOAA National Weather Service",
  url: "https://www.weather.gov/documentation/services-web-api",
  license: "NWS open data, free to use; public domain unless otherwise noted. No NWS endorsement.",
  licenseUrl: "https://www.weather.gov/disclaimer",
});

// A fixed reviewed point avoids accepting arbitrary coordinates or upstream URLs.
// Coordinates describe the stadium area, not a field-level observation station.
export const WEATHER_VENUES = Object.freeze({
  "AT&T Stadium": Object.freeze({
    id: "att-stadium", name: "AT&T Stadium", latitude: 32.74778, longitude: -97.09278,
    roofType: "retractable", roofStatus: "unknown", timeZone: "America/Chicago",
    coordinateSourceUrl: "https://github.com/NFLScoreBot/stadiums/blob/master/stadiums.json",
    coordinateLicense: "NFLScoreBot stadium coordinate data released into the public domain; approximate venue-area point.",
    roofSourceUrl: "https://www.hksinc.com/what-we-do/projects/att-stadium/",
    sourceUrl: "https://attstadium.com/stadium-info/a-to-z-guide/",
  }),
});

const iso = (value) => new Date(value).toISOString();
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const limitedText = (value, max = 240) => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
function problem(code, retryAfterMs = 0) { return Object.assign(new Error(code), { retryAfterMs }); }

function safeNwsUrl(value, kind) {
  let url;
  try { url = new URL(value); } catch { throw problem("invalid_source_url"); }
  if (url.origin !== "https://api.weather.gov" || url.username || url.password || url.hash) throw problem("invalid_source_url");
  if (kind === "forecast" && (!/^\/gridpoints\/[A-Z]{3}\/\d{1,3},\d{1,3}\/forecast\/hourly$/.test(url.pathname) || url.search)) throw problem("invalid_source_url");
  if (kind === "points" && (!/^\/points\/-?\d{1,3}\.\d{1,5},-?\d{1,3}\.\d{1,5}$/.test(url.pathname) || url.search)) throw problem("invalid_source_url");
  if (kind === "alerts" && (url.pathname !== "/alerts" || url.searchParams.get("active") !== "true"
    || !/^-?\d{1,3}\.\d{1,5},-?\d{1,3}\.\d{1,5}$/.test(url.searchParams.get("point") ?? "")
    || [...url.searchParams.keys()].some((key) => !["active", "point"].includes(key)))) throw problem("invalid_source_url");
  return url.href;
}

async function boundedNwsJson(url, kind, fetchImpl, now, timeoutMs) {
  safeNwsUrl(url, kind);
  const controller = new AbortController();
  let timer;
  try {
    const work = (async () => {
      // workerd supports manual/follow only. Manual plus status rejection keeps
      // redirects from escaping the reviewed NWS URL boundary.
      const response = await fetchImpl(url, { headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" }, signal: controller.signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) throw problem("source_redirect_rejected");
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        const retryMs = /^\d+$/.test(retry ?? "") ? Number(retry) * 1000 : validDate(retry) ? Date.parse(retry) - now() : 0;
        throw problem("rate_limited", Math.min(24 * HOUR, Math.max(FAILURE_COOLDOWN, retryMs)));
      }
      if (!response.ok) throw problem("source_http_error");
      if (Number(response.headers.get("content-length")) > MAX_BYTES || !response.body) throw problem("invalid_source_body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0, text = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); throw problem("source_size_limit"); }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      try { return JSON.parse(text); } catch { throw problem("invalid_source_json"); }
    })();
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(problem("source_timeout")); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

function validatePoint(data) {
  const p = data?.properties;
  if (!p || !limitedText(p.timeZone, 60)) throw problem("invalid_point_schema");
  safeNwsUrl(p.forecastHourly, "forecast");
  return { forecastHourly: p.forecastHourly, timeZone: p.timeZone };
}

function validateForecast(data, now) {
  const p = data?.properties;
  const updatedAt = p?.updateTime ?? p?.updated ?? p?.generatedAt;
  if (!validDate(updatedAt) || Date.parse(updatedAt) > now + 5 * MINUTE || now - Date.parse(updatedAt) > SOURCE_MAX_AGE) throw problem("stale_forecast_source");
  if (!Array.isArray(p.periods) || !p.periods.length || p.periods.length > 200) throw problem("invalid_forecast_schema");
  let previousEnd = -Infinity;
  const periods = p.periods.map((period) => {
    const start = Date.parse(period?.startTime), end = Date.parse(period?.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || start < previousEnd
      || end - start > 2 * HOUR || !Number.isFinite(period.temperature) || period.temperature < -120 || period.temperature > 150
      || !["F", "C"].includes(period.temperatureUnit) || !limitedText(period.windSpeed, 40)
      || !/^(?:Calm|\d+(?: to \d+)? mph)$/.test(period.windSpeed) || !limitedText(period.windDirection, 8)
      || !limitedText(period.shortForecast, 240)) throw problem("invalid_forecast_schema");
    const precipitationProbability = period.probabilityOfPrecipitation?.value ?? null;
    if (precipitationProbability !== null && (!Number.isFinite(precipitationProbability) || precipitationProbability < 0 || precipitationProbability > 100)) throw problem("invalid_forecast_schema");
    previousEnd = end;
    return { startTime: iso(start), endTime: iso(end), name: limitedText(period.name, 80) ? period.name : "Hourly forecast",
      temperature: period.temperature, temperatureUnit: period.temperatureUnit, windSpeed: period.windSpeed,
      windDirection: period.windDirection, precipitationProbability, shortForecast: period.shortForecast };
  });
  return { sourceUpdatedAt: iso(Date.parse(updatedAt)), validFrom: periods[0].startTime, validTo: periods.at(-1).endTime, periods };
}

function validateAlerts(data, now) {
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features) || data.features.length > 200) throw problem("invalid_alerts_schema");
  const items = [];
  for (const feature of data.features) {
    const p = feature?.properties;
    if (!p || !limitedText(p.event, 120) || !limitedText(p.headline, 500) || !validDate(p.expires)
      || !validDate(p.sent) || Date.parse(p.sent) > now + 5 * MINUTE || !["Extreme", "Severe", "Moderate", "Minor", "Unknown"].includes(p.severity)) throw problem("invalid_alerts_schema");
    if (Date.parse(p.expires) <= now || p.status !== "Actual" || p.messageType === "Cancel") continue;
    if (!limitedText(feature.id, 500) || !feature.id.startsWith("https://api.weather.gov/alerts/")) throw problem("invalid_alerts_schema");
    const source = new URL(feature.id);
    if (source.origin !== "https://api.weather.gov" || source.username || source.password) throw problem("invalid_alerts_schema");
    const onset = p.onset ?? p.effective ?? p.sent;
    if (!validDate(onset)) throw problem("invalid_alerts_schema");
    items.push({ id: feature.id, event: p.event, headline: p.headline, severity: p.severity,
      onset: iso(Date.parse(onset)), expires: iso(Date.parse(p.expires)), sourceUrl: source.href });
  }
  return { activeCount: items.length, items: items.slice(0, 8) };
}

const SELECT_CACHE = "SELECT payload, source_url, fetched_at, expires_at, last_error, lease_expires_at, cooldown_until FROM game_weather_cache WHERE cache_key = ?";
async function cachedResource(db, { key, url, kind, ttl, validate, fetchImpl, now, timeoutMs }) {
  const started = now();
  let row, token;
  const unavailable = (reason, next = row?.cooldown_until ?? null) => ({ ok: false, payload: null, fetchedAt: row?.fetched_at ?? null,
    mode: reason === "refresh_in_progress" ? "refresh_in_progress" : "unavailable", reason, sourceUrl: url,
    nextRefreshAt: next && Number.isFinite(next) ? iso(next) : null });
  try {
    row = await db.prepare(SELECT_CACHE).bind(key).first();
    if (row?.payload && row.source_url === url && row.expires_at > started && !row.last_error) {
      const payload = validate(JSON.parse(row.payload), started);
      return { ok: true, payload, fetchedAt: row.fetched_at, mode: "cache_hit", reason: null, sourceUrl: url, nextRefreshAt: iso(row.expires_at) };
    }
    if (row?.lease_expires_at > started) return unavailable("refresh_in_progress", row.lease_expires_at);
    if (row?.cooldown_until > started) return unavailable(row.last_error ?? "refresh_cooldown");
    token = crypto.randomUUID();
    const claimed = await db.prepare(`INSERT INTO game_weather_cache
      (cache_key, source_url, last_attempt_at, lease_token, lease_expires_at, cooldown_until)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET source_url = excluded.source_url,
        last_attempt_at = excluded.last_attempt_at, lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at, cooldown_until = excluded.cooldown_until
      WHERE game_weather_cache.lease_expires_at <= ? AND game_weather_cache.cooldown_until <= ?
      RETURNING cache_key`).bind(key, url, iso(started), token, started + 30_000, started + ttl, started, started).first();
    if (!claimed) return unavailable("refresh_in_progress", started + 30_000);
    const raw = await boundedNwsJson(url, kind, fetchImpl, now, timeoutMs);
    const payload = validate(raw, now());
    const fetchedAt = iso(now()), expiresAt = now() + ttl;
    const saved = await db.prepare(`UPDATE game_weather_cache SET payload = ?, fetched_at = ?, expires_at = ?,
      last_error = NULL, lease_token = NULL, lease_expires_at = 0, cooldown_until = ?
      WHERE cache_key = ? AND lease_token = ? AND lease_expires_at > ?`)
      .bind(JSON.stringify(raw), fetchedAt, expiresAt, expiresAt, key, token, now()).run();
    if (saved.meta?.changes !== 1) throw problem("cache_publication_failed");
    return { ok: true, payload, fetchedAt, mode: "refreshed", reason: null, sourceUrl: url, nextRefreshAt: iso(expiresAt) };
  } catch (error) {
    const allowed = new Set(["rate_limited", "source_http_error", "invalid_source_body", "invalid_source_url", "source_size_limit",
      "invalid_source_json", "source_timeout", "source_redirect_rejected", "invalid_point_schema", "stale_forecast_source", "invalid_forecast_schema", "invalid_alerts_schema", "cache_publication_failed"]);
    const reason = allowed.has(error?.message) ? error.message : "source_or_cache_unavailable";
    const retryAt = now() + Math.max(FAILURE_COOLDOWN, Number(error?.retryAfterMs) || 0);
    if (token) {
      try { await db.prepare(`UPDATE game_weather_cache SET last_error = ?, lease_token = NULL, lease_expires_at = 0,
        cooldown_until = ? WHERE cache_key = ? AND lease_token = ?`).bind(reason, retryAt, key, token).run(); } catch { /* No request-path schema creation or fallback fetch. */ }
    }
    return unavailable(reason, retryAt);
  }
}

function emptyWeather(now, reason, matchup = null, venue = null) {
  return { status: "unavailable", reason, checkedAt: iso(now), matchup, venue,
    forecast: { status: "unavailable", reason, sourceUpdatedAt: null, fetchedAt: null, validFrom: null, validTo: null, period: null, sourceUrl: null },
    alerts: { status: "unavailable", reason, checkedAt: null, items: [], activeCount: null, sourceUrl: null,
      scope: "Active now; not a forecast of game-day alerts" },
    source: WEATHER_SOURCE, cache: { mode: "not_requested", nextRefreshAt: null }, trace: [],
    limitations: ["Weather is venue-area outdoor context, not a fantasy-point or game-win adjustment.",
      "NWS forecasts have a limited horizon. Active alerts describe the current check, not predicted game-day alerts.",
      "This view is not an emergency alerting service. Consult NWS for current safety information."] };
}

/** Reads the verified upcoming matchup only. No caller-supplied coordinates, URL or forced refresh. */
export async function readGameWeather(env, snapshot, { fetchImpl = fetch, now = Date.now, timeoutMs = 8000, verified = true } = {}) {
  const checked = now();
  if (!Number.isFinite(checked) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) throw new TypeError("Invalid weather clock or timeout");
  if (!verified) return emptyWeather(checked, "matchup_unverified");
  let state;
  try { state = cowboysSeasonState(snapshot, checked); } catch { return emptyWeather(checked, "matchup_unverified"); }
  if (!state.current || !state.nextGame || snapshot.manifest?.validationStatus !== "passed") return emptyWeather(checked, "matchup_unverified");
  if (state.byeWeek !== null) return emptyWeather(checked, "cowboys_bye");
  if (state.nextGame.week !== state.calendarWeek) return emptyWeather(checked, "no_upcoming_game_this_week");
  const game = state.nextGame;
  const matchup = { id: game.id, week: game.week, kickoffAt: game.kickoffAt, stadium: game.stadium ?? null };
  const venue = WEATHER_VENUES[game.stadium] ?? null;
  if (!venue) return emptyWeather(checked, "venue_not_reviewed", matchup);
  const result = emptyWeather(checked, "weather_unavailable", matchup, venue);
  result.limitations.unshift(venue.roofStatus === "closed"
    ? "The roof is closed. Outdoor conditions are not field conditions and are not applied to fantasy scenarios."
    : "AT&T Stadium has a retractable roof. Its game-day position is unknown; outdoor forecasts must not be treated as field conditions.");
  if (!env?.DB) { result.reason = result.forecast.reason = result.alerts.reason = "weather_cache_unavailable"; return result; }
  // NWS canonical point precision is four decimals. Canonicalize locally so a
  // redirect is never needed and the strict no-redirect boundary stays intact.
  const coordinates = `${venue.latitude.toFixed(4)},${venue.longitude.toFixed(4)}`;
  const common = { fetchImpl, now, timeoutMs };
  const points = await cachedResource(env.DB, { ...common, key: `${venue.id}:points`, url: `https://api.weather.gov/points/${coordinates}`,
    kind: "points", ttl: POINT_TTL, validate: validatePoint });
  result.trace.push({ step: "NWS grid lookup", status: points.ok ? points.mode : points.reason, checkedAt: iso(checked), sourceUrl: points.sourceUrl,
    detail: "Reviewed stadium-area point; grid mapping cached for 24 hours." });
  if (!points.ok) { result.reason = points.reason; result.cache = { mode: points.mode, nextRefreshAt: points.nextRefreshAt }; return result; }
  const [forecast, alerts] = await Promise.all([
    cachedResource(env.DB, { ...common, key: `${venue.id}:forecast`, url: points.payload.forecastHourly, kind: "forecast", ttl: FORECAST_TTL, validate: validateForecast }),
    cachedResource(env.DB, { ...common, key: `${venue.id}:alerts`, url: `https://api.weather.gov/alerts?active=true&point=${coordinates}`, kind: "alerts", ttl: ALERT_TTL, validate: validateAlerts }),
  ]);
  const kickoff = Date.parse(game.kickoffAt);
  const period = forecast.ok ? forecast.payload.periods.find((p) => Date.parse(p.startTime) <= kickoff && kickoff < Date.parse(p.endTime)) ?? null : null;
  const forecastReason = !forecast.ok ? forecast.reason : !period ? "kickoff_outside_available_forecast" : null;
  result.forecast = { status: period ? "current" : "unavailable", reason: forecastReason,
    sourceUpdatedAt: forecast.ok ? forecast.payload.sourceUpdatedAt : null, fetchedAt: forecast.fetchedAt,
    validFrom: forecast.ok ? forecast.payload.validFrom : null, validTo: forecast.ok ? forecast.payload.validTo : null,
    period, sourceUrl: forecast.sourceUrl };
  result.alerts = { status: alerts.ok ? "current" : "unavailable", reason: alerts.reason, checkedAt: alerts.fetchedAt,
    items: alerts.ok ? alerts.payload.items : [], activeCount: alerts.ok ? alerts.payload.activeCount : null,
    sourceUrl: alerts.sourceUrl, scope: "Active now; not a forecast of game-day alerts" };
  result.trace.push({ step: "Kickoff forecast", status: forecastReason ?? forecast.mode, checkedAt: iso(now()), sourceUrl: forecast.sourceUrl,
    detail: "Hourly period must cover the verified kickoff. Cached for 30 minutes; source update must be within 18 hours." },
  { step: "Active venue-area alerts", status: alerts.ok ? alerts.mode : alerts.reason, checkedAt: iso(now()), sourceUrl: alerts.sourceUrl,
    detail: "Active alerts at the check time, cached for 10 minutes. At most eight notices displayed." });
  result.status = period && alerts.ok ? "current" : period || alerts.ok ? "partial" : "unavailable";
  result.reason = result.status === "current" ? null : forecastReason ?? alerts.reason;
  const refreshTimes = [forecast.nextRefreshAt, alerts.nextRefreshAt].filter(validDate).sort();
  result.cache = { mode: [forecast.mode, alerts.mode].every((v) => v === "cache_hit") ? "cache_hit" : "checked",
    nextRefreshAt: refreshTimes[0] ?? null };
  return result;
}
