// Manually verified public practice-participation facts, paraphrased. No
// medical details, article text, images, projections or private data are stored.
const CHECKED_AT = "2026-10-29T01:25:18Z";
const EXPIRES_AT = "2026-10-30T01:25:18Z";
const SOURCE_URL = "https://www.dallascowboys.com/team/injury-report/";
const EVIDENCE = Object.freeze([
  Object.freeze({ id: "dal-w8-pickens-practice", player: "George Pickens", team: "DAL",
    season: 2026, week: 8, opponentTeam: "ARI", kind: "public_participation",
    fact: "The official Cowboys report lists George Pickens as a limited participant in Wednesday practice.",
    interpretation: "Monitor subsequent participation reports before assessing his expected workload.",
    uncertainty: "Limited practice does not establish game availability, workload or a fantasy-point change. A final game designation was not supplied in this report.",
    sourceName: "Dallas Cowboys official participation report", sourceUrl: SOURCE_URL,
    publishedAt: null, checkedAt: CHECKED_AT, expiresAt: EXPIRES_AT,
    dateNote: "The report shows Wednesday participation; its publication time is not supplied." }),
  Object.freeze({ id: "dal-w8-turpin-practice", player: "KaVontae Turpin", team: "DAL",
    season: 2026, week: 8, opponentTeam: "ARI", kind: "public_participation",
    fact: "The official Cowboys report lists KaVontae Turpin as not participating in Wednesday practice.",
    interpretation: "His participation is a watch item; later reports are needed before making a fantasy availability assessment.",
    uncertainty: "A missed practice does not mean a player is ruled out. No numerical fantasy adjustment or teammate benefit is inferred.",
    sourceName: "Dallas Cowboys official participation report", sourceUrl: SOURCE_URL,
    publishedAt: null, checkedAt: CHECKED_AT, expiresAt: EXPIRES_AT,
    dateNote: "The report shows Wednesday participation; its publication time is not supplied." }),
]);

export function fantasyImpactForContext(context, now = Date.now()) {
  const notice = "Public practice-participation facts with separately labeled interpretation. These signals do not change game-win forecasts or establish projected fantasy points.";
  const result = { status: "unavailable", cards: [], checkedAt: CHECKED_AT, expiresAt: EXPIRES_AT, reasons: [], notice };
  if (context?.bye) result.reasons.push("Dallas has a bye. There is no current-week matchup impact report.");
  else if (context?.verified !== true) result.reasons.push("The current matchup must be verified before these participation facts can be shown as current.");
  else if (context.season !== 2026 || context.week !== 8 || context.cowboysTeam !== "DAL" || context.opponentTeam !== "ARI") {
    result.reasons.push("No verified participation evidence is available for this matchup and week.");
  } else if (!Number.isFinite(now) || now < Date.parse(CHECKED_AT) || now >= Date.parse(EXPIRES_AT)
    || !Number.isFinite(Date.parse(context.kickoffAt)) || now >= Date.parse(context.kickoffAt)) {
    result.reasons.push("The participation evidence has expired or is outside its verified pregame window. Recheck the linked official report.");
  } else {
    result.status = "current";
    result.cards = EVIDENCE.map((item) => ({ ...item }));
  }
  return result;
}
