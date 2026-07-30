# Frontier AI Architecture

## Recruiter answer

Road to Six demonstrates a production-minded AI pattern: deterministic software calculates the forecast, and runtime AI explains that result under an enforceable contract. The model cannot invent or change the probability. The application also remains useful when the AI provider, market-data provider, or monthly AI budget is unavailable.

This separation is the central technical product decision. It uses AI where language adds value while keeping calculation, evidence, cost, and release risk under product control.

## System view

```mermaid
flowchart LR
    subgraph browser["Untrusted browser"]
        visitor["Anonymous visitor"]
        interface["React scenario interface"]
    end

    subgraph app["Application trust boundary"]
        router["Worker API"]
        validator["Input and output validators"]
        forecast["Versioned probability function"]
        fallback["Deterministic explanation"]
        rate_limit["Anonymous AI rate limit"]
        ai_orchestrator["AI orchestration"]
    end

    subgraph evidence["Controlled evidence"]
        snapshot["Versioned nflverse snapshot"]
        odds_cache["Six hour odds cache"]
        budget["Monthly AI budget ledger"]
        runs["AI run ledger"]
    end

    subgraph providers["External providers"]
        odds["The Odds API"]
        openai["OpenAI Responses API"]
    end

    visitor --> interface
    snapshot --> interface
    interface --> router
    router --> validator
    validator --> forecast
    snapshot --> forecast
    odds_cache --> forecast
    odds --> odds_cache
    forecast --> fallback
    forecast --> rate_limit
    rate_limit --> ai_orchestrator
    budget --> ai_orchestrator
    ai_orchestrator --> openai
    openai --> validator
    validator --> runs
    fallback --> runs
    runs --> interface
```

## Runtime forecast flow

```mermaid
sequenceDiagram
    actor User
    participant UI as Scenario interface
    participant API as Worker API
    participant Cache as Odds cache
    participant Fn as Probability function
    participant Limit as AI request limit
    participant Ledger as AI budget ledger
    participant AI as OpenAI Responses API

    User->>UI: Select game and change assumptions
    UI->>Fn: Calculate immediate local forecast
    User->>UI: Request grounded explanation
    UI->>API: Send game ID and bounded controls
    API->>Cache: Resolve trusted market evidence
    API->>Fn: Recalculate authoritative forecast
    API->>Limit: Consume shared anonymous request capacity
    API->>Ledger: Reserve estimated request cost

    alt AI is configured and request and budget capacity are available
        API->>AI: Require get_forecast tool call
        AI-->>API: Request forecast tool output
        API->>AI: Return exact forecast and request structured explanation
        AI-->>API: Return drivers, evidence, and uncertainty
        API->>API: Validate probability, version, timestamp, schema, and policy
        API->>Ledger: Reconcile token usage
        API-->>UI: Return forecast, validated explanation, and reliability receipt
    else Request, provider, quota, validation, or budget failure
        API-->>UI: Return forecast, deterministic explanation, and reason receipt
    end
```

## Deterministic and AI responsibilities

| Concern | Deterministic application | Runtime AI |
|---|---|---|
| Win probability | Calculates football-only and market-aware probabilities with `elo-market-v1.1.0`. | Must reproduce the returned probability unchanged. |
| Market signal | Removes vig within each sportsbook and uses the median sportsbook probability. | Explains the relationship between the model and market evidence. |
| Scenario effects | Applies documented participation adjustments for Cowboys and opponent signals. | Translates those effects into concise, reader-facing language. |
| Evidence | Selects the source snapshot, trusted market record, model version, and timestamp. | Names evidence supplied by the application. |
| Uncertainty | Returns an illustrative bounded range and explicit limitations. | Explains uncertainty and missing context. |
| Responsible use | Blocks client market overrides and prohibits betting actions in the product contract. | Must not recommend a bet, stake, payout, sportsbook, or action. |
| Failure behavior | Always retains a deterministic forecast and explanation. | Is optional and can fail without blocking the core job. |

## Trust boundaries

| Boundary | What crosses it | Control |
|---|---|---|
| Browser to Worker API | Game identifier and bounded scenario-control values | The server ignores client-supplied market prices, normalizes controls from 0 to 100, requires JSON, and limits the request body to 8 KB. |
| Source snapshot to product | Normalized schedule, roster, player, rating, backtest, source, and freshness fields | The snapshot is versioned in source control and rebuilt through a dedicated script from approved source files. |
| The Odds API to application | Current NFL moneyline, spread, and total records | The server keeps the key secret, coordinates edge workers through an atomic D1 lease, normalizes Dallas events, removes vig by sportsbook, and caches results for six hours. |
| Application to OpenAI | A bounded scenario prompt and the authoritative forecast tool result | No user profile, wagering history, raw vendor payload, or free-text user content is sent. Requests set `store: false` and use an eight-second timeout. |
| OpenAI to application | Structured explanation fields | The server checks exact probability, model version, source timestamp, required evidence, uncertainty, and prohibited betting language before display. |
| Worker to D1 | Normalized odds cache, aggregate monthly AI usage, shared request-window counts, and bounded AI-run metadata | No account, identity, scenario history, prompt, raw vendor payload, or wagering data is stored. |

## Reliability and cost controls

