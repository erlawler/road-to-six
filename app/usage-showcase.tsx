"use client";

import { useState } from "react";
import { calculateUsageScenario, type UsageComparison, type UsagePlayer, type UsageTeam, type UsageScenarioInput } from "@/lib/player-usage.mjs";
import { evidenceDate, evidenceTime, numberLabel } from "./showcase-format";

const signed = (value: number | null) => value === null ? "Not available" : `${value > 0 ? "+" : ""}${numberLabel(value)}`;
const leaderNames = (players: UsagePlayer[]) => players.map((player) => player.name).join(", ");

function PlayerProduction({ team }: { team: UsageTeam }) {
  const player = team.leaders[0];
  if (!player) return <article className="fantasy-player-card"><h3>{team.teamName}</h3><p>No complete production leader can be supported.</p></article>;
  return <article className="fantasy-player-card production-player-card">
    <div className="fantasy-card-label"><span>{team.teamName}</span><span>{player.position}</span></div>
    <span className="fixture-label">Recent production leader</span>
    <h3>{player.name}</h3>
    <div className="fantasy-points"><strong>{numberLabel(player.totalPpr)}</strong><span>recorded PPR points<br />across {team.games.length} team games</span></div>
    <p className="production-average"><strong>{numberLabel(player.perGamePpr)}</strong> PPR points per team game</p>
    {team.leaders.length > 1 ? <p className="usage-tie">Tied leaders: {leaderNames(team.leaders)}. The featured card uses stable player ID order.</p> : null}
    <dl className="usage-facts"><div><dt>Targets</dt><dd>{numberLabel(player.targets, 0)}</dd></div><div><dt>Carries</dt><dd>{numberLabel(player.carries, 0)}</dd></div><div><dt>Target share</dt><dd>{player.targetShare === null ? "Not available" : `${numberLabel(player.targetShare * 100)}%`}</dd></div></dl>
    <details className="usage-game-trace"><summary>Inspect the {team.games.length}-game record</summary>
      <div className="usage-table-scroll" tabIndex={0} role="region" aria-label={`${player.name} game records`}><table><caption>Actual production. Missing individual stat rows are identified.</caption><thead><tr><th scope="col">Game</th><th scope="col">PPR</th><th scope="col">Targets</th><th scope="col">Carries</th></tr></thead><tbody>{player.weekly.map((week) => <tr key={week.week}><th scope="row">W{week.week}<small>{evidenceDate(week.date)}{!week.recorded ? " · No stat row" : ""}</small></th><td>{numberLabel(week.ppr)}</td><td>{numberLabel(week.targets, 0)}</td><td>{numberLabel(week.carries, 0)}</td></tr>)}</tbody></table></div>
      <p>Latest game compared with the preceding games&apos; average: <strong>{signed(player.trend.ppr)} PPR</strong>, <strong>{signed(player.trend.targets)} targets</strong>, <strong>{signed(player.trend.carries)} carries</strong>. A difference in past usage is not a future prediction.</p>
    </details>
    <p className="usage-window">Window: {team.games.map((game) => `W${game.week}`).join(", ")} · {evidenceDate(team.games[0]?.date ?? "")} to {evidenceDate(team.games.at(-1)?.date ?? "")}.</p>
    <div className="usage-leader-notes"><p><strong>Target leader{team.usageLeaders.targets.length === 1 ? "" : "s"}:</strong> {leaderNames(team.usageLeaders.targets) || "No supported leader"}</p><p><strong>Carry leader{team.usageLeaders.carries.length === 1 ? "" : "s"}:</strong> {leaderNames(team.usageLeaders.carries) || "No supported leader"}</p></div>
  </article>;
}

