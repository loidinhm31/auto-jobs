# Phase 03 — Dashboard layout and Execute Actions

## Context links
- [Overview/IDs](./plan.md#preflight-contract), [busy lifecycle](./phase-01-pure-transitions-and-save-reload-lifecycle.md), [verification](./phase-04-verification-and-release-audit.md).
- [DashboardLayout](../../src/reporting/control-page/components/templates/DashboardLayout.tsx), [DashboardPage](../../src/reporting/control-page/pages/DashboardPage.tsx), [ExecutionSection](../../src/reporting/control-page/components/organisms/ExecutionSection.tsx), [layout contracts](../../src/reporting/control-page/types/component-contracts.ts).
- [Architecture](../../docs/architecture.md#components), [code standards](../../docs/code-standards.md).

## Overview
- Date: 2026-09-30. Priority: P2. Implementation: pending. Review: pending. Verification: pending. Effort: 1h.
- Place the existing Execute Actions region top-right, above the matrix. Maintain semantic regions, responsive order, all execution behavior and existing slot contract.
- Layout work can proceed independently once Phase 01 busy prop/preflight contract is fixed; integration precedes Phase 04.

## Key Insights
- Actions currently render after raw JSON; matrix and actions wrappers are owned by DashboardLayout, not ExecutionSection.
- Existing `actionsSection` slot already contains ExecutionSection; moving its wrapper is sufficient. Do not move execution ownership to matrix or duplicate the slot.
- ExecutionSection includes two distinct action buttons, saved Workers selector, selected-target count, blank-cell count, and no-target feedback. Relocation must move the entire surface, not only buttons.
- Current 1200px container and action row wrapping can accommodate responsive layout; no absolute positioning, fixed overlay or design-system replacement needed.

## Requirements
### Functional
- Keep `#section-matrix` labeled by `#heading-matrix` and `#section-actions` labeled by `#heading-actions`; heading text remains recognizable.
- At wide viewport, matrix heading at left and Execute Actions region right in a shared header band above `#projects-job-matrix`.
- At narrow viewport, header band stacks: matrix heading → Execute Actions → matrix toolbar/table. Actions remain above matrix, visible and outside horizontal table scroll.
- Render action slot exactly once; remove old below-editor placement. Preserve all button/worker/feedback IDs and handlers.
- Keep actions visible/semantically labeled even when no config loaded; existing disabled/empty behavior remains. Preserve layout's no-matrix slot path with a standalone actions region rather than losing it.
### Non-functional
- No new execution logic, auto-run, extra confirmation, sticky/floating controls, mode inference or changing worker count semantics.
- Keep skip link/main landmark, banners, raw editor, recent run and dialogs in their existing roles.
- Busy config save/reload joins existing dirty/invalid/no-target/run-in-progress gates from Phase 01; clean load state never permits premature execution.

## Architecture
Compose one reusable local `actionsRegion` React element with stable section/heading IDs. For the matrix path, place it inside the matrix section's header `div` alongside heading-matrix using responsive flex/grid: stacked by default, row layout and right alignment at a breakpoint that fits full actions. Render `matrixSection` after that band. A semantic section inside another section is valid; actions keeps its own accessible name.

Avoid duplicate `max-width/mx-auto/px` wrappers in the nested actions region; the matrix section already owns page alignment. Use contextual Tailwind classes for the standalone/no-matrix path. Build the element once, place once. Matrix/table overflow remains on matrix's scroll wrapper, never on actions.

DashboardPage still supplies all slots and owns target counting/trigger handlers. ExecutionSection remains a pure display/control component; do not add ID-visibility or master-checkbox concerns here. `actionsSection` can be any ReactNode, so keep the template slot generic rather than importing ExecutionSection directly.

## Related code files
Modify:
- `src/reporting/control-page/components/templates/DashboardLayout.tsx` — action region relocation and responsive composition.
- `src/reporting/control-page/pages/DashboardPage.tsx` — Phase 01 loading integration only; no duplicate layout responsibility.
- `src/reporting/control-page/components/organisms/ExecutionSection.tsx` only if necessary for contextual right alignment via existing `className`; preserve logic and contract.
- `tests/e2e/control-page.spec.ts` — browser relative-position, accessibility, and unchanged execution/worker behavior coverage.
Intentionally unchanged:
- `src/reporting/control-page/types/component-contracts.ts` — current slots suffice unless implementation proves otherwise.
- `src/reporting/control-page/styles/globals.css` — use existing Tailwind utilities first.
Create/delete: no new production module or obsolete execution path.

## Implementation Steps
1. Inventory all DashboardLayout consumers and slot expectations; keep legacy no-matrix behavior unless current usage confirms obsolete scope.
2. Build actions wrapper once with existing section/heading IDs and accessible label association.
3. Inside matrix wrapper add responsive header band containing matrix heading and actions region, followed by matrix slot. Remove previous unconditional below-editor actions insertion; render standalone region only when matrix absent.
4. Preserve banners before main working region, raw editor after matrix, recent run after editor, and dialogs outside main section list. Keep React keys stable.
5. Verify full Execute Actions surface fits intended wide breakpoint and wraps cleanly on small screens; no clipped controls or feedback, no table scroll moving action buttons.
6. Exercise reports/build as distinct user actions and worker changes via existing Dashboard callbacks; verify Phase 01 busy gates without adding save-and-run behavior.

## Todo list
- [ ] Relocate single labeled actions region into responsive matrix header band.
- [ ] Preserve all required locator IDs and standalone/no-matrix slot behavior.
- [ ] Confirm feedback/Workers move with buttons; no execution logic migration.
- [ ] Capture wide/narrow visual and keyboard/accessibility proof.

## Success Criteria
- Wide viewport: actions visibly above matrix and aligned to header's right; matrix heading still readable at left.
- Narrow viewport: actions stack above matrix and remain reachable without table horizontal scrolling.
- Required IDs appear once; aria-labelledby references valid visible headings; keyboard DOM order agrees with visual order.
- Dirty/invalid/no-target/loading states still block runs; external manual reload and valid save/reload restore correct readiness.
- Generate Reports and Trigger Auto Build remain separate operations; Workers still edits saved config, selected/blank feedback unchanged.

## Risk Assessment
- Duplicate action region/IDs → construct once and use mutually exclusive placement.
- CSS visual reorder vs keyboard order → real DOM relocation; no `order`-only swap.
- Nested padding/long action labels → remove redundant container padding, flexible wrapping, desktop and mobile screenshots.
- Accidental reroute of execution or new save-run coupling → slot-only relocation, existing handler ownership retained.

## Security Considerations
Do not expand request permissions, server origins or auto-build availability. Relocation is presentation-only; preserve existing ETag, enabled-only and explicit-mode execution checks. Browser proof uses local fixture executors, never live Jenkins.

## Next steps
Phase 04 audits unique IDs/landmarks, screenshots and state-dependent execution after all three implementation phases integrate.

## Unresolved questions
None.
