"use client";

import { useMemo, useState } from "react";
import type { FootballState } from "@/lib/football-store.mjs";
import { cowboysSeasonState } from "@/lib/season-state.mjs";
import { createSyntheticFantasySnapshot, evaluateFantasyComparison, FANTASY_POLICY, FANTASY_SCORING, type FantasyContext, type FantasyLeader } from "@/lib/fantasy.mjs";
import { fantasyImpactForContext } from "@/lib/fantasy-impact.mjs";
import reliabilityReport from "./data/reliability-report.json";

const DEMO_TIME = Date.parse("2026-10-29T00:00:00Z");
const DEMO_CONTEXT: FantasyContext = { season: 2026, week: 8, cowboysTeam: "DAL", opponentTeam: "ARI", opponentName: "Arizona Cardinals", kickoffAt: "2026-11-01T18:00:00Z", verified: true };
const scenarios = [
  ["complete", "Complete fixture"],
  ["truncated", "Truncated response"],
  ["stale", "Expired projections"],
  ["conflict", "Conflicting score"],
  ["bye", "Cowboys bye"],
] as const;
type Scenario = typeof scenarios[number][0];

function timestamp(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value)) + " Central";
}

function LeaderCard({ leader, team }: { leader: FantasyLeader; team: string }) {
  const { player } = leader;
  return <article className="fantasy-player-card">
    <div className="fantasy-card-label"><span>{team}</span><span>{player.position}</span></div>
    <p className="fixture-label">Fictional player</p>
    <h3>{player.name}</h3>
    <div className="fantasy-points"><strong>{player.projectedPoints.toFixed(2)}</strong><span>synthetic PPR points</span></div>
    <p>Highest projection in this four-player fixture.</p>
    {leader.tiedPlayers.length > 1 ? <p>Joint leader: {leader.tiedPlayers.map((tie) => tie.name).join(", ")}. Featured by stable player ID.</p> : null}
    <details><summary>Inspect the scoring inputs</summary><dl className="fantasy-scoring-inputs">
      {Object.entries(player.stats).filter(([, value]) => value !== 0).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd>{Number(value.toFixed(2))}</dd></div>)}
    </dl></details>
  </article>;
}

