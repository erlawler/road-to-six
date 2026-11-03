export const FANTASY_SCHEMA_VERSION = "fantasy-v1";
export const FANTASY_SCORING = Object.freeze({
  id: "ppr-v1",
  label: "PPR, four-point passing touchdowns",
  positions: Object.freeze(["QB", "RB", "WR", "TE"]),
  rules: Object.freeze({ passingYards: 0.04, passingTouchdowns: 4, passingInterceptions: -2,
    rushingYards: 0.1, rushingTouchdowns: 6, receivingYards: 0.1, receivingTouchdowns: 6,
    receptions: 1, fumblesLost: -2, twoPointConversions: 2 }),
  description: "1 point per reception; 1 per 10 rushing or receiving yards; 1 per 25 passing yards; 6 per rushing or receiving touchdown; 4 per passing touchdown; -2 per interception or lost fumble; 2 per two-point conversion. No bonuses. QB, RB, WR and TE only; kickers and defenses excluded.",
});
export const FANTASY_POLICY = Object.freeze({
  maxAgeMs: 24 * 60 * 60 * 1000,
  publicMode: "synthetic",
  licensedAdapterEnabled: false,
  policyUrl: "https://support.fantasypros.com/hc/en-us/articles/49749297704475-How-do-I-request-access-to-the-FantasyPros-API",
  notice: "Synthetic demonstration, not current FantasyPros projections. Fictional players illustrate the comparison. Public display rights and complete weekly projections have not been verified.",
});

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const validTeam = (value) => typeof value === "string" && /^[A-Z]{2,3}$/.test(value);
const samePositions = (positions) => Array.isArray(positions) && positions.length === FANTASY_SCORING.positions.length
  && new Set(positions).size === positions.length && FANTASY_SCORING.positions.every((position) => positions.includes(position));

export function calculateFantasyPoints(stats) {
  if (!isObject(stats) || Object.keys(FANTASY_SCORING.rules).some((key) => typeof stats[key] !== "number"
    || !Number.isFinite(stats[key]) || stats[key] < 0)) return null;
  return round(Object.entries(FANTASY_SCORING.rules).reduce((total, [key, weight]) => total + stats[key] * weight, 0));
}

export function fantasyContextKey(context) {
  return `${context?.season}:${context?.week}:${context?.cowboysTeam}:${context?.opponentTeam}:${context?.kickoffAt}`;
}

function contextReasons(context, now) {
  if (!isObject(context) || !Number.isInteger(context.season) || context.season < 2000 || context.season > 2200
    || !Number.isInteger(context.week) || context.week < 1 || context.week > 22
    || context.cowboysTeam !== "DAL" || !validTeam(context.opponentTeam) || context.opponentTeam === "DAL") {
    return [{ code: "invalid_context", message: "A valid season, week and two-team matchup are required." }];
  }
  if (context.bye) return [{ code: "bye_week", message: "Dallas has a bye this week. No weekly player comparison is available." }];
  if (context.verified !== true) return [{ code: "unverified_context", message: "The current matchup has not been verified." }];
  if (!timestamp(context.kickoffAt)) return [{ code: "unknown_kickoff", message: "The matchup kickoff has not been verified." }];
  if (!Number.isFinite(now) || Date.parse(context.kickoffAt) <= now) {
    return [{ code: "game_started", message: "This matchup has started or finished. Pregame projections are unavailable." }];
  }
  return [];
}

