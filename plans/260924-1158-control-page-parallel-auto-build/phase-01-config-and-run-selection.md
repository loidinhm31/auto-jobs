# Phase 01 — Config and run selection

## Context links
- [Master plan and preflight contract](./plan.md) · [Next: parallel executor/API](./phase-02-parallel-auto-build-executor-and-api.md) · [Architecture: current control contract](../../docs/architecture.md).
- Current code: `src/config/config-types.ts:27-45,59-95`; `src/config/project-config-project-validation.ts:16-53,74-77,156-192`; `src/config/project-config-schema.ts:17-62`; `src/config/report-worker-count.ts:1-21`; `src/config/project-run-selection.ts:1-34`; `src/config.ts:15-30`; `src/reporting/control-page/hooks/config-document-transitions.ts:71-77`; `src/reporting/control-page/hooks/useConfigDocumentEditor.ts:49-85,134-158`.

## Overview
**Date:** 2026-09-24 · **Priority:** P2 · **Status:** DONE · **Completed:** 2026-09-24 · **Effort:** 2h · **Depends on:** none. Establish the exact schema/selection contract and add pure all-enabled auto-build selection while retaining exact targeted selection.

## Key Insights
- Config already has per-project `runType` and independent `enabled`; `normalizeProjectConfigDocument` normalizes omitted mode to `report`. `ROOT_KEYS` already accepts top-level `reportWorkers` and validation uses `normalizeReportWorkerCount` (safe integer 1–4, default 1); avoid a second persisted field or schema bump.
- `selectReportProjects` filters in config order, freezes its result and fails on empty; `selectAutoBuildProject` checks exact ID, disabled and wrong-mode errors. These are existing conventions, not a reason to route a targeted build through a batch selector.
- Shared editor already persists worker edits in `reportWorkers` and synchronizes raw JSON/dirty state; this phase does not rename its storage/API field. `ConfigProjectEditor` can retain per-project waiting defaults, but the removed dialog no longer supplies per-run UI overrides.

## Requirements
1. `selectAutoBuildProjects(projects: readonly NormalizedProjectConfig[]): readonly NormalizedProjectConfig[]` selects **all and only** `enabled && runType === 'auto-build'`, preserves input order, freezes returned array, and throws `ConfigError(['no enabled auto-build projects found in configuration'])` if empty; no browser I/O.
2. Preserve `selectAutoBuildProject(projects, projectId)` targeted behavior for matching enabled auto-build IDs, including errors for missing, disabled and report-only IDs. Absence of `projectId` is the all-enabled intent only at API/executor boundary; blank/whitespace/non-string supplied values are invalid, never converted into all-enabled.
3. Reuse existing `reportWorkers?: number` document field and `normalizeReportWorkerCount` for both modes; omitted means 1. `runType` stays project-only and mutually exclusive; an enabled report does not become a build target.

## Architecture
`schema-v1 JSON → assertProjectConfigDocument → normalizeProjectConfigDocument → [selectReportProjects | selectAutoBuildProjects | selectAutoBuildProject] → run executor`. The new helper mirrors the existing report selector rather than adding a generic strategy/factory. Server reads one ETag-matched saved document and passes the same numeric policy to both action paths; no project, defaults, SecretStore, browser preference or POST worker field. Side effects happen strictly after selection/preflight in phase 02.

## Related code files
| Action | Path and present range | Work |
| --- | --- | --- |
| Modify | `src/config/project-run-selection.ts:4-34` | Add the all-enabled pure selector alongside existing helpers; keep targeted selector unchanged. |
| Modify | `src/config.ts:22-25` | Export `selectAutoBuildProjects` from existing facade. |
| Verify unchanged | `src/config/config-types.ts:27-95`, `src/config/project-config-project-validation.ts:16-53,74-77,156-192`, `src/config/project-config-schema.ts:17-62`, `src/config/report-worker-count.ts:1-21` | Already enforce mode, enabled and shared worker schema. |
| Verify unchanged | `src/reporting/control-page/hooks/config-document-transitions.ts:71-77`, `src/reporting/control-page/hooks/useConfigDocumentEditor.ts:134-158` | Saved editor transition remains source of truth. |
| Added in Phase 01 | `tests/unit/run-type-config.spec.ts:94-152` | Added meaningful ordered/empty-mode selection contract; retained targeted cases. |

## Implementation Steps
1. Add the selector to `project-run-selection.ts` with existing `filter`/`ConfigError`/`Object.freeze` conventions. Do not mutate normalized projects or expand selection to disabled/report projects. Export in `src/config.ts`.
2. In consumer design for phase 02, branch on **presence** of a validated projectId: exact one with existing selector vs omitted means all via new selector. Reject explicitly supplied `projectId: null`, `''`, whitespace or non-string in API before admission; do not accept them as omission.
3. Keep `ProjectConfigDocumentV1.reportWorkers`, schema version 1, defaults, UI editor transition, and CLI `runFromConfig` unchanged. Document the UI label change as a presentation-only change in phase 03.
4. Focused proof added and run in Phase 01: normalized interleaved report/build entries with disabled build ⇒ ordered enabled builds only; no enabled build ⇒ deterministic `ConfigError`; targeted invalid ID continues to fail. No configuration or browser side effects.

## Todo list
- [x] Add and export `selectAutoBuildProjects` with exact filtering, order and empty error.
- [x] Keep targeted ID semantics and shared saved-worker schema invariant.
- [x] Add selector boundary proof without duplicate schema or source-text assertions.

## Success Criteria
- Selected IDs equal enabled auto-build IDs in document order; returned array immutable; report/disabled projects never selected; empty selection fails before a Jenkins call.
- Old documents missing `reportWorkers` still validate and imply 1; valid 1–4 saved values feed both modes after the ETag contract; targeted helper still rejects missing/disabled/wrong mode.
- Verification on 2026-09-24: focused selector spec passed 18/18 (see [test report](../reports/tester-260924-1245-phase-01-config-and-run-selection.md)).

## Risk Assessment
- Treating `projectId: ''` as omission risks triggering every build: explicit presence/type/trim validation in API, then phase-02 selection.
- A generic pool abstraction would couple report artifacts/browser ownership to Jenkins submit flows; reuse only the scheduling pattern, not report-specific executor dependencies.
- If all projects are report or disabled-build, fail the accepted asynchronous run with clear `no enabled auto-build projects` error and no external side effect; avoid inventing a new schema rule forbidding such documents.

## Security Considerations
- Selection must remain pure, fail closed on invalid IDs and mode mismatch, and never log or serialize credentials. Existing schema checks configured URLs and SecretStore names; runtime URL/origin/form checks remain in `runAutoBuildProject`/Jenkins workflow, not in this selector.

## Next steps
- Phase 01 DONE on 2026-09-24; focused selector spec passed 18/18 and the full unit suite passed 389/389 (see [test report](../reports/tester-260924-1245-phase-01-config-and-run-selection.md)). Proceeding to Phase 02: wire omitted-ID API semantics and the bounded build pool.
