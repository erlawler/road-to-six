CREATE TABLE IF NOT EXISTS mcp_usage_daily (
  day TEXT NOT NULL,
  surface TEXT NOT NULL,
  operation TEXT NOT NULL,
  client TEXT NOT NULL,
  outcome TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  PRIMARY KEY (day, surface, operation, client, outcome)
);
