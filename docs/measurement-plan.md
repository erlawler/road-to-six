# Measurement Plan

## Product question

Can a visitor inspect football and market evidence, change assumptions, and understand a traceable probability and its uncertainty in under five minutes?

## KPI framework

| Layer | Metric | Definition | MVP target | Guardrail |
|---|---|---|---:|---|
| Vision | Forecast completion | Visitor reaches a forecast after changing at least one assumption. | 60% | Do not optimize by hiding evidence or uncertainty. |
| Adoption | Scenario start | Visitor selects a game, player signal, or scenario assumption. | 70% | Keep the product usable without sign-in. |
| Metrics | Time to forecast | Time from first interaction to the structured forecast. | Under 5 minutes | Do not remove source or responsible-use checks. |
| Platform | Probability fidelity | Displayed probability matches the versioned probability function. | 100% | CI blocks schema or calculation mismatches. |
| Platform | AI evaluation expectation rate | Positive and adversarial cases return the expected pass or fail decision. | 100% | Any missed adversarial case blocks release. |
| Model | Calibration reporting | Brier score and calibration are published for every model release. | 100% | Treat market bias as an unvalidated hypothesis unless a licensed dataset can test it. |
| Platform | Sports-data cost | Monthly sports-data vendor spend. | $0 | Paid feeds remain outside MVP scope. |
| Platform | Runtime AI cost | Monthly OpenAI API spend for the public product. | No more than $10 | Stop application AI at $9.50 and use deterministic fallback. |
| Platform | AI reliability receipt completeness | Every AI or fallback response includes model, version, latency, token, cost, source, validation, and reason evidence when applicable. | 100% | Missing operational evidence triggers review. |
| Platform | Anonymous request-limit enforcement | Requests beyond 20 in the shared aligned five-minute bucket are rejected with `429` and `Retry-After`. | 100% | Rate-limit failure blocks public launch. |
| Platform | Live Runtime AI latency | End-to-end provider latency for accepted AI responses. | `[NEEDS INPUT]` target; four-case sample averaged 3,568 ms | Do not treat the bounded sample as a production distribution. |
| Integrity | Evidence traceability | Every driver references a source record and timestamp. | 100% | Missing or stale evidence produces a visible limitation. |
| Integrity | Data freshness | Every football and market record shows its as-of time. | 100% | Stale lines cannot appear current. |
| Integrity | Prohibited advice | Forecasts contain no picks, stake sizes, payout claims, or sportsbook links. | 100% | A violation blocks public release. |
| Integrity | Grounded explanation fidelity | AI preserves the trusted model version, source time, drivers, evidence, impacts, and uncertainty. | 100% | Any changed contract field triggers deterministic fallback. |
| Integrity | Accessibility gate | Required accessibility checks closed before public launch. | 100% | An open gate blocks publication. |

## Event plan for a later instrumented version

| Event | Required properties | Decision supported |
|---|---|---|
| `game_selected` | game id, data snapshot id | Which games start an analysis? |
| `player_signal_selected` | game id, player id, signal id | Which player evidence matters to visitors? |
| `market_context_viewed` | game id, markets available, line movement available | Is market data contributing to use? |
| `scenario_changed` | scenario id, field id, old bucket, new bucket | Which assumptions drive probability changes? |
| `forecast_requested` | scenario id, snapshot id, model version | Did the visitor attempt the core job? |
| `forecast_completed` | scenario id, model version, latency bucket, fallback used | Did the product deliver a forecast reliably? |
| `ai_fallback_served` | reason code, model version | Why did runtime AI fail or get bypassed? |
| `ai_budget_fallback_served` | month, model version, safety cutoff | Is the budget control preserving scenario availability? |
| `ai_explanation_completed` | mode, model version, prompt version, contract version, evaluation version, latency bucket, token bucket, cost bucket, validation status, reason code | Are quality, latency, cost, and fallback behavior operating within the release contract? |

## Data quality rules

- Count one activation per privacy-preserving anonymous session in an instrumented version.
- Do not collect names, email addresses, device identifiers, or free text.
- Do not collect wagers, bankroll, sportsbook accounts, or betting history.
- Version source snapshots, feature definitions, scenarios, prompts, and forecast models.
- Separate vendor data, model outputs, and observed product analytics.
- Do not send raw vendor payloads to analytics or runtime AI.
- Report targets and actuals separately.

No product analytics are implemented in the public v1.0.0 release. The targets above remain hypotheses, not observed outcomes.
