export type LiveMarket = {
  cowboysMoneyline: number | null;
  opponentMoneyline: number | null;
  cowboysSpread: number | null;
  totalLine: number | null;
  marketImpliedProbability: number | null;
  sportsbookCount: number;
};

export type ScheduleGame = {
  date: string;
  opponentName: string;
  cowboysMoneyline: number | null;
  opponentMoneyline: number | null;
  cowboysSpread: number | null;
  totalLine: number | null;
};

export type OddsEvent = Record<string, unknown> & {
  commenceTime?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  cowboysMoneyline?: unknown;
  opponentMoneyline?: unknown;
  cowboysSpread?: unknown;
  total?: unknown;
  cowboysConsensusProbability?: unknown;
  sportsbookCount?: unknown;
};

export type MarketEvidenceAction =
  | { action: "unchanged" }
  | { action: "clear" }
  | {
      action: "apply";
      market: LiveMarket;
      metadata: {
        source: "The Odds API";
        retrievedAt: string | null;
        cached: boolean;
        cacheExpiresAt: string | null;
      };
    };

export function cowboysScheduleDate(commenceTime: unknown): string | null;
export function defaultScheduleGame<T extends { date: string }>(schedule: readonly T[], date: string): T | undefined;
export function cowboysOpponent(event: OddsEvent): string | null;
export function findCowboysScheduleGame<T extends ScheduleGame>(
  schedule: readonly T[],
  event: OddsEvent,
): T | undefined;
export function marketFromOddsEvent(
  event: OddsEvent,
): LiveMarket;
export function applyLiveMarket<T extends object>(game: T, market?: LiveMarket): T & Partial<LiveMarket>;
export function forecastMarketEvidenceAction(evidence: unknown): MarketEvidenceAction;
