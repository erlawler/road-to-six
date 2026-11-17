export type FantasyPosition = "QB" | "RB" | "WR" | "TE";
export type FantasyStats = {
  passingYards: number; passingTouchdowns: number; passingInterceptions: number;
  rushingYards: number; rushingTouchdowns: number; receivingYards: number;
  receivingTouchdowns: number; receptions: number; fumblesLost: number; twoPointConversions: number;
};
export type FantasyContext = {
  season: number; week: number; cowboysTeam: "DAL"; opponentTeam: string; opponentName?: string;
  kickoffAt: string; verified: boolean; bye?: boolean;
};
export type FantasyPlayer = {
  id: string; name: string; team: string; position: FantasyPosition; season: number; week: number;
  scoringId: string; stats: FantasyStats; projectedPoints: number;
};
export type FantasySource = {
  label: string; updatedAt: string; expiresAt: string;
  licenseStatus: "synthetic" | "public_display_verified" | string; rightsEvidence?: string;
};
export type FantasySnapshot = {
  schemaVersion: string; mode: "synthetic" | "licensed"; season: number; week: number;
  contextKey: string; scoringId: string; source: FantasySource;
  coverage: { complete: boolean; truncated: boolean; positions: FantasyPosition[]; teamPlayerCounts: Record<string, number> };
  players: FantasyPlayer[];
};
export type FantasyLeader = { player: FantasyPlayer; tiedPlayers: FantasyPlayer[] };
export type FantasyComparison = {
  status: "ready_demo" | "ready_live" | "unavailable";
  reasons: Array<{ code: string; message: string }>;
  leaders: { cowboys: FantasyLeader; opponent: FantasyLeader } | null;
  pointsDifference: number | null;
  scoring: typeof FANTASY_SCORING;
  source: FantasySource | null;
  notice: string; contextKey: string; candidateCount: number;
};
export type FantasyClaim = { type: "leader"; playerId: string; points: number; mode: "ready_demo" | "ready_live" }
  | { type: "difference"; points: number; mode: "ready_demo" | "ready_live" }
  | { type: "abstention" };
export const FANTASY_SCHEMA_VERSION: string;
export const FANTASY_SCORING: Readonly<{
  id: string; label: string; positions: readonly FantasyPosition[];
  rules: Readonly<FantasyStats>; description: string;
}>;
export const FANTASY_POLICY: Readonly<{
  maxAgeMs: number; publicMode: "synthetic"; licensedAdapterEnabled: false; policyUrl: string; notice: string;
}>;
export function calculateFantasyPoints(stats: unknown): number | null;
export function fantasyContextKey(context: FantasyContext): string;
export function createSyntheticFantasySnapshot(context: FantasyContext, now?: number): FantasySnapshot;
export function evaluateFantasyComparison(snapshot: unknown, context: FantasyContext, now?: number): FantasyComparison;
export function validateFantasyExplanation(claims: unknown, comparison: FantasyComparison): { passed: boolean; reason: string };
