# Backend research: persistent project report management

Researched 2026-09-24. Scope: current artifact/index publication, locking, Control API security, and safe deletion design.

## Findings

### 1. Manifest discovery, storage, and aggregate publication

- `ArtifactPaths` allocates immutable run directories at `<reportRoot>/<projectId>/<runId>`; staging is a separate sibling root (default `artifacts`). Project/run IDs must satisfy `SAFE_ID`; report/staging roots must be canonical, real directories and must not overlap. [src/artifacts/artifact-paths.ts:163-209]
- Runner acquires the report-root lock, recovers interrupted aggregate publication, ensures shared stylesheet, and cleans orphan staging/publication entries before and after workers. It then calls `discoverRunManifests(reportRoot)`. [src/runner.ts:102-139]
- Discovery scans persisted project/run directories (bounded by 5,000 manifests and artifact read/byte budgets), excludes internal lock storage, validates manifests and referenced artifacts, and returns diagnostics for malformed/unsafe/incomplete entries rather than trusting them. Optional report paths are retained only when validated. [src/artifacts/aggregate-manifest-reader.ts:26-32, 215-309]
- Runner projects each discovered manifest to historical run metadata, then sets `aggregate.projects` to `outcomes.map(...)`. Thus discovery contains retained historical runs, but aggregate project *rows* are gated by projects selected/executed in this invocation; historical-only or removed-from-config projects are omitted. A warning notes unconfigured historical manifests are ignored. [src/runner.ts:139-171]
- Aggregate publisher validates the model; stages JSON and rendered `index.html` under random exclusive temporary names; journals the intended transaction; backs up prior pair; renames staged files into place; commits journal; and rolls back on publication errors. Recovery handles interrupted journals. `writeAggregateReportFile` renders root `index.html`; `aggregate-data.json` is pretty-printed JSON. Shared stylesheet is under `assets/`. [src/artifacts/aggregate-report-publisher.ts:67-143; src/reporting/report-output.ts:86-140]
- Existing index publication is atomic/rollback-aware for the JSON+HTML pair, not a transaction with project-directory deletion.

### 2. Locks, leases, cleanup, and deletion serialization

- No `artifact-root-lease.ts` appeared in `src/artifacts/`; current mechanisms are the report-root lock plus per-run staging leases.
- Runner lock is `<reportRoot>/.report-root-lock`, with owner/claim files, a 2-minute lease, 15-second heartbeat, and 30-second wait. It validates canonical root/lock paths, records process identity, and can reclaim stale/incomplete locks only after process/lease checks. [src/artifacts/report-root-lock-owner.ts:12-20, 42-45, 158-267]
- Staging leases live in the separate staging root and track project/run, PID, creation and expiry (2-hour duration); cleanup uses leases to avoid deleting active staging runs. Orphan cleanup excludes `assets` and lock internals, uses age/count/byte/removal budgets, and preserves symlink/unsafe entries with warnings. [src/artifacts/staging-lease.ts:7-18, 61-133; src/artifacts/orphan-cleanup.ts:6-16, 190-251]
- Deletion MUST acquire the same report-root lock as the runner before inventory, removal, discovery, or index publication. A separate delete-only lock would still race runners. Keep lock for the whole operation; map lock contention/timeout to a retryable API conflict/service error.
- Under the lock: discover validated reports; require the requested ID to correspond to at least one retained validated report; validate direct-child path; remove only that project subtree; rediscover remaining validated reports; rebuild/publish root aggregate pair. Preserve `assets`, `.report-root-lock`, sibling project dirs, staging root, and root files except aggregate pair. Do not base target path on a manifest-provided path.

### 3. Control API and mutation security; endpoint proposal

