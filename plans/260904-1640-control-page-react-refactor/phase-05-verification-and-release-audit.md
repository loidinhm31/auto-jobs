# Phase 05: Verification, Playwright E2E & Accessibility Audit

## Context Links
- Parent Plan: [plan.md](plan.md)
- Prior Phases: [phase-01-tooling-vite-pipeline-server-asset-routing.md](phase-01-tooling-vite-pipeline-server-asset-routing.md), [phase-02-types-and-custom-hooks.md](phase-02-types-and-custom-hooks.md), [phase-03-atoms-and-molecules.md](phase-03-atoms-and-molecules.md), [phase-04-organisms-and-page-assembly.md](phase-04-organisms-and-page-assembly.md)
- Test Suite: [tests/e2e/control-page.spec.ts](../../tests/e2e/control-page.spec.ts)
- Related Unit Tests: [tests/unit/control-config-api.spec.ts](../../tests/unit/control-config-api.spec.ts), [tests/unit/control-run-api.spec.ts](../../tests/unit/control-run-api.spec.ts), [tests/unit/control-secret-store.spec.ts](../../tests/unit/control-secret-store.spec.ts), [tests/unit/control-secrets-api.spec.ts](../../tests/unit/control-secrets-api.spec.ts), [tests/unit/control-secrets-security.spec.ts](../../tests/unit/control-secrets-security.spec.ts), [tests/unit/control-run-executor-secrets.spec.ts](../../tests/unit/control-run-executor-secrets.spec.ts)

## Parallelization Info
- Concurrency: Sequential final validation phase.
- Depends on: Phase 01, Phase 02, Phase 03, Phase 04
- Blocks: Phase 06

## Overview
- Date: 2026-09-04
- Description: Execute full verification and quality gates across TypeScript typecheck, Vite production builds, Playwright E2E tests (4 test scenarios × 2 browsers = 8 runs), Axe-core automated accessibility audits, unit tests, and static report regression tests.
- Priority: P1
- Implementation Status: Complete
- Review Status: Complete
- Completed At: 2026-09-04

## Key Insights
1. **4 test scenarios, not 8**: The file contains exactly 4 test cases. Running on Chromium + WebKit = 8 test runs total.
2. **3 separate Axe accessibility scans**: Main page (Test 1), credentials dialog open (Test 2), browser settings dialog open (Test 4). All must report zero violations.
3. **E2E tests cover the complete lifecycle**:
   - Test 1: Load → project cards → checkbox toggle → save → report run → auto-build confirmation → auto-build run
   - Test 2: Credentials dialog → badges → save → clear → reopen persistence
   - Test 3: Credentials required for execution → fail without → save → succeed with → secret leakage audit → page reload persistence
   - Test 4: Browser settings → save → injected into executor → clear individual settings
4. **No test file modifications allowed**: The plan's constraint is zero changes to `control-page.spec.ts`. If any assertion fails, the fix must be in the React components.
5. **React rendering timing**: Playwright uses web-first assertions with auto-retry (default 5s, run status 10s). React must render DOM elements synchronously or within this timeout window. Ensure no lazy loading or Suspense boundaries delay critical DOM elements.
6. **Unit test file `report-server-control.spec.ts` does NOT exist**: The plan's Phase 05 previously referenced it. The actual unit tests are split across 6 dedicated spec files (listed above).

## Requirements

### Automated Test Gates (in order)
1. `npm run typecheck` — 0 TypeScript errors
2. `npm run build` — cleanly emits Vite assets into `.runner-build/reporting/control-page/`
3. `npm run test:unit` — all unit tests pass (control API, secrets, config store, etc.)
4. `npm run test:control` — 4 test scenarios pass on Chromium AND WebKit (8 total runs)
5. `npm run test:report` — static report tests unaffected
6. `npm run test:release` — complete validation suite passes (typecheck + build + unit + e2e templates + control + report + webkit)

## Verified Test Matrices

