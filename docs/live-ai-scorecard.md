# Live AI Scorecard

**Purpose:** Compare quality, latency, and estimated cost for actual Runtime AI responses against the deterministic explanation baseline.
**Current state:** Four-scenario Runtime AI and deterministic comparison complete

## Product decision

The scorecard evaluates the user-visible AI contract, not writing style. A live response counts as passing only when it:

1. Returns in Runtime AI mode with no fallback.
2. Preserves the deterministic probability, model version, and source freshness.
3. Preserves every required driver, evidence statement, numeric impact, and uncertainty.
4. Avoids actionable betting guidance.
5. Returns reliability metadata for model, prompt, contract, evaluation, forecast, latency, tokens, estimated cost, validation, and fallback reason.

## Verified live baseline

| Measure | Result |
|---|---|
| HTTP status | 200 |
| Runtime mode | AI |
| Fallback | None |
| Contract quality | 7 of 7 checks passed |
| Probability | `0.5531549573107291` |
| Forecast model | `elo-market-v1.1.0` |
| Source date | `2026-07-15` |
| Drivers | 3 |
| Uncertainty items | 3 |
| Latency | 4,124 ms |
| Token use | 646 input and 423 output tokens |
| Estimated cost | $0.003346 |

## Four-scenario comparison

The checked-in runner covers a standard baseline, reduced George Pickens participation, reduced Javonte Williams participation, and a two-sided stress scenario.

| Mode | Cases | Quality pass rate | Average latency | Total estimated cost |
|---|---:|---:|---:|---:|
| Runtime AI | 4 | 100% | 3,568 ms | $0.013118 |
| Deterministic explanation | 4 | 100% | 0.024 ms | $0 |

All four Runtime AI scenarios returned in AI mode, passed validation, and used no fallback. This is a bounded functional sample, not a production latency benchmark.

The sanitized evidence is checked in at [`evals/live/2026-07-27-gpt-5.6-luna.json`](../evals/live/2026-07-27-gpt-5.6-luna.json).

## Run the scorecard

Start the private candidate locally with valid server-side credentials, then run:

```bash
LIVE_EVAL_BASE_URL=http://localhost:3000 \
LIVE_EVAL_OUTPUT=/tmp/road-to-six-live-ai-scorecard.json \
npm run eval:live
```

The runner exits with a nonzero status if any Runtime AI or deterministic case misses the expected contract. The output contains scenario identifiers and operational metrics, not API keys, prompts, user identity, wagering history, or raw vendor responses.

## Release interpretation

- A 100% pass rate across four Runtime AI cases supports functional contract quality for this release.
- Average latency and estimated cost describe this bounded sample only.
- Four cases do not prove future provider quality, uptime, or a population latency distribution.
- Any failed case blocks a stronger live-performance claim and preserves deterministic fallback as the public reliability state.
