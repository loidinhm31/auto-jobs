# Phase 02 — spreadsheet matrix UI components

## Context links

[Plan](./plan.md) · [Architecture/component hierarchy](./architecture-design.md#component-hierarchy-atomic-design) · [Frontend research](./research/researcher-02-frontend-matrix-ui.md) · [Code standards](../../docs/code-standards.md) · [Current Control layout](../../docs/architecture.md#components)

## Overview

- Priority: P2 · Status: Pending · Estimate: 7h.
- Replace **both** `ProjectsGrid`/`ProjectGroupColumn`/`ProjectCard` and `ConfigFormBuilder` with one flat, spreadsheet-style editor. No grouped board, form panel, or extra per-link run-type control remains. Each project appears once, rows map to shared named columns and carry a fixed multiple-selection control.

## Key insights

- `DashboardPage` currently fills separate `projectsSection` and `formBuilderSection`; `DashboardLayout` exposes both slots. Removing only board cards leaves a duplicate project form.
- The old form holds project/default/clone/remove/advanced editing; board holds groups/enabled/run type. Retain advanced/default editing without retaining group controls: legacy group metadata persists invisibly in the document/raw JSON.
- Existing atoms, `ConfigSelectorBar`, `RawJsonSection`, credentials/browser dialogs, run status, and Tailwind responsive styles should be reused; strict CSP precludes unreviewed UI libraries.

## Requirements

1. One semantic table: fixed editable ID and name columns; ordered dynamic header controls (add/rename/remove) shared by all projects; one URL cell per project/column; fixed row-local multi-select of column IDs. Save/Execute/actions remain keyboard usable.
2. Rename header changes label only. Remove populated column only after explicit destructive confirmation listing affected rows; URL cells/selections are removed together via Phase 03 transition. Add initializes blank cells for all rows. Project add/clone/remove, enabled, advanced fields and defaults stay reachable **inside the matrix or compact settings dialogs**, not as a parallel project form. No group-management controls.
3. Keep two explicit `ExecutionSection` buttons: **Generate Reports** (`runType:'report'`) and **Trigger Auto Build** (`runType:'auto-build'`). Both execute the same per-row selected nonblank cells, without a per-link run type or mode picker. Saved Workers bounds both modes; disable both buttons while dirty, invalid, loading, queued/running, or when no executable selected nonblank cell exists. Explain skipped blank selections.
4. Horizontal scroll belongs to matrix; sticky row identity/header where practical; long names and many columns do not force page-wide overflow. Label inputs with project/column, preserve visible focus, row/column association, error text, assistive announcement and usable narrow-screen keyboard navigation.

## Architecture

`DashboardPage -> DashboardLayout[header, one matrix, raw JSON, actions, run status] -> ProjectsJobMatrix -> header/URL/row-selection/settings molecules -> existing atoms`. The matrix receives authoritative document and callbacks, not a parallel `ProjectCardData` copy. Controlled URL inputs can preserve invalid draft text without bypassing shared validation. Store stable column IDs in React keys; project row edits keyed by array index or stable draft identity (ID itself is editable). Keep selection checkboxes in a fixed final column or accessible popover, not separate run-type selectors. Rendering may project legacy V1 via Phase 01 helper once on load; never materialize a synthetic copy per render.

## Related code files

| Action | Path | Planned change |
| --- | --- | --- |
| Create | `src/reporting/control-page/components/organisms/projects-job-matrix.tsx` | Single table composition, toolbar, row rendering; split if reaching 200 LOC. |
| Create | `src/reporting/control-page/components/molecules/job-column-header.tsx`, `project-job-cell.tsx`, `project-job-selection.tsx` | Narrow labeled header, URL cell and multiple-choice controls. |
| Create or modify | `src/reporting/control-page/components/molecules/matrix-row-settings.tsx`, `ConfigDefaultsEditor.tsx` | Existing advanced fields/defaults reachable through matrix settings, not second project form. |
| Modify | `src/reporting/control-page/components/organisms/ExecutionSection.tsx` | Keep two explicit report/build buttons; route both through selected targets with skip/count feedback and saved Workers. |
| Modify | `src/reporting/control-page/components/templates/DashboardLayout.tsx`, `src/reporting/control-page/pages/DashboardPage.tsx`, `src/reporting/control-page/types/component-contracts.ts` | One matrix slot and typed callbacks; remove two old slots and lossy card projection. |
| Modify | `src/reporting/control-page/components/organisms/index.ts`, `components/molecules/index.ts`, `styles/globals.css` | Public exports, scoped grid overflow/focus utilities. |
| Delete after migration | `components/organisms/ProjectsGrid.tsx`, `ProjectCard.tsx`, `project-group-column.tsx`, `project-group-board.tsx`, `ConfigFormBuilder.tsx`, `components/molecules/ConfigProjectEditor.tsx` if no remaining user | Clean cutover, no compatibility aliases. Keep/move useful field controls instead of losing features. |
| Modify | `tests/e2e/control-page.spec.ts`, `tests/unit/control-grouped-project-board.spec.ts`, `tests/unit/clone-project-draft.spec.ts`, `tests/unit/control-atomic-components.spec.ts` | Replace obsolete board/form snapshots/contracts with behavior-focused matrix coverage. |

## Implementation steps

1. Inventory imports of removed components and map old actions to matrix (column CRUD, ID/name/URL, row enable/advanced/clone/delete, defaults, raw JSON, Workers, secrets). Confirm all advanced/default settings remain reachable; legacy group metadata remains in raw JSON only.
2. Build header and cell controls with existing atoms; use `<th scope="col">`, `<th scope="row">`, associated labels/`aria-describedby`, stable IDs from row index/column ID. Add bounded rename input and explicit remove confirmation; preserve keyboard access and focus after column edits.
3. Build flat matrix organism. Use `table-layout` or natural columns plus `min-width` per job column, `overflow-x:auto` at matrix container; prevent main page horizontal scrolling. Render one row per project even when group metadata exists; do not expose group membership controls. Show validation errors near offending row/cell and global Save banner.
4. Rehouse `ConfigProjectEditor` advanced fields and defaults in compact settings/dialogs; keep login URL, enabled, `waitForCompletion`, browser, selectors, credential references, timeouts, origins, sources and artifactDir editable. Preserve clone semantics through existing `clone-project-draft` utility, including ungrouped/disabled copy; no dual project form. Root `projectGroups` and row `groupId` remain in saved JSON without UI controls.
5. Replace two layout slots with one; remove `projectsData` derivation/board/form props in `DashboardPage`. Connect UI only to Phase 03 transitions. Preserve old `runType` in the saved document for legacy consumers, but do not expose a per-link run-type control or alter it when either run button is clicked.
6. Keep both action buttons; wire Generate Reports to `runType:'report'` and Trigger Auto Build to `runType:'auto-build'`, each with the selected coordinate IDs via Phase 04. Guard empty/dirty/invalid/running state; server still enforces gates. Keep report run status, logs and report links accessible and display column identity in outcome rows.
7. Remove obsolete components/exports/tests only after equivalent UI and settings are usable. Verify actual Chromium/WebKit viewport, 50 rows, many columns, long names, zoom, keyboard navigation, screen-reader labels and `axe` on matrix and dialogs.

## Todo list

- [ ] Single shared-heading table with editable row ID/name and URL cells.
- [ ] Add/rename/remove headings and row-specific multiple-column selector.
- [ ] Project add/clone/remove and advanced/default editing retained without form panel; no group-management UI.
- [ ] Two explicit report/build actions, saved worker count, blank skip feedback and outcome identity.
- [ ] Board/form components and duplicate layout slots fully removed; actual browser inspection.

## Success criteria

- Both old project surfaces are absent from DOM and exports; one project row per document project, dynamic headers appear for all rows and cell edits do not affect sibling URL cells.
- Two column checkboxes on one row may be selected while another row differs. Save/reload displays same choices; both explicit action buttons dispatch the expected request mode and same selected coordinates; blanks are visibly identified as skipped.
- Project and defaults advanced settings, clone and credential access remain operable; group metadata persists invisibly through Save. Keyboard and narrow viewport tests show no inaccessible scroll/focus behavior.

## Risk assessment

- **Feature regression from deleted form:** use old form field inventory and browser acceptance matrix before removal; move fields into matrix settings, never erase persisted fields.
- **Wide-table overflow/label ambiguity:** test 50×50 boundary, scroll containment, sticky header/focus and accessible coordinate labels in a real browser.
- **Changing row IDs breaks ID-keyed event handlers:** use index/stable internal row identity and collision validation from Phase 03.

## Security considerations

- URL input labels and links must never include secret values or credential-bearing URLs. Safe links use existing URL policy and `rel="noopener noreferrer"` for external navigation. React text interpolation, not unsafe HTML. UI validation is advisory; server validates saved cells and selected execution targets. Keep CSRF in shared API client.

## Next steps

- Integrate with Phase 03's immutable transitions and Phase 04's target request/provenance. Phase 05 performs e2e UX and accessibility proof and removes stale snapshots/docs.

## Real remaining decisions

- No blocking product choice; choose fixed always-visible checkbox group vs compact popover by actual 50-column/keyboard evidence, keeping a fixed per-row selection control either way.
