# Frontend Matrix UI Research

**Date:** 2026-09-30  
**Scope:** `src/reporting/control-page/` UI, config editor state, execution, and existing tests.

## Findings

- The current page renders two separate project surfaces at once: `ProjectsGrid` in `projectsSection` and `ConfigFormBuilder` in `formBuilderSection` (`src/reporting/control-page/pages/DashboardPage.tsx:175-200`). Replace both with one matrix/editor surface; do not leave either as a second project view.
- Current hierarchy: `DashboardPage` → `DashboardLayout` slots; `ProjectsGrid` → `ProjectGroupColumn` → `ProjectCard`, plus `ProjectGroupEditorDialog` (create/membership/rename/delete); `ConfigFormBuilder` → selected-project editor and defaults editor; `ExecutionSection` is a separate actions slot. `project-group-board.tsx` only aliases `ProjectsGrid` (`components/organisms/project-group-board.tsx:1-2`).
- `ProjectsGrid` builds grouped columns and passes group CRUD/membership and per-project enabled/run-type controls (`components/organisms/ProjectsGrid.tsx:14-25,41-55,99-118`). `ProjectCard` presents one `jobUrl`, an enabled checkbox, and a per-project run-type select (`components/organisms/ProjectCard.tsx:19-24,54-66`). The grouped board and project form are distinct existing workflows, not alternate names for one component.
- `ConfigFormBuilder` owns single-project selection/add/clone/remove draft UI and receives the full document, validation errors, and callbacks (`components/organisms/ConfigFormBuilder.tsx:19-39,40-49`). Its draft validation gates commit; project editor exposes per-project fields including `runType` (`ConfigFormBuilder.tsx:145-150`; `components/molecules/ConfigProjectEditor.tsx:19-34,87-107`). Keep needed advanced/default editing reachable in the matrix or another non-project surface; do not preserve a parallel project form.
- Data model is currently scalar: project has `id`, `name`, `groupId?`, `loginUrl`, `jobUrl`, optional `runType`, waits/enabled, advanced credentials/selectors/origins, and an unknown-field index signature; document has `projects`, optional `projectGroups`, `defaults`, and unknown-field index signature (`types/index.ts:21-58`). Named job columns/URL cells have no current explicit typed field. Group deletion currently ungroups members, so deleting the board UI must not delete persisted groups/membership implicitly (`hooks/project-group-transitions.ts:87-112`; tests below).
- Page derives `ProjectCardData` from document and applies defaults for report run type, wait settings, enabled, and group (`pages/DashboardPage.tsx:88-109`). The matrix should bind editable ID/name and job URL cells to the same document/editor state, not maintain an independent lossy project copy. Preserve unknown project/document/default fields when changing shape (`types/index.ts:21-58`).

## State, save, validation, execution

- Requested names `useControlConfig`, `useActiveConfig`, `useControlState`, and `ConfigDocumentContext` were not found in this tree search. Actual owner is `useConfigManager`, composed with `useConfigDocumentEditor`; `DashboardPage` calls the hook directly (no context in this page composition) (`pages/DashboardPage.tsx:18-48`; `hooks/useConfigManager.ts:37-51`).
- Editor owns `currentDoc`, synchronized formatted JSON, dirty flag, validation errors, and replacement revision (`hooks/useConfigDocumentEditor.ts:29-50,64-88`). Structured updates set dirty; whole-document replacement clears it; applying raw JSON validates before replacing. Validation uses `assertProjectConfigDocument` (`useConfigDocumentEditor.ts:53-61,91-118,120-161`). `ConfigFormBuilder` separately holds selected index and unsaved draft validation/add/clone state; replacement revision resets selection/draft (`components/organisms/ConfigFormBuilder.tsx:40-71,91-112,145-167`).
- Config load updates active name + ETag and replaces editor document; save validates, PUTs JSON with `If-Match`, treats 409/412 as stale-config conflict, then adopts server document/ETag (`hooks/useConfigManager.ts:61-80,114-155`). Save button is gated on dirty/loading (`components/molecules/ConfigSelectorBar.tsx:18-22,69-72`). Matrix edits should flow through editor transition callbacks so dirty state, validation, save, raw JSON, and ETag conflict behavior remain unified.
- Current execution has page-level `report` and `auto-build` handlers with no project/URL selection (`pages/DashboardPage.tsx:120-130`). `ExecutionSection` exposes “Generate Reports (All Enabled)” and “Trigger Auto Build (All Enabled)” and disables them for dirty/loading/no document (`components/organisms/ExecutionSection.tsx:6-10,46-62`). Run request type is one `runType` plus optional single `projectId` (`types/index.ts:142-149`); current per-project `runType` also remains in config. Matrix execution therefore needs a coordinated request/dispatch mapping for selected nonempty cells and one user-chosen run type; frontend-only multiple checkbox selection cannot be represented by the existing page handler as-is.
- Suggested panel hierarchy: one `ProjectsJobMatrix` editor owning shared heading controls and project rows; each row has editable ID/name, URL input per shared job column, and a fixed multi-select/checkbox group for executable columns. Keep build/report choice once at panel execution level, not per cell. Skip blank/whitespace URLs at dispatch; keep columns shared and operations add/rename/remove explicit. A native checkbox popover is compact/accessibly labelable; inline grid checkboxes are more discoverable but consume width. Table/grid gives spreadsheet scan/edit affordance; horizontal scrolling + sticky ID/name and job headers helps wide configurations. Do not invent independent card/run-type-per-link controls.

