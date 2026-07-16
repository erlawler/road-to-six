export const AI_BUDGET_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_monthly_budget (
  month TEXT PRIMARY KEY,
  estimated_spend_micros INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)
`;
