# Researcher Report: Control Page Atomic Design Structure

## Executive Summary
Audit of `src/reporting/control-page/` reveals partial Atomic Design implementation with significant architectural gaps: `ReportManagementPage` and `FinalProjectReportPage` lack templates; components like `Card` and `Checkbox` are unstandardized raw HTML; `FormField` composition is embedded redundantly across inputs.

## Current Component Inventory
- **Atoms (`components/atoms/`)**: `Badge`, `Button`, `Input`, `LoadingIndicator`, `Select`, `StatusBanner`. Missing: `Checkbox`, `Card` (compound), `IconButton`, `Tooltip`.
- **Molecules (`components/molecules/`)**: `BrowserSettingRow`, `build-project-outcome-row`, `ConfigDefaultsEditor`, `ConfigProjectEditor`, `ConfigSelectorBar`, `CredentialRow`, `LogViewer`, `project-runs-table`, `ProjectReportStatusView`, `ReportExportButton`, `RunResultBox`. Missing: `FormField`, `PageHeader`, `PaginationBar`.
- **Organisms (`components/organisms/`)**: `BrowserSettingsDialog`, `ConfigFormBuilder`, `CredentialsDialog`, `DeleteReportsConfirmationDialog`, `DeleteRunConfirmationDialog`, `ExecutionSection`, `HeaderBar`, `ProjectCard`, `project-group-board`, `project-group-column`, `project-group-dialog-*`, `ProjectReportHistoryCard`, `ProjectsGrid`, `RawJsonSection`, `RunStatusCard`.
- **Templates (`components/templates/`)**: `DashboardLayout` only. Missing: `ReportManagementLayout`, `FinalReportLayout`.
- **Pages (`pages/`)**: `DashboardPage`, `ReportManagementPage`, `final-project-report-page`.

## Architectural Gaps Identified
1. **Missing Layout Templates**:
   - `ReportManagementPage` hardcodes header, navigation link (`#back-to-dashboard-link`), container, and status branches directly in the page file instead of a reusable template.
   - `final-project-report-page` hardcodes viewer shell, skip-link, and status wrappers inline.
2. **Missing Atom Primitives**:
   - Raw `<input type="checkbox">` rendered directly in `ProjectCard` and `build-project-outcome-row` without accessible focus or standardized styling.
   - Container styling (`bg-white border border-slate-300 rounded-lg p-5 shadow-sm`) duplicated across 8+ organism components instead of a compound `Card` atom (`Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`).
   - Action buttons with icons lack an `IconButton` atom enforcing accessible `aria-label` and hit targets.
3. **Form Composition Duplication**:
   - Both `Input.tsx` and `Select.tsx` include ad-hoc label/error wrappers. A dedicated `FormField` molecule decouples inputs from form layout and error handling.
4. **Organism Boundary Inconsistencies**:
   - `ProjectCard` is currently placed in `organisms/` but behaves as a compound molecule composing `Checkbox`, `Badge`, `Select`, and Link atoms. It can remain in organisms for compatibility or be classified as an organism that coordinates project interactions.

## Proposed Atomic Design Taxonomy

```
components/
├── atoms/
│   ├── Button.tsx (refactored with modern variants & focus rings)
│   ├── Badge.tsx (modern pill design, dot indicator variant)
│   ├── Input.tsx (clean text/number/password atom)
│   ├── Select.tsx (styled select atom)
│   ├── Checkbox.tsx (accessible custom checkbox atom)
│   ├── Card.tsx (compound Card, Header, Title, Content, Footer)
│   ├── IconButton.tsx (accessible icon button with tooltip support)
│   ├── StatusBanner.tsx (animated alert banner)
│   ├── LoadingIndicator.tsx (modern spinner / pulse indicator)
│   └── index.ts
├── molecules/
│   ├── FormField.tsx (label + input/select + error + helper text)
│   ├── PageHeader.tsx (title + breadcrumb/back-link + action slot)
│   ├── ConfigSelectorBar.tsx (active config + reload + save + modal triggers)
│   ├── CredentialRow.tsx (key + badge + input + clear button)
│   ├── BrowserSettingRow.tsx (key + badge + select/input + clear button)
│   ├── LogViewer.tsx (terminal output with autoscroll & copy)
│   ├── RunResultBox.tsx (execution outcome + outcome rows)
│   ├── BuildProjectOutcomeRow.tsx (per-project auto-build stage row)
│   ├── ConfigProjectEditor.tsx (project fields form)
│   ├── ConfigDefaultsEditor.tsx (collapsible defaults form)
│   ├── ProjectRunsTable.tsx (paginated runs table)
│   ├── ProjectReportStatusView.tsx (loading/empty/error states)
│   ├── ReportExportButton.tsx (PDF export action with progress)
│   └── index.ts
├── organisms/
│   ├── HeaderBar.tsx (app header with logo, title, nav, and selector bar)
│   ├── ProjectCard.tsx (project card with enabled toggle, runtype, link)
│   ├── ProjectGroupColumn.tsx (scrollable column with column header & cards)
│   ├── ProjectGroupBoard.tsx (board container with ungrouped & custom groups)
│   ├── ProjectsGrid.tsx (board wrapper with group action triggers)
│   ├── ConfigFormBuilder.tsx (project CRUD + draft clone)
│   ├── RawJsonSection.tsx (raw JSON textarea with apply & status)
│   ├── ExecutionSection.tsx (workers selector + report/build buttons)
│   ├── RunStatusCard.tsx (status badge + logs + results)
│   ├── ProjectReportHistoryCard.tsx (report history with run actions)
│   ├── CredentialsDialog.tsx (Radix-backed credential modal)
│   ├── BrowserSettingsDialog.tsx (Radix-backed browser modal)
│   ├── ProjectGroupDialogs/ (Create, Rename, Delete, Membership dialogs)
│   ├── DeleteConfirmationDialogs/ (Project & Run deletion modals)
│   └── index.ts
├── templates/
│   ├── DashboardLayout.tsx (header, banner, projects, editor, actions, run)
│   ├── ReportManagementLayout.tsx (header, feedback, history, dialogs)
│   ├── FinalReportLayout.tsx (header toolbar, status, report body)
│   └── index.ts
└── pages/
    ├── DashboardPage.tsx
    ├── ReportManagementPage.tsx
    └── final-project-report-page.tsx
```

## Migration & Cutover Strategy
- 100% backward compatible props and exports on all existing atoms/molecules/organisms.
- New atoms (`Checkbox`, `Card`, `IconButton`) replace duplicate inline styles.
- New templates (`ReportManagementLayout`, `FinalReportLayout`) clean up pages to purely manage state and lifecycle hooks.
