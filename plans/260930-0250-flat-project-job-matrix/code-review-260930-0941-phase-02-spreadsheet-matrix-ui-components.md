# Code Review: Phase 02 Spreadsheet Matrix UI Components

**Plan**: `plans/260930-0250-flat-project-job-matrix/phase-02-spreadsheet-matrix-ui-components.md`  
**Date**: 2026-09-30  
**Score**: 9.3/10  

---

## Code Review Summary

### Scope
- **Files reviewed**:
  - `src/reporting/control-page/components/molecules/job-column-header.tsx` (199 LOC)
  - `src/reporting/control-page/components/molecules/project-job-cell.tsx` (108 LOC)
  - `src/reporting/control-page/components/molecules/project-job-selection.tsx` (95 LOC)
  - `src/reporting/control-page/components/molecules/matrix-row-settings.tsx` (198 LOC)
  - `src/reporting/control-page/components/molecules/config-defaults-dialog.tsx` (136 LOC)
  - `src/reporting/control-page/hooks/matrix-document-transitions.ts` (168 LOC)
  - `src/reporting/control-page/components/organisms/matrix-toolbar.tsx` (107 LOC)
  - `src/reporting/control-page/components/organisms/matrix-row.tsx` (185 LOC)
  - `src/reporting/control-page/components/organisms/add-column-dialog.tsx` (144 LOC)
  - `src/reporting/control-page/components/organisms/projects-job-matrix.tsx` (196 LOC)
  - `src/reporting/control-page/components/organisms/ExecutionSection.tsx` (137 LOC)
  - `src/reporting/control-page/components/templates/DashboardLayout.tsx` (136 LOC)
  - `src/reporting/control-page/pages/DashboardPage.tsx` (193 LOC)
  - `src/reporting/control-page/hooks/useConfigManager.ts` (196 LOC)
  - `src/config/config-types.ts` (117 LOC)
  - `src/reporting/control-page/types/index.ts` (152 LOC)
  - `src/reporting/control-page/components/molecules/index.ts`
  - `src/reporting/control-page/components/organisms/index.ts`
  - `tests/unit/control-matrix-components.spec.ts`
  - `tests/unit/control-grouped-project-board.spec.ts`
  - `tests/unit/clone-project-draft.spec.ts`
  - `tests/unit/control-atomic-components.spec.ts`
  - `tests/e2e/control-page.spec.ts`
- **Lines of code analyzed**: ~2,800 LOC production code + ~2,000 LOC tests
- **Review focus**: Security (URL safety, secret leakage, prototype checks), performance (rendering, memoization, scroll containment), architecture, YAGNI/KISS/DRY, LOC constraints (<200 LOC per file), backward compatibility.
- **Updated plans**:
  - `plans/260930-0250-flat-project-job-matrix/phase-02-spreadsheet-matrix-ui-components.md`
  - `plans/260930-0250-flat-project-job-matrix/plan.md`

### Overall Assessment
High-quality, robust implementation replacing both obsolete project surfaces (`ProjectsGrid`/`ProjectCard`/`project-group-*` board and `ConfigFormBuilder` panel) with a single spreadsheet matrix.
- Clean cutover: all 11 obsolete board/form files completely purged, no compatibility aliases or shims.
- Strict LOC compliance: all 16 production TypeScript files strictly adhere to the <200 LOC limit.
- Accessibility & UX: `<th scope="col">`, `<th scope="row">`, `role="group"`, `role="alert"`, descriptive ARIA labels, autofocus, and keyboard navigation (Enter/Esc).
- Security: external job links strictly enforce HTTP(S) protocol and `rel="noopener noreferrer"`; credentials expose only env var identifiers, never secrets.
- Data integrity: group metadata (`projectGroups`, `groupId`) seamlessly preserved across matrix editing, cloning, and saving.
- Two explicit execution triggers (`Generate Reports` & `Trigger Auto Build`) maintain clarity with target selection feedback and blank cell skipping.
- Verification: 22/22 Chromium E2E tests and 73/73 unit tests pass cleanly. `tsc --noEmit` and Vite build pass with 0 errors.

---

### Critical Issues
None.

---

### High Priority Findings

#### 1. Primary Mirror Retains Stale URL When All Cells Cleared
- **Location**: `src/reporting/control-page/hooks/matrix-document-transitions.ts:63, 82`
- **Issue**: In `updateJobCell` and `removeJobColumn`, when all cells for a project have empty URLs, `computePrimaryJobUrl` returns `''`. However, `nextPrimary || previous.jobUrl` falls back to `previous.jobUrl`.
- **Impact**: If a user clears all cell URLs in a project, the hidden `jobUrl` field preserves the old URL rather than being cleared, causing a discrepancy between visible matrix cells and saved document state.
- **Fix**:
```typescript
// src/reporting/control-page/hooks/matrix-document-transitions.ts
const nextPrimary = computePrimaryJobUrl(nextJobs, columns);
const updatedProject = {
  ...previous,
  jobs: nextJobs,
  jobUrl: nextPrimary,
};
```

---

### Medium Priority Improvements

#### 1. Redundant `forceMount: true` in `MatrixRowSettings`
- **Location**: `src/reporting/control-page/components/molecules/matrix-row-settings.tsx:178, 193, 194`
- **Issue**: `forceMount: true` is passed to Radix `Dialog.Portal`, `Dialog.Overlay`, and `Dialog.Content`. Currently, `ProjectsJobMatrix` mounts `MatrixRowSettings` conditionally (`activeSettingsProject && activeSettingsIndex != null`). If the caller pattern ever changes to mount unconditionally with `isOpen={false}`, `forceMount: true` on the overlay will render a fixed full-screen overlay without `data-[state=closed]:hidden`.
- **Fix**: Remove `forceMount: true` or append `data-[state=closed]:hidden` to the overlay className.

---

### Low Priority Suggestions

#### 1. Narrow Viewport Scroll Indication
- **Location**: `src/reporting/control-page/components/organisms/projects-job-matrix.tsx:149`
- **Suggestion**: The matrix container uses `overflow-x-auto max-w-full`. On mobile devices or viewports <768px, adding a subtle right-edge shadow or scroll indicator helps users discover additional columns.

---

### Positive Observations
1. **Strict Line Count Compliance**: Every new and materially modified production file is strictly under 200 lines (e.g., `job-column-header.tsx` is 199 LOC, `matrix-row-settings.tsx` is 198 LOC, `projects-job-matrix.tsx` is 196 LOC).
2. **Complete Clean Cutover**: Deleted 11 obsolete board and form components with zero lingering shims or dead code paths.
3. **Strong Accessibility**: Semantic table tags, keyboard controls on rename/dialogs, explicit `aria-label` / `aria-describedby` on all inputs and checkboxes.
4. **Reliable Group Preservation**: Preserves `projectGroups` and `groupId` invisibly in the document during matrix modifications and ETag saves.
5. **Clear Execution UX**: Direct report and build actions with target counting and clear explanation of skipped empty cells.

---

### Recommended Actions
1. Apply fix to `matrix-document-transitions.ts` so clearing all cell URLs updates `jobUrl` to `''` instead of retaining `previous.jobUrl`.
2. Remove redundant `forceMount: true` from `MatrixRowSettings` dialog components.

---

### Metrics
- **Type Coverage**: 100% strict TypeScript (`tsc --noEmit` 0 errors)
- **Test Pass Rate**: 100% (22/22 Chromium E2E, 73/73 unit tests)
- **Production File LOC**: All production TS files strictly <200 LOC

---

### Unresolved Questions
None.
