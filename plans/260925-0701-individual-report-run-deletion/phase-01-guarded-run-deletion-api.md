# Phase 01 — Guarded run deletion API and service

## Overview

Implement backend support for deleting an individual report run within a project (`reports/<projectId>/<runId>/`). The service validates identities, acquires the exclusive report-root lock, verifies the run directory with a bounded preflight check, deletes only the specified run directory, prunes the project directory if no runs or files remain, and republishes the aggregate index from surviving manifests.

## Requirements

1. **Endpoint:** `DELETE /api/reports/projects/:projectId/runs/:runId`
2. **Security & Input Validation:**
   - Both `projectId` and `runId` must conform to `SAFE_ID` (`/^[a-z0-9][a-z0-9-_]{0,80}$/u`), not contain path separators (`/`, `\`), encoded slashes, or null bytes, and not be reserved names.
   - Request must pass loopback validation, same-origin HTTP(S) Origin check, Timing-safe CSRF token check, and Fetch Metadata check.
   - Body must be empty or empty JSON object `{}`; non-empty body returns 400.
   - Non-DELETE methods return 405 with `Allow: DELETE`.
3. **Execution Safety & Atomicity:**
   - Acquires `.report-root-lock` with zero wait time; returns 409 `REPORT_ROOT_LOCKED` on contention without exposing internal lock paths.
   - Recovers any uncommitted aggregate publication before proceeding.
   - Checks that `reports/<projectId>/<runId>` exists and is a directory within the canonical report root.
   - Executes preflight tree inspection (depth <= 32, entries <= 4096, bytes <= 256 MiB, no symlinks/junctions).
   - Deletes only `reports/<projectId>/<runId>`. All sibling runs in the same project and sibling projects remain byte-for-byte untouched.
   - If `reports/<projectId>` is now empty (contains 0 directory entries), prunes the empty directory.
   - Rediscovers surviving manifests, builds updated aggregate index via `buildAggregateIndex`, and publishes via `writeAggregateDataPair`.
   - Releases the root lock in `finally`.
4. **Error Handling & Status Codes:**
   - 200: `{ success: true, projectId, runId, remainingRunsCount }`
   - 400: `INVALID_PROJECT_ID` or `INVALID_RUN_ID`
   - 403: `FORBIDDEN` (CSRF / Origin / Fetch Metadata)
   - 404: `RUN_NOT_FOUND` (if project or run does not exist)
   - 405: `METHOD_NOT_ALLOWED`
   - 409: `REPORT_ROOT_LOCKED`
   - 500: `UNSAFE_PROJECT_DIRECTORY`, `REMOVAL_FAILED`, `REFRESH_FAILED`
5. **Code Constraints:**
   - New module `src/artifacts/report-run-deletion.ts` strictly under 200 LOC.
   - Modified `src/reporting/report-server-control-reports-api.ts` strictly under 200 LOC.
   - Kebab-case naming, ESM `.js` imports.

## Implementation Steps

1. Create `src/artifacts/report-run-deletion.ts` implementing `deleteProjectRunReport` with root lock, preflight, removal, directory pruning, and aggregate rebuild.
2. Update `src/reporting/report-server-control-reports-api.ts` to route `/api/reports/projects/:projectId/runs/:runId`.
3. Create unit test suite `tests/unit/control-reports-run-delete-api.spec.ts` covering the full API matrix and filesystem boundaries.
4. Verify compilation with `npm run typecheck` and run tests with `npm run test:unit`.

## Status & Next Steps

- **Status:** Done — 100% (completed: 2026-09-25)
- **Verification:** `npm run typecheck` passed (0 errors); `node scripts/run-playwright.mjs playwright test tests/unit/control-reports-run-delete-api.spec.ts --config=playwright.unit.config.ts` passed (8/8 passed). Full test suite passed (490/490 tests passed).
- **Next Steps:** Proceed to [Phase 02 — Per-run deletion UI and confirmation](./phase-02-per-run-deletion-ui.md).
