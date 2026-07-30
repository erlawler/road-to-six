# AI Persona Validation and Owner Findings

**Showcase evidence gate:** COMPLETE

**Accepted evidence:** Five labeled AI proxy and expert pretests plus five transparent synthetic ideal-persona simulations

**Owner decision:** Eric Lawler accepted the transparent AI persona evidence package as the completed showcase validation scope on July 30, 2026.

**Evidence boundary:** This is AI-assisted design evaluation, not human research. No human usability testing has been conducted or claimed. The findings do not represent observed human behavior, adoption, or accessibility certification.

**Optional future work:** Moderated human research may be pursued later, but it is not required for release or showcase completion.

**Product version:** Public Road to Six v1.0.0

**AI persona evidence:** [Synthetic Ideal-Persona Usability Simulations](synthetic-persona-sessions.md)

**Optional future protocol:** [Optional Moderated Usability Research Kit](usability-session-kit.md)

## Decision supported

Evaluate whether the showcase experience makes its product purpose, scenario flow, Runtime AI boundary, evidence, uncertainty, responsible-use policy, and product ownership inspectable for the target practitioner profiles.

The completed showcase gate provides:

- Five transparent target-profile simulations
- Six task-level modeled checks for each profile
- Traceability for every modeled partial score
- Explicit Runtime AI and responsible-use comprehension checks
- Five prioritized design hypotheses
- Owner-reviewed product decisions
- Automated and hosted validation for accepted changes

## AI persona validation method

The simulations used the same production workflow and task rubric across five ideal reviewer profiles:

1. Executive product stakeholder
2. Technical product manager
3. AI platform product leader
4. Analytics product leader
5. Mobile product practitioner with accessibility awareness

The simulations produced 52 of 60 modeled task points. This is a design-risk indicator, not a completion rate or human usability measure. Full persona definitions, score evidence, prompts, limitations, and optional future research criteria are documented in [Synthetic Ideal-Persona Usability Simulations](synthetic-persona-sessions.md).

The two highest-priority hypotheses for owner review or optional future research are:

1. Visitors may need a compact explanation of which changed control moved the probability.
2. Visitors may need deterministic fallback behavior stated beside the Runtime AI action.

Synthetic findings may support owner-led showcase decisions only when they stay labeled, are grounded in the production workflow, and are validated through code, tests, or hosted evidence. They cannot support claims about actual user behavior.

## Prior proxy findings synthesis

These AI proxy pretests and synthetic simulations satisfy the owner-approved showcase evidence gate. They remain explicitly distinct from observed human behavior and do not support claims of human usability testing.

| Pretest | Proxy perspective | Result | Primary evidence |
|---|---|---|---|
| A | Nontechnical product stakeholder | PARTIAL PASS | Understood the product and responsible-use boundary; Eric's ownership and the AI boundary were initially too far below the first screen. |
| B | Technical product peer | PARTIAL PASS | Found model, architecture, and governance evidence; detected a stale live-provider-gate claim. |
| C | Dallas football fan | PASS, 7 of 7 tasks | Changed Dallas and opponent assumptions, observed the probability move, generated Runtime AI, and found the receipt and uncertainty. |
| D | Skeptical analytics reviewer | PASS, 5 of 5 tasks | Correctly concluded the model improves on football-only Elo but does not beat the market baseline. |
| E | Accessibility expert | CONDITIONAL PASS | Keyboard and responsive flows passed; a P1 light-surface contrast issue was detected and corrected. |

