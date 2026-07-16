export const ADVANCE_THRESHOLD = 12;

export function calculateBetsScore(values) {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

export function getBetsVerdict(score) {
  return score >= ADVANCE_THRESHOLD ? "ADVANCE" : "HOLD";
}
