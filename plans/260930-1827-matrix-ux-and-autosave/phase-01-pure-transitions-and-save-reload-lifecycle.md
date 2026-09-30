# Phase 01 — Pure transitions and Save & Reload lifecycle

## Context links
- [Overview/preflight](./plan.md#preflight-contract), [UI consumer](./phase-02-matrix-ui-controls.md), [verification](./phase-04-verification-and-release-audit.md).
- [Current architecture](../../docs/architecture.md), [code standards](../../docs/code-standards.md#configuration-and-mode-rules).
- [Transitions](../../src/reporting/control-page/hooks/matrix-document-transitions.ts), [manager](../../src/reporting/control-page/hooks/useConfigManager.ts), [editor](../../src/reporting/control-page/hooks/useConfigDocumentEditor.ts).

## Overview
- Date: 2026-09-30. Priority: P2. Implementation: pending. Review: pending. Verification: pending. Effort: 4h.
- Deliver two bulk transitions and a single user action that saves, then reads and adopts the active file without an intermediate editable/executable window.

## Key Insights
- Matrix currently imports transitions directly and emits `onUpdateDocument`; editor also exposes matrix handlers. Both must use the same pure functions, not competing implementations.
- `saveConfig()` currently adopts PUT document/ETag using `setDocument`; no GET, no replacement revision. `loadConfig()` projects legacy config, uses `replaceDocument`, updates selection URL/storage, catches failures, and returns void.
- Blindly `await reloadConfig()` then showing success is wrong: failure is swallowed, loading can end prematurely, and config identity/response ordering can be stale.
- Selector/matrix disable on config loading; Raw JSON and Workers currently do not. Without closing these edit paths, GET can silently destroy edits made while saving.
- Transition module is currently 192 lines; manager 194. Plan modularization by responsibility to satisfy existing 200-line source limit, not by compressing code.

## Requirements
### Functional
- Add `setProjectJobSelections(document, projectIndex, columnIds: readonly string[]): ProjectConfigDocumentV1`.
- Add `setAllProjectsEnabled(document, enabled: boolean): ProjectConfigDocumentV1`.
- Extend existing matrix handler/editor interfaces with both operations; direct matrix consumer remains supported through its existing document emission API.
- `saveConfig(): Promise<boolean>` returns true only after successful PUT **and** current-operation GET adoption. Keep public load/reload signatures; no callers need a new save method.
- Button label becomes “Save & Reload”; `#btn-save` unchanged. Manual `#btn-reload` still reads external changes without PUT.
### Non-functional
- No mutation, extra persistence fields, automatic execution, background autosave, config-list refetch, retries, or extra dependencies.
- Existing validation, CSRF injection, If-Match conflict behavior, legacy projection, name encoding, and load sequence protection remain authoritative.

## Architecture
### Pure transition contracts
| Operation | Rule |
| --- | --- |
| Row selection | Invalid/nonexistent project index → same document. Normalize requested IDs to unique declared columns in document column order, using existing `DEFAULT_JOB_COLUMN` fallback. Unknown IDs do not enter selection. `[]` clears selection. Blank URLs do not restrict selection. |
| Row no-op | Compare normalized result with stored selection in order; effective absent selection is `[]`. Equal result → same document/project references. Actual edit copies only document, projects array, changed row, and selection array; never mutate caller input. |
| Enabled bulk | For each row compare `project.enabled !== false` with requested value. Preserve unchanged row references and omitted `enabled` when already effectively enabled. Changed rows receive explicit boolean. Empty/all-already-matching → same document; preserve row order and every unrelated field. |
| Dispatch | Existing handlers and matrix each call these functions once, then emit/set dirty only for a changed document reference. Never loop individual checkbox handlers using stale closure state. |

### Save/reload state and ownership
Use manager-owned operation sequence (extend existing `loadSequenceRef`) and an in-flight save ref to prevent duplicate PUTs before React rerender. Capture config name, document, and ETag at save start. A newer load invalidates the older operation; check ownership before every state/banner/URL/storage commit and before clearing busy. Share small fetch/adoption routines with normal load rather than duplicating projection and selection synchronization. Do not initiate the post-save GET using a stale active-config closure.

| Stage/outcome | Observable result |
| --- | --- |
| Missing config/document or invalid draft | false; no PUT/GET; validation feedback retained. |
| Saving | Mark busy before PUT. Keep selector, reload, save, all document editors, dialog saves, worker changes, raw Apply, and run actions unavailable until lifecycle settles. Guard callbacks that could have remained mounted in open dialogs. |
| PUT 409/412 | false; original ETag/document/raw JSON and dirty state retained; conflict feedback; no GET or overwrite. |
| Other PUT/network failure | false; draft retained; existing save-error handling; no automatic retry or GET. |
| PUT succeeds | Read acknowledgement ETag. Start GET for captured filename; do not adopt acknowledgement as a clean replacement or show success yet. Busy stays true. |
| GET succeeds/current | Adopt GET name, ETag, legacy-projected document, raw JSON, validation, clean state, stored selection and URL together through shared load adoption; `replaceDocument` advances revision once. Success message “Configuration saved and reloaded successfully.”; true. |
| PUT succeeds, GET fails | false; distinguish “Configuration saved, but reload failed. Reload to synchronize.” Retain draft/raw JSON, update ETag to acknowledged PUT ETag, leave dirty true and run blocked; no replacement revision. Manual Reload is recovery. If acknowledgement cannot be parsed, do not guess the new ETag; preserve draft and report synchronization failure. |
| Superseded operation | false; do not adopt older name/document/ETag or banner, do not launch wrong-file GET, do not unlock a newer operation. Successful disk write may have happened; never retry it automatically. |

`isConfigLoading` must gate execution in both visual props and Dashboard callback preflight. Do not mark dirty false between PUT and GET. A failed GET cannot be presented as complete success. This is a two-request UI lifecycle, **not** a server transaction: another process can change the file between requests; GET-authoritative state/ETag and existing run If-Match safely represent that state.

## Related code files
Modify:
- `src/reporting/control-page/hooks/matrix-document-transitions.ts` — required bulk functions.
- `src/reporting/control-page/hooks/use-matrix-editor-handlers.ts`, `useConfigDocumentEditor.ts` — typed bulk dispatch.
- `src/reporting/control-page/hooks/useConfigManager.ts` — shared guarded I/O/adoption and save sequencing.
- `src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx` — label only; HeaderBar forwards props and needs no duplicate button/copy.
- `src/reporting/control-page/pages/DashboardPage.tsx` — loading gates for runs, workers/raw controls, defaults/document callbacks.
- `src/reporting/control-page/components/organisms/RawJsonSection.tsx` — optional disabled prop gates textarea and Apply.
- `tests/unit/matrix-document-transitions.spec.ts`, `config-document-editor-groups.spec.ts` — bulk invariants and lifecycle behavior.
Create only where needed:
- `src/reporting/control-page/hooks/matrix-project-draft-transitions.ts` — move existing add/clone project draft functions here, preserving behavior. Update imports in matrix, handlers, and transition tests; no compatibility re-exports. Keep new bulk functions in required original module.
- `src/reporting/control-page/hooks/config-document-io.ts` if manager would exceed 200 lines — stateless config GET/PUT and response-error parsing using injected existing API; lifecycle/state stays manager-owned.
Delete: obsolete Save-only test contract; no unrelated files. Re-read all transition imports before moving functions.

## Implementation Steps
1. Apply overview preflight; inventory transition callers and editable surfaces. Establish immutable function signatures and outcome table before UI wiring.
2. Move existing draft transitions by responsibility if needed for size; migrate direct imports. Add the two pure functions with structural sharing and effective defaults.
3. Add typed handler methods; use reference inequality to mark dirty once. Preserve existing single-target toggle behavior.
4. Refactor shared config fetch/adoption with explicit failure propagation internally; public load/reload remain void. Add sequence ownership and save re-entry protection without introducing a generalized request framework.
5. Implement validate → captured If-Match PUT → captured-name GET → one replacement. Keep busy ownership in outer lifecycle; nested fetch must not toggle loading or clear the success/error banner.
6. Implement the outcome table, including conflict, partial success and stale response handling. Synchronize GET state/URL/storage with normal loads.
7. Pass loading into run disabled state and handler preflight; block raw editing/Apply, worker changes and already-open dialog writes while busy using existing document-update entry points. Keep ordinary non-loading editing unchanged.
8. Rename visible save copy in ConfigSelectorBar only. Keep Reload available after lifecycle settles. Delete/rewrite obsolete Save-only revision test around actual replacement behavior; remove incidental wording assertions instead of re-pinning them.
9. Run targeted behavioral proof described in Phase 04; do not run project-wide validation mid-flight.

## Todo list
- [ ] Implement pure bulk transitions and migrate any extracted draft imports.
- [ ] Extend editor handlers without duplicate mutation logic.
- [ ] Implement ownership-safe save/read/adopt and partial-failure behavior.
- [ ] Close busy-state edit and execution paths; preserve manual reload.
- [ ] Update lifecycle contract coverage; scoped smoke proof recorded.

## Success Criteria
- Row bulk selection/Enabled bulk mutate only intended fields, preserve unchanged references, and emit no update on semantic no-op.
- One Save click produces one PUT then GET; delayed GET keeps controls locked; successful GET state, ETag, raw JSON, dirty flag and selection identity agree.
- Failed writes/conflicts never GET; failed reload is not success; older responses cannot overwrite newer selection or unlock its UI.
- Post-save reload advances revision once, normal edits not at all; ordinary external Reload still works.

## Risk Assessment
- Swallowed read errors or nested loading toggles → explicit internal outcome propagation, one lifecycle owner.
- Applying PUT success before GET → premature clean/run-ready state; adopt clean document only after GET.
- New edits during request → lock all document entry points, not only matrix inputs.
- Extra source size/caller drift → focused extraction, complete import migration; no aliases or duplicated helpers.

## Security Considerations
Use existing same-origin API/CSRF wrapper and If-Match. Keep encoded filenames and server validation. No config secret values, request bodies, hidden Jenkins parameters, or raw credential data in proof artifacts. Never force-write after conflict or auto-trigger report/build.

## Next steps
Phase 02 consumes bulk transitions; Phase 03 consumes busy execution contract. Phase 04 proves adverse outcomes and updates lifecycle docs after implementation smoke.

## Unresolved questions
None.
