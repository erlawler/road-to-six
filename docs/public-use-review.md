# Public Use Review

**Review date:** July 30, 2026
**Decision owner:** Eric Lawler  
**Decision:** ACCEPTED WITH DOCUMENTED LIMITATIONS

## Answer

Road to Six is accepted as an unofficial educational skills-showcase project, subject to the controls and limitations below. The public GitHub repository, `v1.0.0` tag, GitHub release, and [public Sites release](https://road-to-six-erl.erlrickylre.chatgpt.site) are available. The live Runtime AI scorecard, v1.0.0 regression, authenticated hosted smoke test, and signed-out production smoke test pass. Eric Lawler authorized public hosting on July 29, 2026, and public access was completed on July 30, 2026.

This review documents product risk decisions. It is not legal advice or a guarantee that a third party will not object.

## Review outcomes

| Area | Decision | Control and accepted limitation |
|---|---|---|
| Data rights | ACCEPTED WITH LIMITATIONS | nflverse presents its data repository under CC BY 4.0. The application provides attribution, links to the source and license, states that the snapshot was transformed, and acknowledges that the license covers only rights the licensor can grant. Underlying third party rights may still apply. |
| Market data | ACCEPTED WITH CONDITIONS | The Odds API terms support websites, dashboards, and analytical tools when the data is not redistributed as a standalone product. The project shows only normalized consensus values, uses a six-hour cache, does not enable cross-origin access, and keeps the key server-side. A current response was validated through the public release. |
| Trademark | ACCEPTED WITH LIMITATIONS | The NFL states that league and club names, logos, uniform designs, and related marks are protected. The project uses factual text references to identify the subject, excludes logos and uniform artwork, avoids official colors as a copied trade dress claim, places educational-use language beside the forecast, and displays the full non-affiliation statement in the footer. A rights holder could still object. |
| Player publicity | ACCEPTED WITH LIMITATIONS | Names and public performance statistics are used as factual evidence. No headshots, likenesses, medical information, endorsements, or private data are included. |
| Responsible use | ACCEPTED | The product calculates educational probabilities and uncertainty. It provides no picks, stakes, payouts, affiliate links, sportsbook links, wager placement, or personalized advice. |
| Privacy | ACCEPTED | Public exploration is anonymous. No profile, wagering history, or personal information is collected. D1 stores an aggregate monthly AI cost ledger, shared request-window counts, cached normalized odds, and bounded AI-run metadata. It does not store prompts, user identity, wagering history, or raw vendor payloads. |
| Runtime AI data | ACCEPTED WITH LIMITATIONS | OpenAI states that API data is not used for model training unless the customer opts in. Default abuse monitoring may retain customer content for up to 30 days. The app sends no personal data, uses a bounded scenario, and sets `store: false`. |
| Accessibility | ACCEPTED | The browser semantic tree exposes one level-one heading, ordered section headings, a named navigation, named controls, a scenario fieldset, live statuses, and the probability graphic. A skip link, visible focus rules, reduced motion support, responsive layouts, and normal-text contrast of at least 4.5 to 1 are implemented. This is a showcase review, not a formal accessibility certification. |

## Primary sources

- [nflverse data repository](https://github.com/nflverse/nflverse-data)
- [nflverse CC BY 4.0 license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md)
- [nflverse terms of use statement](https://github.com/nflverse/nflverse)
- [The Odds API terms and conditions](https://the-odds-api.com/terms-and-conditions.html)
- [NFL terms and conditions](https://www.nfl.com/legal/terms/)
- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)

## Accepted operating limitations

1. Remove or revise data or naming if a rights holder raises a valid concern.
2. Do not add official logos, uniforms, player images, or copied NFL site content.
3. Do not expose raw odds data through an API, download, or standalone feed. Keep the same-site normalized endpoint limited to application use and without cross-origin access.
4. Do not infer bettor popularity without a licensed bettor-split source.
5. Keep the deterministic forecast available when live odds or runtime AI are unavailable.
6. Stop Runtime AI through the application ledger before estimated monthly spend exceeds $9.50. Keep the separate OpenAI project budget at $10 while the live key is enabled.
7. Keep rollback controls available for any failed public production gate. Public access and the signed-out production smoke test were completed July 30, 2026.
8. Keep educational-use language beside the forecast and the full non-affiliation statement in the footer.
9. Keep the shared anonymous request limit and bounded run ledger active while public Runtime AI is available.

## Acceptance record

Eric Lawler explicitly requested completion of the public-use review and acceptance of the documented limitations on July 15, 2026. The review was reconciled with the hosted candidate, successful live Runtime AI baseline, and local v1.0.0 regression on July 27, 2026. Eric approved the final source push, tag and release, public hosting, and signed-out production smoke test on July 29, 2026. The public release and signed-out smoke test were completed on July 30, 2026.
