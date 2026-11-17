CREATE TABLE IF NOT EXISTS game_weather_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT,
  source_url TEXT NOT NULL,
  fetched_at TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NOT NULL,
  last_error TEXT,
  lease_token TEXT,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0
);
