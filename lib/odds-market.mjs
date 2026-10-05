const COWBOYS_TEAM_NAME = "Dallas Cowboys";
const COWBOYS_SCHEDULE_TIME_ZONE = "America/Chicago";

const scheduleDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: COWBOYS_SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function finiteMarketNumber(value) {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 10_000 ? parsed : null;
}

function marketProbability(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : null;
}

function sportsbookCount(value) {
  if (typeof value !== "number" && typeof value !== "string") return 0;
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

export function marketFromOddsEvent(event) {
  const cowboysMoneyline = finiteMarketNumber(event?.cowboysMoneyline);
  const opponentMoneyline = finiteMarketNumber(event?.opponentMoneyline);
  const pairedBooks = sportsbookCount(event?.sportsbookCount);
  const hasMoneylinePair = cowboysMoneyline !== null && cowboysMoneyline !== 0
    && opponentMoneyline !== null && opponentMoneyline !== 0 && pairedBooks > 0;
  return {
    cowboysMoneyline: hasMoneylinePair ? cowboysMoneyline : null,
    opponentMoneyline: hasMoneylinePair ? opponentMoneyline : null,
    cowboysSpread: finiteMarketNumber(event?.cowboysSpread),
    totalLine: finiteMarketNumber(event?.total),
    marketImpliedProbability: hasMoneylinePair ? marketProbability(event?.cowboysConsensusProbability) : null,
    sportsbookCount: hasMoneylinePair ? pairedBooks : 0,
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
      cacheExpiresAt: typeof evidence.cacheExpiresAt === "string"
        && Number.isFinite(Date.parse(evidence.cacheExpiresAt))
        ? evidence.cacheExpiresAt
        : null,
    },
  };
}
