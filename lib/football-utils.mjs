export async function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export const assertData = {
  ok(value, message = "Invalid football data") { if (!value) throw new Error(message); },
  equal(actual, expected, message = "Football data mismatch") { if (actual !== expected) throw new Error(message); },
  deepEqual(actual, expected, message = "Football data mismatch") {
    if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) throw new Error(message);
  },
  match(value, pattern, message = "Invalid football data format") { if (typeof value !== "string" || !pattern.test(value)) throw new Error(message); },
};