## Relevant tests

- `tests/e2e/control-page.spec.ts:167-200`: dashboard accessibility, project-card enabled toggle → dirty/save lifecycle, and report execution; current selector is `.project-card`, current run action IDs target global “all enabled” behavior. Update rather than retain assertions for removed UI.
- `tests/unit/control-grouped-project-board.spec.ts`: group bucketing/reassignment and create/rename/delete/membership behavior; direct board coverage to replace with matrix column/row behavior while retaining config group-preservation coverage where relevant.
- `tests/unit/clone-project-draft.spec.ts:337-...`: `ConfigFormBuilder` clone/add draft lifecycle and validation; replace project-form-specific expectations with matrix editing while retaining meaningful config-preservation checks.
- `tests/unit/config-document-editor-groups.spec.ts:103-180,210-...`: replacement revision, dirty state, group preservation/ungrouping, raw JSON and config-manager interactions.
- `tests/unit/control-atomic-components.spec.ts:30,665-702`: `ExecutionSection`/`ConfigSelectorBar` UI contracts and dirty-save gating.
- `tests/unit/control-hooks-and-types.spec.ts:937-...` and `tests/unit/control-config-api.spec.ts:69-120,232-277`: load/save, ETag conflict/round-trip, defaults/report workers and project group persistence.
- `tests/unit/control-run-api.spec.ts:87-155`: report/build run requests and optional single `projectId`; backend contract currently has no multi-cell selection payload.

## Tradeoffs / migration cautions

- **Persisted vs transient selections:** storing selected column IDs per row makes choices survive reload but changes config schema; transient UI selection avoids saved-config churn but resets on config replacement. Resolve explicitly.
- **Legacy `jobUrl` mapping:** map it deterministically into a matrix column on read/migration and write it back compatibly (or maintain a migration/version policy); never discard it or silently remove group/default/advanced fields. Existing groups may be hidden from UI but must remain in document until an explicit migration decision.
- **ID editing:** current update actions locate projects by ID (`useConfigDocumentEditor.ts:126-129`); editing an ID needs index/stable identity-based updates and collision validation, otherwise subsequent edits may target the wrong row.
- **Execution contract:** selected cells may require one run per cell, a backend batch payload, or transient project copies. Preserve a single user-selected `report`/`auto-build` type across selected links and skip empty URLs; confirm backend semantics before fixing UI API shape.

## Unresolved questions

1. What column name/ID should represent legacy `jobUrl`, and must every existing config round-trip without schema migration?
2. Should row-selected job columns persist in config or be run-only UI state?
3. Does the run API need a multi-project/multi-URL payload or can selected cells be dispatched as separate calls with the same chosen run type?
4. Should group metadata remain silently retained for compatibility, or should the refactor offer an explicit group-to-matrix migration/removal path?