1. The core forecast works without either external API.
2. The odds path uses a six-hour in-memory and D1 cache plus an atomic D1 refresh lease. Successful persistence supports the documented free-tier usage model.
3. If current odds are absent or unavailable, the server uses the bundled, labeled market snapshot.
4. The AI path permits at most 20 requests in each shared aligned five-minute bucket. One atomic D1 statement runs before market reads, and exhausted capacity returns `429` with `Retry-After` without ledger or provider work.
5. Only explicitly priced GPT-5.6 model configurations may reach the provider. Unsupported configuration serves the deterministic fallback.
6. The AI path reserves cost in D1 before a provider call and reconciles actual token usage after success.
7. The application limit cannot exceed $9.50, leaving a $0.50 margin beneath the separately configured $10 OpenAI project maximum.
8. Input context and output tokens are bounded. The two AI responses are limited to 300 and 500 output tokens.
9. Failed AI calls and missing or invalid provider usage retain the conservative reservation instead of understating possible spend.
10. Missing credentials, unsupported models, exhausted request capacity, exhausted budget, provider timeout, malformed output, policy failure, or quota failure all return the deterministic explanation or a bounded rejection with a reason code.
11. Only post-reservation AI outcomes record bounded operational metadata for model, version, validation, latency, tokens, estimated cost, source freshness, and fallback reason.
12. Duplicate client requests are disabled while a market refresh or AI explanation is in progress.
13. CI runs dependency audit, lint, build, and automated tests before release.
14. Post-reservation ledger writes perform best-effort cleanup of expired request-window rows, keeping cleanup off denied traffic.

## Model and evidence decisions

The baseline is intentionally transparent:

1. Walk-forward Elo creates the football-only probability.
2. A predeclared blend uses 20 percent football probability and 80 percent vig-adjusted market probability when a trusted market is available.
3. Spread, total, and line status remain visible evidence, but they are not counted again in the probability.
4. The 2024 to 2025 holdout contains 544 games. The football-only Brier score is 0.220, the market-aware score is 0.207, and the market baseline is 0.206.
5. The result supports a narrow claim: the market-aware baseline improves on football-only Elo, but it does not outperform the market.

The displayed uncertainty range is an illustrative fixed-width sensitivity band, not a statistically estimated confidence interval. Labeling it this way avoids presenting false precision.

## Product tradeoffs

| Decision | Benefit | Cost or limitation | Why it was selected |
|---|---|---|---|
| AI explains but does not calculate | Prevents a language model from becoming the source of numerical truth. | The AI experience is intentionally narrower. | Trust and auditability are more valuable than open-ended generation for this job. |
| Anonymous exploration | Removes sign-up friction and avoids personal-data collection. | Saved scenarios and user-level controls are deferred. | Authentication did not improve the core portfolio use case. |
| Transparent baseline | Makes assumptions, weights, and backtest results inspectable. | It is not positioned as a production wagering model. | The portfolio is intended to demonstrate judgment, not claim a betting edge. |
| Free data boundary | Keeps the operating model sustainable. | Bettor splits and paid historical odds are excluded. | A $0 sports-data target was an explicit product constraint. |
| Aggregate monthly AI ledger and shared rate limit | Enforces cost and request capacity without collecting identity. | One visitor can consume shared capacity, and no per-user abuse history exists. | The release remains privacy-minimal while total exposure stays bounded. |
| Deterministic fallback | Preserves the user journey during AI failure. | Generated explanations may not always be available. | Reliability is a product requirement, not a provider assumption. |

## Current limitations

- A four-scenario live scorecard passed every Runtime AI and deterministic case. Runtime AI returned in AI mode with no fallback, averaged 3,568 ms, and used an estimated $0.013118 total in this bounded sample.
- Runtime AI is intentionally closed-set: the server owns the summary and disclaimer, and only exact validated drivers, uncertainty, probability, model version, and source date can reach the interface.
- The shared anonymous request limit protects cost but is not identity-based and does not provide per-user fairness.
- During prolonged AI misconfiguration, one global request-window row can remain per five-minute bucket until the next budgeted AI outcome cleans expired rows, bounded to 288 rows daily.
- The market-aware model is a documented portfolio baseline and does not establish a predictive edge.
- Product KPI targets remain hypotheses because analytics and public-user measurement are not implemented.
- Eric Lawler approved public hosting and the signed-out production smoke test on July 29, 2026. Sites version 13 is deployed owner-only, but internet publishing is disabled for the workspace, so public access and the signed-out success-path check remain pending.

## Evidence map

| Claim | Repository evidence |
|---|---|
| Versioned forecast calculation | [`lib/forecast.mjs`](../lib/forecast.mjs) |
| AI tool flow, validation, trusted market resolution, and fallbacks | [`worker/api.ts`](../worker/api.ts) |
| Cost estimation and request reservation | [`lib/ai-budget.mjs`](../lib/ai-budget.mjs) |
| D1 budget, odds-cache, request-limit, and AI-run schemas | [`db/schema.ts`](../db/schema.ts) |
| Versioned data snapshot and holdout results | [`app/data/nfl-snapshot.json`](../app/data/nfl-snapshot.json) |
| Sanitized live AI quality, latency, and cost evidence | [`evals/live/2026-07-27-gpt-5.6-luna.json`](../evals/live/2026-07-27-gpt-5.6-luna.json) |
| Forecast and scenario interface | [`app/page.tsx`](../app/page.tsx) |
| Product decisions and rationale | [`decision-log.md`](decision-log.md) |
| Release gates and validated limitations | [`release-review.md`](release-review.md) |
| Automated forecast, cost, cache, and rendering checks | [`tests`](../tests) |
