import bundledSnapshot from "../app/data/nfl-snapshot.json";
import { readFootballState, type FootballState } from "../lib/football-store.mjs";
import { getCurrentMatchup, getSourceHealth } from "../lib/source-health.mjs";
import { comparePlayerUsage, getPlayerUsage } from "../lib/player-usage.mjs";
import { readGameWeather, WEATHER_SOURCE } from "../lib/game-weather.mjs";
import { getFootballForecast } from "../lib/football-forecast-tool.mjs";
import { buildEvidence, forecastScenario } from "../lib/mcp-tools.mjs";

type Env = { DB?: D1Database };

export async function readShowcase(env: Env, state?: FootballState) {
  const football = state ?? await readFootballState(env, bundledSnapshot);
  const now = Date.now(), matchup = getCurrentMatchup(football, now);
  const comparison = comparePlayerUsage(football.snapshot, now);
  const usage = matchup.status === "verified" ? comparison : {
    ...comparison, status: "unavailable" as const, teams: [], leaders: [],
    reasons: [matchup.reason ?? "Current matchup verification is unavailable."],
  };
  const weather = await readGameWeather(env, football.snapshot, { now: () => now, verified: matchup.status === "verified" });
  return { schemaVersion: "showcase-v1", dataVersion: football.snapshot.dataVersion,
    observedAt: new Date(now).toISOString(), matchup, usage,
    health: getSourceHealth(football, now), weather };
}

async function evidenceOutput(name: string, args: Record<string, unknown>, env: Env, state: FootballState, now: number): Promise<Record<string, unknown>> {
  if (name === "get_source_health") return getSourceHealth(state, now);
  if (name === "get_football_forecast") return getFootballForecast(state, forecastScenario(args), now);
  const matchup = getCurrentMatchup(state, now);
  if (name === "get_current_matchup") return matchup;
  if (matchup.status !== "verified") return { status: "unavailable", reason: matchup.reason, matchup };
  if (name === "get_player_usage") return getPlayerUsage(state.snapshot, args.team === "DAL" ? "DAL" : matchup.game!.opponent, now);
  if (name === "compare_players") return comparePlayerUsage(state.snapshot, now);
  if (name === "get_game_day_context") return readGameWeather(env, state.snapshot);
  throw new Error("Unknown evidence tool");
}

/**
 * Runs one bounded public read tool and attaches the shared evidence block.
 * Every tool reads the same saved football state, so one data version and one
 * observation time describe the whole result.
 */
export async function readEvidenceTool(name: string, args: Record<string, unknown>, env: Env) {
  const state = await readFootballState(env, bundledSnapshot), now = Date.now();
  const output = await evidenceOutput(name, args, env, state, now);
  const extraSources = name === "get_game_day_context" ? [WEATHER_SOURCE] : [];
  return { ...output, evidence: buildEvidence(name, output, state, now, extraSources) };
}