export default function FantasyShowcase({ football, now, readFailed }: { football: FootballState; now: number | null; readFailed: boolean }) {
  const [scenario, setScenario] = useState<Scenario>("complete");
  const [testFilter, setTestFilter] = useState("All checks");
  const state = cowboysSeasonState(football.snapshot, now ?? Date.parse(football.snapshot.season.verifiedAt));
  const game = football.snapshot.schedule.find((item) => item.week === state.calendarWeek);
  const verified = now !== null && state.current && !readFailed && !["failed", "unavailable"].includes(football.update.status);
  const currentContext: FantasyContext = { season: football.snapshot.season.year, week: state.calendarWeek ?? 0, cowboysTeam: "DAL", opponentTeam: game?.opponent ?? "", opponentName: game?.opponentName, kickoffAt: game?.kickoffAt ?? "", verified, bye: state.byeWeek !== null };
  const impact = fantasyImpactForContext(currentContext, now ?? Number.NaN);
  const comparison = useMemo(() => {
    const fixture = createSyntheticFantasySnapshot(DEMO_CONTEXT, DEMO_TIME);
    if (scenario === "truncated") fixture.coverage.truncated = true;
    if (scenario === "stale") { fixture.source.updatedAt = new Date(DEMO_TIME - 172_800_000).toISOString(); fixture.source.expiresAt = new Date(DEMO_TIME - 86_400_000).toISOString(); }
    if (scenario === "conflict") fixture.players[0].projectedPoints += 10;
    return evaluateFantasyComparison(fixture, { ...DEMO_CONTEXT, bye: scenario === "bye" }, DEMO_TIME);
  }, [scenario]);
  const categories = ["All checks", ...new Set(reliabilityReport.results.map((item) => item.category))];
  const results = reliabilityReport.results.filter((item) => testFilter === "All checks" || item.category === testFilter);

  return <>
    <section className="fantasy-section" id="fantasy" aria-labelledby="fantasy-title">
      <div className="section-heading compact"><span className="section-number">LAB</span><div>
        <span className="eyebrow">Player Decision Lab</span>
        <h2 id="fantasy-title">Two teams. Two leaders. Show the evidence.</h2>
        <p>Compare each team&apos;s highest projected fantasy scorer, with the scoring rules, coverage and source checks in view.</p>
      </div></div>
      <div className="fantasy-current-context">
        <div><span className="eyebrow">Current-week comparison</span><h3>{now === null ? "Checking the current week" : state.byeWeek ? `Week ${state.byeWeek}: Dallas bye` : game ? `Week ${game.week}: Dallas vs. ${game.opponentName}` : "No current-week matchup verified"}</h3>
          <p>{verified && game ? `Schedule verified from the football snapshot. Kickoff: ${timestamp(game.kickoffAt)}.` : "Current matchup verification is pending. No current weekly leader is asserted."}</p>
        </div>
        <span className="evidence-badge warning">Live projections unavailable</span>
      </div>
      <p className="fantasy-license-note">The FantasyPros adapter is disabled. Public-display rights and a complete weekly projection feed are required before real players can be ranked here. <a href={FANTASY_POLICY.policyUrl} target="_blank" rel="noreferrer">Read the API policy</a>.</p>
      <div className="fantasy-demo">
        <div className="fantasy-demo-heading"><div><span className="fixture-label">Synthetic walkthrough</span><h3>See how the comparison behaves</h3><p>Illustrative Week 8 context: Dallas and Arizona. All eight players and projection inputs below are fictional. This demonstration uses a fixed October 29, 2026 UTC test clock.</p></div>
          <div className="fantasy-scenario-control"><label htmlFor="fantasy-scenario">Inject a test condition</label><select id="fantasy-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>{scenarios.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        </div>
        <div className="fantasy-scoring"><strong>{FANTASY_SCORING.label}</strong><details><summary>Scoring rules and eligible positions</summary><p>{FANTASY_SCORING.description}</p></details></div>
        <p className="fixture-warning">Synthetic demonstration, not current FantasyPros projections.</p>
        <div aria-live="polite" aria-atomic="true">
          {comparison.leaders ? <><div className="fantasy-comparison-grid"><LeaderCard leader={comparison.leaders.cowboys} team="Dallas fixture" /><div className="fantasy-versus" aria-hidden="true">VS</div><LeaderCard leader={comparison.leaders.opponent} team="Arizona fixture" /></div>
            <p className="fantasy-difference">Fixture difference: <strong>{Math.abs(comparison.pointsDifference ?? 0).toFixed(2)} PPR points</strong> {comparison.pointsDifference === 0 ? "(tied)" : `toward the ${(comparison.pointsDifference ?? 0) > 0 ? "Dallas" : "Arizona"} fixture leader`}. Deterministic scoring; no AI prediction.</p></>
            : <div className="fantasy-abstention"><span className="evidence-badge warning">Expected abstention</span><h3>No leader can be supported</h3>{comparison.reasons.map((reason) => <p key={reason.code}>{reason.message}</p>)}<p>The invalid input does not produce a recommendation. Select the complete fixture to restore the comparison.</p></div>}
        </div>
        <p className="fantasy-provenance">Fixture source: Road to Six authored demonstration. Eight candidates, four eligible positions per team. Fixture generated: {timestamp(new Date(DEMO_TIME).toISOString())}; 24-hour validity within the simulated clock. No FantasyPros request is made.</p>
      </div>
    </section>

    <section className="fantasy-impact-section" id="fantasy-impact" aria-labelledby="fantasy-impact-title">
      <div className="section-heading compact"><span className="section-number">NEWS</span><div><span className="eyebrow">Cowboys Fantasy Impact</span><h2 id="fantasy-impact-title">Separate the report from the inference.</h2><p>Public practice participation, its possible fantasy relevance, and what the evidence cannot tell us.</p></div></div>
      <p className="fantasy-impact-status"><strong>{impact.status === "current" ? "Reviewed evidence available" : "Current impact assessment unavailable"}</strong> · Last editorial check: {timestamp(impact.checkedAt)} · Expires: {timestamp(impact.expiresAt)}.</p>
      {impact.cards.length ? <div className="fantasy-impact-grid">{impact.cards.map((card) => <article className="fantasy-impact-card" key={card.id}><span className="fixture-label">Week {card.week} · Public participation</span><h3>{card.player}</h3><dl><div><dt>Reported fact</dt><dd>{card.fact}</dd></div><div><dt>Fantasy interpretation</dt><dd>{card.interpretation}</dd></div><div><dt>Uncertainty</dt><dd>{card.uncertainty}</dd></div></dl><a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.sourceName}</a><small>{card.dateNote}</small></article>)}</div> : <div className="fantasy-abstention">{impact.reasons.map((reason) => <p key={reason}>{reason}</p>)}<a href="https://www.dallascowboys.com/team/injury-report/" target="_blank" rel="noreferrer">Check the official participation report</a></div>}
      <p className="fantasy-provenance">{impact.notice} This is a dated editorial check with a 24-hour validity window, not a live news feed. New evidence requires a fresh review.</p>
    </section>

    <section className="showcase-reliability" id="reliability" aria-labelledby="dashboard-title">
      <div className="section-heading compact"><span className="section-number">QA</span><div><span className="eyebrow">AI Reliability Dashboard</span><h2 id="dashboard-title">A refusal can be the correct result.</h2><p>Inspect the executable checks behind schema validation, evidence grounding and safe fallback.</p></div></div>
      <div className="reliability-summary-grid">
        <article><span>Observed test results</span><strong>{reliabilityReport.passed}/{reliabilityReport.total}</strong><p>Expected outcomes detected in local deterministic tests.</p></article>
        <article><span>Live AI metrics</span><strong>Unmeasured</strong><p>Production uptime, model accuracy, latency and cost per decision are not measured by this suite.</p></article>
        <article><span>Release target</span><strong>100%</strong><p>All declared checks must pass. This target is separate from production performance.</p></article>
      </div>
      <div className="reliability-run-evidence"><p><strong>Test evidence:</strong> {timestamp(reliabilityReport.runAt)} · {reliabilityReport.suiteVersion} · {reliabilityReport.paidProviderCalls} paid provider calls.</p><p>These tests inject synthetic inputs and failures. Output validation checks bounded structured claims, not unrestricted AI writing.</p><details><summary>Tested source fingerprint and limitations</summary><p>SHA-256: <code>{reliabilityReport.sourceFingerprint.value}</code></p><p>Base source commit: <code>{reliabilityReport.baseCommit}</code>. The fingerprint identifies the actual tested files, including changes after that base.</p><ul>{reliabilityReport.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul></details></div>
      <details className="reliability-all-checks"><summary>Inspect all {reliabilityReport.total} test results</summary>
      <div className="reliability-filter"><label htmlFor="reliability-filter">Inspect a control family</label><select id="reliability-filter" value={testFilter} onChange={(event) => setTestFilter(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select><span aria-live="polite">{results.length} checks shown</span></div>
      <div className="reliability-check-list">{results.map((result) => <details key={result.id} className="reliability-check"><summary><span className={result.passed ? "check-pass" : "check-fail"}>{result.passed ? "PASS" : "FAIL"}</span><span>{result.label}<small>{result.category} · Simulated test</small></span></summary><p>{result.detail}</p><dl><div><dt>Expected</dt><dd>{result.expected}</dd></div><div><dt>Observed</dt><dd>{result.observed}</dd></div></dl></details>)}</div></details>
    </section>
  </>;
}
