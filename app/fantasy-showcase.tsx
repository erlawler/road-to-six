"use client";

import { useEffect, useRef, useState } from "react";
import type { FootballState } from "@/lib/football-store.mjs";
import { cowboysSeasonState } from "@/lib/season-state.mjs";
import { fantasyImpactForContext } from "@/lib/fantasy-impact.mjs";
import type { FantasyContext } from "@/lib/fantasy.mjs";
import type { UsageComparison } from "@/lib/player-usage.mjs";
import type { GameWeather } from "@/lib/game-weather.mjs";
import { UsageComparisonView, UsageWhatIf } from "./usage-showcase";
import { ReliabilityTower, GameDayContext, type SourceHealthView } from "./source-showcase";
import { evidenceTime } from "./showcase-format";

type ShowcaseRead = {
  schemaVersion: "showcase-v1"; dataVersion: string; observedAt: string;
  usage: UsageComparison; health: SourceHealthView; weather: GameWeather;
};

export default function FantasyShowcase({ football, now, readFailed }: { football: FootballState; now: number | null; readFailed: boolean }) {
  const [payload, setPayload] = useState<ShowcaseRead | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readNumber, setReadNumber] = useState(0);
  const lastReadAt = useRef(0);
  const state = cowboysSeasonState(football.snapshot, now ?? Date.parse(football.snapshot.season.verifiedAt));
  const game = football.snapshot.schedule.find((item) => item.week === state.calendarWeek);
  const verified = now !== null && state.current && !readFailed && !["failed", "unavailable"].includes(football.update.status);
  const currentContext: FantasyContext = { season: football.snapshot.season.year, week: state.calendarWeek ?? 0, cowboysTeam: "DAL", opponentTeam: game?.opponent ?? "", opponentName: game?.opponentName, kickoffAt: game?.kickoffAt ?? "", verified, bye: state.byeWeek !== null };
  const impact = fantasyImpactForContext(currentContext, now ?? Number.NaN);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    lastReadAt.current = Date.now();
    setLoading(true); setReadError(null); setPayload(null);
    fetch("/api/showcase", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("The source-health read did not complete. No new player or weather conclusion is shown.");
      const result = await response.json() as ShowcaseRead;
      if (result.schemaVersion !== "showcase-v1" || result.dataVersion !== football.snapshot.dataVersion || !Array.isArray(result.usage?.teams) || !Array.isArray(result.health?.trace) || !result.health?.coverage || !result.weather?.alerts) throw new Error("The evidence response does not match the current football snapshot. Recheck after the football snapshot updates.");
      if (active) setPayload(result);
    }).catch((error: unknown) => {
      if (active) setReadError(error instanceof Error && error.name !== "AbortError" ? error.message : "The evidence read timed out. Recheck when the source is available.");
    }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [football.snapshot.dataVersion, readNumber]);

  useEffect(() => {
    const refreshVisibleEvidence = () => {
      if (document.visibilityState === "visible" && Date.now() - lastReadAt.current >= 300_000) setReadNumber((value) => value + 1);
    };
    window.addEventListener("focus", refreshVisibleEvidence);
    document.addEventListener("visibilitychange", refreshVisibleEvidence);
    const interval = window.setInterval(refreshVisibleEvidence, 300_000);
    return () => { window.removeEventListener("focus", refreshVisibleEvidence); document.removeEventListener("visibilitychange", refreshVisibleEvidence); window.clearInterval(interval); };
  }, []);

  const sameVersion = payload?.dataVersion === football.snapshot.dataVersion;
  const usage = sameVersion && verified ? payload?.usage ?? null : null;
  const unavailable = readError ?? (!verified ? "Current matchup or football verification is pending. No current comparison or scenario result is asserted." : null);

  return <>
    <UsageComparisonView usage={usage} loading={loading} reason={unavailable} currentWeek={state.calendarWeek} bye={state.byeWeek !== null} />
    <UsageWhatIf key={`${football.snapshot.dataVersion}:${state.calendarWeek}`} usage={usage} />
    <ReliabilityTower health={sameVersion ? payload?.health ?? null : null} loading={loading} error={readError} onRefresh={() => setReadNumber((value) => value + 1)} />
    <GameDayContext weather={sameVersion && verified ? payload?.weather ?? null : null} loading={loading} />
    <section className="fantasy-impact-section" id="fantasy-impact" aria-labelledby="fantasy-impact-title">
      <div className="section-heading compact"><span className="section-number">NEWS</span><div><span className="eyebrow">Cowboys Fantasy Impact</span><h2 id="fantasy-impact-title">Separate the report from the inference.</h2><p>Public practice participation, its possible fantasy relevance, and what the evidence cannot tell us.</p></div></div>
      <p className="fantasy-impact-status"><strong>{impact.status === "current" ? "Reviewed evidence available" : "Current impact assessment unavailable"}</strong> · Last editorial check: {evidenceTime(impact.checkedAt)} · Expires: {evidenceTime(impact.expiresAt)}.</p>
      {impact.cards.length ? <div className="fantasy-impact-grid">{impact.cards.map((card) => <article className="fantasy-impact-card" key={card.id}><span className="fixture-label">Week {card.week} · Public participation</span><h3>{card.player}</h3><dl><div><dt>Reported fact</dt><dd>{card.fact}</dd></div><div><dt>Fantasy interpretation</dt><dd>{card.interpretation}</dd></div><div><dt>Uncertainty</dt><dd>{card.uncertainty}</dd></div></dl><a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.sourceName}</a><small>{card.dateNote}</small></article>)}</div> : <div className="fantasy-abstention">{impact.reasons.map((reason) => <p key={reason}>{reason}</p>)}<a href="https://www.dallascowboys.com/team/injury-report/" target="_blank" rel="noreferrer">Check the official participation report</a></div>}
      <p className="fantasy-provenance">{impact.notice} This is a dated editorial check with a 24-hour validity window, not a live news feed. New evidence requires a fresh review.</p>
    </section>
  </>;
}
