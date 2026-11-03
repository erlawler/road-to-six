export type UsageScenarioInput = { carries: number; targetShare: number; scoring: "ppr" | "half-ppr" | "standard" };
export type UsageSource = { url: string; updatedAt: string; reviewedAt: string; sha256: string; license: string; licenseUrl: string; attribution: string; correctionNotice: string };
export type UsagePlayer = {
  id: string; name: string; position: string; team: string; games: number; recordedGames: number;
  totalPpr: number; totalStandard: number; perGamePpr: number; targets: number; carries: number; targetShare: number | null;
  receptions: number; receivingYards: number; rushingYards: number;
  weekly: Array<{ week: number; date: string; ppr: number; targets: number; carries: number; targetShare: number | null; recorded: boolean }>;
  trend: { ppr: number | null; targets: number | null; carries: number | null };
  scenarioBaseline: UsageScenarioInput;
  efficiency: { rushStandardPerCarry: number | null; receiveStandardPerTarget: number | null; receptionsPerTarget: number | null; otherStandardPerGame: number; teamTargetsPerGame: number };
};
export type UsageTeam = {
  team: string; teamName?: string; complete: boolean; weeks: number[];
  games: Array<{ id: string; week: number; date: string; opponent: string }>;
  players: UsagePlayer[]; leaders: UsagePlayer[]; usageLeaders: { targets: UsagePlayer[]; carries: UsagePlayer[] };
  teamTargets: number; teamCarries: number; limitations: string[];
};
export type UsageComparison = {
  status: "available" | "unavailable"; reasons: string[];
  matchup: { season: number; week: number; opponent: string; opponentName: string; kickoffAt: string | null } | null;
  source: UsageSource | null; lookbackGames: number; scoring: { id: string; label: string; description: string };
  teams: UsageTeam[]; leaders: UsagePlayer[]; notice: string; limitations: string[];
};
export type UsageScenarioResult = {
  status: "available" | "unavailable"; reasons: string[]; baselinePoints: number | null; scenarioPoints: number | null; delta: number | null;
  assumptions: (UsageScenarioInput & { targets: number }) | null;
  components: { rushing: number; receiving: number; other: number } | null; formula: string; limitations: string[];
};
export const USAGE_SCHEMA_VERSION: string;
export const USAGE_POSITIONS: readonly string[];
export const USAGE_SCORING: Readonly<{ id: string; label: string; description: string }>;
export const USAGE_CORRECTION_NOTICE: string;
export function comparePlayerUsage(snapshot: unknown, now?: number): UsageComparison;
export function getPlayerUsage(snapshot: unknown, team: string, now?: number): { status: "available" | "unavailable"; reasons: string[]; team: UsageTeam | null; source: UsageSource | null };
export function calculateUsageScenario(player: UsagePlayer | null, team: UsageTeam | null, input: UsageScenarioInput): UsageScenarioResult;
