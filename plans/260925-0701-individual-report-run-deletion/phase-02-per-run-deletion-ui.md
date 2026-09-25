# Phase 02 — Per-run deletion UI and confirmation

**Status:** Done · **Progress:** 100% · **Completed:** 2026-09-25

## Overview

Enhance the Control Dashboard report management view (`/reports/index.html`) so that each historical run in the `ProjectRunsTable` displays a dedicated Delete button. Clicking it triggers an accessible confirmation dialog explaining permanent removal of that run. Confirming sends a guarded `DELETE` request with CSRF token and refreshes the aggregate inventory.

## Requirements

1. **Table Actions Column:**
   - In `ProjectRunsTable`, add an `Actions` column header.
   - Each run row renders a `Delete` button with `id="delete-run-${run.runId}-btn"`.
   - Prop `onDeleteRun: (runId: string) => void` passes the run selection to the parent.
2. **Confirmation Dialog:**
   - Create `DeleteRunConfirmationDialog.tsx` using `@radix-ui/react-dialog`.
   - Modal displays the target project name, project ID, and run ID (`runId`).
   - Wording explicitly clarifies that only this specific report run and its artifacts will be permanently deleted.
   - Supports keyboard `Escape` dismissal, focus trapping, and `Cancel` button.
   - During in-flight deletion, buttons are disabled and confirm button shows a loading spinner.
   - Surfaces 409 lock conflicts and 500 errors with actionable guidance in the dialog.
3. **ReportManagementPage Integration:**
   - Manage target run state (`{ projectId: string; projectName: string; runId: string } | null`).
   - Sends `DELETE /api/reports/projects/:projectId/runs/:runId` with `x-csrf-token` header.
   - On success: closes dialog, displays feedback banner ("Successfully deleted report run <runId> for <projectName>"), and re-fetches `/reports/aggregate-data.json`.
   - If the deleted run was the last run of the project, the project card disappears or reflects empty state without page reload.
4. **Code Standards:**
   - Components strictly under 200 LOC.
   - Clean modular division between table molecule, dialog organism, and page.

## Verification Checklist

- [x] Table Actions column added with `Delete` button per run (`id="delete-run-${run.runId}-btn"`)
- [x] `onDeleteRun` prop wired through `ProjectReportHistoryCard` to `ProjectRunsTable`
- [x] `DeleteRunConfirmationDialog` implemented with `@radix-ui/react-dialog` displaying project name, ID, run ID, and warning
- [x] Keyboard dismiss (`Escape`), focus trapping, cancel button, and in-flight busy state handling implemented
- [x] Surfaces 409 lock conflicts and 500 error messages with actionable advice
- [x] `ReportManagementPage` state management via `useDeleteRun` hook sending `DELETE` with `x-csrf-token`
- [x] Re-fetches `/reports/aggregate-data.json` and updates UI without full reload
- [x] Unit tests in `tests/unit/control-delete-run-ui.spec.ts` pass
- [x] E2E tests in `tests/e2e/control-report-management.spec.ts` covering sibling run preservation, empty project pruning, and 409 conflict pass
- [x] All production modules strictly under 200 LOC
