export type BetsValues = {
  business: number;
  effort: number;
  techDebt: number;
  urgency: number;
};

export const ADVANCE_THRESHOLD: number;
export function calculateBetsScore(values: BetsValues): number;
export function getBetsVerdict(score: number): "ADVANCE" | "HOLD";
