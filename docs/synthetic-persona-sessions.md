# Synthetic Ideal-Persona Usability Simulations

> **SYNTHETIC PERSONA SIMULATION. NOT HUMAN RESEARCH.** These scenarios model plausible first-time behavior against the public v1.0.0 workflow. They identify hypotheses for real moderated sessions and do not represent observed participant behavior.

**Review date:** July 30, 2026

**Product:** Public Road to Six v1.0.0, Sites version 14

**Method:** Five AI-simulated target-profile walkthroughs using the six tasks and scoring rubric in the [Moderated Usability Session Kit](usability-session-kit.md)

**Human session count:** 0 of 5

**Evidence boundary:** Simulation scores are design-risk indicators. They do not populate the human aggregate table, establish adoption, validate accessibility, or support claims about actual user behavior.

## Production workflow evidence used

The production workflow evidence supplied to the simulations included:

- The product purpose, responsible-use boundary, and Eric Lawler ownership statement
- A weekly matchup selector and six participation-assumption controls
- Current or baseline market status with source time
- Deterministic probability, named drivers, uncertainty, and model version
- A Runtime AI action and passed reliability receipt that preserve the locked probability
- Weekly opponent production cards, model-audit evidence, and product tradeoffs

The signed-out production evidence used for the simulations showed a 63% Dallas probability, a 64% market-implied probability, current market status, model `elo-market-v1.1.0`, and an educational-use disclaimer.

## Target-profile personas

### SIM01: Portfolio recruiter

**Context:** Nontechnical recruiter performing a short desktop portfolio review.

**Job to be done:** Decide quickly whether the candidate demonstrates product ownership, technical fluency, and responsible AI judgment.

**Likely pains:**

- Limited time for a long single-page case study
- Football terminology competes with the product-management narrative
- Source details and player evidence require significant scrolling

**Desired gains:**

- Clear ownership within the first screen
- A fast path from product value to inspectable proof
- Plain-language evidence that AI is governed

**Product fit hypothesis:** The hero and product case communicate ownership well, but distributed evidence and six controls can slow the first-pass review.

### SIM02: Technical product manager

**Context:** Technical product manager evaluating end-to-end product judgment.

**Job to be done:** Determine whether product strategy, architecture, delivery, measurement, and operational controls form one coherent system.

**Likely pains:**

- Model controls can appear more important than the product decisions behind them
- Aggregated scenario impact hides the contribution of each changed assumption
- Adoption targets remain intentionally unmeasured

**Desired gains:**

- Traceability from requirement to implementation and test
- Explicit tradeoffs and rejected alternatives
- Evidence that cost, safety, and failure modes were designed before launch

**Product fit hypothesis:** The product case, architecture, release evidence, and reliability receipt provide strong proof. Individual control contribution remains a likely follow-up question.

### SIM03: AI platform product leader

**Context:** Product leader assessing frontier AI controls and observability.

**Job to be done:** Verify that AI adds value without owning the numerical decision or creating an uncontrolled reliability and cost path.

**Likely pains:**

- The deterministic fallback is explained in the case study but is not adjacent to the Runtime AI action
- Model, prompt, contract, evaluation, and forecast versions require interpretation
- A public anonymous AI endpoint raises cost and misuse questions

**Desired gains:**

- Clear separation between calculation and explanation
- Structured validation, fallback, rate limiting, and cost evidence
- A reliability receipt that supports incident review

**Product fit hypothesis:** The AI boundary and receipt are strong. Fallback behavior could be easier to understand at the moment a visitor requests the explanation.

### SIM04: Analytics product leader

**Context:** Skeptical analytics leader evaluating forecast integrity.

**Job to be done:** Decide whether the model comparison is reproducible, honestly interpreted, and free of unsupported betting-edge claims.

**Likely pains:**

- Individual assumption materiality is summarized into one scenario contribution
- Brier and calibration measures require statistical familiarity
- Current odds can be mistaken for proof of market bias

**Desired gains:**

- Honest comparison with the market baseline
- Visible source freshness, holdout method, and limitations
- A clear statement of what the model does not prove

