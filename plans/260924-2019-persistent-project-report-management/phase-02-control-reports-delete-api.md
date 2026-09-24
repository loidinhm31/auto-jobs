# Phase 02 — Guarded Control reports DELETE API

## Context links

- [Plan](./plan.md) · [Phase 01 shared builder](./phase-01-persistent-aggregate-index-builder.md) · [Backend research](./research/researcher-01-report.md) · [Architecture, deletion](../../docs/architecture.md) · [Code standards](../../docs/code-standards.md)
- Existing: `src/reporting/report-server-control.ts`, `report-server-control-security.ts`, `report-server-control-api.ts`, `report-server-json.ts`; `src/artifacts/artifact-paths.ts`, `report-root-lock-owner.ts`, `aggregate-manifest-reader.ts`, `aggregate-report-publisher.ts`.

## Overview

- **Date:** 2026-09-24. **Description:** Add loopback-only `DELETE /api/reports/projects/:projectId` with preflight security, shared root lock, guarded subtree removal, and root index refresh. **Priority:** P2. **Implementation status:** pending. **Review status:** not reviewed.

## Key Insights

- Existing router validates Host for every request and sends `/reports/*` to GET/HEAD-only file handler. Route deletion under `/api/*`, never report file routing.
- `validateMutationRequest` already enforces Host, HTTP(S) same-origin Origin, accepted Fetch Metadata, timing-safe CSRF, and JSON media type or bodyless DELETE. `ArtifactPaths.acquireReportRootLock({ waitMs: 0 })` can reject lock contention promptly with the known lock error; do not mistake unsafe/permission failures for ordinary contention.
- Actual `SAFE_ID` is `/^[a-z0-9][a-z0-9-_]{0,80}$/u` in `src/artifacts/artifact-identity.ts`. In addition reject reserved root names/prefixes; `assets` currently passes SAFE_ID.
- Pair publication is journaled/rollback-aware, but project deletion plus pair publication is not atomic. Never claim an irreversible subtree was restored after a partial failure.

## Requirements

### Functional

1. On valid deletion, remove the entire `reports/<projectId>/` subtree after safety preflight, including invalid/unvalidated files alongside valid runs; rediscover valid remaining manifests and publish `aggregate-data.json` plus `index.html` via `writeAggregateDataPair`. Reply HTTP 200 `{ "success": true, "projectId": "id", "deletedRunsCount": N }` (`N` counts only validated discovered runs, not every removed file).
2. Missing/previously deleted/no validated retained reports → 404; malformed/unsafe ID → 400; live lock contention → 409; removal/refresh failure → sanitized 500 diagnostic. Unknown method on recognized single-project route → 405 with `Allow: DELETE`.
3. Keep `config/*.json`, sibling project trees, `reports/assets/`, `.report-root-lock`, staging root and unrelated root files unchanged. `serve:report` remains GET/HEAD-only.
4. Partial deletion: under same lock attempt rediscovery and publication from whatever validated manifests remain, even if removal fails; preserve primary error/diagnostic and return 500, never success.

### Non-functional

- Acquire lock before *any* filesystem inspection/inventory/removal/discovery; hold through recovery and pair publication, release in `finally`. Avoid long request queue via nonblocking lock acquisition. Inventory and deletion bounded, fail closed on unsafe entries.
- Keep handler and any extracted I/O guard module kebab-case and each new/materially changed production TS file under 200 lines; reuse policy and publisher, avoid private ad hoc lock or duplicate index builder.

## Architecture

### System design

- `handleControlRequest` routes exact one-segment `/api/reports/projects/:projectId` to new `src/reporting/report-server-control-reports-api.ts`; isolate filesystem safety in `src/artifacts/report-project-deletion.ts` if necessary for size/ownership. Route uses existing `ControlRouterContext` (`reportRoot`, `host`, `port`, `csrfToken`). No new public server mode or report-file mutation.

### Component interactions

- Request → global Host gate → route/method → `validateMutationRequest` → decode and validate ID → `new ArtifactPaths(context.reportRoot).acquireReportRootLock({waitMs:0})` → canonical root/child preflight + validated manifest inventory → remove exact direct child → rediscover → phase 01 builder(history-only) → `writeAggregateDataPair` → JSON response; always release lock.

### Data flow

- URL segment alone selects direct-child path; manifests prove eligibility/count but never supply target path. Discovery's validated metadata powers regenerated rows; publisher stages and journals only root JSON/HTML. Every error response is bounded/sanitized through existing `sendError` and no-cache helpers.

## Related code files

- **Modify:** `src/reporting/report-server-control.ts` (exact API routing); `src/artifacts/report-root-lock-owner.ts` only if a small typed lock-contention signal is needed (avoid touching other lock semantics); existing security/report server tests for route and mode boundaries.
- **Create:** `src/reporting/report-server-control-reports-api.ts` (request contract and orchestration), `src/artifacts/report-project-deletion.ts` (contained symlink-safe preflight/removal if handler would exceed 200 lines). Both kebab-case.
- **Delete:** none; do not replace `src/artifacts/aggregate-report-publisher.ts` or `src/reporting/report-server-files.ts`.