export function UsageComparisonView({ usage, loading, reason, currentWeek, bye }: { usage: UsageComparison | null; loading: boolean; reason: string | null; currentWeek: number | null; bye: boolean }) {
  const available = usage?.status === "available" && usage.teams.length === 2;
  const matchup = usage?.matchup;
  return <section className="fantasy-section" id="fantasy" aria-labelledby="fantasy-title">
    <div className="section-heading compact"><span className="section-number">DATA</span><div><span className="eyebrow">Player Decision Lab</span><h2 id="fantasy-title">Two teams. Recent production. Real evidence.</h2><p>Compare recorded fantasy points, targets and carries from each team&apos;s last three completed games. These are historical performance leaders, not live fantasy projections.</p></div></div>
    <nav className="showcase-section-links" aria-label="Free-data showcase sections"><a href="#what-if">Try a usage scenario</a><a href="#reliability">Inspect source health</a><a href="#game-day">Check venue weather</a></nav>
    <div className="fantasy-current-context"><div><span className="eyebrow">Verified current-week matchup</span><h3>{bye ? `Week ${currentWeek}: Dallas bye` : matchup ? `Week ${matchup.week}: Dallas vs. ${matchup.opponentName}` : loading ? "Checking the current matchup" : "Current matchup comparison unavailable"}</h3><p>{matchup ? `Kickoff: ${evidenceTime(matchup.kickoffAt)}. The player comparison describes games already played.` : "A current matchup and complete historical coverage are required."}</p></div><span className={`evidence-badge ${available ? "" : "warning"}`}>{available ? "Recorded production" : loading ? "Checking evidence" : "Comparison withheld"}</span></div>
    {available ? <>
      <div className="fantasy-scoring"><strong>{usage.scoring.label}</strong><p>{usage.scoring.description}</p><p>Lookback: last {usage.lookbackGames} completed team games, excluding byes. Active-roster QB, RB, WR and TE candidates. Leader selection uses total recorded PPR points; joint leaders stay visible.</p></div>
      <div className="fantasy-comparison-grid"><PlayerProduction team={usage.teams[0]} /><div className="fantasy-versus" aria-hidden="true">VS</div><PlayerProduction team={usage.teams[1]} /></div>
      <details className="usage-candidate-details"><summary>Inspect candidate coverage and team usage</summary><ul>{usage.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>{usage.teams.map((team) => <div key={team.team} className="usage-team-audit"><h3>{team.teamName}: {team.players.length} included candidates</h3><p>Team totals in this window: {numberLabel(team.teamTargets, 0)} targets and {numberLabel(team.teamCarries, 0)} carries. Target share divides a player&apos;s targets by team targets in the same window.</p><div className="usage-table-scroll" tabIndex={0} role="region" aria-label={`${team.teamName} candidate production`}><table><thead><tr><th scope="col">Player</th><th scope="col">Position</th><th scope="col">PPR</th><th scope="col">Targets</th><th scope="col">Carries</th></tr></thead><tbody>{team.players.map((player) => <tr key={player.id}><th scope="row">{player.name}</th><td>{player.position}</td><td>{numberLabel(player.totalPpr)}</td><td>{numberLabel(player.targets, 0)}</td><td>{numberLabel(player.carries, 0)}</td></tr>)}</tbody></table></div><ul>{team.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul></div>)}</details>
    </> : <div className="showcase-unavailable" role="status"><h3>{loading ? "Loading the saved usage evidence" : "No current production leader asserted"}</h3>{reason ? <p>{reason}</p> : null}{usage?.reasons.map((item) => <p key={item}>{item}</p>)}<p>Missing, stale or incomplete inputs do not fall back to fictional players. The reliability panel explains the latest observed state.</p></div>}
    {usage?.source ? <div className="fantasy-provenance"><p><a href={usage.source.url} target="_blank" rel="noreferrer">nflverse weekly player statistics</a> · <a href={usage.source.licenseUrl} target="_blank" rel="noreferrer">{usage.source.license}</a>. {usage.source.attribution}</p><p>Source update: {evidenceTime(usage.source.updatedAt)} · Reviewed: {evidenceTime(usage.source.reviewedAt)}.</p><p>{usage.source.correctionNotice}</p><details><summary>Inspect the dataset fingerprint</summary><code>{usage.source.sha256}</code></details></div> : null}
    <p className="usage-limitation">{usage?.notice ?? "Past production does not establish future workload, availability or fantasy points. No FantasyPros data or paid inference is used in this comparison."}</p>
  </section>;
}

function UsageScenarioForm({ player, team }: { player: UsagePlayer; team: UsageTeam }) {
  const [carries, setCarries] = useState(String(player.scenarioBaseline.carries));
  const [targetShare, setTargetShare] = useState(String(player.scenarioBaseline.targetShare * 100));
  const [scoring, setScoring] = useState<UsageScenarioInput["scoring"]>("ppr");
  const [resetMessage, setResetMessage] = useState("");
  const result = calculateUsageScenario(player, team, { carries: carries.trim() ? Number(carries) : Number.NaN, targetShare: targetShare.trim() ? Number(targetShare) / 100 : Number.NaN, scoring });
  function reset() { setCarries(String(player.scenarioBaseline.carries)); setTargetShare(String(player.scenarioBaseline.targetShare * 100)); setScoring("ppr"); setResetMessage("Scenario reset to this player's recent-game baseline."); }
  return <div className="usage-scenario-workspace">
    <div className="usage-scenario-controls"><p className="usage-scenario-player"><strong>{player.name}</strong> · {player.position} · {team.teamName}</p><p>Set hypothetical volume for one game. Team pass volume and player efficiency stay at their observed lookback averages.</p>
      <div className="usage-input"><label htmlFor="usage-carries">Carries per game</label><input id="usage-carries" type="number" min="0" max="40" step="any" value={carries} onChange={(event) => { setCarries(event.target.value); setResetMessage(""); }} aria-describedby="usage-carries-help" /><small id="usage-carries-help">0 to 40. Historical average: {numberLabel(player.scenarioBaseline.carries, 2)}.</small></div>
      <div className="usage-input"><label htmlFor="usage-target-share">Share of team targets (%)</label><input id="usage-target-share" type="number" min="0" max="100" step="any" value={targetShare} onChange={(event) => { setTargetShare(event.target.value); setResetMessage(""); }} aria-describedby="usage-share-help" /><small id="usage-share-help">0 to 100%. Historical share: {numberLabel(player.scenarioBaseline.targetShare * 100, 2)}%.</small></div>
      <div className="usage-input"><label htmlFor="usage-scoring">Scoring format</label><select id="usage-scoring" value={scoring} onChange={(event) => { setScoring(event.target.value as UsageScenarioInput["scoring"]); setResetMessage(""); }}><option value="ppr">PPR: 1 point per reception</option><option value="half-ppr">Half PPR: 0.5 per reception</option><option value="standard">Standard: no reception points</option></select></div>
      <button className="showcase-read-button" type="button" onClick={reset}>Reset usage scenario</button><p className="usage-reset-message" role="status">{resetMessage}</p>
    </div>
    <div className="usage-scenario-result" aria-live="polite" aria-atomic="true"><span className="eyebrow">Deterministic scenario calculation</span>{result.status === "available" && result.assumptions && result.components && result.delta !== null ? <><h3>{numberLabel(result.scenarioPoints, 2)} <span>scenario points</span></h3><dl className="usage-facts"><div><dt>Historical equivalent</dt><dd>{numberLabel(result.baselinePoints, 2)}</dd></div><div><dt>Scenario difference</dt><dd>{result.delta > 0 ? "+" : ""}{numberLabel(result.delta, 2)}</dd></div><div><dt>Assumed targets</dt><dd>{numberLabel(result.assumptions.targets, 2)}</dd></div></dl><p className="usage-scenario-notice">This is arithmetic under your assumptions, not a forecast or a prediction of next-game fantasy points.</p><details open><summary>Inspect the calculation</summary><p className="usage-formula">{result.formula}</p><dl className="usage-formula-components"><div><dt>Rushing contribution</dt><dd>{numberLabel(result.components.rushing, 2)}</dd></div><div><dt>Receiving contribution</dt><dd>{numberLabel(result.components.receiving, 2)}</dd></div><div><dt>Passing and other, held constant</dt><dd>{numberLabel(result.components.other, 2)}</dd></div></dl><p>Historical rates include recorded touchdowns and lost fumbles. They are not stable estimates of future efficiency.</p><ul>{result.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul></details></> : <div className="showcase-unavailable"><h3>Scenario result withheld</h3>{result.reasons.map((reason) => <p key={reason}>{reason}</p>)}<p>Supply valid bounds and supported historical inputs, or reset the scenario.</p></div>}</div>
  </div>;
}

function UsageScenarioSelector({ usage }: { usage: UsageComparison }) {
  const candidates = usage.teams.flatMap((team) => team.players.map((player) => ({ player, team })));
  const defaultCandidate = candidates.find(({ player }) => player.team === "DAL" && player.position === "RB" && player.carries > 0 && player.targets > 0) ?? candidates[0];
  const [playerId, setPlayerId] = useState(defaultCandidate?.player.id ?? "");
  const selected = candidates.find(({ player }) => player.id === playerId) ?? defaultCandidate;
  if (!selected) return <p className="showcase-unavailable">No complete player history is available for a scenario.</p>;
  return <><div className="usage-player-select"><label htmlFor="usage-player">Choose a player from this matchup&apos;s evidence</label><select id="usage-player" value={selected.player.id} onChange={(event) => setPlayerId(event.target.value)}>{candidates.map(({ player, team }) => <option value={player.id} key={player.id}>{player.name} · {player.position} · {team.teamName}</option>)}</select><p>Changing players resets assumptions. Scenarios are not saved across page loads or dataset changes.</p></div><UsageScenarioForm key={selected.player.id} player={selected.player} team={selected.team} /></>;
}

export function UsageWhatIf({ usage }: { usage: UsageComparison | null }) {
  return <section className="usage-what-if-section" id="what-if" aria-labelledby="usage-what-if-title"><div className="section-heading compact"><span className="section-number">LAB</span><div><span className="eyebrow">Usage what-if lab</span><h2 id="usage-what-if-title">Change an assumption. Inspect the arithmetic.</h2><p>Explore carries, target share and reception scoring using actual recent efficiency. This lab does not alter game-win forecasts or claim causal player outcomes.</p></div></div>{usage?.status === "available" ? <UsageScenarioSelector key={`${usage.source?.sha256}:${usage.matchup?.week}`} usage={usage} /> : <div className="showcase-unavailable"><h3>Waiting for complete player usage</h3><p>The lab requires verified current-matchup history. Missing inputs produce no scenario estimate.</p></div>}</section>;
}
