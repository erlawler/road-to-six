export type MarketRequestState = "idle" | "loading" | "loaded" | "error" | "expired";
export function explanationAvailability(input: { checking: boolean; canExplore: boolean; current: boolean; unverified: boolean }): { label: string; reason: string | null };
export function marketAvailability(input: { requestState: MarketRequestState; paired: boolean; retrieved: boolean; snapshotPaired: boolean }): { label: string; missing: string; detail: string };
