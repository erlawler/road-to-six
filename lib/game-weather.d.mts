import type { SeasonGame, SeasonSnapshot } from "./season-state.mjs";
export type WeatherPeriod = {
  startTime: string; endTime: string; name: string; temperature: number; temperatureUnit: "F" | "C";
  windSpeed: string; windDirection: string; precipitationProbability: number | null; shortForecast: string;
};
export type WeatherVenue = {
  id: string; name: string; latitude: number; longitude: number; roofType: string; roofStatus: "unknown" | "open" | "closed";
  timeZone: string; coordinateSourceUrl: string; coordinateLicense: string; roofSourceUrl: string; sourceUrl: string;
};
export type GameWeather = {
  status: "current" | "partial" | "unavailable"; reason: string | null; checkedAt: string;
  matchup: { id: string; week: number; kickoffAt: string; stadium: string | null } | null;
  venue: WeatherVenue | null;
  forecast: { status: "current" | "unavailable"; reason: string | null; sourceUpdatedAt: string | null; fetchedAt: string | null;
    validFrom: string | null; validTo: string | null; period: WeatherPeriod | null; sourceUrl: string | null };
  alerts: { status: "current" | "unavailable"; reason: string | null; checkedAt: string | null; activeCount: number | null;
    items: { id: string; event: string; headline: string; severity: string; onset: string; expires: string; sourceUrl: string }[];
    sourceUrl: string | null; scope: string };
  source: { name: string; url: string; license: string; licenseUrl: string };
  cache: { mode: string; nextRefreshAt: string | null };
  trace: { step: string; status: string; checkedAt: string; sourceUrl: string; detail: string }[];
  limitations: string[];
};
export const NWS_USER_AGENT: string;
export const WEATHER_SOURCE: Readonly<GameWeather["source"]>;
export const WEATHER_VENUES: Readonly<Record<string, Readonly<WeatherVenue>>>;
export function readGameWeather(env: { DB?: D1Database }, snapshot: SeasonSnapshot<SeasonGame & { stadium?: string }>,
  options?: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number; verified?: boolean }): Promise<GameWeather>;
