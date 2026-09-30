# Phase 02 — Matrix UI controls

## Context links
- [Overview/preflight](./plan.md#preflight-contract), [pure transitions](./phase-01-pure-transitions-and-save-reload-lifecycle.md#architecture), [verification](./phase-04-verification-and-release-audit.md).
- [Matrix](../../src/reporting/control-page/components/organisms/projects-job-matrix.tsx), [row](../../src/reporting/control-page/components/organisms/matrix-row.tsx), [selection](../../src/reporting/control-page/components/molecules/project-job-selection.tsx), [toolbar](../../src/reporting/control-page/components/organisms/matrix-toolbar.tsx).

## Overview
- Date: 2026-09-30. Priority: P2. Implementation: pending. Review: pending. Verification: pending. Effort: 2h.
- Add reversible ID visibility and two distinct bulk-selection scopes: targets within one row, Enabled across all project rows.
- Depends on Phase 01 immutable transitions; no network or persistence behavior belongs in these controls.

## Key Insights
- ID `<th>` lives in ProjectsJobMatrix; `idCell` lives in MatrixRow. Both need the same flag to keep table alignment.
- ProjectJobSelection allows blank URLs and shows an “empty” skip hint. All must match those existing checkboxes, not filter blanks or infer a run mode.
- Rows treat omitted `enabled` as true. Master state must use the identical predicate, not Boolean(project.enabled).
- Existing Checkbox forwards native ref but has no indeterminate prop. Use native input and a narrow ref/effect; do not broaden the atom API for one matrix-only requirement.
- Matrix is near 200 lines; keeping the tri-state header in a focused component is justified if needed, not a new bulk-selection framework.

## Requirements
### Functional
1. Matrix owns `isIdColumnHidden`, initially false/visible; toolbar exposes a labeled “Show ID column” checkbox `#checkbox-show-id-column`, checked when IDs are visible. It calls the local state setter only.
2. Conditionally render ID header and row `idCell`; keep IDs and validation in the document. Hiding removes those inputs from keyboard order, not merely CSS visibility.
3. Row quick actions read “All” and “None”, IDs `#btn-select-all-targets-${projectId}` and `#btn-deselect-all-targets-${projectId}`; accessible names include target scope and project name.
4. All sends declared column IDs in order; None sends `[]` once via `onSetSelections`. Keep individual toggle functionality and blank skip hints.
5. Master `#checkbox-enabled-all` stays within Enabled `<th scope="col">`; accessible name “Enable all projects”; mixed, checked, unchecked states reflect all rows, not selected execution targets.
6. Master checked only for nonempty all-enabled rows, indeterminate for a nonzero strict subset, otherwise unchecked. Zero rows disables it. Checked click disables all; mixed/unchecked click enables all.
### Non-functional
- Disabled matrix means disabled bulk mutations. Optional ID view toggle can remain usable while busy because it is presentation-only.
- No localStorage, URL parameter, config field, schema change, filter scope, confirmation dialog, or background save.
- One document emission per changing bulk action; no-op produces none. No enabling a row when selecting targets or clearing targets when disabling rows.

## Architecture
- `ProjectsJobMatrix` → `MatrixToolbar`: `isIdColumnHidden`, `onIdColumnHiddenChange(hidden)`; toolbar checked state maps to `!isIdColumnHidden`.
- `ProjectsJobMatrix` → each `MatrixRow`: same `isIdColumnHidden` plus `onSetSelections(columnIds)`; default false in MatrixRow preserves other consumers.
- `MatrixRow` → `ProjectJobSelection`: `onSetSelections(columnIds)`; row All/None use one callback, not N individual toggles. Matrix calls Phase 01 transition for row index and emits only changed document.
- Matrix derives enabled count each render using `enabled !== false`; header controls call `setAllProjectsEnabled(document, event.target.checked)` once.
- Native master checkbox uses `.indeterminate = mixed` via ref/effect every time derived state changes, including updates after raw Apply/load/row toggles; `aria-checked` conveys mixed or boolean. Declare hooks before any null-document return, or put them in the focused header component.
- Keep visibility for the lifetime of mounted ProjectsJobMatrix, including document reload/switch; full component/page remount resets to visible. It is not dirty-document state.
- Keep hidden ID validation discoverable through existing global invalid/config feedback; toolbar permits showing IDs even if inputs are disabled. Do not silently change visibility to resolve errors.

## Related code files
Modify:
- `src/reporting/control-page/components/organisms/projects-job-matrix.tsx` — local visibility, master state, bulk transitions, reference-gated emission.
- `src/reporting/control-page/components/organisms/matrix-toolbar.tsx` — controlled visibility checkbox.
- `src/reporting/control-page/components/organisms/matrix-row.tsx` — conditional ID cell and selection callback.
- `src/reporting/control-page/components/molecules/project-job-selection.tsx` — All/None controls and contextual accessibility.
- `tests/unit/control-matrix-components.spec.ts` — update affected typed consumer fixtures; no new static-string/wiring tests.
- `tests/e2e/control-page.spec.ts` — actual interaction regressions for consumer-visible state boundaries.
Create only if size separation needed:
- `src/reporting/control-page/components/molecules/matrix-enabled-header.tsx` — focused tri-state native checkbox and Enabled label. Existing matrix composition remains the owner of document mutation.
Delete: none; no old checkbox IDs or target selection paths removed.

## Implementation Steps
1. Re-read Phase 01 transitions and component props. Add `isIdColumnHidden` above matrix null guard and controlled toolbar props; add matching row prop.
2. Render one labeled visibility checkbox. Guard both ID header and ID cell using the same flag; preserve Name, job, Targets and Actions order and table scroll wrapper.
3. Add typed bulk-selection callback through row to selection. All calls `columns.map(column => column.id)`; None calls `[]`. Use type="button", stable IDs, contextual aria-labels, existing Tailwind/button conventions.
4. Disable All when disabled/no columns/already all declared columns selected; None when disabled/no selection. This prevents redundant user actions, while transition reference checks remain authoritative. Keep All/None available for disabled project rows when the overall matrix is editable, just like individual targets.
5. Compute Enabled totals with effective true defaults. Place master beside Enabled text, not in a new first column; set native indeterminate and accessible mixed state. Disable on busy/no rows.
6. Send bulk operations through Phase 01 transitions once and emit only changed documents. Preserve optional external consumer behavior; update affected type-required callback fixtures.
7. Exercise keyboard, mixed→all→none, individual toggle after bulk, hidden IDs with edit/save/reload, and blank target hints in actual browser; Phase 04 defines permanent boundary coverage.

## Todo list
- [ ] Add local ID toggle and matching header/cell visibility.
- [ ] Add row All/None with immutable single-emission callbacks.
- [ ] Add effective-default tri-state Enabled master and zero-row behavior.
- [ ] Preserve existing selectors, skip hints, focus behavior and busy mutation locks.
- [ ] Record actual interaction and accessibility proof.

## Success Criteria
- ID column starts visible; hide removes exactly its header and cells; show restores unchanged values and error indications. Toggle alone never enables Save or sends HTTP.
- All checks every declared target including blank cells only for that row; None clears only that row. Enablement, URLs and other projects remain unchanged.
- Master reflects omitted Enabled, per-row edits and config replacement correctly; mixed click enables all; checked click disables all; zero rows stays unchecked/disabled.
- Header/cell alignment and horizontal scroll survive both visibility states; all controls keyboard-operable and context-labeled.
- Busy save/load cannot change bulk document state. Multiple quick target changes cannot lose prior selected IDs through stale per-checkbox loops.

## Risk Assessment
- Misaligned header/body → single shared flag and semantic table/browser verification.
- Empty-array every() incorrectly checked → require rows.length > 0 explicitly.
- Indeterminate is DOM property, not HTML attribute → real browser proof; static render insufficient.
- Duplicate/invalid project IDs can exist in invalid drafts → keep existing index-based transition addressing; do not add unrelated ID-validation scope. Tests use valid unique IDs and confirm hidden validation does not enable saving.
- Large matrix width → retain existing bounded scroll; no virtualization/new grid package for current limits.

## Security Considerations
Visibility is not access control: IDs remain in model/DOM labels where needed. React escaping and existing ID validation remain. Bulk UI alters config intent only; never submits Jenkins requests or expands enabled-only execution rules.

## Next steps
Phase 03 relocates execution without changing target semantics. Phase 04 combines matrix actions with save/reload and external reload proof.

## Unresolved questions
None.
