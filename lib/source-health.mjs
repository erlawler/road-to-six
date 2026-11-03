import { cowboysSeasonState } from "./season-state.mjs";

const iso = (value) => Number.isFinite(Date.parse(value)) ? value : null;

export function getCurrentMatchup(state, now = Date.now()) {
  const snapshot = state.snapshot;
  const season = cowboysSeasonState(snapshot, now);
  const game = snapshot.schedule.find((item) => item.week === season.calendarWeek) ?? null;
  const healthy = season.current && !["failed", "unavailable"].includes(state.update.status);
  const status = !healthy ? "unavailable" : season.byeWeek !== null ? "bye" : game ? "verified" : "unavailable";
  return {
    status, reason: !healthy ? "Current football verification is unavailable; the last good snapshot is preserved."
      : season.byeWeek !== null ? "Dallas has a bye in the current league week."
      : !game ? "No current-week matchup is verified." : null,
    season: snapshot.season.year, week: season.calendarWeek,
    game: game ? { id: game.id, week: game.week, opponent: game.opponent, opponentName: game.opponentName,
      kickoffAt: game.kickoffAt, stadium: game.stadium, venue: game.venue } : null,
    record: season.record, verifiedAt: snapshot.season.verifiedAt,
  };
}

export function getSourceHealth(state, now = Date.now()) {
  const { snapshot, update, freshness } = state;
  const matchup = getCurrentMatchup(state, now);
  const coverage = snapshot.manifest?.coverage ?? {};
  const usageTeams = Object.values(snapshot.usage?.teams ?? {});
  const missing = [
    ...(coverage.missingFeaturedPlayers ?? []), ...(coverage.missingOpponentLeaders ?? []),
    ...(coverage.missingRosterTeamWeeks ?? []), ...usageTeams.flatMap((team) => team.limitations ?? []),
  ].map(String);
  const inputs = snapshot.manifest?.inputs ?? {};
  const expectedUsageTeams = [...new Set(["DAL", ...snapshot.schedule.map((game) => game.opponent)])];
  const usageReviewedAt = Date.parse(snapshot.usage?.source?.reviewedAt);
  const usageComplete = snapshot.usage?.schemaVersion === "player-usage-v1"
    && snapshot.usage?.season === snapshot.season.year
    && Number.isFinite(usageReviewedAt) && usageReviewedAt <= now && now - usageReviewedAt <= 7 * 86_400_000
    && expectedUsageTeams.every((team) => snapshot.usage.teams?.[team]?.complete
      && snapshot.usage.teams[team].games?.length === 3 && snapshot.usage.teams[team].players?.length > 0);
  const sourceValidation = snapshot.manifest?.validationStatus ?? "unavailable";
  const lastAttemptAt = iso(update.lastAttemptAt), lastSuccessAt = iso(update.lastSuccessAt);
  const current = update.status === "ready" && lastSuccessAt !== null && matchup.status !== "unavailable"
    && freshness.status === "current" && sourceValidation === "passed";
  const elapsed = Date.parse(lastSuccessAt) - Date.parse(lastAttemptAt);
  const lastSuccessfulDurationMs = update.status === "ready" && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 120_000 ? elapsed : null;
  const observedAt = new Date(now).toISOString();
  const trace = [
    { step: "Read saved football state", status: update.status, checkedAt: observedAt,
      detail: `Latest recorded refresh outcome: ${update.status}. Version ${snapshot.dataVersion}. This is a state read, not a new upstream refresh.` },
    ...Object.entries(inputs).map(([name, input]) => ({ step: `Validate ${name} source`,
      status: input.metadataStatus === "verified" ? "verified" : "unavailable",
      checkedAt: input.retrievedBetween?.end ?? null, sourceUrl: input.url,
      detail: `Source update ${input.sourceUpdatedAt ?? "unavailable"}; ${input.rows ?? "unknown"} rows; SHA-256 ${input.sha256 ?? "unavailable"}. Validation is recorded by the hosted updater.` })),
    { step: "Verify current league week", status: matchup.status, checkedAt: matchup.verifiedAt,
      sourceUrl: "https://www.dallascowboys.com/schedule/", detail: matchup.reason ?? `Week ${matchup.week}; ${matchup.game?.opponentName}; verified schedule and completed results.` },
    { step: "Check player usage coverage", status: usageComplete ? "complete" : "unavailable", checkedAt: snapshot.usage?.source?.reviewedAt ?? null,
      sourceUrl: snapshot.usage?.source?.url, detail: usageComplete ? `${usageTeams.length} teams have validated recent-game candidate coverage.` : "Complete recent-game usage has not been verified in this saved snapshot." },
  ];
  return {
    status: update.status === "unavailable" ? "unavailable" : current && usageComplete && !missing.length ? "current" : "degraded",
    observedAt, dataVersion: snapshot.dataVersion, latestOutcome: update.status,
    lastAttemptAt, lastSuccessAt, lastSuccessfulDurationMs,
    snapshotAgeDays: freshness.ageDays, sourceValidation,
    coverage: { games: snapshot.schedule.length, featuredPlayers: snapshot.players.length,
      opponentTeams: Object.keys(snapshot.opponents).length,
      opponentLeaders: Object.values(snapshot.opponents).reduce((count, team) => count + team.leaders.length, 0),
      usageTeams: usageTeams.length, missing },
    metrics: { uptime: null, modelAccuracy: null, paidAiLatency: null, paidAiCost: null }, trace,
    limitations: [
      "Only the latest saved refresh outcome is observed. No uptime percentage, failure-rate history or latency distribution is inferred.",
      "Refresh duration, when shown, is the difference between the latest successful attempt and saved completion timestamps.",
      "nflverse corrections can arrive Wednesday night or Thursday. The existing Wednesday 8 a.m. America/Chicago review schedule is unchanged and may precede those corrections.",
      "The read-only tool interface returns deterministic evidence. It does not perform AI inference or call paid AI or odds services.",
      ...(snapshot.usage?.limitations ?? []),
      ...missing,
    ],
  };
}
