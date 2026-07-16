# Public Use Review

**Review date:** July 15, 2026  
**Decision owner:** Eric Lawler  
**Decision:** ACCEPTED WITH DOCUMENTED LIMITATIONS

## Answer

Road to Six is accepted as an unofficial educational portfolio project, subject to the controls and limitations below. This acceptance authorizes release preparation and a public source repository. It does not authorize public hosting, which still requires Eric Lawler's final approval after the private deployment review.

This review documents product risk decisions. It is not legal advice or a guarantee that a third party will not object.

## Review outcomes

| Area | Decision | Control and accepted limitation |
|---|---|---|
| Data rights | ACCEPTED WITH LIMITATIONS | nflverse presents its data repository under CC BY 4.0. The application provides attribution, links to the source and license, states that the snapshot was transformed, and acknowledges that the license covers only rights the licensor can grant. Underlying third party rights may still apply. |
| Market data | ACCEPTED WITH CONDITIONS | The Odds API terms support websites, dashboards, and analytical tools when the data is not redistributed as a standalone product. The project shows only normalized consensus values and keeps the key server-side. Live display remains blocked until a private key is configured and one response is validated. |
| Trademark | ACCEPTED WITH LIMITATIONS | The NFL states that league and club names, logos, uniform designs, and related marks are protected. The project uses factual text references to identify the subject, excludes logos and uniform artwork, avoids official colors as a copied trade dress claim, and displays a prominent non-affiliation notice. A rights holder could still object. |
| Player publicity | ACCEPTED WITH LIMITATIONS | Names and public performance statistics are used as factual evidence. No headshots, likenesses, medical information, endorsements, or private data are included. |
| Responsible use | ACCEPTED | The product calculates educational probabilities and uncertainty. It provides no picks, stakes, payouts, affiliate links, sportsbook links, wager placement, or personalized advice. |
| Privacy | ACCEPTED | Public exploration is anonymous. No profile, wagering history, or personal information is collected. The D1 record is an aggregate monthly AI cost ledger only. |
| Runtime AI data | ACCEPTED WITH LIMITATIONS | OpenAI states that API data is not used for model training unless the customer opts in. Default abuse monitoring may retain customer content for up to 30 days. The app sends no personal data, uses a bounded scenario, and sets `store: false`. |
| Accessibility | ACCEPTED | The browser semantic tree exposes one level-one heading, ordered section headings, a named navigation, named controls, a scenario fieldset, live statuses, and the probability graphic. A skip link, visible focus rules, reduced motion support, responsive layouts, and normal-text contrast of at least 4.5 to 1 are implemented. This is a portfolio review, not a formal accessibility certification. |

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
3. Do not expose raw odds data through an API, download, or standalone feed.
4. Do not infer bettor popularity without a licensed bettor-split source.
5. Keep the deterministic forecast available when live odds or runtime AI are unavailable.
6. Stop runtime AI through the application ledger before estimated monthly spend exceeds $9.50. The separate OpenAI project budget must be set to $10 before enabling the live key.
7. Keep public hosting private until Eric Lawler gives the final go-live approval.

## Acceptance record

Eric Lawler explicitly requested completion of the public-use review and acceptance of the documented limitations on July 15, 2026. The release can advance to a private hosted candidate while the credential-dependent live gates and public-hosting approval remain open.