**Product fit hypothesis:** The model audit earns trust by showing that the market-aware baseline does not beat the market itself. Control-level sensitivity and metric interpretation remain improvement opportunities.

### SIM05: Mobile recruiter with accessibility awareness

**Context:** Recruiter conducting a first-pass review on a mobile device while checking basic accessibility signals.

**Job to be done:** Understand the candidate story and complete the core flow without losing context in a long page.

**Likely pains:**

- Six sliders and distributed evidence create scan and scroll fatigue
- Market status, model version, and uncertainty appear in different parts of the result
- Human assistive-technology validation has not occurred

**Desired gains:**

- Predictable headings, named controls, focus indicators, and responsive layout
- A compact product-proof path
- Clear status messages after scenario and AI actions

**Product fit hypothesis:** The semantic structure and responsive layout support the flow, but progressive disclosure may improve recruiter scanning. This simulation does not validate VoiceOver, NVDA, or human accessibility.

## Simulated task results

Each score adapts the session-kit scale: `2` models likely independent completion and correct explanation, `1` models partial completion or one neutral prompt, and `0` models failure. These are hypotheses, not observed participant results.

| Simulation | T1 | T2 | T3 | T4 | T5 | T6 | Total | Primary hypothesis |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| SIM01, portfolio recruiter | 2 | 1 | 1 | 2 | 1 | 2 | 9 of 12 | Predicted to understand value and ownership but require more effort to find distributed evidence. |
| SIM02, technical product manager | 2 | 2 | 2 | 2 | 2 | 2 | 12 of 12 | Modeled as completing the flow and then seeking control-level probability contribution. |
| SIM03, AI platform product leader | 2 | 2 | 2 | 1 | 2 | 2 | 11 of 12 | Modeled as understanding the AI boundary but seeking fallback copy beside the action. |
| SIM04, analytics product leader | 2 | 2 | 1 | 2 | 2 | 2 | 11 of 12 | Predicted to trust the audit but seek more inspectable sensitivity evidence. |
| SIM05, mobile recruiter | 2 | 1 | 1 | 2 | 1 | 2 | 9 of 12 | The simulation suggests the flow may remain usable while control and evidence density increase effort. |
| **Modeled total** | **10** | **8** | **7** | **9** | **8** | **10** | **52 of 60** | **Use as a prioritization signal only.** |

## Partial-score evidence

This table makes every modeled score of `1` traceable. No error, prompt, or recovery below was observed from a person.

| Simulation and task | Modeled partial behavior | Modeled neutral prompt or recovery |
|---|---|---|
| SIM01, T2 | Scans the result first and does not immediately connect the matchup selector with the lower player-evidence section. | `Tell me what you are looking for.` The model then scrolls to one Dallas and one opponent player. |
| SIM01, T3 | Changes a control but cannot explain the aggregated scenario contribution. | `What changed, and what stayed the same?` The model identifies the probability and locked market evidence. |
| SIM01, T5 | Finds the market label but not all of source time, model version, and uncertainty on the first scan. | `What evidence would you look for next?` The model locates the remaining fields. |
| SIM03, T4 | Correctly states that deterministic code calculates the probability and AI explains it, but does not find fallback behavior beside the action. | `What do you think happens if AI is unavailable?` The model searches the product case for the fallback answer. |
| SIM04, T3 | Sees the probability change but cannot attribute the change to an individual control because the model exposes one aggregate scenario contribution. | `What evidence supports that explanation?` The model identifies the limitation instead of inventing a per-control effect. |
| SIM05, T2 | Requires extended mobile scrolling to connect the selected matchup with opponent cards. | `What would you try next?` The model continues to the player-evidence section. |
| SIM05, T3 | Changes a control but loses result context after scrolling. | `What changed, and where would you verify it?` The model returns to the result. |
| SIM05, T5 | Finds uncertainty but not source time and model version in one scan. | `What evidence is still missing?` The model locates both fields. |

## Modeled P0 and Runtime AI comprehension checks

