---
title: "Flat project job matrix refactor"
description: "Replace both Control project surfaces with one editable job matrix and execute selected project-column targets safely in report or build mode."
status: in-progress
priority: P2
effort: 32h
branch: main
tags: [refactor, frontend, backend, api]
created: 2026-09-30
---

# Flat project job matrix

## Overview

Replace **both** the grouped project board (`ProjectsGrid` → `ProjectGroupColumn` → `ProjectCard`) **and** project form (`ConfigFormBuilder`) in `src/reporting/control-page` with one spreadsheet-style project editor. Shared add/rename/remove job-link headings; row ID/name, independent URL cells, multi-column execution selection; two explicit actions, Generate Reports and Trigger Auto Build, against the selected nonblank cells. Extend the existing validated schema-v1 document without erasing old `jobUrl`, groups, defaults, login settings or advanced fields. Resolve a saved ETag-matched selection into bounded, distinct build/report targets and report artifact identities. [Full proposed architecture](./architecture-design.md); [short command entry](./cmd-plan.md).

**Boundary:** Overall implementation remains in progress. Phases 01–04 (schema/data model/migration, spreadsheet matrix UI, document lifecycle, and multi-job execution engine/API) are DONE; Phase 05 remains pending. Phase 02 replaced the grouped Control Page board and separate project form with one matrix; Phase 03 completed the document transition/save/reload lifecycle. Follow [code standards](../../docs/code-standards.md), [architecture](../../docs/architecture.md), [system architecture](../../docs/system-architecture.md), [backend research](./research/researcher-01-backend-schema-exec.md), and [frontend research](./research/researcher-02-frontend-matrix-ui.md); `docs/development-rules.md` is absent in this checkout.

## Phases

| # | Work and deliverable | Status | Effort | Link |
| --- | --- | --- | --- | --- |
| 01 | Extend schema-v1, lossless V1 projection/mirror validation and CLI compatibility | DONE — 2026-09-30 | 6h | [Schema, data model, migration](./phase-01-schema-data-model-and-migration.md) |
| 02 | Replace grouped board and form with one accessible flat matrix | DONE — 2026-09-30 | 7h | [Matrix UI](./phase-02-spreadsheet-matrix-ui-components.md) |
| 03 | Pure immutable transitions and editor/save/reload/selection lifecycle | DONE — 2026-09-30 | 6h | [State and document transitions](./phase-03-state-management-and-document-transitions.md) |
| 04 | Validated batch run API, two bounded execution paths, provenance/artifact isolation | DONE — 2026-09-30 | 8h | [Multi-job execution engine and API](./phase-04-multi-job-execution-engine-and-api.md) |
| 05 | Contract/e2e proof, compatibility and security audit, docs/release gate | Pending | 5h | [Verification and release](./phase-05-testing-verification-and-release-audit.md) |

## Phase 02 completion

**Status:** DONE — 2026-09-30; status finalized at `2026-09-30T10:01:59+07:00`.

**Evidence:** The Phase 02 validation report records 110/110 selected checks (98 unit, 12 Chromium Control E2E), typecheck and build passed. The code review scored 9.3/10 with no critical findings. Its summary reports a different test split (73 unit, 22 E2E); Phase 05 must establish consolidated release-gate totals. Current matrix transitions assign the computed primary URL directly to `jobUrl`, addressing the review's stale-mirror finding. Remaining review suggestions: remove redundant Dialog `forceMount` options and consider a narrow-screen scroll cue. Vite emitted a non-blocking bundle warning (2,697.08 kB; 1,083.88 kB gzip). See [validation](../reports/phase02tester-260930-0939-spreadsheet-matrix-validation.md) and [review](./code-review-260930-0941-phase-02-spreadsheet-matrix-ui-components.md).

**Handoff:** Phase 03 completed the integrated document transitions and is marked DONE below.

## Phase 03 completion

**Status:** DONE — 2026-09-30.

**Evidence:** 212/212 targeted tests passed (190 unit, 22 Chromium E2E). Code review scored 9.8/10, with 0 critical issues and 0 warnings. The review also records passing typecheck and build ([phase](./phase-03-state-management-and-document-transitions.md), [review](./code-review-260930-1130-phase-03-state-management-and-document-transitions.md), [completion report](../reports/Phase03PM-260930-1154-flat-project-job-matrix-phase-03-completion.md)).


## Phase 04 completion

**Status:** DONE — 2026-09-30.

**Evidence:** 101/101 targeted tests passed (79 unit, 22 Chromium E2E). Typecheck (`tsc --noEmit`) and production build passed. Code review scored 9.6/10 with no critical issues or warnings. Safe batch target execution, server-side ETag coordinate resolution, bounded auto-build and report dispatch, virtual target collision preflight, and per-target typed provenance are verified ([validation](../reports/phase04tester-260930-1313-phase-04-multi-job-execution-engine-and-api.md), [review](./code-review-260930-1317-phase-04-multi-job-execution-engine-and-api.md)).

