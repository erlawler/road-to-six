"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import snapshot from "./data/nfl-snapshot.json";
import {
  calculateForecast,
  deterministicExplanation,
  type ForecastResult,
  type ScenarioControls,
} from "@/lib/forecast.mjs";
import {
  applyLiveMarket,
  findCowboysScheduleGame,
  forecastMarketEvidenceAction,
  marketFromOddsEvent,
  type LiveMarket,
  type OddsEvent,
} from "@/lib/odds-market.mjs";
import type { AIReliabilityReceipt } from "@/lib/ai-contract.mjs";
import { footballSnapshotFreshness } from "@/lib/source-freshness.mjs";
import { cowboysSeasonState, gameProgress, scenarioContextKey } from "@/lib/season-state.mjs";

import { buildComparisonEvidence, defaultComparisonSelection, selectComparisonEvidence } from "@/lib/scenario-comparison.mjs";

type Player = (typeof snapshot.players)[number];

type MarketMetadata = {
  source: string;
  retrievedAt: string;
  cacheExpiresAt?: string;
  cacheTtlHours?: number;
  cached: boolean;
};

type Explanation = {
  mode: "ai" | "deterministic";
  summary: string;
  drivers: Array<{ label: string; evidence: string; impact: string | number }>;
  uncertainty: string[];
  disclaimer: string;
  comparisonEvidenceIds?: string[];
};

type ForecastResponse = {
  explanation?: Explanation;
  forecast?: ForecastResult;
  error?: string;
  fallbackReason?: string;
  reliability?: AIReliabilityReceipt;
  marketEvidence?: unknown;
};
type OddsResponse = {
  events?: OddsEvent[];
  source?: string;
  retrievedAt?: string;
  fetchedAt?: string;
  cacheExpiresAt?: string;
  cacheTtlHours?: number;
  cached?: boolean;
  message?: string;
};

const defaultControls: ScenarioControls = {
  quarterback: 100,
  lamb: 100,
  pickens: 100,
  williams: 100,
  defense: 100,
  opponentStar: 100,
};