## Implementation Steps

1. Register exact prefix + exactly one encoded segment under `/api/`; reject empty, duplicate slash, suffixes and malformed percent-encoding (400). Decode exactly once; reject residual encoded separators/double-encoding, dot traversal, null bytes, IDs not matching actual `SAFE_ID`, `assets`, `.report-root-lock`, `.tmp*`, `.bak*` and other root-internal names. Reject unsupported method with 405/Allow. Apply mutation gate before filesystem work.
2. Enforce no body or bounded JSON object with no recognized payload; do not silently ignore an unbounded/chunked body. Existing gate accepts bodyless DELETE and JSON; use `readBoundedJsonBody` for a supplied JSON payload, reject nonempty/invalid body with 400/413. Supply no `Content-Type` for browser's bodyless DELETE.
3. Acquire shared root lock with short/nonblocking wait **before** calling `assertReportRoot`, `lstat`, discovery or `recoverAggregatePublication`. Differentiate known contention from unsafe lock, permission and I/O errors; map only actual contention to 409.
4. Under lock, recover outstanding aggregate publication, assert canonical existing root, resolve ID as a strict single direct child via `path.relative`, `lstat` child as real directory (not link), compare realpath/identity and require strict containment. Preflight descendants recursively without following symlinks; reject symlinked/reparse-point/nonconforming entries and unsafe mutation race; enforce count/byte/depth budgets (align existing orphan-cleanup limits where suitable). Do not inspect a symlink target.
5. Discover validated manifests with the phase 01 typed completeness signal; refuse delete if discovery is incomplete. Require ≥1 validated manifest for ID before deletion; otherwise 404 even if an empty/malformed-only project directory exists. Count that project's validated runs but preflight and remove its entire safely contained directory, including invalid files alongside those runs.
6. After preflight, recheck canonical child identity and remove only its directory; use no-follow checks as close as possible to removal and reject unexpected changes. Rely on report-root ACLs to prevent adversarial external writers while the cooperative lock is held; do not claim a path-based recursive deletion provides a filesystem-atomic defense against a hostile concurrent writer.
7. Rediscover under same lock, build history-only aggregate with timestamp and sanitized discovery warnings, and call `writeAggregateDataPair`. If removal or publication fails, attempt publisher recovery and refresh from surviving valid manifests while still locked; log/return bounded diagnostic with 500. If refresh also fails, preserve recoverable journal state for next runner and report that index may require recovery. Never re-delete or retry irreversible removal automatically.
8. Return success only after confirmed deletion and published refreshed pair; release lock in `finally`. Do not change config, separate staging, CSS/assets, secrets or read-only server routes.

## Todo list

- [ ] Wire exact DELETE route, method/CSRF/body guards, stable JSON/error contract.
- [ ] Implement locked canonical path/symlink preflight and project-only removal.
- [ ] Rebuild pair using shared builder/publisher under same lock.
- [ ] Handle contention, 404, partial failure and bounded diagnostics; test protected neighbors.

## Success Criteria

- **Definition of done:** A valid configured or unconfigured retained project's whole directory is deleted (including adjacent invalid files after safe preflight); response count matches validated pre-delete runs, remaining index files agree, other paths unchanged; incomplete discovery/missing or invalid requests never mutate disk; concurrent runner/delete uses one root lock and 409 on contention.
- **Validation methods:** in-process loopback Control server + isolated temp roots; assert HTTP status/body and filesystem snapshots, lock held through refresh, journal fault injection and recovery, GET/HEAD-only report mode. Detailed matrix in phase 04.

## Risk Assessment

- **Symlink/junction/TOCTOU:** canonical root + `lstat` every entry, no-follow traversal, identity recheck, locked cooperative writers and protected filesystem ACLs; fail closed on unsafe entries, especially Windows reparse points.
- **Partial removal versus pair rollback:** project tree is not journaled; refresh remaining valid history and return 500 on any failure. Next runner's recovery repairs interrupted pair if immediate refresh fails.
- **Bad count on truncated discovery:** if discovery budgets exhaust, refuse delete (500/diagnostic) rather than deleting unknown runs while reporting inaccurate count.
- **Large tree:** bounded preflight before irreversible removal; no silent truncation or unbounded walk.

## Security Considerations

- **Auth/authorization:** loopback binding plus existing Host/Origin/Fetch Metadata/timing-safe CSRF mutation gate; this is local operator intent, not user-account auth. Never expose DELETE via report-only server or `/reports/*`.
- **Data protection:** reject encoded traversal, reserved root names, links and noncanonical paths; never derive target from manifest, send raw filesystem errors/secret values, or delete outside the selected subtree. Protect report root from untrusted local writers by OS ACLs.

## Next steps

- Phase 03 uses the JSON contract and 404/409 error meanings; phase 04 exercises security, synchronization and recovery on Windows and CI platforms.
