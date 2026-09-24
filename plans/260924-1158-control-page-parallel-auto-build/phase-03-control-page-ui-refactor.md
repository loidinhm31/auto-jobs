# Phase 03 — Control Page UI refactor

## Context links
- [Master plan](./plan.md) · [Backend result contract](./phase-02-parallel-auto-build-executor-and-api.md) · [Verification](./phase-04-testing-and-verification.md).
- Current UI: `src/reporting/control-page/pages/DashboardPage.tsx:1-19,69-135,180-258`; `src/reporting/control-page/components/organisms/ExecutionSection.tsx:7-73`; `src/reporting/control-page/components/organisms/ProjectCard.tsx:6-24,41-105`; `src/reporting/control-page/components/organisms/ProjectsGrid.tsx:6-48`; `src/reporting/control-page/components/organisms/BuildConfirmDialog.tsx:1-120`; `src/reporting/control-page/components/organisms/index.ts:1-12`; `src/reporting/control-page/hooks/useRunPoller.ts:13-29,171-238`; `src/reporting/control-page/components/molecules/RunResultBox.tsx:5-149`; `src/reporting/control-page/components/organisms/RunStatusCard.tsx:8-41`.

## Overview
**Date:** 2026-09-24 · **Priority:** P2 · **Status:** pending · **Effort:** 3h · **Depends on:** phase 02 result contract. Make the action bar the single execution surface: both all-enabled buttons and one shared, saved Workers selector; immediate build submission with clear per-project result presentation.

## Key Insights
- `ProjectCard` already has accessible Enabled checkbox and `runType` select (report/auto-build). Keep those; only the per-card `.btn-auto-build` and `onTriggerBuild` callback go. `ProjectsGrid` simply forwards this obsolete callback.
- `ExecutionSection` already has `#btn-run-reports` plus `#select-report-workers` bound to saved `reportWorkers` through `DashboardPage`/`useConfigManager.updateReportWorkers`. Reuse existing atom `Select` and document editor; rename **visible label and DOM ID to `Workers` / `select-workers`** as clean cutover, while retaining internal schema/property symbols `reportWorkers`, `onReportWorkersChange` where helpful to avoid needless churn. Update selectors/tests/docs accordingly; no alias controls.
- `useRunPoller.triggerRun(configName, configEtag, runType, projectId?, waitForCompletion?, waitTimeoutMs?)` already omits `projectId` from JSON if not passed. It will send `{ configName, configEtag, runType: 'auto-build' }` without adding worker count; no new hook or API endpoint.
- `RunResultBox` currently shows one report link, one build link/result/stages or error; status card already passes `result` through. Add ordered `buildProjects` rendering and retain scalar fallback for old single-project records; never suppress a failed entry because another succeeded.

## Requirements
1. Action bar contains button text exactly **Generate Reports (All Enabled)** (`#btn-run-reports`), **Trigger Auto Build (All Enabled)** (new `#btn-run-auto-build`), and one labeled **Workers** select (`#select-workers`, options 1, 2, 3, 4). Count affects both server paths via saved top-level `reportWorkers`, not POST. No per-project build button, second worker selector, dialog, or implicit run on selection.
2. Keep existing edit/Save/ETag journey: changing Workers updates active document/raw JSON and dirty flag, so both run buttons disable until Save succeeds; switching configs/reload reflects each saved count/default 1. Disable both while no document or triggering/active run; optionally disable the build button if there are no enabled auto-build projects, with accessible reason if needed. Button fires immediately once, no prompt, with no `projectId` or UI wait overrides.
3. Preserve Enabled checkbox `checkbox-enabled-${project.id}`, run mode select `select-runtype-${project.id}`, project card/grid IDs/layout and report button ID. `ConfigProjectEditor`/raw JSON continue editing persisted `waitForCompletion`/`waitTimeoutMs` defaults. Remove only obsolete per-run dialog controls and their callback chain; don't remove persisted wait options, backend targeted-ID support or shared credential/browser settings dialogs.
4. `RunResultBox` shows each `buildProjects` member identified by safe display name/ID, state/status badge, build number, authorized build link (when present), stages and sanitized error (when present), in config order. Show submitted/unknown/failed even without build URL or number; no empty anchor, no misleading batch-wide success if one failed. Keep `#run-result-box`, report link and scalar fallback behavior.

## Architecture
`ProjectCard[enabled,runType] → useConfigManager shared document → Save/ETag → ExecutionSection[Workers,report action,build action] → DashboardPage handlers → useRunPoller.triggerRun(...,'report'|'auto-build') → POST /api/run → polled RunRecord.result.buildProjects → RunStatusCard → RunResultBox`. `DashboardPage` has no `confirmProject` state or modal render. `BuildConfirmDialog` deleted, not hidden. Build button text explicitly signals all selected projects and the irreversible immediate action; style with existing danger variant and keyboard focus/disabled semantics.

