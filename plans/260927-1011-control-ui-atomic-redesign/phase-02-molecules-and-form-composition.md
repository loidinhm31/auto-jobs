# Phase 02: Molecules & Form Composition

## Context Links
- Parent Plan: [Implementation Plan](./plan.md)
- Access Overview: [cmd-plan.md](./cmd-plan.md)
- Prior Phase: [Phase 01: Design System Tokens & Base Atoms](./phase-01-design-system-tokens-and-atoms.md)
- Architecture Design: [Architecture Design](./architecture-design.md)
- Research Reports: [Atomic Structure](./research/researcher-01-atomic-structure.md) · [Contracts & A11y](./research/researcher-02-contracts-and-a11y.md)
- Codebase Standards: [docs/code-standards.md](../../docs/code-standards.md) · [docs/codebase-summary.md](../../docs/codebase-summary.md)

## Overview
- Date: 2026-09-27
- Description: Refactor and standardize composite UI molecules in `components/molecules/`, introducing reusable `FormField` and `PageHeader` molecules, and modernizing existing rows, tables, viewers, and action bars.
- Priority: P2
- Implementation Status: DONE (100%)
- Review Status: Approved (Score: 9.5/10)
- Completed: 2026-09-27

## Key Insights
- Current form fields interweave label, input, and error logic inside atoms or inline in organisms, creating duplication.
- Header bars across `DashboardPage`, `ReportManagementPage`, and `final-project-report-page` duplicate title, navigation links, and action layouts.
- Key molecules (`ConfigSelectorBar`, `CredentialRow`, `BrowserSettingRow`, `LogViewer`, `RunResultBox`, `BuildProjectOutcomeRow`, `ProjectRunsTable`, `ReportExportButton`) contain critical E2E test IDs and classes that must remain untouched while updating their aesthetics.
- Validation Confirmed: Apply selective high-utility Lucide icons (copy, export, external link, clear, modal close, reload), integrate Radix UI headless slot composition, and maintain strict WCAG AA 4.5:1 contrast across all molecule labels, helper text, and error states.
## Requirements
- Functional:
  - Create `FormField` molecule composing label, required asterisk, atom input/select, helper text, and accessible error message (`role="alert"`).
  - Create `PageHeader` molecule composing title, back navigation link, status badges, and action button slot.
  - Refactor `ConfigSelectorBar` with sleek button groups, active config indicator, selective Lucide icons, and modal triggers (`#btn-reload`, `#btn-save`, `#btn-credentials`, `#btn-browser-settings`).
  - Refactor `CredentialRow` and `BrowserSettingRow` with modern card/row styling, clear action icons, preserving `#secret-input-*` and `#badge-browser-*` IDs.
  - Refactor `LogViewer` with dark terminal theme, clear monospace typography, autoscroll anchor, and selective copy-logs Lucide icon action.
  - Refactor `RunResultBox` and `BuildProjectOutcomeRow` with clear visual status indicators and clean links.
  - Refactor `ProjectRunsTable` and `ReportExportButton` with modern table borders, responsive controls, and Lucide download icon with progress state.
- Non-Functional:
  - Retain all test selectors (`.credential-row`, `.btn-clear-credential`, `#browser-headless-select`, etc.).
  - Preserve zero-leakage security invariants for credential inputs (type="password", no value logging).

## Architecture
Molecules assemble atoms into cohesive, reusable functional units:

```
components/molecules/
├── FormField.tsx               # Label + Input/Select + Error + Helper
├── PageHeader.tsx              # Title + Breadcrumb/Back-link + Action slot
├── ConfigSelectorBar.tsx       # Active config selector + action buttons
├── CredentialRow.tsx           # Credential key + status badge + password input + clear
├── BrowserSettingRow.tsx       # Setting key + badge + control + clear
├── LogViewer.tsx               # Monospace terminal logs with autoscroll
├── RunResultBox.tsx            # Run outcome summary + links container
├── BuildProjectOutcomeRow.tsx  # Auto-build stage view status item
├── ConfigProjectEditor.tsx     # Project editor fields grid
├── ConfigDefaultsEditor.tsx    # Collapsible defaults editor
├── ProjectRunsTable.tsx        # Paginated runs table with delete actions
├── ProjectReportStatusView.tsx # Loading/empty/error state display
├── ReportExportButton.tsx      # Accessible PDF export toolbar trigger
└── index.ts                    # Clean facade re-export
```

