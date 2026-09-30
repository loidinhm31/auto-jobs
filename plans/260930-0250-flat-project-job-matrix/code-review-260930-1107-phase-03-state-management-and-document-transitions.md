# Code Review: Phase 03 — State Management and Document Transitions

## Score: 8.5 / 10

### Scope
- **Files reviewed**:
  - `src/reporting/control-page/hooks/matrix-document-transitions.ts`
  - `src/reporting/control-page/hooks/config-document-transitions.ts`
  - `src/reporting/control-page/hooks/useConfigDocumentEditor.ts`
  - `src/reporting/control-page/hooks/useConfigManager.ts`
  - `src/reporting/control-page/utils/config-document-validation.ts`
  - `src/reporting/control-page/pages/DashboardPage.tsx`
  - `src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx`
  - `src/reporting/control-page/types/component-contracts.ts`
  - `tests/unit/matrix-document-transitions.spec.ts`
  - `tests/unit/config-document-editor-groups.spec.ts`
  - `tests/unit/clone-project-draft.spec.ts`
- **Lines of code analyzed**: ~1,390 lines across production and test modules.
- **Review focus**: Pure transitions immutability, structural sharing, replacement revision lifecycles, ETag concurrency, validation gating, YAGNI/KISS/DRY adherence.
- **Updated plans**: `plans/260930-0250-flat-project-job-matrix/phase-03-state-management-and-document-transitions.md`

---

## Overall Assessment
Implementation delivers high-quality state management with strict pure transitions, structural sharing on cell/selection mutations, no-op short-circuiting, and resilient lifecycle handling in `useConfigDocumentEditor` and `useConfigManager`. ETag conflict recovery (409/412), sequence guards against stale responses, and legacy V1 projection are thoroughly covered with comprehensive unit tests. Two moderate findings noted: `ConfigSelectorBar` receives `isInvalid` but omits it from the Save button's disabled calculation, and `useConfigDocumentEditor.ts` exceeds the 200 LOC project limit due to coexisting legacy group transitions.

---

## Critical Issues
*None*. No security vulnerabilities, memory leaks, or breaking regressions identified.

---

## Warnings (High / Medium Priority)

### 1. [High Priority] `ConfigSelectorBar` Save button ignores `isInvalid` prop
- **Location**: `src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx:65-77`
- **Problem**: `ConfigSelectorBarProps` accepts `isInvalid?: boolean` (passed from `DashboardPage.tsx` via `validationErrors.length > 0`), but `saveBtn` only checks `disabled: !isDirty || isSaving || isLoading`. An invalid draft with unsaved changes leaves the Save button visually enabled.
- **Context**: While `useConfigManager.saveConfig()` protects the API by rejecting invalid documents at click-time (`showBanner('error', 'Cannot save an invalid configuration...')`), the UI button state diverges from the plan requirement (*"Disabled Save/Execute for invalid or stale drafts"*).
- **Note on E2E test**: `tests/e2e/control-page.spec.ts:570` explicitly asserts `await expect(saveBtn).toBeEnabled();` immediately after `#btn-add-project` is clicked (while the new project draft has empty required fields). Directly adding `|| isInvalid` to `saveBtn` will fail this test unless updated in coordination with UI/UX expectations.

### 2. [Medium Priority] `useConfigDocumentEditor.ts` exceeds 200 lines limit (265 LOC)
- **Location**: `src/reporting/control-page/hooks/useConfigDocumentEditor.ts` (265 lines)
- **Standard**: `docs/code-standards.md` requires keeping production TypeScript modules under 200 lines.
- **Cause**: Retained backward-compatible group editing methods (`createGroup`, `renameGroup`, `deleteGroup`, `setGroupMembership`) alongside new matrix transition handlers.
- **Remedy**: Once caller migration completes in Phase 04/05, remove obsolete group methods (lines 172-193) or extract matrix dispatchers into a dedicated sub-hook.

---

## Suggestions (Low Priority / Code Quality)

### 1. `validateCurrentDocument` sets valid message when document is null
- **Location**: `src/reporting/control-page/hooks/useConfigDocumentEditor.ts:118-127`
- **Problem**: When `currentDoc === null`, `getValidationErrors(null)` returns `[]`. Line 125 sets `jsonValidationMsg: { isValid: true, message: 'Configuration is valid.' }` while line 126 returns `false`.
- **Fix**: Guard early:
  ```ts
  if (!currentDoc) {
    setJsonValidationMsg(null);
    return false;
  }
  ```

### 2. Explicit primary mirror recalculation on `cloneProjectMatrixDraft`
- **Location**: `src/reporting/control-page/hooks/matrix-document-transitions.ts:180-186`
- **Observation**: `cloneProjectMatrixDraft` copies `jobs` map and resets `selectedJobColumns: []`, while inheriting `cloned.jobUrl` from `sourceProject.jobUrl`.
- **Fix**: Set `cloned.jobUrl = computePrimaryJobUrl(jobs, columns);` to guarantee the primary URL mirror invariant regardless of source project synchronization state.

---

## Positive Observations
- **Pure Immutability & Structural Sharing**: Transitions (`updateJobCell`, `toggleProjectJobSelection`, `addJobColumn`, `renameJobColumn`, `removeJobColumn`) strictly check identity before modifying objects. Untouched rows retain referential equality (`toBe(doc.projects[1])`), minimizing React re-renders.
- **Prototype Pollution Prevention**: Column IDs are strictly verified against `COLUMN_ID_REGEX` and sanitized in lowercase.
- **Race Condition Prevention**: `loadSequenceRef` in `useConfigManager` prevents out-of-order network responses from overwriting active configurations.
- **Single Source of Truth**: Unified editor model keeps raw JSON, structured matrix, validation errors, and replacement revision synchronized.
- **Testing Quality**: 53 unit tests pass deterministically in under 1 second, specifically covering 409 conflict retention, out-of-order requests, and V1 legacy projections.

---

## Validation Commands & Results
- `npm run typecheck`: **PASSED** (0 TypeScript errors)
- `npx playwright test tests/unit/matrix-document-transitions.spec.ts tests/unit/config-document-editor-groups.spec.ts tests/unit/clone-project-draft.spec.ts`: **PASSED** (53 tests, 880ms)
- `npx playwright test tests/unit/control-hooks-and-types.spec.ts tests/unit/control-config-api.spec.ts`: **PASSED** (52 tests, 991ms)
- `npx playwright test tests/e2e/control-page.spec.ts`: **PASSED** (12 tests, 3.1s)

---

## Unresolved Questions
1. **Save Button Visual State vs Click Validation**: Should `ConfigSelectorBar.tsx` disable the Save button when `isInvalid={true}` (and update `tests/e2e/control-page.spec.ts:570` accordingly), or is keeping Save clickable to trigger the informative validation banner the intended user experience?