| Suite / Gate | Command | Scope / Matrix | Result | Details |
|---|---|---|---|---|
| **Typecheck** | `npm run typecheck` | Root TypeScript project | PASS | 0 errors |
| **Build** | `npm run build` | Vite production bundle | PASS | Emitted assets into `.runner-build/reporting/control-page/` |
| **Unit Tests** | `npm run test:unit` | Full unit suite | PASS | 292 unit tests passing |
| **Control E2E** | `npm run test:control` | Chromium & WebKit (4 scenarios × 2) | PASS | 8 tests passing, 0 Axe a11y violations |
| **Report Tests** | `npm run test:report` | Static report generation | PASS | Static reporting suite unaffected |
| **Release Tests** | `npm run test:release` | Full release validation | PASS | All suites green including WebKit tests |

### Accessibility Audit (Axe-core)
- 3 distinct scan points: Main Dashboard, Credentials Dialog open, Browser Settings Dialog open.
- Result: 0 violations across Chromium and WebKit.

### E2E Test Scenario Checklist

#### Test 1: Dashboard Load, Edit, Save & Execute
- [x] Page title is `'Jenkins Control Dashboard'`
- [x] Axe a11y scan passes with zero violations
- [x] 2 `.project-card` elements rendered
- [x] `'Demo Report Service'` and `'Demo Build Service'` visible
- [x] `#btn-save` initially disabled
- [x] Uncheck checkbox → `#btn-save` enabled
- [x] Save → `#status-banner` shows `/Configuration saved successfully/i` → `#btn-save` disabled
- [x] `#btn-run-reports` click → `#run-status-badge` transitions to `'succeeded'` (10s timeout)
- [x] `#run-logs` contains `'Report run finished'`
- [x] `#run-result-box a` visible with `href` containing `/reports/`
- [x] `.btn-auto-build` click → `#build-confirm-dialog` visible → `#confirm-project-id` is `'demo-build-service'`
- [x] `#btn-confirm-build` click → dialog closes → badge reaches `'succeeded'` → logs contain `'Auto-build run finished with state: submitted'`

#### Test 2: Credentials Dialog — A11y, Save, Clear, Leakage
- [x] `#btn-credentials` click → `#credentials-dialog` visible
- [x] Axe a11y scan passes while dialog is open
- [x] `#secret-input-JENKINS_PASSWORD` and `#secret-input-JENKINS_USERNAME` visible
- [x] 2 `.badge` elements with text `'Missing'`
- [x] Save without input → `#credentials-message` shows `/No changes entered/i`
- [x] Fill + save → badges become `'Configured'`, inputs cleared to `''`
- [x] `page.content()` does NOT contain plaintext secret
- [x] 2 `.btn-clear-credential` buttons visible
- [x] Clear JENKINS_PASSWORD → badge `'Missing'`, clear button disappears
- [x] Close + reopen → JENKINS_PASSWORD `'Missing'`, JENKINS_USERNAME `'Configured'`

#### Test 3: Credentials Required for Execution
- [x] Run without credentials → fails with `'Invalid configuration: JENKINS_USERNAME is required; JENKINS_PASSWORD is required'`
- [x] Save credentials → badges `'Configured'`
- [x] Run with credentials → succeeds
- [x] Log and DOM don't contain plaintext secrets
- [x] Page reload → credentials persist as `'Configured'`

#### Test 4: Browser Settings — A11y, Save, Clear, Executor Injection
- [x] `#btn-browser-settings` click → `#browser-dialog` visible
- [x] Axe a11y scan passes while dialog is open
- [x] `#badge-browser-headless` and `#badge-browser-executable-path` show `'Not Set'`
- [x] Select `'false'` in `#browser-headless-select`, fill `'C:\\browsers\\chrome-custom.exe'` in `#browser-executable-path-input`
- [x] Save → badges become `'Configured'`
- [x] Run → executor receives `PLAYWRIGHT_HEADLESS='false'` and `PLAYWRIGHT_EXECUTABLE_PATH='C:\\browsers\\chrome-custom.exe'`
- [x] Reopen → both still `'Configured'`, clear buttons visible
- [x] Clear headless → `'PLAYWRIGHT_HEADLESS cleared'`, badge `'Not Set'`, button hidden
- [x] Clear exec path → `'PLAYWRIGHT_EXECUTABLE_PATH cleared'`, badge `'Not Set'`, button hidden