## Related Code Files
- Modify:
  - `src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx`
  - `src/reporting/control-page/components/molecules/CredentialRow.tsx`
  - `src/reporting/control-page/components/molecules/BrowserSettingRow.tsx`
  - `src/reporting/control-page/components/molecules/LogViewer.tsx`
  - `src/reporting/control-page/components/molecules/RunResultBox.tsx`
  - `src/reporting/control-page/components/molecules/build-project-outcome-row.tsx`
  - `src/reporting/control-page/components/molecules/ConfigProjectEditor.tsx`
  - `src/reporting/control-page/components/molecules/ConfigDefaultsEditor.tsx`
  - `src/reporting/control-page/components/molecules/project-runs-table.tsx`
  - `src/reporting/control-page/components/molecules/ProjectReportStatusView.tsx`
  - `src/reporting/control-page/components/molecules/ReportExportButton.tsx`
  - `src/reporting/control-page/components/molecules/index.ts`
  - `src/reporting/control-page/types/component-contracts.ts`
- Create:
  - `src/reporting/control-page/components/molecules/FormField.tsx`
  - `src/reporting/control-page/components/molecules/PageHeader.tsx`

## Implementation Steps
1. Create `FormField.tsx` supporting standard input/select children with error messaging.
2. Create `PageHeader.tsx` providing standard title and action layout for all pages.
3. Modernize `ConfigSelectorBar.tsx` using atom `Button` and `Select` with refined spacing and divider lines.
4. Refactor `CredentialRow.tsx` using `FormField` and atom `Badge`, ensuring password inputs wipe on clear.
5. Refactor `BrowserSettingRow.tsx` using atom `Badge` and clean select/input components.
6. Refactor `LogViewer.tsx` to use dark terminal canvas (`bg-slate-900 text-slate-100 font-mono`) with autoscroll.
7. Refactor `RunResultBox.tsx` and `BuildProjectOutcomeRow.tsx` with clean card rows and status pills.
8. Refactor `ProjectRunsTable.tsx` with modern table header, hover rows, and pagination controls.
9. Update `components/molecules/index.ts` to export all molecules.
10. Verify TypeScript compilation and Vite build.

## Todo List
- [x] Create `FormField.tsx` molecule
- [x] Create `PageHeader.tsx` molecule
- [x] Modernize `ConfigSelectorBar.tsx`
- [x] Modernize `CredentialRow.tsx` and preserve test contracts
- [x] Modernize `BrowserSettingRow.tsx` and preserve badges
- [x] Modernize `LogViewer.tsx` with terminal styling and copy action icon
- [x] Modernize `RunResultBox.tsx` and `BuildProjectOutcomeRow.tsx`
- [x] Modernize `ProjectRunsTable.tsx` and `ReportExportButton.tsx` with selective Lucide icons
- [x] Update `components/molecules/index.ts`
- [x] Verify build and typecheck

## Success Criteria
- All molecules cleanly compose atoms and render with Modern Refined Light styling.
- All credential row and browser setting IDs and test hooks remain 100% functional.
- Zero accessibility regressions on form controls, labels, and table semantics.
- Build and typecheck pass without warnings.

## Risk Assessment
- Risk: Breaking `CredentialRow` password field visibility or clear button behavior.
  - Mitigation: Explicitly preserve `#secret-input-{key}` ID, `type="password"`, and `.btn-clear-credential` class.
- Risk: `LogViewer` scroll behavior failing on new log lines.
  - Mitigation: Maintain `ref` autoscroll to `scrollHeight` on log updates.

## Security Considerations
- Zero password reflection or logging in DOM text or state.
- Form inputs disable auto-completion (`autoComplete="off"`) and spellcheck where appropriate.

## Next Steps
- Proceed to [Phase 03: Organisms & Layout Templates](./phase-03-organisms-and-layout-templates.md) to assemble molecules into organisms and templates.
