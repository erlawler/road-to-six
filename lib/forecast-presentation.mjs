// Presentation follows the existing verification gates; it never relaxes them.
export function explanationAvailability({ checking, canExplore, current, unverified }) {
  if (checking) return { label: "Checking", reason: "Checking football verification before enabling AI explanations." };
  if (!canExplore) return { label: "Paused", reason: "AI explanations are paused until the next pregame matchup is verified." };
  if (unverified) return { label: "Paused", reason: "AI explanations are paused because the latest football refresh could not be verified. The calculated scenario remains available." };
  if (!current) return { label: "Paused", reason: "AI explanations are paused until football data is refreshed. You can still explore the dated snapshot." };
  return { label: "Ready", reason: null };
}

export function marketAvailability({ requestState, paired, retrieved, snapshotPaired }) {
  if (requestState === "loading") return { label: "Loading", missing: "Loading", detail: "Checking current odds. Any displayed prices remain from the previous snapshot." };
  if (requestState === "error") return { label: "Unavailable", missing: "Unavailable", detail: "Refresh failed. Dated football and any bundled market evidence remain available. Try again when ready." };
  if (requestState === "expired") return { label: "Expired", missing: "Refresh needed", detail: "The market cache expired. Refresh odds to check current coverage." };
  if (paired) return { label: "Available", missing: "Not quoted", detail: "Paired market odds are included in this forecast." };
  if (retrieved) return { label: "Unavailable", missing: "Not quoted", detail: "No usable paired odds were returned for this matchup. The dated baseline remains in use." };
  if (snapshotPaired) return { label: "Snapshot only", missing: "Not quoted", detail: "Dated bundled odds are included. Refresh to check current coverage." };
  return { label: "Not loaded", missing: "Not loaded", detail: "Current odds have not been loaded. Refresh odds to compare the market with the football model." };
}
