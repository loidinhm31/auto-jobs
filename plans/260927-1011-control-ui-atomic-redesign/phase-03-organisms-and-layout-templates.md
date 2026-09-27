# Phase 03: Organisms & Layout Templates

## Context Links
- Parent Plan: [Implementation Plan](./plan.md)
- Access Overview: [cmd-plan.md](./cmd-plan.md)
- Prior Phases: [Phase 01: Atoms](./phase-01-design-system-tokens-and-atoms.md) · [Phase 02: Molecules](./phase-02-molecules-and-form-composition.md)
- Architecture Design: [Architecture Design](./architecture-design.md)
- Research Reports: [Atomic Structure](./research/researcher-01-atomic-structure.md) · [Contracts & A11y](./research/researcher-02-contracts-and-a11y.md)
- Codebase Standards: [docs/code-standards.md](../../docs/code-standards.md) · [docs/codebase-summary.md](../../docs/codebase-summary.md)

## Overview
- Date: 2026-09-27
- Description: Restructure organisms into cohesive domain sections, modernize project cards, group columns, and execution panels, and introduce dedicated layout templates (`DashboardLayout`, `ReportManagementLayout`, `FinalReportLayout`) in `components/templates/`.
- Priority: P2
- Implementation Status: **DONE (100%)**
- Review Status: Approved (Score: 9.5/10)
- Completed: 2026-09-27

## Key Insights
- Layout markup is currently mixed into page containers (`ReportManagementPage` and `final-project-report-page` have inline `header`, `skip-link`, `main`), violating Atomic Design template separation.
- `ProjectCard` benefits from using the new `Checkbox` atom, atom `Badge`, and molecule `FormField`, resulting in a cleaner, more readable card.
- Organisms like `ExecutionSection`, `RunStatusCard`, `RawJsonSection`, and `ConfigFormBuilder` can leverage the compound `Card` atom to replace duplicate outer shell styling.
- Layout templates define the responsive page skeleton, max-width containers, skip navigation, and layout grid, leaving zero styling burden on page files.
- Validation Confirmed: Keep Project Groups Board strictly contained within the centered 1200px max-width container with internal horizontal scrolling in `#projects-list`, build all dialogs on Radix UI Dialog primitives with keyboard focus traps, and apply selective Lucide icons.
## Requirements
- Functional:
  - Refactor `HeaderBar` to use `PageHeader` and `ConfigSelectorBar`.
  - Refactor `ProjectCard` with modern compact styling, subtle card borders, status badges, and preserved IDs (`#checkbox-enabled-*`, `#select-runtype-*`).
  - Refactor `ProjectGroupColumn` and `ProjectGroupBoard` to support a contained 1200px board layout with smooth internal horizontal scrolling in `#projects-list` and independent vertical column scrolling.
  - Refactor `RawJsonSection` with modern code-editor container, status pill, and apply button.
  - Refactor `ExecutionSection` with modern action toolbar, Workers select, and dirty-state indicators.
  - Refactor `RunStatusCard` with modern status pill, tabs/split view for logs and results.
  - Refactor dialogs (`CredentialsDialog`, `BrowserSettingsDialog`, group dialogs, delete confirmation dialogs) using Radix UI primitives with full keyboard focus trapping.
  - Refactor `DashboardLayout` and create `ReportManagementLayout` and `FinalReportLayout` in `components/templates/`.
- Non-Functional:
  - 100% preservation of all E2E test IDs, roles, and ARIA attributes.
  - Responsive layout: fluid grid scaling smoothly from 1280px desktop down to 375px mobile without horizontal window scroll.

## Architecture
Templates define structural page layouts; organisms provide feature sections:

```
components/
├── organisms/
│   ├── HeaderBar.tsx
│   ├── ProjectCard.tsx
│   ├── project-group-column.tsx
│   ├── project-group-board.tsx
│   ├── ProjectsGrid.tsx
│   ├── ConfigFormBuilder.tsx
│   ├── RawJsonSection.tsx
│   ├── ExecutionSection.tsx
│   ├── RunStatusCard.tsx
│   ├── ProjectReportHistoryCard.tsx
│   ├── CredentialsDialog.tsx
│   ├── BrowserSettingsDialog.tsx
│   ├── project-group-dialog-*.tsx
│   ├── DeleteReportsConfirmationDialog.tsx
│   ├── DeleteRunConfirmationDialog.tsx
│   └── index.ts
└── templates/
    ├── DashboardLayout.tsx          # Dashboard page template
    ├── ReportManagementLayout.tsx   # Report index & history template
    ├── FinalReportLayout.tsx        # Final report viewer template
    └── index.ts                     # Template facade
```

