# Phase 02 — Compact grouped project board

## Context links

[Parent plan](./plan.md) · [Architecture](./architecture-design.md) · [Dependency: Phase 01](./phase-01-group-schema-and-document-state.md)

## Overview

Date: 2026-09-26. Priority P2. Implementation pending; review pending. Compact cards, editable membership, nested scroll layout.

## Key Insights

Current ProjectsGrid uses responsive 1/2/3-column CSS grid; ProjectCard uses spacious separate field rows. DashboardLayout limits content to 1200px. Keep that page containment; horizontal overflow belongs to the board, not the whole page.

## Requirements

Create group then choose projects; each project shown once. Always render Ungrouped first. Independent vertical scroll per group and horizontal scroll across non-wrapping columns. Preserve enabled/run type/job link, accessibility, raw JSON, and global Save semantics.

## Architecture

ProjectsGrid remains composition owner; group-column component renders header and separate scroll list; group-editor-dialog owns local name/checklist input only. Shared membership remains exclusively in currentDoc. Use existing Radix dialog and Button/Input/Select patterns, not a second component framework.

## Related code files

Modify:
- `src/reporting/control-page/components/organisms/ProjectsGrid.tsx`: grouped board, toolbar, dialog orchestration.
- `src/reporting/control-page/components/organisms/ProjectCard.tsx`: compact card, preserve callbacks/IDs and safe link behavior.
- `src/reporting/control-page/pages/DashboardPage.tsx`: pass metadata/actions and replacement revision; disable editing while loading.
- `src/reporting/control-page/types/component-contracts.ts`: add optional membership to projected card data if needed.
- `src/reporting/control-page/components/templates/DashboardLayout.tsx`: minimum-width/overflow containment only where needed.
- `src/reporting/control-page/styles/globals.css`: scoped board rules only if Tailwind classes cannot express the layout clearly.

Create:
- `src/reporting/control-page/components/organisms/project-group-column.tsx`.
- `src/reporting/control-page/components/organisms/project-group-editor-dialog.tsx`.

No new export barrel required for private components. Reuse existing organisms exported names.

## Implementation Steps

1. Build group buckets in one pass using Map; Ungrouped plus root group order. Preserve project order within each bucket. Unknown membership in an invalid form draft displays in Ungrouped with validation retained, never disappears.
2. Compact card into identity, one wrapping controls row, and job-link row. Reduced spacing; full name/ID accessible at keyboard focus, truncation must not conceal controls. Do not reduce all global input/button sizes or reintroduce per-card run actions.
3. Create horizontal flex board with no wrap and contained overflow. Fixed-width, nonshrinking columns; bounded vertical lists with nonshrinking cards; headers/actions outside vertical lists. Empty groups and Ungrouped show clear empty state.
4. New Group dialog submits name to shared document, then opens target membership checklist. The empty group remains valid even if subsequent membership selection is cancelled. State clearly that global Save persists changes.
5. Manage Projects lists all active-document projects with current group labels and target membership checked. Apply atomically moves selections; Cancel changes nothing. Add minimal rename and confirmation-gated delete-to-Ungrouped management using same shared transitions.
6. Reset local dialogs on replacement revision, not ordinary group/project edits. Do not apply stale selections to another config; recheck target and project identities before commit.
7. Keyboard: labelled controls, focus-trapped dialogs, Escape cancel, focus return, named focusable scroll regions and visible outlines. Native scroll behavior; no mouse-only assignment or drag/drop.
8. Preserve unchanged consumers and update only selectors tied to the changed UI contract. Capture browser proof in Phase 04.

## Todo list

- [ ] Compact cards preserve behavior.
- [ ] Group columns and contained two-axis scrolling.
- [ ] Create/select/move/ungroup/rename/delete flows.
- [ ] Replacement reset and keyboard interaction.

## Success Criteria

Each configured project appears once; all projects reachable at 50 items and many groups. Scrolling one group leaves neighbor scroll position unchanged. Board scroll reveals offscreen groups without page horizontal overflow. Save/reload preserves grouping; enabled/run-type edits still synchronize raw JSON and gate runs.

## Risk Assessment

Nested flex minimum sizing can defeat scroll; specify min-width/min-height and nonshrinking cards. Long names/URLs can expand columns; use wrapping/truncation with accessible full text. Last-group deletion and empty-list states must stay usable.

## Security Considerations

Render labels as React text. Group deletion only edits metadata; never call report deletion endpoints. Membership changes cannot enable projects or trigger execution.

## Next steps

Integrate clone draft in Phase 03; verify actual Chromium/WebKit desktop/mobile/zoom surfaces in Phase 04.

## Unresolved questions

None. Initial column width/height values in architecture-design.md are adjustable after visual proof.