function percent(value: number | null) {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

function moneyline(value: number | null) {
  if (value === null) return "Pending";
  return value > 0 ? `+${value}` : String(value);
}

function spread(value: number | null) {
  if (value === null) return "Pending";
  return value > 0 ? `DAL +${value}` : `DAL ${value}`;
}

function gameDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function evidenceTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function reliabilityLabel(value?: string) {
  if (!value) return "Unavailable";
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function tokenLabel(receipt?: AIReliabilityReceipt) {
  if (!receipt) return "Not returned";
  return `${receipt.inputTokens.toLocaleString()} in • ${receipt.outputTokens.toLocaleString()} out`;
}

function costLabel(value?: number) {
  if (!Number.isFinite(value)) return "Not returned";
  if (value === 0) return "$0.0000";
  if ((value ?? 0) < 0.0001) return "< $0.0001";
  return `$${value?.toFixed(4)}`;
}

function latencyLabel(value?: number) {
  if (!Number.isFinite(value)) return "Not returned";
  const bucket = (value ?? 0) < 2_000
    ? "Under 2 sec"
    : (value ?? 0) < 5_000
      ? "2 to 5 sec"
      : "Over 5 sec";
  return `${bucket} • ${value} ms`;
}

function playerEvidence(player: Player) {
  if (!player.stats || !player.statsSeason) return "2026 active roster";
  if (player.position === "QB") {
    return `${player.stats.passingYards.toLocaleString()} pass yds, ${player.stats.passingTds} pass TD in ${player.statsSeason}`;
  }
  if (["WR", "TE"].includes(player.position)) {
    return `${player.stats.receptions} rec, ${player.stats.receivingYards.toLocaleString()} yds in ${player.statsSeason}`;
  }
  if (player.position === "RB") {
    return `${player.stats.rushingYards.toLocaleString()} rush yds, ${player.stats.receptions} rec in ${player.statsSeason}`;
  }
  if (player.position === "K") {
    return `${player.stats.fgMade} of ${player.stats.fgAttempts} FG in ${player.statsSeason}`;
  }
  if (["DL", "DT", "DE"].includes(player.position)) {
    return `${player.stats.defSacks} sacks, ${player.stats.defQbHits} QB hits in ${player.statsSeason}`;
  }
  if (["DB", "CB", "S"].includes(player.position)) {
    return `${player.stats.defInterceptions} INT, ${player.stats.defPassDefended} passes defended in ${player.statsSeason}`;
  }
  return "2026 active roster";
}

function ProbabilityRing({ value, label }: { value: number; label: string }) {
  const style = { "--probability": `${value * 100}%` } as CSSProperties;
  return (
    <div className="probability-ring" style={style} role="img" aria-label={`${label}: ${percent(value)}`}>
      <strong>{percent(value)}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function Home() {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  useEffect(() => {
    const updateClock = () => setCurrentTime(Date.now());
    updateClock();
    const timer = setInterval(updateClock, 60_000);
    window.addEventListener("pageshow", updateClock);
    window.addEventListener("focus", updateClock);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pageshow", updateClock);
      window.removeEventListener("focus", updateClock);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, []);
  const snapshotFreshness = currentTime === null ? null
    : footballSnapshotFreshness(snapshot, currentTime);
  const seasonState = useMemo(() => cowboysSeasonState(snapshot,
    currentTime ?? Date.parse(snapshot.season.verifiedAt)), [currentTime]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [followCurrent, setFollowCurrent] = useState(true);
  const [controls, setControls] = useState<ScenarioControls>(defaultControls);
  const [runtimeResult, setRuntimeResult] = useState<{
    key: string;
    explanation: Explanation;
    forecast: ForecastResult;
    fallbackReason?: string;
    reliability?: AIReliabilityReceipt;
  } | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState("Ready to explain this scenario");
  const [isExplaining, setIsExplaining] = useState(false);
  const [markets, setMarkets] = useState<Record<string, LiveMarket>>({});
  const [marketStatus, setMarketStatus] = useState("Bundled nflverse snapshot");
  const [marketMetadata, setMarketMetadata] = useState<MarketMetadata | null>(null);
  const [isRefreshingMarkets, setIsRefreshingMarkets] = useState(false);

  const selectedGame = (!followCurrent && snapshot.schedule.find((game) => game.id === selectedGameId))
    || seasonState.nextGame || snapshot.schedule[snapshot.schedule.length - 1];
  const canExplore = seasonState.status === "upcoming"
    && gameProgress(selectedGame, currentTime ?? Date.parse(snapshot.season.verifiedAt)) === "scheduled";
  const contextKey = scenarioContextKey(snapshot, seasonState);
  const previousContext = useRef(contextKey);
  useEffect(() => {
    if (previousContext.current === contextKey) return;
    previousContext.current = contextKey;
    setFollowCurrent(true);
    setSelectedGameId(null);
    setControls(defaultControls);
    setRuntimeResult(null);
    setRuntimeStatus("The week or matchup changed. Previous assumptions were cleared; the next verified matchup is selected.");
  }, [contextKey]);
  const customAssumptions = Object.values(controls).some((value) => value !== 100);
  const selectedOpponent = snapshot.opponents[selectedGame.opponent as keyof typeof snapshot.opponents];
  const opponentLeader = selectedOpponent?.leaders[0];
  const liveMarket = markets[selectedGame.id];
  const effectiveGame = useMemo(
    () => applyLiveMarket(selectedGame, liveMarket),
    [liveMarket, selectedGame],
  );
  const forecast = useMemo(
    () => calculateForecast({
      game: {
        ...effectiveGame,
        venue: effectiveGame.venue as "home" | "away" | "neutral",
        opponentStarName: opponentLeader?.name,
      },
      ratings: snapshot.ratings,
      controls,
    }),
    [controls, effectiveGame, opponentLeader?.name],
  );
  const scenarioKey = `${contextKey}:${selectedGame.id}:${controls.quarterback}:${controls.lamb}:${controls.pickens}:${controls.williams}:${controls.defense}:${controls.opponentStar}`;
  const localExplanation = useMemo(
    () => deterministicExplanation({
      forecast,
      game: {
        ...effectiveGame,
        venue: effectiveGame.venue as "home" | "away" | "neutral",
        opponentStarName: opponentLeader?.name,
      },
    }) as Explanation,
    [effectiveGame, forecast, opponentLeader?.name],
  );
  const displayedForecast = runtimeResult?.key === scenarioKey ? runtimeResult.forecast : forecast;
  const displayedExplanation = runtimeResult?.key === scenarioKey ? runtimeResult.explanation : localExplanation;
  const comparisonEvidence = buildComparisonEvidence({ forecast: displayedForecast, controls });
  const comparisonCards = selectComparisonEvidence(
    displayedExplanation.comparisonEvidenceIds ?? defaultComparisonSelection(comparisonEvidence),
    comparisonEvidence,
  );
  useEffect(() => {
    if (!marketMetadata?.cacheExpiresAt) return;
    const expireMarkets = () => {
      if (Date.now() < Date.parse(marketMetadata.cacheExpiresAt!)) return;
      setMarkets({});
      setMarketMetadata(null);
      setRuntimeResult(null);
      setMarketStatus("Live market cache expired. Bundled snapshot restored; refresh when ready.");
    };
    const timer = setInterval(expireMarkets, 15_000);
    expireMarkets();
    return () => clearInterval(timer);
  }, [marketMetadata]);
  const selectedMarketStatus = marketMetadata
    ? liveMarket
      ? `Week ${selectedGame.week}: ${liveMarket.sportsbookCount} paired sportsbook(s). ${liveMarket.marketImpliedProbability === null ? "No paired market probability; football-only forecast." : liveMarket.sportsbookCount === 1 ? "Single-book reference, limited coverage." : "Paired-book consensus applied."}`
      : `No current market matched Week ${selectedGame.week}. Continuing with the ${snapshot.asOf} baseline.`
    : null;

  function updateControl(key: keyof ScenarioControls, value: number) {
    setControls((current) => ({ ...current, [key]: value }));
    setRuntimeStatus("Scenario changed. Generate a new explanation when ready.");
  }

  async function explainForecast() {
    if (isExplaining || !canExplore || !seasonState.current) return;
    setIsExplaining(true);
    setRuntimeStatus("Grounding the explanation in the forecast function...");
    try {
      const response = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: selectedGame.id,
          controls,
        }),
      });
      const data = await response.json() as ForecastResponse;
      const marketAction = forecastMarketEvidenceAction(data.marketEvidence);
      if (marketAction.action === "apply") {
        // Forecast evidence covers this game only; never give older quotes its new freshness.
        setMarkets({ [selectedGame.id]: marketAction.market });
        setMarketMetadata({
          ...marketAction.metadata,
          cacheExpiresAt: marketAction.metadata.cacheExpiresAt ?? undefined,
          retrievedAt: marketAction.metadata.retrievedAt ?? "",
        });
      } else if (marketAction.action === "clear") {
        setMarkets({});
        setMarketMetadata(null);
      }
      if (!response.ok) {
        if (data.reliability) {
          setRuntimeResult({
            key: scenarioKey,
            explanation: data.explanation ?? localExplanation,
            forecast: data.forecast ?? forecast,
            fallbackReason: data.error ?? "Forecast request was rejected",
            reliability: data.reliability,
          });
          setRuntimeStatus(
            `Deterministic explanation preserved: ${data.reliability.fallbackReasonCode ?? data.error ?? "request rejected"}`,
          );
          return;
        }
        throw new Error(data.error ?? "Forecast unavailable");
      }
      if (!data.explanation || !data.forecast) throw new Error("Incomplete forecast response");
      setRuntimeResult({
        key: scenarioKey,
        explanation: data.explanation,
        forecast: data.forecast,
        fallbackReason: data.fallbackReason,
        reliability: data.reliability,
      });
      setRuntimeStatus(
        data.explanation.mode === "ai"
          ? "Runtime AI explanation completed"
          : `Deterministic fallback served: ${data.fallbackReason ?? "AI unavailable"}`,
      );
    } catch {
      setRuntimeStatus("The local deterministic explanation remains available.");
    } finally {
      setIsExplaining(false);
    }
  }

  async function refreshMarkets() {
    if (isRefreshingMarkets) return;
    setIsRefreshingMarkets(true);
    setMarketStatus("Checking current markets...");
    try {
      const response = await fetch("/api/odds");
      const data = await response.json() as OddsResponse;
      if (!response.ok) {
        setMarkets({});
        setMarketMetadata(null);
        setRuntimeResult(null);
        setRuntimeStatus("Live market data was cleared. The bundled scenario remains available.");
        setMarketStatus(data.message ?? "Live refresh unavailable. The bundled nflverse snapshot remains visible.");
        return;
      }
      const source = typeof data.source === "string" ? data.source : "The Odds API";
      const retrievedAt = typeof data.retrievedAt === "string"
        ? data.retrievedAt
        : typeof data.fetchedAt === "string"
          ? data.fetchedAt
          : "";
      const cacheTtlHours = Number.isFinite(Number(data.cacheTtlHours))
        ? Number(data.cacheTtlHours)
        : null;
      const nextMarkets: Record<string, LiveMarket> = {};
      for (const event of data.events ?? []) {
        const game = findCowboysScheduleGame(snapshot.schedule, event);
        if (!game) continue;
        nextMarkets[game.id] = marketFromOddsEvent(event);
      }
      setMarkets(nextMarkets);
      setRuntimeResult(null);
      if (Object.keys(nextMarkets).length) {
        setRuntimeStatus("Markets refreshed. Generate a new explanation when ready.");
      } else {
        setRuntimeStatus("No current market matched the schedule. The bundled scenario remains available.");
      }
      setMarketMetadata({
        source,
        retrievedAt,
        cacheExpiresAt: data.cacheExpiresAt,
        cacheTtlHours: cacheTtlHours ?? undefined,
        cached: Boolean(data.cached),
      });
      setMarketStatus(
        Object.keys(nextMarkets).length
          ? `${source} consensus retrieved ${evidenceTimestamp(retrievedAt)} for ${Object.keys(nextMarkets).length} Cowboys game(s).${cacheTtlHours === null ? "" : ` Cached up to ${cacheTtlHours} hours.`}`
          : "No matching current Cowboys markets were returned",
      );
    } catch {
      setMarkets({});
      setMarketMetadata(null);
      setRuntimeResult(null);
      setRuntimeStatus("Live market data was cleared. The bundled scenario remains available.");
      setMarketStatus("Live refresh unavailable. The bundled nflverse snapshot remains visible.");
    } finally {
      setIsRefreshingMarkets(false);
    }
  }

  return (
    <main>
      <a className="skip-link" href="#forecast">Skip to forecast</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Road to Six home">
          <span>ROAD TO SIX</span>
          <small>Market Context Lab</small>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#forecast">Forecast</a>
          <a href="#players">Players</a>
          <a href="#model">Model audit</a>
          <a href="#case-study">Product case</a>
          <a href="#trust">Trust</a>
        </nav>
        <span className="unofficial" aria-label="Eric Ryan Lawler">ERL</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="season-kicker">2026 record verified {snapshot.asOf}: {seasonState.record.wins}-{seasonState.record.losses}-{seasonState.record.ties} · {seasonState.completed.length} final, {seasonState.remaining.length} remaining</p>
          <span className="eyebrow">Frontier AI skills showcase</span>
          <h1>Football evidence meets market reality.</h1>
          <p>
            An evidence-grounded product that joins actual players, games, and market lines with
            transparent win probabilities. Explore scenarios, inspect the model, and see how cost,
            safety, and release decisions are governed.
          </p>
          <p className="ownership-line">
            Product strategy, architecture, risk, and release owned by Eric Lawler. Implemented with Codex.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#forecast">Run the forecast</a>
            <a className="secondary-action" href="#case-study">Review the case</a>
          </div>
          <div className="source-stamp">
            <span>Source</span>
            <strong>nflverse</strong>
            <span>2026</span>
          </div>
        </div>

        {canExplore ? <article className="hero-forecast" aria-label="Selected game forecast summary">
          <p className="scenario-context">{currentTime !== null && !seasonState.current ? "Dated snapshot hypothetical" : selectedGame.id === seasonState.nextGame?.id ? "Next Cowboys matchup" : "Future-week hypothetical"}{customAssumptions ? " · Your custom assumptions" : " · Baseline assumptions"}</p>
          <div className="game-kicker">
            <span>Week {selectedGame.week}</span>
            <span>{gameDate(selectedGame.date)}</span>
            <span>{selectedGame.venue.toUpperCase()}</span>
          </div>
          <h2>Dallas vs. {selectedGame.opponentName}</h2>
          <ProbabilityRing
            value={displayedForecast.probability}
            label={displayedForecast.marketImplied === null ? "Football only" : "Market aware"}
          />
          <div className="hero-comparison">
            <div><span>Football only</span><strong>{percent(displayedForecast.footballOnly)}</strong></div>
            <div><span>Market implied</span><strong>{percent(displayedForecast.marketImplied)}</strong></div>
          </div>
          <p>
            Illustrative uncertainty band {percent(displayedForecast.confidenceLow)} to {percent(displayedForecast.confidenceHigh)}
          </p>
          <small>Educational probability, not a recommended bet.</small>
        </article> : <article className="hero-forecast" aria-label="Season status">
          <h2>{seasonState.status === "complete" ? "Regular season complete" : "Current result or schedule verification needed"}</h2>
          <p>Completed outcomes are actual results. A pregame probability is unavailable until the next matchup can be verified.</p>
        </article>}
      </section>

      <section className="season-state" aria-labelledby="season-state-title">
        <h2 id="season-state-title">Start from the season as played</h2>
        <p><strong>Dallas: {seasonState.record.wins}-{seasonState.record.losses}-{seasonState.record.ties}</strong> from {seasonState.completed.length} verified finals. {seasonState.remaining.length} games remain without a verified final result.</p>
        <p>Last official result and schedule verification: <time dateTime={snapshot.season.verifiedAt}>{snapshot.season.verifiedAt}</time>. Ratings include completed games through {snapshot.ratingsMetadata.trainedThrough}.</p>
        <p><a href="https://www.dallascowboys.com/schedule/" target="_blank" rel="noreferrer">Official Cowboys schedule and results</a> · <a href="https://www.nfl.com/teams/dallas-cowboys/" target="_blank" rel="noreferrer">NFL team record</a></p>
        {seasonState.byeWeek !== null ? <p><strong>Week {seasonState.byeWeek} is the Cowboys bye.</strong> The next-game scenario is separate from this bye week.</p> : null}
        {seasonState.nextGame ? <p>Next scheduled matchup: <strong>Week {seasonState.nextGame.week}, {seasonState.nextGame.opponentName}</strong>, {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(seasonState.nextGame.kickoffAt!))} (Dallas time).</p> : null}
        {seasonState.pending.length ? <p className="source-stale" role="status">Kickoff has passed for Week {seasonState.pending.map((game) => game.week).join(", ")}; a final result is not verified. This is not a live scoreboard. The displayed record may be incomplete and scenarios are paused until the source refresh.</p> : currentTime !== null && !seasonState.current ? <p className="source-stale" role="status">Current season state is not verified. The record and scenario use the dated snapshot below; they must not be read as current.</p> : null}
        <div className="season-details">
          <details><summary>Completed results ({seasonState.completed.length})</summary>
            <table><caption>Actual finals, never changed by scenario controls</caption><thead><tr><th>Week</th><th>Opponent</th><th>Dallas score first</th></tr></thead>
              <tbody>{seasonState.completed.map((game) => <tr key={game.id}><th scope="row">{game.week}</th><td>{game.opponentName}</td><td>{game.cowboysScore! > game.opponentScore! ? "W" : game.cowboysScore! < game.opponentScore! ? "L" : "T"} {game.cowboysScore}-{game.opponentScore}</td></tr>)}</tbody>
            </table>
          </details>
          <details><summary>Remaining schedule ({seasonState.remaining.length}) and bye</summary>
            <p>Bye: Week {snapshot.season.byeWeeks.join(", ")}. Future dates remain subject to official schedule changes.</p>
            <table><caption>Games without a verified final result</caption><thead><tr><th>Week</th><th>Matchup</th><th>Date / status</th></tr></thead>
              <tbody>{seasonState.remaining.map((game) => <tr key={game.id}><th scope="row">{game.week}</th><td>{game.venue === "home" ? "vs" : game.venue === "away" ? "at" : "neutral vs"} {game.opponentName}</td><td>{game.kickoffAt ? `${gameDate(game.date)}${gameProgress(game, currentTime ?? Date.parse(snapshot.season.verifiedAt)) === "result_pending" ? ": result pending" : ""}` : "TBD: kickoff not confirmed"}</td></tr>)}</tbody>
            </table>
          </details>
        </div>
      </section>

      <p className="freshness-note">
        Football and roster snapshot: {snapshot.asOf}.
        {snapshotFreshness ? <strong className={snapshotFreshness.status === "current" ? "source-age" : "source-stale"}> {snapshotFreshness.message}</strong> : null}
        {" "}Historical player baseline: 2025 regular season. Refresh odds separately for current market coverage.
      </p>
      {canExplore ? <><section className="market-strip" aria-label="Market snapshot">
        <div><span>Dallas moneyline</span><strong>{moneyline(effectiveGame.cowboysMoneyline)}</strong></div>
        <div><span>Spread</span><strong>{spread(effectiveGame.cowboysSpread)}</strong></div>
        <div><span>Total</span><strong>{effectiveGame.totalLine ?? "Pending"}</strong></div>
        <div><span>Line status</span><strong>{liveMarket ? liveMarket.marketImpliedProbability === null ? "Incomplete" : "Live source" : "Bundled snapshot"}</strong></div>
      </section>

      <section className="forecast-section" id="forecast">
        <div className="section-heading">
          <span className="section-number">01</span>
          <div>
            <span className="eyebrow">Interactive forecast</span>
            <h2>Change assumptions. Keep the evidence visible.</h2>
            <p id="scenario-disclaimer">Hypothetical participation starts at 100%; this is not a report of current player availability. Completed results and the actual record never change with these controls.</p>
            <p className="scenario-context">{selectedGame.id === seasonState.nextGame?.id ? `Week ${selectedGame.week}: next-matchup scenario` : `Week ${selectedGame.week}: future-week hypothetical`}. {customAssumptions ? "Custom assumptions are active." : "Baseline assumptions are active."} {currentTime !== null && !seasonState.current ? "Stale snapshot: current-state verification required." : "Uses the verified season results above."}</p>
          </div>
        </div>

        <div className="forecast-workspace">
          <div className="control-panel">
            <div className="game-select">
              <label htmlFor="game-select">Select a Cowboys game</label>
              <select id="game-select" value={selectedGame.id} onChange={(event) => {
                setSelectedGameId(event.target.value);
                setFollowCurrent(false);
                setControls((current) => ({ ...current, opponentStar: 100 }));
                setRuntimeStatus("Game changed. Generate a new explanation when ready.");
              }} aria-describedby="scenario-disclaimer">
                {seasonState.upcoming.map((game) => (
                  <option key={game.id} value={game.id}>
                    Week {game.week}: {game.venue === "home" ? "vs" : game.venue === "away" ? "at" : "neutral vs"} {game.opponentName}
                  </option>
                ))}
              </select>
            </div>

            <div className="scenario-presets" role="group" aria-label="Example scenario assumptions">
              <span>Try an assumption</span>
              <button type="button" onClick={() => { setControls({ ...defaultControls, quarterback: 50 }); setRuntimeResult(null); setRuntimeStatus("Quarterback 50% scenario loaded."); }}>Quarterback at 50%</button>
              <button type="button" onClick={() => { setControls({ ...defaultControls, defense: 70, opponentStar: 70 }); setRuntimeResult(null); setRuntimeStatus("Two-sided 70% scenario loaded."); }}>Two-sided at 70%</button>
            </div>
            <fieldset className="scenario-controls" aria-describedby="scenario-disclaimer">
              <legend className="sr-only">Scenario participation assumptions</legend>
              {[
                ["quarterback", "Dak Prescott participation", "Largest modeled player effect"],
                ["lamb", "CeeDee Lamb participation", "Primary receiving scenario"],
                ["pickens", "George Pickens participation", "Secondary receiving scenario"],
                ["williams", "Javonte Williams participation", "Rushing and receiving scenario"],
                ["defense", "Defensive core participation", "Combined defensive scenario"],
                ["opponentStar", `${opponentLeader?.name ?? selectedGame.opponentName} participation`, `${selectedGame.opponentName} top 2025 PPR producer`],
              ].map(([key, label, hint]) => {
                const controlId = `scenario-${key}`;
                const hintId = `${controlId}-hint`;
                return (
                  <label key={key} htmlFor={controlId}>
                    <span><strong>{label}</strong><small id={hintId}>{hint}</small></span>
                    <input
                      id={controlId}
                      type="range"
                      min="0"
                      max="100"
                      step="10"
                      value={controls[key as keyof ScenarioControls]}
                      onChange={(event) => updateControl(key as keyof ScenarioControls, Number(event.target.value))}
                      aria-describedby={hintId}
                      aria-valuetext={`${controls[key as keyof ScenarioControls]} percent participation`}
                    />
                    <output htmlFor={controlId}>{controls[key as keyof ScenarioControls]}%</output>
                  </label>
                );
              })}
            </fieldset>

            <div className="scenario-tools">
              <button
                type="button"
                className="scenario-reset"
                onClick={() => {
                  setControls(defaultControls);
                  setRuntimeResult(null);
                  setRuntimeStatus("Scenario reset. Generate a new explanation when ready.");
                }}
              >
                Reset scenario
              </button>
              <button type="button" className="scenario-reset" onClick={() => { setFollowCurrent(true); setSelectedGameId(null); setControls(defaultControls); setRuntimeResult(null); setRuntimeStatus("Returned to the next matchup with baseline assumptions."); }}>Use current matchup</button>
              <small>Dallas assumptions stay in place during manual matchup changes. Week transitions clear old assumptions. Scenarios are not saved across page loads.</small>
            </div>

            <div className="market-refresh">
              <div>
                <strong>Market data</strong>
                <small role="status">{marketStatus}</small>
                {selectedMarketStatus ? <small className="selected-market-status">{selectedMarketStatus}</small> : null}
              </div>
              <button
                type="button"
                className="text-button"
                onClick={refreshMarkets}
                disabled={isRefreshingMarkets}
                aria-busy={isRefreshingMarkets}
              >
                {isRefreshingMarkets ? "Refreshing odds" : "Refresh odds"}
              </button>
            </div>
          </div>

          <article className="result-panel">
            <div className="result-header">
              <div>
                <span className="eyebrow">Scenario result</span>
                <h3 role="status" aria-live="polite" aria-atomic="true">
                  {percent(displayedForecast.probability)} Dallas win probability
                </h3>
              </div>
              <span className={`mode-badge ${displayedExplanation.mode}`}>
                {displayedExplanation.mode === "ai" ? "Runtime AI" : "Deterministic"}
              </span>
            </div>
            {displayedExplanation.mode === "ai" ? (
              <p className="ai-boundary">Probability unchanged. Runtime AI selected grounded context for this comparison.</p>
            ) : null}
            <p className="explanation-summary">{displayedExplanation.summary}</p>
            <section className="scenario-comparison" aria-labelledby="comparison-title">
              <h4 id="comparison-title">What changed from baseline</h4>
              <dl>
                <div><dt>All controls at 100%</dt><dd>{(displayedForecast.baselineProbability * 100).toFixed(1)}%</dd></div>
                <div><dt>Your scenario</dt><dd>{(displayedForecast.probability * 100).toFixed(1)}%</dd></div>
                <div><dt>Change</dt><dd>{displayedForecast.scenarioDelta > 0 ? "+" : ""}{(displayedForecast.scenarioDelta * 100).toFixed(1)} pp</dd></div>
              </dl>
              <small>{displayedExplanation.mode === "ai" ? "Experimental AI-selected context" : "Default context"}. Same game and market evidence; only assumptions change.</small>
              <ul>{comparisonCards.map((item) => <li key={item.id}>{item.text}</li>)}</ul>
            </section>
            <p className="contribution-note">Contributions below add to a 50% starting point. Units are percentage points (pp); display rounding can affect the sum.</p>
            <div className="driver-list">
              {displayedExplanation.drivers.slice(0, 3).map((driver) => (
                <div key={driver.label}>
                  <span>{driver.label}</span>
                  <strong>{typeof driver.impact === "number" ? `${driver.impact > 0 ? "+" : ""}${driver.impact.toFixed(1)} pp` : driver.impact}</strong>
                  <small>{driver.evidence}</small>
                </div>
              ))}
            </div>
            <div className="uncertainty-panel">
              <strong>Uncertainty to keep in view</strong>
              <ul>
                {displayedExplanation.uncertainty.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <small>{displayedExplanation.disclaimer}</small>
              <div className="result-evidence">
                <span>Model {displayedForecast.modelVersion}</span>
                <span>
                  {liveMarket && marketMetadata
                    ? `${marketMetadata.source} retrieved ${evidenceTimestamp(marketMetadata.retrievedAt)}`
                    : `nflverse market snapshot ${selectedGame.sourceUpdatedAt}`}
                </span>
              </div>
            </div>
            <div className="runtime-action">
              <button
                type="button"
                className="primary-action dark"
                onClick={explainForecast}
                disabled={isExplaining || !seasonState.current}
                aria-busy={isExplaining}
              >
                {isExplaining ? "Generating explanation" : "Generate grounded explanation"}
              </button>
              <small role="status">{runtimeStatus}</small>
            </div>
            {runtimeResult?.key === scenarioKey && (
              <section className="reliability-receipt" aria-labelledby="reliability-title">
                <div className="reliability-heading">
                  <div>
                    <span className="eyebrow">Runtime evidence</span>
                    <h4 id="reliability-title">AI reliability receipt</h4>
                  </div>
                  <span className={`validation-badge ${
                    runtimeResult.reliability?.validationStatus === "passed"
                      ? "passed"
                      : runtimeResult.reliability?.validationStatus === "failed"
                        ? "failed"
                        : "review"
                  }`}>
                    {reliabilityLabel(runtimeResult.reliability?.validationStatus)}
                  </span>
                </div>
                <dl className="reliability-grid">
                  <div>
                    <dt>Mode</dt>
                    <dd>
                      {(runtimeResult.reliability?.mode ?? runtimeResult.explanation.mode) === "ai"
                        ? "Runtime AI"
                        : runtimeResult.reliability?.mode === "rejected"
                          ? "Request rejected"
                          : "Deterministic fallback"}
                    </dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{runtimeResult.reliability?.model ?? "No model call"}</dd>
                  </div>
                  <div>
                    <dt>Latency</dt>
                    <dd>{latencyLabel(runtimeResult.reliability?.latencyMs)}</dd>
                  </div>
                  <div>
                    <dt>Token use</dt>
                    <dd>{tokenLabel(runtimeResult.reliability)}</dd>
                  </div>
                  <div>
                    <dt>Prompt</dt>
                    <dd>{runtimeResult.reliability?.promptVersion ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Output contract</dt>
                    <dd>{runtimeResult.reliability?.contractVersion ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Evaluation</dt>
                    <dd>{runtimeResult.reliability?.evalVersion ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Forecast</dt>
                    <dd>{runtimeResult.reliability?.forecastVersion ?? displayedForecast.modelVersion}</dd>
                  </div>
                  <div>
                    <dt>Estimated request cost</dt>
                    <dd>{costLabel(runtimeResult.reliability?.estimatedCostUsd)}</dd>
                  </div>
                  <div>
                    <dt>Fallback reason</dt>
                    <dd>
                      {runtimeResult.reliability?.fallbackReasonCode
                        ? <code>{runtimeResult.reliability.fallbackReasonCode}</code>
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Source freshness</dt>
                    <dd>
                      {liveMarket && marketMetadata
                        ? `Current market • ${evidenceTimestamp(marketMetadata.retrievedAt)}`
                        : `Baseline snapshot • ${runtimeResult.reliability?.sourceUpdatedAt ?? selectedGame.sourceUpdatedAt}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Responsible use</dt>
                    <dd>Enforced • educational analytics only</dd>
                  </div>
                </dl>
                {runtimeResult.reliability?.requestId && (
                  <p className="receipt-id">Request <code>{runtimeResult.reliability.requestId}</code></p>
                )}
              </section>
            )}
          </article>
        </div>
      </section>

      </> : null}

      <section className="players-section" id="players">
        <div className="section-heading compact">
          <span className="section-number">02</span>
          <div>
            <span className="eyebrow">Player evidence</span>
            <h2>Weekly matchup. Real baselines.</h2>
            <p>Compare featured Cowboys with the selected opponent&apos;s top four stat producers from the roster snapshot verified {snapshot.asOf}.</p>
          </div>
        </div>
        <div className="opponent-heading">
          <div>
            <span className="eyebrow">Week {selectedGame.week} opponent</span>
            <h3>{selectedOpponent.teamName} production leaders</h3>
          </div>
          <p>Ranked by {selectedOpponent.rankingMethod.toLowerCase()}.</p>
        </div>
        <div className="opponent-grid">
          {selectedOpponent.leaders.map((leader, index) => (
            <article className="opponent-card" key={leader.id}>
              <div>
                <span>#{index + 1} rank</span>
                <small>{leader.position} {leader.jerseyNumber ? `#${leader.jerseyNumber}` : ""}</small>
              </div>
              <h3>{leader.name}</h3>
              <strong>{leader.fantasyPointsPpr.toFixed(1)}</strong>
              <small>2025 PPR points</small>
              <p>{leader.evidence}</p>
            </article>
          ))}
        </div>
        <div className="cowboys-heading">
          <span className="eyebrow">Featured Cowboys</span>
          <h3>Roster snapshot verified {snapshot.asOf}</h3>
        </div>
        <div className="player-grid">
          {snapshot.players.map((player) => (
            <article className="player-card" key={player.id}>
              <div className="player-number">{player.jerseyNumber ?? "--"}</div>
              <div>
                <span>{player.position}</span>
                <h3>{player.name}</h3>
                <p>{playerEvidence(player)}</p>
              </div>
              <small>{player.status === "ACT" ? "Active roster" : player.status}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="model-section" id="model">
        <div className="section-heading compact inverse">
          <span className="section-number">03</span>
          <div>
            <span className="eyebrow">Model audit</span>
            <h2>Measure the forecast against the market.</h2>
            <p>
              The baseline is tested walk-forward on a <span aria-hidden="true">2024-2025</span>
              <span className="sr-only">2024 to 2025</span> holdout so each prediction uses only
              information available before that game.
            </p>
          </div>
        </div>
        <div className="model-grid">
          <article>
            <span>Football-only Brier</span>
            <strong>{snapshot.backtest.footballOnlyBrier.toFixed(3)}</strong>
            <small>Lower is better</small>
          </article>
          <article className="highlight">
            <span>Market-aware Brier</span>
            <strong>{snapshot.backtest.marketAwareBrier.toFixed(3)}</strong>
            <small>{snapshot.backtest.seasons}, {snapshot.backtest.games.toLocaleString()} games</small>
          </article>
          <article>
            <span>Market baseline Brier</span>
            <strong>{snapshot.backtest.marketBaselineBrier.toFixed(3)}</strong>
            <small>Honest comparison</small>
          </article>
          <article>
            <span>Calibration error</span>
            <strong>{snapshot.backtest.marketAwareCalibrationError.toFixed(3)}</strong>
            <small>Weighted 10-bin error</small>
          </article>
        </div>
        <div className="model-note">
          <strong>What the backtest says</strong>
          <p>
            The market-aware baseline improves on football-only Elo, but it does not outperform the market itself.
            That limitation stays visible instead of being turned into a false claim of betting edge.
          </p>
          <small>{snapshot.backtest.method}</small>
        </div>
      </section>

      <section className="case-study-section" id="case-study">
        <div className="section-heading compact">
          <span className="section-number">04</span>
          <div>
            <span className="eyebrow">Technical product management</span>
            <h2>Product judgment, made inspectable.</h2>
            <p>
              The showcase evidence is not the forecast alone. It is the set of product decisions
              that makes the experience useful, measurable, affordable, and safe to release.
            </p>
          </div>
        </div>

        <div className="case-pillars">
          {[
            ["Opportunity", "Test whether football evidence and market prices tell the same story without claiming a wagering edge."],
            ["AI role", "Deterministic code owns the forecast and factual text. OpenAI selects comparison context from approved evidence. Incremental user value is unmeasured."],
            ["Operating model", "Free sports data, a six-hour odds cache, an AI cutoff, and a deterministic fallback protect cost and reliability."],
            ["Launch governance", "Accessibility, security, data rights, trademark, responsible-use, and private-release gates are explicit."],
          ].map(([title, copy]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{copy}</p>
            </article>
          ))}
        </div>

        <div className="eval-proof" aria-labelledby="eval-proof-title">
          <div>
            <span className="eyebrow">AI evaluation release gate</span>
            <h3 id="eval-proof-title">17 of 17 expected outcomes detected.</h3>
            <p>
              Evaluation v1.1.0 covers contract integrity and grounded comparison selection.
              These are offline safety checks, not proof of user comprehension. The July 27, 2026 live
              scorecard passed four of four AI and deterministic cases under the earlier contract;
              that historical sample does not validate this candidate.
            </p>
          </div>
          <dl>
            <div><dt>Positive cases</dt><dd>2</dd></div>
            <div><dt>Adversarial cases</dt><dd>15</dd></div>
            <div><dt>Product criteria</dt><dd>8</dd></div>
            <div><dt>Binary checks</dt><dd>136</dd></div>
          </dl>
        </div>

        <div className="decision-table" role="region" aria-label="Key product decisions" tabIndex={0}>
          <table>
            <caption>Key product decisions and their evidence</caption>
            <thead>
              <tr>
                <th scope="col">Decision</th>
                <th scope="col">Tradeoff</th>
                <th scope="col">Inspectable proof</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Transparent baseline before model complexity</th>
                <td>Less sophistication, faster trust and testability</td>
                <td>544-game walk-forward holdout and visible Brier scores</td>
              </tr>
              <tr>
                <th scope="row">AI explains but does not invent probability</th>
                <td>Less autonomy, stronger numerical integrity</td>
                <td>Versioned forecast function, structured output, and binary evals</td>
              </tr>
              <tr>
                <th scope="row">Anonymous exploration</th>
                <td>No saved profiles, lower privacy and security exposure</td>
                <td>No personal data, wagering history, or authenticated product state</td>
              </tr>
              <tr>
                <th scope="row">Free data and bounded runtime cost</th>
                <td>Lower market depth, predictable showcase operating cost</td>
                <td>Normalized consensus cache, budget ledger, and fallback path</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="showcase-links" aria-label="Showcase documentation">
          <a
            href="https://github.com/erlawler/road-to-six/blob/main/docs/showcase-case-study.md"
            target="_blank"
            rel="noreferrer"
          >
            <span>Read the case study</span>
            <small>Problem, ownership, tradeoffs, outcomes, and next decisions</small>
          </a>
          <a
            href="https://github.com/erlawler/road-to-six/blob/main/docs/ai-evaluation.md"
            target="_blank"
            rel="noreferrer"
          >
            <span>Inspect the AI evaluation</span>
            <small>Binary quality gates, adversarial cases, and release criteria</small>
          </a>
          <a
            href="https://github.com/erlawler/road-to-six/blob/main/docs/frontier-ai-architecture.md"
            target="_blank"
            rel="noreferrer"
          >
            <span>Review the architecture</span>
            <small>Trust boundaries, runtime controls, and failure behavior</small>
          </a>
        </div>
      </section>

      <section className="trust-section" id="trust">
        <div className="section-heading compact">
          <span className="section-number">05</span>
          <div>
            <span className="eyebrow">Trust and release controls</span>
            <h2>Probability with product guardrails.</h2>
          </div>
        </div>
        <div className="trust-grid">
          {[
            ["Evidence", "Every forecast shows source date, model version, and named drivers."],
            ["Privacy", "Public and anonymous. No profiles, wagering history, or personal data."],
            ["Responsible use", "No picks, stake sizes, payout claims, sportsbook links, or wager placement."],
            ["Reliability", "The probability function and deterministic explanation remain available when AI is not."],
          ].map(([title, copy]) => (
            <article key={title}><strong>{title}</strong><p>{copy}</p></article>
          ))}
        </div>
        <div className="source-list">
          <strong>Sources and freshness</strong>
          {snapshot.sources.map((source) => (
            <a key={source.name} href={source.url} target="_blank" rel="noreferrer">
              <span>{source.name}</span>
              <small>{source.license}</small>
            </a>
          ))}
          <a href="https://the-odds-api.com/" target="_blank" rel="noreferrer">
            <span>The Odds API current markets</span>
            <small>Normalized consensus values cached for six hours to protect the free allowance.</small>
          </a>
          <p>
            Model version: {displayedForecast.modelVersion}. Football snapshot: {selectedGame.sourceUpdatedAt}.
            {" "}
            Market evidence: {liveMarket && marketMetadata
              ? `${marketMetadata.source}, retrieved ${evidenceTimestamp(marketMetadata.retrievedAt)}`
              : `bundled snapshot captured ${selectedGame.sourceUpdatedAt}`}.
          </p>
        </div>
      </section>

      <footer>
        <div>
          <strong aria-label="Road to Super Bowl Six">Road to SB # Six</strong>
          <span>Ownership and strategy by Eric Lawler. Implemented with Codex.</span>
        </div>
        <p>
          Unofficial educational analytics. Not affiliated with or endorsed by the Dallas Cowboys, the NFL, sportsbooks, or their partners. No betting recommendation is provided.
        </p>
      </footer>
    </main>
  );
}