**Next:** Phase 05 — Testing, verification, and release audit.

## Dependencies

- 01 precedes 03 and 04: single shared validated schema and explicit migration/mirror rules; do not fork frontend and server models.
- 02 and 03 can be designed in parallel; final integration requires 03 transitions and 01 schema. 04's API contract must be agreed with 02's Execute props before merging.
- 05 verifies all phases together and updates shipped architecture/code standards/config docs only after behavior lands. Do not run project-wide gates mid-integration.
- Existing `If-Match`/CSRF/Host/Origin guards, 1 MiB limits, `reportWorkers` concurrency, SecretStore snapshot/redaction, canonical URL policy, and artifact root lock are unchanged prerequisites. No dependency or database additions.

## Design decisions and tradeoffs

- **Schema-v1 extension instead of v2:** V1 files read unmodified, optional matrix fields validated strictly. Existing updated CLI retains `jobUrl`; older strict binaries reject new fields even if version stays 1. Document this limit and backup/rollback strategy; do not claim universal old-binary support.
- **Persist row selections:** choices survive reload and run against saved documents, not browser-only draft. Blank selected cells skip at dispatch; all-skipped batch rejects clearly. Each of the two explicit buttons selects a run mode at click time; do not save a per-link mode or mutate legacy per-project `runType`.
- **Single batch POST with coordinate IDs:** each button sends one batch; server resolves URLs after ETag match. This avoids user-supplied URL injection, one-active-run races, and multiple POST fan-out. Existing no-target API callers retain old selection path.
- **Primary mirror:** project `jobUrl` equals first nonblank cell by shared heading order, preserving usable old scalar workflow. A row with no nonblank URL is a draft only and cannot be saved; changing/deleting a primary promotes another or blocks Save. Removing populated columns requires explicit confirmation.
- **Virtual ID `<projectId>--<columnId>`:** same report worker/aggregate pipeline with distinct artifact path; bound column ID to 16 characters, check collisions against other virtual targets and real IDs, and fail closed on unrelated history collisions. No new report storage subsystem.
- **Flat but not lossy:** hidden `projectGroups`/`groupId` persist without group-management UI; advanced project/default editing stays accessible through matrix settings without a parallel project form. Preserve clone and enabled controls; removal of old board/form exports/callers/tests is a clean cutover.

## Release definition

Matrix is the **only** project editor on Dashboard; persisted shared columns and per-row URL/selection round-trip through guarded save/reload. Old schema-v1 loads without a write; save preserves all settings plus scalar mirror; direct CLI still resolves `jobUrl`. Two explicit run buttons each dispatch selected nonblank cells in their own report/build mode; report output is isolated per virtual ID and visible in the existing flat report index. Security, focused unit/e2e, actual Control Page browser smoke, and project-wide release gates pass. No scaffolds or dual project surfaces left.

## Real remaining decisions

1. Historical artifact ID collisions: after checking existing on-disk report history, reject ambiguous virtual IDs or adopt a documented operator-guided archive migration; never auto-merge unrelated histories.
2. Confirm deployment includes older external strict-validator binaries. Updated repository CLI stays compatible via `jobUrl`; binary-level backward compatibility would require a separately approved export policy.

## Validation Summary

**Validated:** 2026-09-30
**Questions asked:** 5

### Confirmed Decisions
- **Action buttons / Execution triggers (Q1):** Two explicit actions/buttons, "Generate Reports" and "Trigger Auto Build", both running per-row selected nonblank job cells. No per-link type or mode dropdown selector.
- **Group metadata retention (Q2):** Retain existing `projectGroups` and row `groupId` fields invisibly in saved configs and raw JSON; completely remove group board and group management UI.
- **Report history indexing (Q3):** No additional report history grouping; the existing flat report index contains all results, showing clear project and job column provenance. Virtual artifact IDs (`<projectId>--<columnId>`) remain internal for isolated artifact directory paths and execution snapshots.
- **Legacy single-job config projection (Q4):** Legacy single-job configs project an in-memory default shared column on open without writing to disk before an explicit user Save.
- **Selection persistence (Q5):** Persist per-row multi-selection (`selectedJobColumns`) across reload in saved configuration.

### Plan revisions applied
- [x] Phase 02 and architecture: two explicit run buttons; no mode dropdown.
- [x] Phases 02–03: no group-management controls; retain metadata through edits, cloning and raw JSON.
- [x] Phase 04 and verification: use existing flat report index with project/column provenance and isolated target paths.
- [x] Phases 01–03: no-write legacy projection and persistent per-row selection.