export function evaluateFantasyComparison(snapshot, context, now = Date.now()) {
  const reasons = contextReasons(context, now);
  const add = (code, message) => { if (!reasons.some((reason) => reason.code === code)) reasons.push({ code, message }); };
  const base = { status: "unavailable", reasons, leaders: null, pointsDifference: null, scoring: FANTASY_SCORING,
    source: null, notice: FANTASY_POLICY.notice, contextKey: fantasyContextKey(context), candidateCount: 0 };
  if (!isObject(snapshot)) { add("missing_snapshot", "No projection snapshot is available."); return base; }
  if (snapshot.schemaVersion !== FANTASY_SCHEMA_VERSION || !["synthetic", "licensed"].includes(snapshot.mode)) {
    add("invalid_schema", "The projection schema or data mode is unsupported.");
  }
  if (snapshot.season !== context?.season || snapshot.week !== context?.week || snapshot.contextKey !== fantasyContextKey(context)) {
    add("context_mismatch", "Projection season, week or matchup does not match the selected context.");
  }
  if (snapshot.scoringId !== FANTASY_SCORING.id) add("scoring_mismatch", "Projection scoring must match the displayed PPR rules.");
  const source = snapshot.source;
  if (!isObject(source) || !text(source.label) || !timestamp(source.updatedAt) || !timestamp(source.expiresAt)) {
    add("invalid_source", "The projection source and its valid timestamps are required.");
  } else {
    base.source = source;
    const updatedAt = Date.parse(source.updatedAt);
    const expiresAt = Date.parse(source.expiresAt);
    if (updatedAt > now || expiresAt <= updatedAt) add("conflicting_timestamps", "Source timestamps conflict or are in the future.");
    if (now >= expiresAt || now - updatedAt > FANTASY_POLICY.maxAgeMs) add("stale_snapshot", "Projection freshness has expired. No current leader is asserted.");
    if (snapshot.mode === "synthetic" && source.licenseStatus !== "synthetic") add("license_unverified", "Synthetic data must retain its explicit synthetic provenance.");
    // Kept at the domain boundary for a future reviewed adapter. The shipped
    // provider cannot fetch or enable licensed data, even when passed a key.
    if (snapshot.mode === "licensed" && (source.licenseStatus !== "public_display_verified" || !text(source.rightsEvidence))) {
      add("license_unverified", "Public display rights for this projection source have not been verified.");
    }
  }
  if (!isObject(snapshot.coverage) || snapshot.coverage.complete !== true || snapshot.coverage.truncated !== false
    || !samePositions(snapshot.coverage.positions) || !isObject(snapshot.coverage.teamPlayerCounts)) {
    add("incomplete_coverage", "Complete coverage of both teams and every eligible position is required; truncated feeds cannot identify leaders.");
  }
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  if (!Array.isArray(snapshot.players) || players.length === 0 || players.length > 200) add("invalid_players", "The snapshot must contain a bounded, nonempty player list.");
  const ids = new Set();
  const teams = [context?.cowboysTeam, context?.opponentTeam];
  for (const player of players) {
    if (!isObject(player) || !text(player.id) || !text(player.name) || !teams.includes(player.team)
      || !FANTASY_SCORING.positions.includes(player.position) || !Number.isFinite(player.projectedPoints)) {
      add("invalid_player", "Every player requires a unique identity, team, eligible position and finite projection.");
      continue;
    }
    if (ids.has(player.id)) add("duplicate_player", "Duplicate player identities make the projection set ambiguous.");
    ids.add(player.id);
    if (player.season !== context?.season || player.week !== context?.week) add("player_context_mismatch", "Every player must belong to the selected season and week.");
    if (player.scoringId !== FANTASY_SCORING.id) add("scoring_mismatch", "Projection scoring must match the displayed PPR rules.");
    const calculated = calculateFantasyPoints(player.stats);
    if (calculated === null) add("missing_stats", "All scoring inputs must be present and finite; missing values are not zero.");
    else if (Math.abs(calculated - player.projectedPoints) > 0.005) add("projection_conflict", "Projected fantasy points conflict with the supplied scoring components.");
  }
  for (const team of teams) {
    const count = players.filter((player) => player?.team === team).length;
    const declared = snapshot.coverage?.teamPlayerCounts?.[team];
    if (!Number.isInteger(declared) || declared < 1 || declared !== count) add("incomplete_coverage", "Declared team coverage does not match the complete projection list.");
  }
  base.candidateCount = players.length;
  if (reasons.length) return base;
  const leader = (team) => {
    const eligible = players.filter((player) => player.team === team)
      .sort((a, b) => b.projectedPoints - a.projectedPoints || a.id.localeCompare(b.id));
    const maximum = eligible[0].projectedPoints;
    return { player: eligible[0], tiedPlayers: eligible.filter((player) => Math.abs(player.projectedPoints - maximum) < 0.005) };
  };
  const cowboys = leader(context.cowboysTeam);
  const opponent = leader(context.opponentTeam);
  return { ...base, status: snapshot.mode === "synthetic" ? "ready_demo" : "ready_live",
    leaders: { cowboys, opponent }, pointsDifference: round(cowboys.player.projectedPoints - opponent.player.projectedPoints),
    notice: snapshot.mode === "synthetic" ? FANTASY_POLICY.notice : "Projected points are estimates, not guaranteed outcomes. Fantasy scoring is separate from game-win probability." };
}

