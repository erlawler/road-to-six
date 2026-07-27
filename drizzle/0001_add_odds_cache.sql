CREATE TABLE IF NOT EXISTS odds_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
