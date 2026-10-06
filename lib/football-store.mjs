import { footballSnapshotFreshness } from "./source-freshness.mjs";
import { footballContentHash, retrieveFootballCandidate } from "./football-sources.mjs";

const HOUR = 3_600_000;
export const FOOTBALL_STATE_SELECT = "SELECT payload, data_version, content_hash, last_success_at, last_attempt_at, last_error, lease_expires_at, cooldown_until FROM football_state WHERE id = 1";

export async function readFootballState(env, fallback) {
  try {
    if (!env.DB) throw new Error("No football database");
    const row = await env.DB.prepare(FOOTBALL_STATE_SELECT).first();
    const snapshot = row?.payload ? JSON.parse(row.payload) : fallback;
    if (row?.payload && (!snapshot?.dataVersion || snapshot.dataVersion !== row.data_version || snapshot.manifest?.validationStatus !== "passed")) throw new Error("Invalid stored football state");
    return { snapshot, update: { status: row?.last_error ? "failed" : row?.payload ? "ready" : "not_initialized", lastSuccessAt: row?.last_success_at ?? null, lastAttemptAt: row?.last_attempt_at ?? null, reasonCode: row?.last_error ?? null }, freshness: footballSnapshotFreshness(snapshot) };
  } catch {
    return { snapshot: fallback, update: { status: "unavailable", lastSuccessAt: null, lastAttemptAt: null, reasonCode: "football_storage_unavailable" }, freshness: footballSnapshotFreshness(fallback) };
  }
}

export async function refreshFootballState(env, fallback, { retrieve = retrieveFootballCandidate, now = Date.now } = {}) {
  if (!env.DB) throw new Error("Football storage is unavailable");
  const started = now(), attemptedAt = new Date(started).toISOString(), token = crypto.randomUUID();
  const claimed = await env.DB.prepare(`
    INSERT INTO football_state (id, last_attempt_at, lease_token, lease_expires_at, cooldown_until)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at,
      lease_token = excluded.lease_token, lease_expires_at = excluded.lease_expires_at,
      cooldown_until = excluded.cooldown_until
    WHERE football_state.lease_expires_at <= ? AND football_state.cooldown_until <= ?
    RETURNING id
  `).bind(attemptedAt, token, started + 120_000, started + HOUR, started, started).first();
  if (!claimed) return { status: "already_checked_or_running", materialChange: false, state: await readFootballState(env, fallback) };
  let published = false;
  try {
    const previous = await readFootballState(env, fallback);
    if (previous.update.status === "unavailable") throw new Error("Football storage is unavailable");
    const { snapshot } = await retrieve(fallback);
    const contentHash = await footballContentHash(snapshot);
    const materialChange = contentHash !== await footballContentHash(previous.snapshot);
    const completedAt = new Date(now()).toISOString();
    // One conditional statement publishes the complete validated version atomically.
    const result = await env.DB.prepare(`
      UPDATE football_state SET payload = ?, data_version = ?, content_hash = ?,
        last_success_at = ?, last_error = NULL, lease_token = NULL, lease_expires_at = 0
      WHERE id = 1 AND lease_token = ? AND lease_expires_at > ?
    `).bind(JSON.stringify(snapshot), snapshot.dataVersion, contentHash, completedAt, token, now()).run();
    if (result.meta?.changes !== 1) throw new Error("Football publication lease expired");
    published = true;
    const state = await readFootballState(env, fallback);
    if (state.snapshot.dataVersion !== snapshot.dataVersion || state.update.status !== "ready") throw new Error("Football publication readback failed");
    return { status: "published", materialChange, state };
  } catch (error) {
    await env.DB.prepare("UPDATE football_state SET last_error = ?, lease_token = NULL, lease_expires_at = 0 WHERE id = 1 AND lease_token = ?")
      .bind("football_refresh_failed", token).run();
    // Detailed errors stay in the authenticated tool response; public state is bounded.
    throw new Error(`${published ? "Football data was published but readback could not be verified." : "Football refresh failed; last successful snapshot retained."} ${error instanceof Error ? error.message : "Source validation failed"}`);
  }
}
