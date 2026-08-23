const COWBOYS_TEAM_NAME = "Dallas Cowboys";
const COWBOYS_SCHEDULE_TIME_ZONE = "America/Chicago";

const scheduleDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: COWBOYS_SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function finiteMarketNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 10_000 ? parsed : fallback;
}

function marketProbability(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : null;
}

function sportsbookCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function cowboysScheduleDate(commenceTime) {
  if (typeof commenceTime !== "string" || !commenceTime.trim()) return null;
  const date = new Date(commenceTime);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    scheduleDateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function cowboysOpponent(event) {
  const homeTeam = String(event?.homeTeam ?? "");
  const awayTeam = String(event?.awayTeam ?? "");
  if (homeTeam === COWBOYS_TEAM_NAME) return awayTeam || null;
  if (awayTeam === COWBOYS_TEAM_NAME) return homeTeam || null;
  return null;
}

export function findCowboysScheduleGame(schedule, event) {
  const eventDate = cowboysScheduleDate(event?.commenceTime);
  const opponentName = cowboysOpponent(event);
  if (!eventDate || !opponentName) return undefined;
  return schedule.find(
    (game) => game.date === eventDate && game.opponentName === opponentName,
  );
}

export function marketFromOddsEvent(event, fallback = {}) {
  return {
    cowboysMoneyline: finiteMarketNumber(
      event?.cowboysMoneyline,
      fallback.cowboysMoneyline ?? null,
    ),
    opponentMoneyline: finiteMarketNumber(
      event?.opponentMoneyline,
      fallback.opponentMoneyline ?? null,
    ),
    cowboysSpread: finiteMarketNumber(
      event?.cowboysSpread,
      fallback.cowboysSpread ?? null,
    ),
    totalLine: finiteMarketNumber(
      event?.total,
      fallback.totalLine ?? null,
    ),
    marketImpliedProbability: marketProbability(event?.cowboysConsensusProbability),
    sportsbookCount: sportsbookCount(event?.sportsbookCount),
  };
}

export function applyLiveMarket(game, market) {
  return market ? { ...game, ...market } : game;
}

export function forecastMarketEvidenceAction(evidence) {
  if (!evidence || typeof evidence !== "object") return { action: "unchanged" };
  if (
    evidence.source !== "The Odds API"
    || !evidence.market
    || typeof evidence.market !== "object"
  ) {
    return { action: "clear" };
  }

  const market = {
    cowboysMoneyline: finiteMarketNumber(evidence.market.cowboysMoneyline),
    opponentMoneyline: finiteMarketNumber(evidence.market.opponentMoneyline),
    cowboysSpread: finiteMarketNumber(evidence.market.cowboysSpread),
    totalLine: finiteMarketNumber(evidence.market.totalLine),
    marketImpliedProbability: marketProbability(evidence.market.marketImpliedProbability),
    sportsbookCount: sportsbookCount(evidence.market.sportsbookCount),
  };

  return {
    action: "apply",
    market,
    metadata: {
      source: "The Odds API",
      retrievedAt: typeof evidence.retrievedAt === "string"
        ? evidence.retrievedAt
        : typeof evidence.fetchedAt === "string"
          ? evidence.fetchedAt
          : null,
      cached: Boolean(evidence.cached),
    },
  };
}
