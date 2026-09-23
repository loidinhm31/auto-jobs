# Phase 04: Control Page UI Enhancements

> Parent: [plan.md](./plan.md) | Prev: [phase-03-auto-build-runner-integration.md](./phase-03-auto-build-runner-integration.md) | Next: [phase-05-testing-and-verification.md](./phase-05-testing-and-verification.md)

**Status:** DONE · **Progress:** 100% · **Completed:** 2026-09-24T03:00:00+07:00

> Scope variance: The optional `ConfigProjectEditor` toggle is deferred; the setting remains configurable through project JSON and the run-confirmation modal.

## Context
Operators triggering an auto-build from the Control Page dashboard (`npm run serve:control`) need visibility into the build's execution. The confirmation modal should let operators toggle `waitForCompletion`, and the result card should display the build run number, terminal status badge, and stage breakdown.

## Requirements
1. Update `BuildConfirmDialog.tsx`:
   - Add a checkbox `[x] Wait for build completion in Stage View` with `id="checkbox-wait-for-completion"`.
   - Default to `project.waitForCompletion !== false` (default checked).
   - Pass `waitForCompletion: boolean` on confirm to `onConfirm(projectId, waitForCompletion)`.
2. Update `DashboardPage.tsx` and `useRunPoller.ts`:
   - Pass `waitForCompletion` to `triggerRun`.
   - Send `waitForCompletion` in `POST /api/run` payload.
3. Update `RunResultBox.tsx`:
   - When `result.buildState` is present:
     - If `result.buildNumber` and `result.buildResult`:
       Display `Build ${result.buildNumber}: ${result.buildResult}` with styled badge (green for SUCCESS, red for FAILED/ABORTED).
     - If `result.stages` are present, render a compact list or summary of completed stages with duration.
     - Link to `result.jobUrl` and `result.buildPageUrl`.
4. Update `ConfigProjectEditor.tsx` / `ConfigFormBuilder.tsx`:
   - Add an optional toggle for `waitForCompletion` in the project editor form.

## Related Files
- `src/reporting/control-page/components/organisms/BuildConfirmDialog.tsx`
- `src/reporting/control-page/components/molecules/RunResultBox.tsx`
- `src/reporting/control-page/components/molecules/ConfigProjectEditor.tsx`
- `src/reporting/control-page/pages/DashboardPage.tsx`
- `src/reporting/control-page/hooks/useRunPoller.ts`
- `src/reporting/control-page/types/index.ts`
- `src/reporting/control-page/types/component-contracts.ts`

## Implementation Steps
1. Add `waitForCompletion?: boolean` to `RunResult` and component contract types.
2. Add state `const [waitForCompletion, setWaitForCompletion] = useState(true)` in `BuildConfirmDialog.tsx`.
3. Add accessible checkbox input to `BuildConfirmDialog.tsx`.
4. Update `RunResultBox.tsx` to format Stage View build results with status badges and stage tags.
5. In `ConfigProjectEditor.tsx`, add checkbox to configure project default `waitForCompletion`.

## Todo List
- [x] Add `waitForCompletion` checkbox to `BuildConfirmDialog`
- [x] Wire `waitForCompletion` through `DashboardPage` and `useRunPoller`
- [x] Enhance `RunResultBox` to display build number, terminal status, and stage summary
- [x] Record deferral of `ConfigProjectEditor` toggle (setting remains available through project JSON and confirmation modal)
- [x] Update frontend types and contract interfaces

## Success Criteria
- Modal allows toggling `waitForCompletion` before triggering build.
- Result box clearly presents build number, terminal status (`SUCCESS` / `FAILED`), and stages.
- Preserves all existing Playwright accessibility and DOM selectors.
