import { AsyncLocalStorage } from "node:async_hooks";
import type { FootballState } from "./football-store.mjs";
import { footballSnapshotFreshness } from "./source-freshness.mjs";
import bundledSnapshot from "../app/data/nfl-snapshot.json";

// RSC and Worker chunks share one request-local store without sharing user state.
const key = Symbol.for("road-to-six.football-request-context");
const shared = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<FootballState> };
export const footballRequestContext = shared[key] ??= new AsyncLocalStorage<FootballState>();

export function requestFootballState(): FootballState {
  return footballRequestContext.getStore() ?? {
    snapshot: bundledSnapshot,
    update: { status: "not_initialized", lastSuccessAt: null, lastAttemptAt: null, reasonCode: null },
    freshness: footballSnapshotFreshness(bundledSnapshot),
  };
}
