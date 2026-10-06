# Weekly football update operations

This document defines the approved updater workflow. Code being present does not prove the owner connection or schedule is enabled. Confirm the Site's linked task and a successful hosted update before reporting activation.

## Scope and source evidence

Refresh Dallas Cowboys record, actual completed scores, remaining games, confirmed next kickoff, roster evidence, serving ratings, default scenario, and visible verification/failure state. Preserve the model, 2025 player baseline labels, public viewing, $9.50 application cutoff, and existing provider configuration. Do not call `/api/forecast` or `/api/odds`, use paid feeds, change billing, or broaden permissions.

Approved sources are fixed in `lib/football-sources.mjs`: nflverse games at a resolved commit, its weekly roster release and existing prior-season statistics release, the official Cowboys schedule, and the official NFL Cowboys record. Downloads have time and byte limits. Compare published digests where available, preserve retrieval/publication times and checksums, reconcile every Cowboys final and kickoff, then apply the shared snapshot validator with the actual time. Missing or conflicting source facts fail closed. Season rollover beyond the deployed supported season requires an explicit model/source review.

## Hosted access and data operations

Use this existing Site's provisioned private MCP plugin through its connected owner OAuth identity. Reopen the linked Site to verify its identity, current version, public audience, and installed connection. Use the platform-returned connection details unchanged. Never put tokens in the task prompt, source files, or logs. The owner allowlist is the server-only `FOOTBALL_UPDATER_OWNER_EMAIL` setting, derived from the confirmed Site owner. Service access without a user identity cannot authorize writes on this public Site.

The tools are:

- `football_update_status`: authenticated, owner-only readback of verification status and season facts.
- `refresh_football`: authenticated, owner-only refresh from fixed sources with no arguments. It cannot accept arbitrary data, URLs, SQL, or configuration changes.

The shared D1 lease prevents overlapping work. Repeated calls within one hour do not refetch sources. A successful candidate replaces the complete payload atomically and returns `published`, its data version, and whether football content changed materially. A timestamp-only recheck returns no material change. If a call reports `already_checked_or_running`, inspect status; do not claim a new update occurred or repeatedly bypass the cooldown. The last successful payload and verified timestamp remain unchanged after a failed source validation. An ambiguous publication/readback must be reported as unverified.

## Each scheduled run

1. Reopen the linked Road to Six Site through Sites and confirm the same identity and connection. This document is retrievable from `https://github.com/erlawler/road-to-six/blob/main/docs/weekly-football-updates.md`; use the connected GitHub source reader if necessary. No local checkout is required.
2. Call the connected `football_update_status` tool, then `refresh_football` once. These use the owner's authorized OAuth connection. Never substitute an anonymous request or invent identity headers.
3. Read status again. Compare the resulting data version, successful-update time, record, final count/scores, remaining count, next matchup, and official verification time. Read the public `/api/football` endpoint and page when supported and confirm they show that version and evidence. A stored update is incomplete until readback succeeds.
4. Notify Eric only in the private task conversation for a failure, unresolved conflict, or material football change. State exactly what changed and the verified timestamp. A timestamp-only successful recheck is silent. Do not repeatedly notify the same unchanged failure.
5. Keep the existing monthly health check unchanged. Do not create additional schedules, new credentials, or unrelated changes during routine runs.

## Schedule and activation

Approved cadence: Wednesday at 08:00 `America/Chicago`, with daylight-saving adjustment. Proposed first occurrence is October 7, 2026 at 8 a.m. CDT. If setup is not complete by that occurrence, use the next future Wednesday and report the actual saved start. The schedule continues weekly until changed; it does not imply daily or live updates. Weekend results can remain visibly pending until Wednesday.

Before creating exactly one Site-linked task, verify the Active Agent Memory Claim, owner connection, anonymous-write rejection, real owner read/write/readback, and a controlled free-source update. Re-read the linked automation list to avoid duplicates, copy the fresh native schedule request ID, and reuse that ID on retries. Verify the saved timezone, enabled state, linkage, and next scheduled occurrence. Schedule creation is not evidence that a scheduled run executed.

## Validation and fallback

The bundled JSON is a dated recovery artifact; CI validates its consistency as of its recorded verification time. Runtime refresh validation always uses the actual current time. Both paths use the same ingestion and validation functions. Public API and UI expose failed/unavailable state without replacing good data with partial input or advancing successful timestamps. Scenarios pause for missing finals, unconfirmed kickoffs, expired reviews, or failed reads; historical player baselines are never presented as current availability.

Tests cover official source disagreement, final/bye/TBD behavior, precise weekly freshness, atomic SQLite writes, overlapping calls, idempotency, expired leases, failed-source retention, unavailable storage, owner authorization, and matching server-rendered/public-reader data. Complete the repository release checks and security audit before publication. A new owner or authorization policy requires a separate review and connection verification.
