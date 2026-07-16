---
name: road-to-six-release-review
description: Review a Road to Six feature or release for scoring integrity, synthetic data labeling, accessibility, public content safety, trademark boundaries, and portfolio completeness.
---

# Road to Six Release Review

1. Read `AGENTS.md`, `docs/product-brief.md`, `docs/architecture.md`, and the changed files.
2. Confirm all performance values are labeled synthetic or backed by an official source and as-of date.
3. Confirm no official team or league logo, player likeness, uniform design, private data, betting advice, or outcome forecast was added.
4. Recalculate changed BETS examples and verify that 12 or higher returns ADVANCE.
5. Check keyboard access, visible labels, heading order, focus states, contrast, and reduced motion behavior.
6. Run `npm run lint`, `npm run build`, and `npm test`.
7. Scan the repository for em dash and en dash characters.
8. Return findings by severity, followed by the release recommendation and any open gate owner.
