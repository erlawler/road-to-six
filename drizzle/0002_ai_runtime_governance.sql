CREATE TABLE IF NOT EXISTS ai_rate_limit_window (
  scope TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, window_start)
);

CREATE TABLE IF NOT EXISTS ai_run_ledger (
  request_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('ai', 'deterministic', 'rejected')),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  eval_version TEXT NOT NULL,
  forecast_version TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('passed', 'failed', 'not_run')),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_micros >= 0),
  fallback_reason_code TEXT,
  source_updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_run_ledger_created_at
ON ai_run_ledger (created_at);

CREATE TABLE IF NOT EXISTS odds_refresh_control (
  cache_key TEXT PRIMARY KEY,
  lease_token TEXT,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
