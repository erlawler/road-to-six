# Usability Research Plan and Findings

**Study state:** Five AI proxy and expert pretests COMPLETE. No moderated human sessions have occurred.
**Release decision:** OWNER-APPROVED DEFERRAL for v1.0.0, recorded July 29, 2026.
**Accepted limitation:** Eric Lawler approved moving the five moderated human sessions from the v1.0.0 pre-launch gate to post-launch validation. This decision allows release with incomplete human-usability evidence. It does not represent the product as human validated, and all human-participant findings remain `[NEEDS INPUT]`.
**Post-launch target:** Complete five privacy-safe moderated human sessions before making evidence-based claims about human comprehension, usability, or behavior.
**Research owner:** Eric Lawler
**Product version:** 1.0.0

## Decision this study supports

Determine whether a first-time reviewer can understand the product's evidence, change a scenario, distinguish calculated probability from AI explanation, and identify uncertainty within five minutes.

## Research questions

1. Can a reviewer explain what Road to Six does after reading the hero section?
2. Can a reviewer select a matchup and find the relevant Dallas and opponent evidence?
3. Does the reviewer understand that participation controls are assumptions rather than injury reports?
4. Can the reviewer distinguish football-only, market-implied, and market-aware probabilities?
5. Does the reviewer understand that Runtime AI explains but does not calculate or recommend?
6. Can the reviewer identify at least one uncertainty and one source-freshness indicator?
7. Does the portfolio case make Eric's product ownership and Codex's implementation role clear?

## Participant profile

- Three technical product managers, product leaders, or engineering partners
- Two recruiters or hiring managers who evaluate technical product talent
- No gambling history, medical information, account data, or other sensitive attributes are required
- Participants may use initials or a session code instead of a name

## Privacy and consent

1. Explain that this is a portfolio usability study, not betting research.
2. Ask for consent before recording audio, video, or the screen.
3. If recording is declined, keep only de-identified notes.
4. Do not collect email addresses, wagering behavior, financial information, or account credentials in the research artifact.
5. Store findings by session code, such as `P01`.
6. Remove direct quotes that could identify a participant unless the participant explicitly approves publication.
7. Delete raw recordings after synthesis or by a date agreed with the participant.

## Five-minute task script

1. Without prompting, describe what you believe this product does.
2. Select a matchup and identify one Dallas player and one opponent player that could influence the scenario.
3. Change one Dallas assumption and one opponent assumption.
4. Explain what changed in the probability and what did not.
5. Generate the grounded explanation and describe the role Runtime AI played.
6. Find the model version, source freshness, and one uncertainty.
7. Open the product case and describe one product tradeoff Eric made.

## Measures

| Measure | Target | Collection method |
|---|---:|---|
| Scenario task completion | At least 4 of 5 participants | Moderator observation |
| AI role comprehension | At least 4 of 5 state that AI explains but does not calculate | Post-task question |
| Responsible-use comprehension | 5 of 5 state that the product does not recommend a bet | Post-task question |
| Evidence discovery | At least 4 of 5 find model version and source freshness | Moderator observation |
| Uncertainty discovery | At least 4 of 5 identify one uncertainty | Moderator observation |
| Five-minute value comprehension | At least 4 of 5 explain the product and one tradeoff | Timed task |

## Session notes template

| Field | Entry |
|---|---|
| Session code | `[NEEDS INPUT]` |
| Participant profile | `[NEEDS INPUT]` |
| Date | `[NEEDS INPUT]` |
| Recording consent | `[NEEDS INPUT]` Yes, no, or notes only |
| Scenario completion | `[NEEDS INPUT]` |
| AI role explanation | `[NEEDS INPUT]` |
| Responsible-use explanation | `[NEEDS INPUT]` |
| Evidence found | `[NEEDS INPUT]` |
| Uncertainty found | `[NEEDS INPUT]` |
| Friction observed | `[NEEDS INPUT]` |
| Direct quote approved for publication | `[NEEDS INPUT]` |
| Candidate product change | `[NEEDS INPUT]` |

## Findings synthesis

