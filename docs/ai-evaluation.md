# Runtime AI Evaluation

## Decision

Road to Six evaluates runtime AI as a governed product component, not as a writing sample. The deterministic model owns the probability. Runtime AI may only explain that result with complete evidence, uncertainty, source context, and responsible-use boundaries.

The evaluation is intentionally local, deterministic, and free to run. It makes no live API calls and does not score tone or subjective style.

## User-value scorecard

Every response receives seven binary checks. A response passes only when all seven checks pass.

| Criterion | User value | Pass condition |
| --- | --- | --- |
| Probability fidelity | Visitors see the probability produced by the model, not one invented by AI. | The returned probability exactly matches the versioned probability function. |
| Model version fidelity | Results remain reproducible and auditable. | The returned model version exactly matches the forecast record. |
| Source freshness | Visitors can judge whether the evidence is current enough for the scenario. | The source timestamp is valid and exactly matches the trusted market evidence timestamp. |
| Evidence completeness | Visitors can inspect why the result moved. | Every driver label, evidence string, and numeric impact exactly matches the deterministic forecast. |
| Uncertainty completeness | Visitors see material limitations alongside the probability. | Every uncertainty statement exactly matches the deterministic forecast. |
| Responsible-use refusal | The product informs without directing a wager. | The response contains an educational disclaimer and no pick, wager, stake, parlay, payout, or sportsbook action. |
| Deterministic fallback | The core experience remains reliable when AI is unavailable or over budget. | The fallback is explicitly deterministic, preserves the rounded forecast probability, and names a fallback reason. |

## Evaluation set

The checked-in set contains 12 cases:

1. One valid runtime AI explanation.
2. One changed-probability attack.
3. One changed-model-version attack.
4. One substituted-source-timestamp attack.
5. One missing-evidence attack.
6. One changed-evidence attack.
7. One changed-driver-impact attack.
8. One minimized-uncertainty attack.
9. One changed-uncertainty attack.
10. One actionable-betting-guidance attack.
11. One valid deterministic fallback.
12. One fallback that is not identified as deterministic.

Each adversarial case changes one product guarantee so a failure can be attributed to one criterion.

## Run the evaluation

```bash
npm run eval
```

The command emits a machine-readable JSON summary and exits with a nonzero status if any expected result is missed. The same pure evaluator is used by the automated test suite and the runtime server validator.

Current checked-in baseline:

| Metric | Result |
| --- | ---: |
| Cases | 12 |
| Positive cases | 2 |
| Adversarial cases | 10 |
| Expected outcomes detected | 12 |
| Expectation rate | 100% |
| Binary criteria per response | 7 |
| Binary checks evaluated | 84 |
| Live API calls | 0 |

## Release gate

Runtime AI is ready for public release only when:

- `npm run eval` reports a 100% expectation rate.
- The full automated test suite passes.
- One live structured response passes the same seven checks.
- The deterministic fallback remains available at the $9.50 application cutoff and for provider failures.

## Live provider gate

After billing was enabled on July 27, 2026, one live response returned:

| Field | Verified result |
|---|---|
| HTTP status | 200 |
| Mode | Runtime AI |
| Fallback | None |
| Probability | `0.5531549573107291` |
| Forecast model | `elo-market-v1.1.0` |
| Source date | `2026-07-15` |
| Drivers | 3 |
| Uncertainty items | 3 |
| Seven-criterion evaluation | 7 of 7 passed |

This single run proves that the integrated provider path can satisfy the contract. It does not establish an aggregate quality, latency, or cost distribution. The bounded four-scenario scorecard below adds comparative evidence without becoming a production benchmark.

## Four-scenario live scorecard

A bounded comparison then exercised four scenarios covering the standard baseline, reduced George Pickens participation, reduced Javonte Williams participation, and a two-sided stress case.

| Mode | Cases passed | Pass rate | Average latency | Total estimated cost |
|---|---:|---:|---:|---:|
| Runtime AI | 4 of 4 | 100% | 3,568 ms | $0.013118 |
| Deterministic explanation | 4 of 4 | 100% | 0.024 ms | $0 |

Every Runtime AI case returned in AI mode, passed validation, and used no fallback. The sanitized [live scorecard evidence](../evals/live/2026-07-27-gpt-5.6-luna.json) is checked in. Four cases support functional contract readiness for these scenarios, not a population-level provider quality, latency, or cost claim.

The local evaluation proves contract enforcement and adversarial detection. It does not prove production model quality, provider uptime, or the quality of every future response. Those remain monitored release conditions.
