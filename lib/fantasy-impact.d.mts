import type { FantasyContext } from "./fantasy.mjs";
export type FantasyImpactCard = {
  id: string; player: string; team: string; season: number; week: number; opponentTeam: string;
  kind: "public_participation"; fact: string; interpretation: string; uncertainty: string;
  sourceName: string; sourceUrl: string; publishedAt: string | null;
  checkedAt: string; expiresAt: string; dateNote: string;
};
export function fantasyImpactForContext(context: FantasyContext, now?: number): {
  status: "current" | "unavailable"; cards: FantasyImpactCard[];
  checkedAt: string; expiresAt: string; reasons: string[]; notice: string;
};
