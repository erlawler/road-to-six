"use client";

import { useMemo, useState, type CSSProperties } from "react";
import snapshot from "./data/nfl-snapshot.json";
import {
  calculateForecast,
  deterministicExplanation,
  type ForecastResult,
  type ScenarioControls,
} from "@/lib/forecast.mjs";
import type { AIReliabilityReceipt } from "@/lib/ai-contract.mjs";

type Player = (typeof snapshot.players)[number];

type LiveMarket = {
  cowboysMoneyline: number | null;
  opponentMoneyline: number | null;
  cowboysSpread: number | null;
  totalLine: number | null;
  marketImpliedProbability: number | null;
  sportsbookCount: number;
};

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
  const [selectedGameId, setSelectedGameId] = useState(snapshot.schedule[0].id);
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

  const selectedGame = snapshot.schedule.find((game) => game.id === selectedGameId) ?? snapshot.schedule[0];
  const selectedOpponent = snapshot.opponents[selectedGame.opponent as keyof typeof snapshot.opponents];
  const opponentLeader = selectedOpponent?.leaders[0];
  const liveMarket = markets[selectedGame.id];
  const effectiveGame = useMemo(
    () => liveMarket ? {
      ...selectedGame,
      cowboysMoneyline: liveMarket.cowboysMoneyline,
      opponentMoneyline: liveMarket.opponentMoneyline,
      cowboysSpread: liveMarket.cowboysSpread,
      totalLine: liveMarket.totalLine,
    } : selectedGame,
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
  const scenarioKey = `${selectedGame.id}:${controls.quarterback}:${controls.lamb}:${controls.pickens}:${controls.williams}:${controls.defense}:${controls.opponentStar}`;
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

  function updateControl(key: keyof ScenarioControls, value: number) {
    setControls((current) => ({ ...current, [key]: value }));
    setRuntimeStatus("Scenario changed. Generate a new explanation when ready.");
  }

  async function explainForecast() {
    if (isExplaining) return;
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
      const data = await response.json();
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
      if (data.marketEvidence?.source === "The Odds API" && data.marketEvidence.market) {
        const evidenceSource = typeof data.marketEvidence.source === "string"
          ? data.marketEvidence.source
          : "The Odds API";
        const evidenceRetrievedAt = typeof data.marketEvidence.retrievedAt === "string"
          ? data.marketEvidence.retrievedAt
          : typeof data.marketEvidence.fetchedAt === "string"
            ? data.marketEvidence.fetchedAt
            : new Date().toISOString();
        setMarkets((current) => ({
          ...current,
          [selectedGame.id]: data.marketEvidence.market,
        }));
        setMarketMetadata({
          source: evidenceSource,
          retrievedAt: evidenceRetrievedAt,
          cached: Boolean(data.marketEvidence.cached),
        });
      }
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
      const data = await response.json();
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
          : new Date().toISOString();
      const cacheTtlHours = Number.isFinite(Number(data.cacheTtlHours))
        ? Number(data.cacheTtlHours)
        : null;
      const nextMarkets: Record<string, LiveMarket> = {};
      for (const event of data.events ?? []) {
        const opponentName = event.homeTeam === "Dallas Cowboys" ? event.awayTeam : event.homeTeam;
        const eventDate = String(event.commenceTime ?? "").slice(0, 10);
        const game = snapshot.schedule.find(
          (candidate) => candidate.date === eventDate && candidate.opponentName === opponentName,
        );
        if (!game) continue;
        nextMarkets[game.id] = {
          cowboysMoneyline: event.cowboysMoneyline,
          opponentMoneyline: event.opponentMoneyline,
          cowboysSpread: event.cowboysSpread,
          totalLine: event.total,
          marketImpliedProbability: event.cowboysConsensusProbability,
          sportsbookCount: event.sportsbookCount,
        };
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
          <span className="eyebrow">Frontier AI product case study</span>
          <h1>Football evidence meets market reality.</h1>
          <p>
            An evidence-grounded product that joins actual players, games, and market lines with
            transparent win probabilities. Explore scenarios, inspect the model, and see how cost,
            safety, and release decisions are governed.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#forecast">Run the forecast</a>
            <a className="secondary-action" href="#case-study">Review the product case</a>
          </div>
          <div className="source-stamp">
            <span>Source</span>
            <strong>nflverse</strong>
            <span>2026</span>
          </div>
        </div>

        <article className="hero-forecast" aria-label="Selected game forecast summary">
          <div className="game-kicker">
            <span>Week {selectedGame.week}</span>
            <span>{gameDate(selectedGame.date)}</span>
            <span>{selectedGame.venue.toUpperCase()}</span>
          </div>
          <h2>Dallas vs. {selectedGame.opponentName}</h2>
          <ProbabilityRing value={displayedForecast.probability} label="Market aware" />
          <div className="hero-comparison">
            <div><span>Football only</span><strong>{percent(displayedForecast.footballOnly)}</strong></div>
            <div><span>Market implied</span><strong>{percent(displayedForecast.marketImplied)}</strong></div>
          </div>
          <p>
            Illustrative uncertainty band {percent(displayedForecast.confidenceLow)} to {percent(displayedForecast.confidenceHigh)}
          </p>
          <small>Educational probability, not a recommended bet.</small>
        </article>
      </section>

      <section className="market-strip" aria-label="Market snapshot">
        <div><span>Dallas moneyline</span><strong>{moneyline(effectiveGame.cowboysMoneyline)}</strong></div>
        <div><span>Spread</span><strong>{spread(effectiveGame.cowboysSpread)}</strong></div>
        <div><span>Total</span><strong>{effectiveGame.totalLine ?? "Pending"}</strong></div>
        <div><span>Line status</span><strong>{liveMarket ? "Current" : "Baseline"}</strong></div>
      </section>

      <section className="forecast-section" id="forecast">
        <div className="section-heading">
          <span className="section-number">01</span>
          <div>
            <span className="eyebrow">Interactive forecast</span>
            <h2>Change assumptions. Keep the evidence visible.</h2>
            <p id="scenario-disclaimer">Player controls are scenario assumptions, not medical or injury reports.</p>
          </div>
        </div>

        <div className="forecast-workspace">
          <div className="control-panel">
            <div className="game-select">
              <label htmlFor="game-select">Select a Cowboys game</label>
              <select id="game-select" value={selectedGame.id} onChange={(event) => {
                setSelectedGameId(event.target.value);
                setControls((current) => ({ ...current, opponentStar: 100 }));
                setRuntimeStatus("Game changed. Generate a new explanation when ready.");
              }} aria-describedby="scenario-disclaimer">
                {snapshot.schedule.map((game) => (
                  <option key={game.id} value={game.id}>
                    Week {game.week}: {game.venue === "home" ? "vs" : game.venue === "away" ? "at" : "neutral vs"} {game.opponentName}
                  </option>
                ))}
              </select>
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

            <div className="market-refresh">
              <div>
                <strong>Market data</strong>
                <small role="status">{marketStatus}</small>
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
            <p className="explanation-summary">{displayedExplanation.summary}</p>
            <div className="driver-list">
              {displayedExplanation.drivers.slice(0, 3).map((driver) => (
                <div key={driver.label}>
                  <span>{driver.label}</span>
                  <strong>{typeof driver.impact === "number" ? `${driver.impact > 0 ? "+" : ""}${driver.impact} pts` : driver.impact}</strong>
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
                disabled={isExplaining}
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

      <section className="players-section" id="players">
        <div className="section-heading compact">
          <span className="section-number">02</span>
          <div>
            <span className="eyebrow">Player evidence</span>
            <h2>Weekly matchup. 2025 baselines.</h2>
            <p>Compare featured Cowboys with the selected opponent&apos;s top four 2025 PPR producers from its active 2026 roster.</p>
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
                <span>#{index + 1} PPR rank</span>
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
          <h3>Active 2026 roster</h3>
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
            <p>The baseline is tested walk-forward on a 2024 to 2025 holdout so each prediction uses only information available before that game.</p>
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
              The portfolio proof is not the forecast alone. It is the set of product decisions
              that makes the experience useful, measurable, affordable, and safe to release.
            </p>
          </div>
        </div>

        <div className="case-pillars">
          {[
            ["Opportunity", "Test whether football evidence and market prices tell the same story without claiming a wagering edge."],
            ["AI role", "Deterministic code owns the probability. Runtime AI explains named evidence, uncertainty, and source freshness."],
            ["Operating model", "Free sports data, a six-hour odds cache, a $9.50 AI cutoff, and a deterministic fallback protect cost and reliability."],
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
            <h3 id="eval-proof-title">12 of 12 expected outcomes detected.</h3>
            <p>
              The offline suite verifies positive and adversarial behavior without spending API
              budget. A live structured response remains a separate provider gate.
            </p>
          </div>
          <dl>
            <div><dt>Positive cases</dt><dd>2</dd></div>
            <div><dt>Adversarial cases</dt><dd>10</dd></div>
            <div><dt>Product criteria</dt><dd>7</dd></div>
            <div><dt>Binary checks</dt><dd>84</dd></div>
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
                <td>Lower market depth, predictable portfolio operating cost</td>
                <td>Normalized consensus cache, budget ledger, and fallback path</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="portfolio-links" aria-label="Portfolio documentation">
          <a
            href="https://github.com/erlawler/road-to-six/blob/main/docs/portfolio-case-study.md"
            target="_blank"
            rel="noreferrer"
          >
            <span>Read the case study</span>
            <small>Problem, ownership, tradeoffs, outcomes, and next bets</small>
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
          <strong>Road to Six</strong>
          <span>Product ownership and strategy by Eric Ryan Lawler. Implemented with Codex.</span>
        </div>
        <p>
          Unofficial educational analytics. Not affiliated with or endorsed by the Dallas Cowboys, the NFL, sportsbooks, or their partners. No betting recommendation is provided.
        </p>
      </footer>
    </main>
  );
}
