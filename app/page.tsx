"use client";

import { useMemo, useState, type CSSProperties } from "react";
import snapshot from "./data/nfl-snapshot.json";
import {
  calculateForecast,
  deterministicExplanation,
  type ForecastResult,
  type ScenarioControls,
} from "@/lib/forecast.mjs";

type Player = (typeof snapshot.players)[number];

type LiveMarket = {
  cowboysMoneyline: number | null;
  opponentMoneyline: number | null;
  cowboysSpread: number | null;
  totalLine: number | null;
  sportsbookCount: number;
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
  } | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState("Ready to explain this scenario");
  const [markets, setMarkets] = useState<Record<string, LiveMarket>>({});
  const [marketStatus, setMarketStatus] = useState("Bundled nflverse snapshot");

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
  const scenarioKey = `${selectedGame.id}:${controls.quarterback}:${controls.lamb}:${controls.pickens}:${controls.williams}:${controls.defense}:${controls.opponentStar}:${effectiveGame.cowboysMoneyline}:${effectiveGame.opponentMoneyline}`;
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
    setRuntimeStatus("Grounding the explanation in the forecast function...");
    try {
      const response = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: selectedGame.id,
          controls,
          market: liveMarket ? {
            cowboysMoneyline: liveMarket.cowboysMoneyline,
            opponentMoneyline: liveMarket.opponentMoneyline,
            cowboysSpread: liveMarket.cowboysSpread,
            totalLine: liveMarket.totalLine,
          } : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Forecast unavailable");
      setRuntimeResult({
        key: scenarioKey,
        explanation: data.explanation,
        forecast: data.forecast,
        fallbackReason: data.fallbackReason,
      });
      setRuntimeStatus(
        data.explanation.mode === "ai"
          ? "Runtime AI explanation completed"
          : `Deterministic fallback served: ${data.fallbackReason ?? "AI unavailable"}`,
      );
    } catch {
      setRuntimeStatus("The local deterministic explanation remains available.");
    }
  }

  async function refreshMarkets() {
    setMarketStatus("Checking current markets...");
    try {
      const response = await fetch("/api/odds");
      const data = await response.json();
      if (!response.ok) {
        setMarketStatus(data.message ?? "Live market refresh is not configured");
        return;
      }
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
          sportsbookCount: event.sportsbookCount,
        };
      }
      setMarkets(nextMarkets);
      setMarketStatus(
        Object.keys(nextMarkets).length
          ? `Current consensus loaded for ${Object.keys(nextMarkets).length} Cowboys game(s)`
          : "No matching current Cowboys markets were returned",
      );
    } catch {
      setMarketStatus("Live refresh unavailable. The nflverse snapshot remains visible.");
    }
  }

  return (
    <main>
      <a className="skip-link" href="#forecast">Skip to forecast</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Road to Six home">
          <span>ROAD TO SIX</span>
          <small>Market Bias Lab</small>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#forecast">Forecast</a>
          <a href="#players">Players</a>
          <a href="#model">Model audit</a>
          <a href="#trust">Trust</a>
        </nav>
        <span className="unofficial">ERL</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow">Dallas Cowboys scenario lab</span>
          <h1>Football evidence meets market reality.</h1>
          <p>
            Explore actual players, scheduled games, lines, and transparent win probabilities.
            Change the assumptions and see what moves the forecast without receiving betting advice.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#forecast">Run the forecast</a>
            <a className="secondary-action" href="#model">Audit the model</a>
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
            Confidence range {percent(displayedForecast.confidenceLow)} to {percent(displayedForecast.confidenceHigh)}
          </p>
          <small>Educational probability, not a recommended bet.</small>
        </article>
      </section>

      <section className="market-strip" aria-label="Market snapshot">
        <div><span>Dallas moneyline</span><strong>{moneyline(effectiveGame.cowboysMoneyline)}</strong></div>
        <div><span>Spread</span><strong>{spread(effectiveGame.cowboysSpread)}</strong></div>
        <div><span>Total</span><strong>{effectiveGame.totalLine ?? "Pending"}</strong></div>
        <div><span>Line movement</span><strong>{liveMarket ? "Refreshed" : "Baseline"}</strong></div>
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
              <button type="button" className="text-button" onClick={refreshMarkets}>Refresh odds</button>
            </div>
          </div>

          <article className="result-panel" aria-live="polite">
            <div className="result-header">
              <div>
                <span className="eyebrow">Scenario result</span>
                <h3>{percent(displayedForecast.probability)} Dallas win probability</h3>
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
            <div className="runtime-action">
              <button type="button" className="primary-action dark" onClick={explainForecast}>
                Generate grounded explanation
              </button>
              <small role="status">{runtimeStatus}</small>
            </div>
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
            <h2>The market is a benchmark, not an oracle.</h2>
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

      <section className="trust-section" id="trust">
        <div className="section-heading compact">
          <span className="section-number">04</span>
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
          <p>Model version: {displayedForecast.modelVersion}. Market snapshot captured {selectedGame.sourceUpdatedAt}.</p>
        </div>
      </section>

      <footer>
        <div><strong>Road to Six</strong><span>Technical product management portfolio built with Codex.</span></div>
        <p>
          Unofficial educational analytics. Not affiliated with or endorsed by the Dallas Cowboys, the NFL, sportsbooks, or their partners. No betting recommendation is provided.
        </p>
      </footer>
    </main>
  );
}