## Related code files
| Action | Path and present range | Work |
| --- | --- | --- |
| Modify | `src/reporting/control-page/components/organisms/ExecutionSection.tsx:7-73` | Add `onRunAutoBuild`, shared Workers select label/ID, new action button, common disabling/accessible layout. |
| Modify | `src/reporting/control-page/pages/DashboardPage.tsx:1-19,69-135,180-258` | Remove confirm state/handlers/dialog; call `triggerRun(name, etag, 'auto-build')` directly; pass both callbacks and saved count. |
| Modify | `src/reporting/control-page/components/organisms/ProjectCard.tsx:6-20,92-105` | Remove per-card button/callback; keep Enabled and Run Type controls. |
| Modify | `src/reporting/control-page/components/organisms/ProjectsGrid.tsx:6-20,36-44` | Remove obsolete callback prop/forwarding and unnecessary dirty prop if unused. |
| Delete | `src/reporting/control-page/components/organisms/BuildConfirmDialog.tsx:1-120` | No caller and no confirmation behavior remains. |
| Modify | `src/reporting/control-page/components/organisms/index.ts:1` | Remove stale re-export; retain other organisms. |
| Modify | `src/reporting/control-page/types/index.ts:80-97,119-129`, `src/reporting/control-page/components/molecules/RunResultBox.tsx:5-149` | Typed multi-project DTO and per-project rendering, preserve scalar fallback. |
| Verify unchanged | `src/reporting/control-page/hooks/useRunPoller.ts:171-238`, `src/reporting/control-page/hooks/useConfigDocumentEditor.ts:49-85,134-158`, `src/reporting/control-page/components/organisms/RunStatusCard.tsx:8-41` | Existing optional projectId omission, editor/dirty/ETag flow and result handoff. |
| Update in phase 04 | `tests/e2e/control-page.spec.ts:198-229,697-895`, `tests/unit/control-atomic-components.spec.ts:413-519` | Replace obsolete modal/button text assertions with immediate batch/selector/result behavior. |

## Implementation Steps
1. Add build callback to `ExecutionSectionProps` and render new danger-style `Button` `#btn-run-auto-build` alongside current report button. Change select label/ID to `Workers`/`select-workers`, keep options 1–4 and `reportWorkers` backing prop. Use `isDirty || isLoading || !hasDocument` (and active-run state if passed) consistently for both buttons; selector unavailable while no document/triggering. Maintain responsive wrapping and accessible labels.
2. Replace `handleOpenAutoBuildConfirm`/`handleConfirmAutoBuild` and `confirmProject` in DashboardPage with `handleRunAutoBuild` calling `triggerRun(activeConfigName, etag, 'auto-build')` immediately. Remove dialog import/render, `onTriggerBuild` from grid/card, and `BuildConfirmDialog.tsx` + barrel export. Keep `updateProject` handlers, `ConfigFormBuilder`, credentials/browser dialogs, `handleRunReports` intact.
3. Extend UI `RunResult` with typed `buildProjects` matching server's sanitized shape; in `RunResultBox` prioritize `buildProjects` over scalar fields if present. Render ordered rows, explicit state and build/stage details, link only when a validated URL exists. Preserve scalar fallback for old records; keep report and error rendering. Avoid dangerouslySetInnerHTML; React text escaping and `rel='noopener noreferrer'`.
4. Validate full journey: edit mode/enabled/count → dirty disables both → Save/ETag clears dirty → click build once and observe one omitted-ID POST/no modal → poll → every outcome visible (including failed/unknown). Confirm report action uses same saved count and report links still render.

## Todo list
- [ ] Two buttons and one shared Workers selector in ExecutionSection, with dirty/loading/no-config states.
- [ ] Immediate omitted-ID build handler; remove dialog, per-card trigger and re-export cleanly.
- [ ] Render all sanitized build outcomes plus scalar fallback and report result.
- [ ] Update old modal/worker-label tests rather than pinning obsolete UI text.

## Success Criteria
- Browser: button `#btn-run-auto-build` is in Execute Actions; none in project cards; clicking it sends one POST with `runType: 'auto-build'`, no `projectId`, no `workerCount`, no dialog, then shows every selected build outcome. Report button still sends `runType: 'report'`.
- Select is labeled Workers with values 1–4, defaults to 1, changes active document, disables both action buttons until save, persists/reloads/switches correctly. Check Axe and keyboard operation in desktop/mobile responsive UI.
- Unit/DOM proof covers mixed success/failure results with separate project identity, state, link/stage/error; single scalar and report link still render, and no old dialog selector survives. Targeted command and browser fixture route are in phase 04.

## Risk Assessment
- Immediate submission is irreversible: explicit all-enabled label, danger style, no hidden auto-trigger, and shared dirty guard make intent clear; backend still validates saved config and CSRF.
- Old E2E intentionally asserts dialog and per-card button; replace those assertions with user-observable behavior, delete stale dialog-only tests rather than updating their wording.
- A batch may contain submitted, timeout and unknown outcomes; visible per-project state and aggregate failure must not flatten ambiguity or hide errors.

## Security Considerations
- Only trusted/server-sanitized `buildProjects` fields reach UI. React escapes text; link URL derives from validated credential-free Jenkins result, `target='_blank'` paired with `rel='noopener noreferrer'`. No credential values or raw request/response details in result UI, no new localStorage setting or request override. Never allow dirty/unsaved mode or count changes to trigger external actions.

## Next steps
- Phase 04 updates focused unit/API/E2E contracts and exercises the actual browser surface. After implementation, revise affected architecture, codebase and operator docs to describe shared worker semantics and no modal; planning phase writes only files inside this plan directory.