export function createSyntheticFantasySnapshot(context, now = Date.now()) {
  const empty = Object.fromEntries(Object.keys(FANTASY_SCORING.rules).map((key) => [key, 0]));
  const templates = [
    ["QB", "Avery Vale", { passingYards: 260, passingTouchdowns: 1.8, passingInterceptions: 0.6, rushingYards: 16 }],
    ["RB", "Jordan Mesa", { rushingYards: 72, rushingTouchdowns: 0.6, receptions: 3.6, receivingYards: 26 }],
    ["WR", "Cameron Lane", { receptions: 7.4, receivingYards: 96, receivingTouchdowns: 0.5 }],
    ["TE", "Morgan Reed", { receptions: 4.5, receivingYards: 47, receivingTouchdowns: 0.4 }],
  ];
  const players = [context.cowboysTeam, context.opponentTeam].flatMap((team, teamIndex) => templates.map(([position, name, partial], index) => {
    const stats = { ...empty, ...partial };
    if (teamIndex === 1) {
      stats.passingYards *= 0.9;
      stats.receivingYards *= 0.85;
      stats.rushingYards *= 0.9;
    }
    return { id: `synthetic-${team}-${position}`, name: teamIndex === 0 ? name : ["Riley Stone", "Casey Brook", "Taylor Ridge", "Alex Harbor"][index],
      team, position, season: context.season, week: context.week, scoringId: FANTASY_SCORING.id,
      stats, projectedPoints: calculateFantasyPoints(stats) };
  }));
  return { schemaVersion: FANTASY_SCHEMA_VERSION, mode: "synthetic", season: context.season, week: context.week,
    contextKey: fantasyContextKey(context), scoringId: FANTASY_SCORING.id,
    source: { label: "Road to Six fictional scenario fixture", updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + FANTASY_POLICY.maxAgeMs).toISOString(), licenseStatus: "synthetic" },
    coverage: { complete: true, truncated: false, positions: [...FANTASY_SCORING.positions],
      teamPlayerCounts: { [context.cowboysTeam]: 4, [context.opponentTeam]: 4 } }, players };
}

// Explanations are structured evidence claims, never unrestricted generated
// prose. The UI renders canonical copy after every claim passes this boundary.
export function validateFantasyExplanation(claims, comparison) {
  if (!comparison?.leaders || comparison.status === "unavailable") {
    const passed = Array.isArray(claims) && claims.length === 1 && claims[0]?.type === "abstention"
      && Object.keys(claims[0]).length === 1;
    return { passed, reason: passed ? "abstention_verified" : "must_abstain" };
  }
  if (!Array.isArray(claims) || claims.length !== 3) return { passed: false, reason: "claim_count_mismatch" };
  const expected = [comparison.leaders.cowboys.player, comparison.leaders.opponent.player].map((player) => ({
    type: "leader", playerId: player.id, points: player.projectedPoints, mode: comparison.status,
  }));
  expected.push({ type: "difference", points: comparison.pointsDifference, mode: comparison.status });
  const passed = expected.every((claim, index) => isObject(claims[index])
    && Object.keys(claims[index]).length === Object.keys(claim).length
    && Object.entries(claim).every(([key, value]) => claims[index][key] === value));
  return { passed, reason: passed ? "evidence_matched" : "unsupported_claim" };
}