| Simulation | Betting-advice boundary | Complete modeled T4 answer |
|---|---|---|
| SIM01 | Modeled answer: the product does not recommend a bet or stake. | Runtime AI explained the locked drivers and uncertainty. Deterministic code calculated the probability. If AI is unavailable, the same forecast remains available with the deterministic explanation. |
| SIM02 | Modeled answer: the product provides educational analytics only. | Runtime AI turned versioned forecast evidence into a structured explanation and could not change the number. The probability function performed the calculation. Deterministic fallback preserves the core workflow without AI. |
| SIM03 | Modeled answer: no wager, pick, or stake is recommended. | Before a prompt, the model states that the versioned forecast owns the number and AI returns a validated explanation, but does not locate the fallback behavior. After one neutral prompt, it finds that the deterministic explanation remains available. This supports the T4 score of `1`. |
| SIM04 | Modeled answer: market comparison is not evidence of a betting edge. | Runtime AI explained named evidence, uncertainty, and freshness without calculating. The deterministic forecast owns the probability, and deterministic explanation remains the fallback when AI is unavailable. |
| SIM05 | Modeled answer: the responsible-use notice prohibits betting guidance. | Runtime AI explained but did not change the probability. Deterministic code calculated the result, and the forecast plus deterministic explanation remain available without Runtime AI. |

## Prioritized hypotheses

| Hypothesis | Supporting simulations | Signal | Severity | Proposed experiment | Human validation required |
|---|---|---:|---:|---|---|
| Individual assumption effects are difficult to inspect inside one scenario contribution. | SIM01, SIM02, SIM04, SIM05 | 4 of 5 | P1 | Test a compact `What moved` row that shows the last changed control and probability delta while preserving the canonical aggregate driver. | Yes |
| Deterministic fallback behavior is not visible beside the Runtime AI action. | SIM03 | 1 of 5 | P1 | Test concise adjacent fallback copy without adding another technical panel. The severity reflects the critical AI-role boundary, not frequency. | Yes |
| Market status, source time, model version, and uncertainty are visually distributed. | SIM01, SIM05 | 2 of 5 | P2 | Test one compact evidence summary near the result heading with links to full detail. | Yes |
| Six sliders create recruiter and mobile scan fatigue. | SIM01, SIM05 | 2 of 5 | P2 | Test a `Key scenarios` preset layer with optional expanded controls. | Yes |
| Brier and calibration values need more plain-language interpretation. | SIM02, SIM04 | 2 of 5 | P2 | Test one sentence explaining the score differences and the market-baseline limitation. | Yes |

No product change is accepted solely from these simulations. The two P1 hypotheses receive priority in the real moderated study.

## Real-study bridge

Recruit the same five target profiles:

1. One nontechnical portfolio recruiter
2. One technical product manager
3. One AI platform product leader or engineering partner
4. One analytics product leader
5. One recruiter or hiring manager who reviews on mobile and can discuss accessibility expectations

The real study should use these confirm-or-reject observations:

| Hypothesis | Confirming observation | Rejecting observation |
|---|---|---|
| Control-level contribution is unclear. | At least 2 of 5 participants cannot explain what changed after one Dallas and one opponent assumption change, or require a prompt. | At least 4 of 5 explain the changed assumption, probability movement, and unchanged market evidence without a prompt. |
| Fallback behavior is hard to find. | At least 2 of 5 cannot state that the deterministic forecast remains available when Runtime AI is unavailable. | At least 4 of 5 find and explain fallback behavior without moderator direction. |
| Result evidence is too distributed. | At least 2 of 5 cannot find market status, source time, model version, and one uncertainty within five minutes. | At least 4 of 5 find all four without a prompt. |
| Six controls create scan fatigue. | At least 2 of 5 show repeated scrolling, more than 60 seconds of delay, abandonment, or moderator intervention during T3. | At least 4 of 5 complete T3 independently without repeated search behavior. |
| Model metrics need interpretation. | Either technical reviewer misinterprets the Brier comparison or describes the result as beating the market. | Both technical reviewers explain that lower is better and that the market-aware model still does not beat the market baseline. |

The moderated-study actuals remain `[NEEDS INPUT]` until five real participants complete the protocol with consent and de-identified evidence.
