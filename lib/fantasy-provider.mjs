import { evaluateFantasyComparison, fantasyContextKey } from "./fantasy.mjs";

export function licensedFantasyProsAdapter() {
  return Object.freeze({ enabled: false, provider: "FantasyPros", status: "disabled",
    reason: "Public display rights and complete weekly access are not verified. No FantasyPros request is made.",
    callsMade: 0 });
}

// A fixture transport is injected by the reliability suite. This client never
// creates a network transport or reads credentials. Its metrics describe local
// controlled scenarios, not FantasyPros availability or account entitlements.
export function createFantasySimulationClient({ provider, now = Date.now, timeoutMs = 1000, cacheTtlMs = 60_000 }) {
  if (typeof provider !== "function" || typeof now !== "function" || !Number.isFinite(timeoutMs) || timeoutMs < 1
    || !Number.isFinite(cacheTtlMs) || cacheTtlMs < 1) throw new TypeError("A fixture provider and positive cache/timeout settings are required.");
  const cache = new Map();
  const pending = new Map();
  const failures = new Map();
  let cooldownUntil = 0;
  let providerCalls = 0;
  const receipt = (mode, snapshot, context, currentTime, reason = null) => {
    const preservedSnapshot = snapshot ? structuredClone(snapshot) : null;
    let comparison = evaluateFantasyComparison(preservedSnapshot, context, currentTime);
    if (reason) comparison = { ...comparison, status: "unavailable", leaders: null, pointsDifference: null,
      reasons: [...comparison.reasons, { code: reason, message: "The simulated refresh did not provide verified current inputs. Recommendations are paused." }] };
    return { mode, comparison, preservedSnapshot, reason,
      receipt: { transport: "simulated", providerCalls, nextRetryAt: cooldownUntil > currentTime ? new Date(cooldownUntil).toISOString() : null } };
  };
  async function read(context, { forceRefresh = false } = {}) {
    const key = fantasyContextKey(context);
    const currentTime = now();
    const stored = cache.get(key);
    const cached = evaluateFantasyComparison(stored?.snapshot, context, currentTime);
    if (!forceRefresh && !failures.has(key) && stored && currentTime < stored.cachedAt + cacheTtlMs && cached.status !== "unavailable") {
      return receipt("cache_hit", stored.snapshot, context, currentTime);
    }
    if (currentTime < cooldownUntil) return receipt("abstained", stored?.snapshot, context, currentTime, "rate_limited");
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      let timer;
      const fail = (reason) => {
        failures.set(key, reason);
        return receipt("abstained", stored?.snapshot, context, now(), reason);
      };
      try {
        providerCalls += 1;
        const result = await Promise.race([
          Promise.resolve().then(() => provider(context)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("provider_timeout")), timeoutMs); }),
        ]);
        if (result?.status === 429) {
          // Local test policy, not a claim about FantasyPros request limits.
          const seconds = Number.isFinite(result.retryAfterSeconds) && result.retryAfterSeconds > 0 ? result.retryAfterSeconds : 60;
          cooldownUntil = now() + Math.min(seconds, 86_400) * 1000;
          return fail("rate_limited");
        }
        if (result?.status !== 200) return fail("provider_http_error");
        if (result.snapshot?.mode !== "synthetic") return fail("fixture_transport_only");
        const checked = evaluateFantasyComparison(result.snapshot, context, now());
        if (checked.status === "unavailable") return fail("invalid_provider_snapshot");
        cache.set(key, { snapshot: structuredClone(result.snapshot), cachedAt: now() });
        failures.delete(key);
        return receipt("provider_fixture", result.snapshot, context, now());
      } catch (error) {
        return fail(error?.message === "provider_timeout" ? "provider_timeout" : "provider_unavailable");
      } finally {
        clearTimeout(timer);
        pending.delete(key);
      }
    })();
    pending.set(key, work);
    return work;
  }
  return { read };
}