## Related Code Files
- Modify:
  - `src/reporting/control-page/components/organisms/HeaderBar.tsx`
  - `src/reporting/control-page/components/organisms/ProjectCard.tsx`
  - `src/reporting/control-page/components/organisms/project-group-column.tsx`
  - `src/reporting/control-page/components/organisms/project-group-board.tsx`
  - `src/reporting/control-page/components/organisms/ProjectsGrid.tsx`
  - `src/reporting/control-page/components/organisms/ConfigFormBuilder.tsx`
  - `src/reporting/control-page/components/organisms/RawJsonSection.tsx`
  - `src/reporting/control-page/components/organisms/ExecutionSection.tsx`
  - `src/reporting/control-page/components/organisms/RunStatusCard.tsx`
  - `src/reporting/control-page/components/organisms/ProjectReportHistoryCard.tsx`
  - `src/reporting/control-page/components/organisms/CredentialsDialog.tsx`
  - `src/reporting/control-page/components/organisms/BrowserSettingsDialog.tsx`
  - `src/reporting/control-page/components/templates/DashboardLayout.tsx`
  - `src/reporting/control-page/types/component-contracts.ts`
- Create:
  - `src/reporting/control-page/components/templates/ReportManagementLayout.tsx`
  - `src/reporting/control-page/components/templates/FinalReportLayout.tsx`
  - `src/reporting/control-page/components/templates/index.ts`

## Implementation Steps
1. Refactor `ProjectCard.tsx` using atom `Checkbox`, `Badge`, `Card`, and preserved IDs.
2. Refactor `project-group-column.tsx` and `project-group-board.tsx` for clean column cards, scroll mechanics, and group action menus.
3. Modernize `ConfigFormBuilder.tsx` and `RawJsonSection.tsx` with compound `Card` components and clean responsive grids.
4. Refactor `ExecutionSection.tsx` and `RunStatusCard.tsx` with modern card styling and status badges.
5. Modernize modal dialogs (`CredentialsDialog`, `BrowserSettingsDialog`, `DeleteConfirmationDialogs`) ensuring strict focus trap and accessible backdrop.
6. Refactor `DashboardLayout.tsx` to provide standard slots for header, banner, project board, editor grid, execution actions, and run status.
7. Create `ReportManagementLayout.tsx` with slots for header, feedback banner, search/filter, project history list, and deletion dialogs.
8. Create `FinalReportLayout.tsx` with slots for header toolbar, status banner, report container, and PDF export action.
9. Create `components/templates/index.ts` exporting all layout templates.
10. Verify TypeScript compilation and Vite build.

## Todo List
- [x] Modernize `ProjectCard.tsx` and preserve interactive IDs
- [x] Modernize `project-group-column.tsx` and `project-group-board.tsx` with contained 1200px horizontal scroll
- [x] Modernize `ConfigFormBuilder.tsx` and `RawJsonSection.tsx`
- [x] Modernize `ExecutionSection.tsx` and `RunStatusCard.tsx` with selective Lucide action icons
- [x] Modernize modal dialogs with Radix UI Dialog focus trap and escape dismissal
- [x] Refactor `DashboardLayout.tsx` enforcing max-w-[1200px] alignment
- [x] Create `ReportManagementLayout.tsx`
- [x] Create `FinalReportLayout.tsx`
- [x] Create `components/templates/index.ts`
- [x] Verify build and typecheck

## Success Criteria
- Organisms cleanly assemble atoms and molecules using modern styling.
- All 3 page layout templates are fully extracted and documented.
- Responsive layout handles viewports from 1280px to 375px without horizontal window scroll.
- Zero DOM ID or ARIA attribute regressions.

## Risk Assessment
- Risk: Modal dialog accessibility violations (Axe modal trap check).
  - Mitigation: Ensure Radix Dialog primitives properly manage focus, aria-modal="true", and document title.
- Risk: Group board horizontal scroll breaking page-level responsive overflow checks.
  - Mitigation: Confine horizontal scroll to `#projects-list` container while `#main-content` remains strictly non-overflowing.

## Security Considerations
- Dialog inputs retain password masking and zero leakage.
- Strict CSP compliance maintained (no inline scripts or style attributes).

## Next Steps
- Proceed to [Phase 04: Page Integration & Verification](./phase-04-page-integration-and-verification.md) to wire pages into templates and execute full verification.
