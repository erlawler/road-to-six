# Data and Licensing Spike

**Status:** DECIDED  
**As of:** July 15, 2026  
**Decision owner:** Eric Lawler  
**Purpose:** Identify a credible, publishable data path with $0 sports-data cost and no more than $10 in monthly runtime AI spend.

## Answer

Advance with this cost-bounded data strategy:

1. Use nflverse for attributed historical football, roster, schedule, play-by-play, and player-stat prototypes.
2. Use The Odds API free tier for current moneyline, spread, total, and line-movement snapshots.
3. Do not use bettor ticket percentages, money percentages, or paid sports feeds in the MVP.
4. Use a versioned probability function at runtime. Let the OpenAI Responses API call that function and explain its result with structured evidence and uncertainty.
5. Create a dedicated OpenAI project with a $10 monthly maximum, then stop application AI at $9.50 as a safety margin and serve the deterministic explanation.
6. Keep the product public and anonymous. Do not collect betting behavior or personal information.

## Source assessment

| Need | Recommended source | Cost signal | License and product decision |
|---|---|---:|---|
| Players, rosters, schedules, and game statistics | [nflverse data releases](https://github.com/nflverse/nflverse-data) | $0 vendor fee | The release repository is labeled CC BY 4.0. nflverse also states that underlying NFL data remains governed by its owners. Attribute the source, preserve an as-of date, exclude headshots, and complete final terms review before publication. |
| Current moneyline, spreads, and totals | [The Odds API](https://the-odds-api.com/) | Free for 500 credits per month | Three markets in one region cost three credits per request under the documented formula. Its [terms](https://the-odds-api.com/terms-and-conditions.html) permit user-facing websites, dashboards, and analytical tools when the data is not redistributed as a standalone feed. Historical odds are excluded because they require a paid plan. Store source timestamps and keep the API key server-side. |
| Runtime forecast explanation | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) | Usage based, capped at $10 per month | Use a dedicated OpenAI project, bounded prompts and outputs, caching, rate limits, and an application safety cutoff. Do not use paid web search at runtime because the application supplies the evidence. |

## Cost answer

| Cost category | Monthly target | Included capability |
|---|---:|---|
| Football and market data | $0 | nflverse data plus current odds, spreads, totals, and daily line snapshots within the free quota |
| Runtime AI | $0 to $10 | Grounded explanations until the monthly safety cutoff is reached |
| Hosting | $0 target | Cloudflare Workers Free for portfolio traffic; paid tier is not required for the private preview |

Runtime AI cost varies with prompt size and model selection. The application defaults to GPT-5.6 Luna. The D1 ledger reserves cost before each request using the configured model's standard rates and reconciles actual input and output token use afterward, so the application does not depend on a traffic estimate to enforce the cutoff.

## Runtime AI budget controls

- Set the dedicated OpenAI project monthly budget to $10.
- Set the application safety cutoff to $9.50 per calendar month.
- Bound input context and maximum output tokens.
- Default to GPT-5.6 Luna for the cost and quality balance required by this narrow explanation task.
- Reserve and reconcile estimated token cost in the aggregate D1 monthly ledger.
- Do not call paid web search or other paid tools at runtime.
- When the cutoff, project quota, timeout, or schema validation blocks AI, return the same calculated probability with a deterministic explanation.
- Display the fallback as a normal reliability state, not an error that prevents scenario completion.

## Data contract

Every normalized record must include:

- Source name and source record identifier
- Event, team, and player identifiers
- Source update time and ingestion time
- Season and week
- Data license label
- Raw snapshot version or checksum
- Validation status and failure reason

Do not store or display player headshots, team logos, official uniform artwork, medical details, or proprietary narrative content.

## Forecast contract

The scenario endpoint returns two probabilities:

1. **Football-only probability:** Uses team and player performance features without market inputs.
2. **Market-aware probability:** Blends football probability with vig-adjusted consensus moneyline probability. Spread, total, and line status remain separately visible evidence.

The runtime AI must call the versioned probability function and return its probability unchanged. Its structured response contains:

- Probability and confidence band
- Top forecast drivers
- Evidence records and timestamps
- Important uncertainty and missing data
- Comparison with vig-adjusted market probability
- Educational-use notice

The product must not return a recommended bet, stake size, expected payout, or sportsbook link.

## Market comparison question

The MVP tests whether football-only and market-aware probabilities differ in useful, explainable ways. It compares model probability, vig-adjusted implied probability, spread, total, and line movement. It does not infer Cowboys popularity or gambler sentiment without bettor-split evidence.

## Exit criteria

- [ ] Public-display rights confirmed for every production data source.
- [x] Free odds quota, analytical display terms, and refresh cadence confirmed before deployment.
- [x] Source attribution and as-of timestamps visible in the interface.
- [x] API keys remain server-side and are excluded from logs.
- [x] Forecast is backtested with Brier score and calibration reporting.
- [x] Runtime AI output is schema validated and falls back safely.
- [ ] Dedicated OpenAI project maximum is $10 and the application cutoff is $9.50.
- [x] Responsible gambling notice is visible beside market analysis.

## Decision

**ADVANCE** football data, free odds, forecasting, and cost-capped runtime AI implementation.  
**DEFER** bettor splits, paid sports feeds, and historical odds.
