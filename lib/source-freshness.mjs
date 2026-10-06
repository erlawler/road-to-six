const DAY_MS = 86_400_000;
export const FOOTBALL_REVIEW_WINDOW_DAYS = 7;

// Review recency is independent of publication age. Completed-season statistics
// remain historical; refreshing odds must never refresh the football review date.
export function footballSnapshotFreshness(snapshot, now = Date.now()) {
  const unavailable = {
    status: "unavailable",
    ageDays: null,
    message: "Football freshness unavailable. Verify the source review before calling this snapshot current.",
  };
  const asOf = snapshot?.asOf;
  const reviewedAt = typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf)
    ? Date.parse(`${asOf}T00:00:00Z`) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(reviewedAt) || reviewedAt > now
    || new Date(reviewedAt).toISOString().slice(0, 10) !== asOf
    || snapshot?.manifest?.validatedAt !== asOf
    || snapshot.manifest.validationStatus !== "passed") return unavailable;

  const reviewTimes = [reviewedAt];
  for (const key of ["games", "roster"]) {
    const source = snapshot.manifest.inputs?.[key];
    const published = Date.parse(source?.sourceUpdatedAt);
    const start = Date.parse(source?.retrievedBetween?.start);
    const end = Date.parse(source?.retrievedBetween?.end);
    if (source?.metadataStatus !== "verified"
      || ![published, start, end].every(Number.isFinite)
      || start > end || published > end || end > now
      || end >= reviewedAt + DAY_MS) return unavailable;
    reviewTimes.push(end);
  }
  const ageMs = now - Math.min(...reviewTimes);
  const ageDays = Math.floor(ageMs / DAY_MS);
  const stale = ageMs > FOOTBALL_REVIEW_WINDOW_DAYS * DAY_MS;
  return {
    status: stale ? "stale" : "current",
    ageDays,
    message: stale
      ? `${ageDays} day(s) since the oldest source review. Snapshot refresh needed under the weekly review policy.`
      : `${ageDays} day(s) since source review. Within the weekly review window.`,
  };
}