### Manual Verification
- Run `npm run serve:control` and inspect visually in browser
- Confirm theme consistency with legacy design (colors, spacing, typography)
- Confirm responsiveness of project cards grid
- Confirm smooth dialog open/close animations
- Confirm keyboard navigation (Tab, Shift+Tab, ESC, Enter) works across all dialogs

## Related Code Files
- `tests/e2e/control-page.spec.ts` (read-only)
- `tests/unit/control-config-api.spec.ts`
- `tests/unit/control-run-api.spec.ts`
- `tests/unit/control-secret-store.spec.ts`
- `tests/unit/control-secrets-api.spec.ts`
- `tests/unit/control-secrets-security.spec.ts`
- `tests/unit/control-run-executor-secrets.spec.ts`
- `playwright.control.config.ts`

## File Ownership
- Read-only on test files. May make targeted fixes to Phase 03/04 components if a test failure is detected.

## Implementation Steps
1. Run `npm run typecheck` to catch lingering type discrepancies.
2. Run `npm run build` to verify end-to-end bundling (Vite + TypeScript).
3. Run `npm run test:unit` to verify server-side tests are unaffected.
4. Run `npm run test:control` on Chromium and analyze results.
5. For each failing test:
   a. Identify the failing assertion and its DOM contract requirement.
   b. Trace to the responsible Phase 03/04 component.
   c. Fix the component (add missing ID, class, attribute, or text).
   d. Re-run the specific test.
6. If Axe accessibility violations occur, adjust color contrast, ARIA roles, or labels in Phase 03/04 components.
7. Run `npm run test:release` to ensure webkit, static reports, and unit test suites remain green.
8. Perform visual inspection on `http://127.0.0.1:4173`.

## Todo List
- [x] Run `npm run typecheck`
- [x] Run `npm run build`
- [x] Run `npm run test:unit`
- [x] Run `npm run test:control` (Chromium + WebKit)
- [x] Verify zero Axe accessibility violations across all 3 scan points
- [x] Walk through all 4 test scenario checklists above
- [x] Run `npm run test:release`
- [x] Complete manual UI review

## Success Criteria
- All 4 Playwright test scenarios pass on Chromium and WebKit (8 total runs).
- Axe-core reports zero violations on main page, credentials dialog, and browser settings dialog.
- No regressions to `npm run serve:report`, static vulnerability report generation, or unit tests.
- Zero modifications to `tests/e2e/control-page.spec.ts`.

## Conflict Prevention
- Strictly read-only on test files unless fixing a detected failure in components.

## Risk Assessment
- **Risk**: Timing/flakiness due to React rendering cycle vs legacy DOM innerHTML swaps.
- **Mitigation**: Ensure ARIA attributes and elements are present in DOM synchronously or within Playwright's default locator wait timeout (5,000ms for assertions, 10,000ms for run status transitions). Avoid lazy loading or Suspense on critical DOM paths.
- **Risk**: Radix Dialog portal rendering causes Playwright to not find elements.
- **Mitigation**: Verify dialog content has the expected `id` and is queryable via `page.locator('#dialog-id')`.

## Security Considerations
- Confirm CSP headers remain intact and that no script injection vulnerabilities were introduced.
- Verify that plaintext secrets never appear in DOM (`page.content()`) or logs (`#run-logs` innerText).

## Next Steps
- Phase 05 completed: 2026-09-04
- Proceed to [Phase 06: Legacy Cleanup & Documentation](phase-06-legacy-cleanup.md).