| Finding | Pretests | Severity | Product decision | Validation |
|---|---:|---|---|---|
| Live AI gate copy contradicted completed evidence | B | P0 | Replace the stale gate with the verified four-scenario live scorecard, latency, cost, and no-fallback outcome | Render test and authenticated hosted review passed |
| Provider refresh could be confused with selected-game freshness | C, D | P0 | Show whether a current market is applied to the selected week or whether the dated baseline remains active | Hosted Week 1 baseline and Week 2 current states passed |
| Light-blue text and focus outlines failed contrast on light surfaces | E | P1 | Split light-surface and dark-surface blue tokens and add automated contrast assertions | Ratios pass at 6.12 to 1 or better for light text and 8.57 to 1 or better for dark-surface focus |
| Eric's product ownership was not visible early enough | A | P1 | Add an above-the-fold ownership line | Hosted hero screenshot and semantic tree passed |
| No-market matchups still displayed a market-aware label | A | P1 | Label the forecast football-only when no market-implied probability exists | Implemented and covered by release review |
| Runtime AI ownership was not explicit enough after generation | C | P1 | State that the probability stayed locked while Runtime AI explained it | Hosted Runtime AI receipt flow passed |
| Scenario assumptions persisted across matchup changes without explanation | C | P1 | Add a reset action and a persistence note | Hosted reset returned the deterministic state and announced completion |
| Six sliders may create stakeholder scan friction | A, SIM01, SIM05 | P2 | Retain for v1.0.0 and consider presets or progressive disclosure | Optional future research opportunity |
| Per-player effects are aggregated into one scenario contribution | C, SIM01, SIM02, SIM04 | P2 | Consider a compact contribution row in a future version | Product prioritization opportunity |
| Model score materiality may need more interpretation | D, SIM02, SIM04 | P2 | Consider calibration visualization and confidence limits | Product prioritization opportunity |
| Screen-reader status changes may announce twice | E | P2 | Consider optional VoiceOver and NVDA review before making assistive-technology claims | No human assistive-technology claim |

## Owner review feedback to shipped outcome

The entries below are documented owner-review changes, not participant-study findings.

| Owner feedback | Product decision | Shipped evidence | Outcome |
|---|---|---|---|
| Replace the long unofficial-project label with Eric's identifier | Reduce header noise while retaining attribution | Header displays `ERL` with the accessible name `Eric Ryan Lawler` | More visible showcase ownership with less visual clutter |
| Remove `2026` from the scenario-lab hero title | Avoid making the product name feel season-limited | Hero uses `Frontier AI skills showcase`; source stamp separately shows `2026` | Evergreen positioning with dated evidence |
| Remove `inputs` from the player-control disclaimer | Describe the interaction in plain product language | Disclaimer reads `Player controls are scenario assumptions, not medical or injury reports.` | Clearer boundary without implementation jargon |
| Remove `Free` from the odds refresh action | Describe the user action, not the vendor cost model | Button reads `Refresh odds` | Shorter, task-focused interface copy |
| Remove the public AI budget meter | Keep cost governance in the product architecture rather than the primary user flow | Result panel omits the monthly meter; reliability evidence exposes per-request estimated cost | Cleaner scenario result with inspectable operations |
| Remove public Cost and Brand trust cards | Keep the trust section focused on user-facing controls | Trust cards cover Evidence, Privacy, Responsible use, and Reliability | More relevant trust narrative |
| Use complete 2025 production baselines | Prefer the latest complete season over partial or stale player evidence | Player and opponent sections label complete 2025 baselines | Stronger evidence freshness |
| Add George Pickens, Javonte Williams, and opponent scenarios | Make the game selector materially affect the scenario | Named controls cover both players and the selected opponent's top producer | Broader football reasoning without medical claims |
| Add four matchup-aware opponent cards | Make weekly matchup evidence visible before scenario changes | Opponent leaders update with the selected game | More useful weekly exploration |
| Replace the contrast-template model headline | Describe the analytical job directly | Model audit headline reads `Measure the forecast against the market.` | More natural editorial voice |
| Reframe Market Bias Lab | Avoid implying the available data proves popularity-driven bias | Product label reads `Market Context Lab`; bias is documented as an unvalidated hypothesis | Claims now match the evidence boundary |

## Completion rule

The showcase evidence gate is complete through labeled AI proxy review, transparent synthetic persona simulation, owner decision-making, and product validation. No human study has been run or claimed. If optional moderated research is commissioned later, its participant evidence, consent, findings, and limitations must remain separate from this completed AI evidence package.