These sessions are AI proxy and expert pretests. They are useful for finding release friction, but they are not evidence of human behavior and do not satisfy the human-session completion rule.

| Session | Proxy perspective | Result | Primary evidence |
|---|---|---|---|
| A | Nontechnical recruiter | PARTIAL PASS | Understood the product and responsible-use boundary; Eric's ownership and the AI boundary were initially too far below the first screen. |
| B | Technical hiring manager | PARTIAL PASS | Found model, architecture, and governance evidence; detected a stale live-provider-gate claim. |
| C | Dallas football fan | PASS, 7 of 7 tasks | Changed Dallas and opponent assumptions, observed the probability move, generated Runtime AI, and found the receipt and uncertainty. |
| D | Skeptical analytics reviewer | PASS, 5 of 5 tasks | Correctly concluded the model improves on football-only Elo but does not beat the market baseline. |
| E | Accessibility expert | CONDITIONAL PASS | Keyboard and responsive flows passed; a P1 light-surface contrast issue was detected and corrected. |

| Finding | Sessions | Severity | Product decision | Validation |
|---|---:|---|---|---|
| Live AI gate copy contradicted completed evidence | B | P0 | Replace the stale gate with the verified four-scenario live scorecard, latency, cost, and no-fallback outcome | Render test and authenticated hosted review passed |
| Provider refresh could be confused with selected-game freshness | C, D | P0 | Show whether a current market is applied to the selected week or whether the dated baseline remains active | Hosted Week 1 baseline and Week 2 current states passed |
| Light-blue text and focus outlines failed contrast on light surfaces | E | P1 | Split light-surface and dark-surface blue tokens and add automated contrast assertions | Ratios pass at 6.12 to 1 or better for light text and 8.57 to 1 or better for dark-surface focus |
| Eric's product ownership was not visible early enough | A | P1 | Add an above-the-fold ownership line | Hosted hero screenshot and semantic tree passed |
| No-market matchups still displayed a market-aware label | A | P1 | Label the forecast football-only when no market-implied probability exists | Implemented and covered by release review |
| Runtime AI ownership was not explicit enough after generation | C | P1 | State that the probability stayed locked while Runtime AI explained it | Hosted Runtime AI receipt flow passed |
| Scenario assumptions persisted across matchup changes without explanation | C | P1 | Add a reset action and a persistence note | Hosted reset returned the deterministic state and announced completion |
| Six sliders create recruiter scan friction | A | P2 | Retain for v1.0.0, then evaluate presets or progressive disclosure with human participants | `[NEEDS INPUT]` Human validation |
| Per-player effects are aggregated into one scenario contribution | C | P2 | Consider a compact contribution row in a future version | `[NEEDS INPUT]` Product prioritization |
| Model score materiality needs more interpretation | D | P2 | Consider calibration visualization and confidence limits | `[NEEDS INPUT]` Product prioritization |
| Screen-reader status changes may announce twice | E | P2 | Retest with VoiceOver and NVDA, then debounce or simplify announcements if confirmed | `[NEEDS INPUT]` Assistive-technology validation |

## Owner review feedback to shipped outcome

The entries below are documented owner-review changes, not participant-study findings.

| Owner feedback | Product decision | Shipped evidence | Outcome |
|---|---|---|---|
| Replace the long unofficial-project label with Eric's identifier | Reduce header noise while retaining attribution | Header displays `ERL` with the accessible name `Eric Ryan Lawler` | More portfolio ownership with less visual clutter |
| Remove `2026` from the scenario-lab hero title | Avoid making the product name feel season-limited | Hero uses `Frontier AI product case study`; source stamp separately shows `2026` | Evergreen positioning with dated evidence |
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

The research completion rule remains unchanged. The owner-approved deferral removes the study as a blocking dependency for v1.0.0 only. It does not mark the study complete. The study is complete only when five moderated human sessions are documented, findings are de-identified, at least one product decision is tied to observed human evidence, and accepted changes are retested. Proxy findings above remain labeled as pretests. Human-session counts, findings, quotes, and outcomes remain `[NEEDS INPUT]` until actual moderated sessions occur.
