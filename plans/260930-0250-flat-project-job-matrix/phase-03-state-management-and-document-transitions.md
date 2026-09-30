# Phase 03 — state management and document transitions

## Context links

[Plan](./plan.md) · [Architecture/state machine](./architecture-design.md#matrix-state-machine) · [Frontend research](./research/researcher-02-frontend-matrix-ui.md) · [Editor rules](../../docs/code-standards.md#configuration-and-mode-rules) · [Phase 01](./phase-01-schema-data-model-and-migration.md)

## Overview

- Priority: P2 · Status: DONE — 2026-09-30 · Estimate: 6h.
- Keep one saved document/editor state across table cells, row/column mutations, raw JSON and guarded Save. Define pure immutable transitions preserving every unrelated schema-v1 field; use existing replacement revision and ETag handling rather than a second matrix store.

## Key insights

- `useConfigDocumentEditor` owns `currentDoc`, `rawJsonString`, validation, `isDirty`, `replacementRevision`. `setDocument(updated,true)` updates all; `replaceDocument` increments revision on GET; Apply increments only when valid. Save acknowledgment should not reset transient UI state.
- `useConfigManager` handles load, `If-Match` Save, 409/412 conflicts and adopting returned document/ETag. Editor's old ID-keyed `updateProject` is unsafe while ID text changes; `updateProjectAt` already exists.
- Old add draft starts with `loginUrl:''` and `jobUrl:''`, currently invalid until repaired. Matrix add may similarly create an invalid draft; Execute/Save must remain blocked, with repair UI instead of silently inserting fake URLs.
- Group transitions preserve project order and unrelated fields; clone utility copies advanced fields. Column removal needs explicit destructive confirmation upstream, then one atomic transition across all rows.

## Requirements

1. Column add/rename/remove, project ID/name/url/edit/add/clone/remove, row column selection toggles, and primary mirror updates are pure no-op-aware transitions. Preserve `projectGroups`, `groupId`, `defaults`, reportWorkers, `loginUrl`, selectors, credentials references, browser, waits and timeouts, source policies, `enabled` and legacy project `runType`.
2. Column add gives every row an empty URL cell, selection unchanged; rename changes label only; removal strips each removed URL and selection, recalculates mirrors, and never silently drops populated URLs. Reject last-column removal unless replacement column exists; UI confirms destructive removal.
3. Project add/clone uses existing limit 50, safe unique ID, clone disabled/ungrouped with deep-independent nested settings and copied URL cells, **selection reset to `[]`** so clone never implicitly executes. Initialize new rows with all declared column keys. ID edits target stable row index, reject duplicate/invalid IDs before Save/Execute. Do not move historical report directories after ID edits.
4. Selection persists per row and survives Save/reload. An empty selection is intentional. When a selected URL is whitespace, leave selection persisted but skip the cell on Execute. No shadow selection that can diverge from raw JSON.
5. Existing ETag concurrency, no-auto-save behavior, invalid raw Apply semantics and one document-replacement revision stay intact. A legacy GET projection must **not** mark dirty, and raw Apply of a valid legacy document must expand into same model and mark dirty. A Save must send a validated complete document, not a lossy subset.

## Architecture

`ConfigStore GET -> useConfigManager -> upgradeLegacyProjectMatrixDocument -> useConfigDocumentEditor.replaceDocument -> ProjectsJobMatrix -> pure config-document/matrix transitions -> setDocument(draft,true) -> raw JSON + validation -> PUT with If-Match -> adopt server version and ETag`. Invalid edit may remain visible but neither Save nor either run action proceeds. Legacy no-edit Save must not be required; only an explicit valid mutation writes matrix fields. `replacementRevision` resets transient dialogs/column-edit focus on successful reload/switch/valid raw Apply; Save acknowledgement does not reset. The two action buttons supply their own mode at click time and are not persisted; row selection persists. Keep result/run state distinguishable after a config switch or save conflict.

## Related code files

| Action | Path | Planned change |
| --- | --- | --- |
| Create | `src/reporting/control-page/hooks/project-job-matrix-transitions.ts` | Pure column/cell/selection/mirror operations, split narrow responsibilities if near 200 LOC. |
| Modify | `src/reporting/control-page/hooks/config-document-transitions.ts` | Project row add/update/remove/clone integration while preserving fields and index identity. |
| Modify | `src/reporting/control-page/hooks/useConfigDocumentEditor.ts` | Expose matrix transitions and projected Apply; remove old board-only edit hooks after caller migration. |
| Modify | `src/reporting/control-page/hooks/useConfigManager.ts` | Project GET before editor replacement; retain Save validation, ETag/conflict semantics. |
| Modify | `src/reporting/control-page/pages/DashboardPage.tsx` | Consume matrix transitions and selection from current document; no independent card copy. |
| Modify | `src/reporting/control-page/utils/clone-project-draft.ts` | Matrix-aware clone of cells/selection; preserve independent nested settings and ungrouped disabled default. |
| Delete after caller migration | `src/reporting/control-page/hooks/project-group-transitions.ts` | Remove unused group editing operations; preserve serialized `projectGroups` and `groupId` in unrelated document transitions. |
| Modify | `tests/unit/config-document-editor-groups.spec.ts`, `tests/unit/control-hooks-and-types.spec.ts`, `tests/unit/clone-project-draft.spec.ts`, `tests/unit/control-config-api.spec.ts` | Behavior contracts for lifecycle and preservation. |

## Implementation steps

1. Define pure transitions with explicit return of original document on no-op/invalid target; avoid broad array cloning on every keystroke beyond affected rows. Identify columns by stable ID and rows by array index for editable project ID. Column identity never derives from its editable display name.
2. Implement add column with safe generated bounded ID (e.g. `job`, `job-2`), empty URL per project, no automatic selection. Rename validates nonblank bounded name without changing IDs/URL keys. Remove checks existence and permits only deliberate UI confirmation; removes keys and references in all rows, promotes primary when possible, leaves invalid draft if a row loses its last URL. Preserve all other object keys by spread.
3. Cell update stores entered URL verbatim in `jobs[columnId]`; recompute primary mirror from first nonblank cell in shared column order using same canonical/raw comparison rule as Phase 01. A whitespace cell counts as empty and is skippable. Do not trim/rewrite other cells just because one changed.
4. Project ID/name updates use row index and schema validation for safety and duplicate detection. Add/clone through matrix-aware transition. Continue to require >=1 project and >=1 enabled project; remove follows existing guards. Warn that changing ID changes *future* artifact target paths but old reports remain historical.
5. Wire transitions into `setDocument(updated,true)` only when object changes, so raw JSON, validation and dirty state stay synchronized. `getValidationErrors` must catch cross-cell URL issues. Gate Save if invalid (not just dirty) and Execute if dirty/invalid/unavailable. `applyRawJson` validates legacy or complete matrix, expands valid legacy and increments revision; invalid Apply leaves current applied document and ETag untouched.
6. Keep existing manager PUT `If-Match`; on success adopt server document/new ETag while preserving transient dialog state; on 409/412 retain unsaved document and show recoverable conflict. Avoid stale responses overwriting a newer active config; respect existing load sequence guards.
7. Remove obsolete group-board/form-specific handlers when all callers migrate, including group management UI/actions and unused group transitions. Preserve `projectGroups`/`groupId` as opaque validated saved metadata and assert retention in no-op/read-only Save tests. The two report/build buttons use the same saved selection and different explicit `runType` values.

## Todo list

- [x] Pure immutable column, row, cell, mirror, selection transitions with no-op behavior.
- [x] ID-safe row editing, matrix-aware clone and preserved advanced/default/group metadata.
- [x] One editor model for raw JSON, migration, Save, ETag conflicts and dirty/replacement revision.
- [x] Disabled Save/Execute for invalid or stale drafts; explicit column deletion confirmation.
- [x] Unit evidence for V1 projection, multi-cell persistence, ID rename and conflict recovery.

## Completion

**Status:** DONE — 2026-09-30.

**Evidence:** 212/212 tests passed (190 unit, 22 Chromium E2E). Cycle 2 code review: 9.8/10, 0 critical issues, 0 warnings; typecheck and build passed ([review](./code-review-260930-1130-phase-03-state-management-and-document-transitions.md), [completion report](../reports/Phase03PM-260930-1154-flat-project-job-matrix-phase-03-completion.md)).

Cycle 2 resolved the prior Save-button validation finding. Its remaining suggestions are non-blocking: assert clone `jobUrl` mirror recalculation explicitly, and retire legacy group handlers after Phases 04/05 caller migration.

## Success criteria

- Editing a URL on project A/column X leaves B/X, A/Y and all unrelated fields byte-equivalent when serialized; changing a header name leaves IDs and URL keys untouched. Removing a column after confirmation strips only its cell keys/selections.
- Load of V1 displays expanded default column with no dirty state and original file unchanged. Save/reload preserves all advanced/group/default data and first nonblank legacy `jobUrl`. Empty explicit selection survives reload.
- Invalid raw Apply preserves applied document; valid Apply increments replacement revision and can switch between legacy and expanded shape. Save acknowledgements do not reset transient matrix state. 409 leaves unsaved edits for user recovery.

## Risk assessment

- **Lost updates from stale UI closures/ID changes:** use index/key-based callbacks against latest document; test rename followed by URL edit.
- **Unsaved invalid draft accidentally executes last saved config:** disable Execute on dirty/invalid, enforce ETag/target resolution again on server.
- **Destructive heading removal:** confirmation and immutable atomic change, no silent deletion; if legacy mirror would be stale, block Save until repaired.

## Security considerations

- Never trust client-only validation. Server rechecks all cells, referenced columns, same Jenkins context, enabled state, ETag and run selection. Prototype-polluting keys are rejected; keep raw JSON parsing through schema assertion. Credentials remain references, not secret values, even in cloned rows or logs.

## Next steps

- Proceed to Phase 04: multi-job execution engine and API (`phase-04-multi-job-execution-engine-and-api.md`).

## Real remaining decisions

- No blocking state choice: per-row selection is persisted; each explicit report/build button supplies its own run mode. Exact confirm-copy for destructive remove can be tuned in browser verification.
