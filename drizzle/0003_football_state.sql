CREATE TABLE IF NOT EXISTS football_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT,
  data_version TEXT,
  content_hash TEXT,
  last_success_at TEXT,
  last_attempt_at TEXT NOT NULL,
  last_error TEXT,
  lease_token TEXT,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0
);