- `handleControlRequest` checks Host globally, serves exact dashboard/assets routes, forwards `/reports/*` to the read-only report file handler, and dispatches `/api/*` to config/run/secrets handlers. API routing is explicit. `ControlRouterContext` supplies report root, expected host/port, stores/managers, and CSRF token. [src/reporting/report-server-control.ts:17-25, 40-149]
- Existing config PUT and run POST call shared `validateMutationRequest` before body parsing. Gate requires valid expected Host, same expected HTTP(S) Origin, acceptable Fetch metadata (`same-origin`/`none`; absent metadata allowed), timing-safe `x-csrf-token`, and JSON content type; bodyless DELETE is the explicit exception when no body/content-type (or content-length 0). Host/origin/CSRF/fetch failures are 403; wrong media type is 415. [src/reporting/report-server-control-security.ts:26-110; src/reporting/report-server-control-api.ts:32-48, 76-87]
- Recommended API: `DELETE /api/reports/projects/{projectId}`. Decode exactly one path segment, validate `SAFE_ID`, reject reserved/internal names (especially `assets`), and use existing mutation gate (bodyless DELETE is supported). Return JSON with deleted project ID and removed run/report count; use 404 for no retained validated project, 400 for malformed ID, 409/503 for lock timeout, and 500 if deletion/index refresh fails. Set `Allow: DELETE` for recognized path with other methods. Dashboard call supplies CSRF header and same-origin request metadata. No mutation through `/reports/*`.
- Rebuild aggregate from all validated retained report manifests across the root, grouped by project ID—not only current configured/outcome projects. Historical-only row metadata must come from persisted validated manifest data; exclude malformed/unvalidated reports and preserve validation diagnostics. Ensure rows link only to validated report paths.

### 4. Path safety and behavior boundaries

- Follow established artifact patterns: resolve requested ID as exactly one child of canonical report root; validate `SAFE_ID` and reserved names; `lstat` root/child and require real directories, not symlinks; verify `realpath` canonicality/containment; reject symlink/non-directory targets before recursive removal. Preflight nested entries and preserve/refuse unsafe symlinks rather than traversing them. Limit removal inventory/bytes similarly to orphan cleanup. [src/artifacts/artifact-paths.ts:49-85, 163-209; src/artifacts/orphan-cleanup.ts:37-42, 60-94, 190-227]
- Removal invalidates every immutable URL under `/reports/<projectId>/<runId>/...` for that project (expected explicit-delete consequence); unrelated projects and shared `/reports/assets/*` remain. Root `/reports/index.html` and `aggregate-data.json` are regenerated. `serve:report`/report-file handler remains read-only (`GET`/`HEAD` only); deletion belongs only to authenticated-by-CSRF Control mutation API. [src/reporting/report-server-control.ts:90-104; src/reporting/report-server-files.ts:57-60]
- Malformed manifests are warned/skipped by discovery; never use their embedded values to choose a deletion path or index link. Requiring at least one validated retained report before deletion prevents a safe-looking arbitrary directory (e.g. shared `assets`) from becoming a target. A project folder may contain additional malformed runs; explicit deletion can remove that validated project’s whole direct-child subtree after filesystem safety checks.
- Concurrent runner/control deletion serializes on the shared root lock, including across separate processes. Immutable run links remain stable during ordinary publication; explicit deletion removes all links for the selected project. Read-only `serve:report` has no route to delete. If deletion succeeds but index publication fails, report operation failure and ensure next runner rebuilds from remaining manifests; the current publisher does not atomically couple directory removal to index commit.

## Sources

- `src/runner.ts:89-183`
- `src/artifacts/aggregate-manifest-reader.ts:26-32, 215-309`
- `src/artifacts/aggregate-report-publisher.ts:67-143`; `src/artifacts/aggregate-publication-recovery.ts`
- `src/artifacts/artifact-paths.ts:49-95, 163-225`; `src/artifacts/report-root-lock-owner.ts:12-20, 42-45, 158-267`; `src/artifacts/staging-lease.ts`; `src/artifacts/orphan-cleanup.ts`
- `src/reporting/report-server-control.ts:17-25, 40-149`; `src/reporting/report-server-control-api.ts`; `src/reporting/report-server-control-security.ts:26-110`; `src/reporting/report-server-files.ts:57-60`
- `src/security/` currently contains URL-policy modules; filesystem safety patterns are in `src/artifacts/` and `src/reporting/report-server-file-io.ts`.

## Unresolved questions

- Should a delete request for an already-removed project return 404 (recommended) or be idempotent 204? API contract choice only; neither affects safe deletion.
