# Dependabot Review, July 30, 2026

**Review scope:** Seven open Dependabot pull requests

**Action boundary:** Review only. No dependency pull request was merged, closed, or modified.

**Repository state:** Every reviewed branch is behind current `main`. The `Protect main` ruleset requires each candidate to update from `main` and pass fresh `validate` and `Analyze JavaScript and TypeScript` checks before merge.

## Recommendations

| PR | Change | Current checks | Risk assessment | Recommendation |
|---|---|---|---|---|
| [#1](https://github.com/erlawler/road-to-six/pull/1) | `actions/checkout` 5 to 7 | CI and CodeQL passed on the original branch state | Major action update across three workflows, but the repository does not use `pull_request_target` or `workflow_run` patterns | Rebase, rerun required checks, then merge serially |
| [#2](https://github.com/erlawler/road-to-six/pull/2) | `actions/setup-node` 5 to 7 | CI and CodeQL passed on the original branch state | Major action update with a successful hosted workflow run | Rebase after #1, rerun required checks, then merge |
| [#3](https://github.com/erlawler/road-to-six/pull/3) | `@types/react` 19.2.14 to 19.2.17 | CI and CodeQL passed on the original branch state | Development-only patch update with low runtime risk | Rebase after prior merges, rerun required checks, then merge |
| [#4](https://github.com/erlawler/road-to-six/pull/4) | `@cloudflare/vite-plugin` 1.47.0 to 1.48.0 | CI and CodeQL passed on the original branch state | Development-tool minor update touches the production build path | Rebase, run the full production build and hosted packaging smoke path, then decide |
| [#5](https://github.com/erlawler/road-to-six/pull/5) | TypeScript 5.9.3 to 7.0.2 | CI failed; CodeQL passed | `typescript-eslint@8.65.0` declares a TypeScript peer range below 6.1.0, so TypeScript 7 is incompatible with the current toolchain | Defer until the lint toolchain supports TypeScript 7 |
| [#6](https://github.com/erlawler/road-to-six/pull/6) | `@vitejs/plugin-rsc` 0.5.26 to 0.5.32 | CI and CodeQL passed on the original branch state | Patch update touches React Server Components and the production build path | Rebase, run the production build and focused RSC smoke test, then decide |
| [#7](https://github.com/erlawler/road-to-six/pull/7) | Wrangler 4.114.0 to 4.115.0 | CI and CodeQL passed on the original branch state | Development-tool minor update is not exercised by the current CI deployment path | Rebase, run a non-deploy Wrangler validation and hosting build, then decide |

## Merge strategy

1. Keep TypeScript 7 deferred.
2. Update and merge #1, #2, and #3 one at a time after fresh required checks.
3. Test #4, #6, and #7 independently against the production build and hosting package.
4. Rebase the next Dependabot branch after every merge so strict branch protection evaluates the current base.
5. Do not batch dependency updates into the portfolio-completion pull request.

## Security configuration verified

| Control | Status |
|---|---|
| Dependabot version update proposals | ENABLED |
| Dependabot vulnerability alerts | ENABLED |
| Dependabot security update proposals | ENABLED |
| Open Dependabot vulnerability alerts | 0 |
| Secret scanning | ENABLED |
| Push protection | ENABLED |
| Open secret-scanning alerts | 0 |
| CodeQL | PASSING |
| Protected `main` ruleset | ACTIVE, NO BYPASS |

The zero-alert counts are a point-in-time GitHub API result, not a guarantee that future vulnerabilities or secrets will not be detected.
