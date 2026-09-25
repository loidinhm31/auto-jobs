---
title: "Individual report run deletion"
description: "Allow deleting individual report runs within a project from the Control Dashboard, with root locking, safety preflight, empty project pruning, and aggregate index rebuild."
status: in-progress
priority: P2
effort: 8h
branch: main
tags: [reporting, control-page, artifacts, security]
created: 2026-09-25
---

# Individual report run deletion

## Overview

Enable operators to delete individual report runs (`reports/<projectId>/<runId>/`, e.g. `20260925_004829`) from the Control Dashboard at `/reports/index.html`. While whole-project deletion removes all runs and the project directory at once, per-report deletion allows surgical removal of specific historical runs while preserving other runs in the same project. When the final remaining run of a project is deleted, the empty project directory is pruned automatically from disk. The published aggregate pair (`reports/index.html` and `reports/aggregate-data.json`) is rebuilt under the report-root lock from surviving manifests.

## Phases

| Phase | Work | Status | Progress | Effort |
| --- | --- | --- | --- | --- |
| [01: Guarded run deletion API and service](./phase-01-guarded-run-deletion-api.md) | Implement `deleteProjectRunReport` service and `DELETE /api/reports/projects/:projectId/runs/:runId` endpoint with root lock and empty project pruning | Done (2026-09-25) | 100% | 3h |
| [02: Per-run deletion UI and confirmation](./phase-02-per-run-deletion-ui.md) | Add Actions column with Delete button per run row in `ProjectRunsTable`, `DeleteRunConfirmationDialog`, and optimistic/refreshed state | Planned | 0% | 3h |
| [03: Verification and release gates](./phase-03-verification-and-release-gates.md) | Unit/E2E test suite covering single-run removal, sibling preservation, empty pruning, lock contention, and full release gates | Planned | 0% | 2h |

## Dependencies

- Phase 01 owns `src/artifacts/report-run-deletion.ts` (<200 LOC) and expands `src/reporting/report-server-control-reports-api.ts`.
- Phase 02 integrates with Phase 01's DELETE contract: `DELETE /api/reports/projects/:projectId/runs/:runId`.
- Phase 03 runs once both backend and frontend land.
- Architecture and standards: modules under 200 lines, kebab-case, ESM `.js` imports, Markdown under 800 lines.

## Confirmed decisions

1. **Deletion Scope:** Keep both individual report run deletion (button on each table row) and whole-project deletion ("Delete All Reports" at project header).
2. **Empty Project Cleanup:** When the last run under a project is deleted, automatically prune the now-empty `reports/<projectId>/` directory from disk.
3. **Security:** Require `SAFE_ID` on both `projectId` and `runId`, Host/Origin/CSRF validation, loopback-only control mode, bounded filesystem preflight on the run directory, and exclusive report-root lock.
4. **Aggregate Rebuild:** Re-discover surviving manifests after removal and republish `aggregate-data.json` and static `index.html`.
