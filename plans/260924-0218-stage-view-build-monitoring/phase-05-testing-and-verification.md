# Phase 05: Testing, Fixture & E2E Verification

> Parent: [plan.md](./plan.md) | Prev: [phase-04-control-page-ui-enhancements.md](./phase-04-control-page-ui-enhancements.md)

**Status:** DONE · **Progress:** 100% · **Completed:** 2026-09-24T03:00:00+07:00

## Context
Validate all changes with unit tests, control dashboard end-to-end tests, template mock server tests, and real-time execution tests. Ensure zero regressions across existing test suites.

## Requirements
1. Unit Tests for Stage View Parser (`tests/unit/stage-view.spec.ts`):
   - Parse stage names from headers in `template.html`.
   - Parse existing runs, run IDs, stage statuses, and durations.
   - Detect terminal status (`SUCCESS`, `FAILED`, `UNSTABLE`, `ABORTED`).
   - Test polling loop with mock DOM updates.
   - Test timeout behavior when build remains in-progress past deadline.
2. Unit Tests for Config & API (`tests/unit/project-config-validation.spec.ts`, `tests/unit/control-runs-api.spec.ts`):
   - Test `waitForCompletion` boolean validation and normalization.
   - Test `POST /api/run` with and without `waitForCompletion`.
3. Unit Tests for Auto-Build Runner (`tests/unit/auto-build-runner.spec.ts`, `tests/unit/jenkins-build-trigger.spec.ts`):
   - Test `waitForCompletion: false` returns immediate `submitted`.
   - Test `waitForCompletion: true` waits for Stage View and returns `SUCCESS` / `FAILED`.
4. Control Page E2E Tests (`tests/e2e/control-page.spec.ts`):
   - Test Auto-Build modal displays `[x] Wait for build completion in Stage View` checkbox.
   - Test triggering with checkbox checked sends `waitForCompletion: true`.
   - Test unchecking sends `waitForCompletion: false`.
   - Test `RunResultBox` displays build number and status.
5. Template E2E Tests (`tests/e2e/template-auto-build.spec.ts`):
   - Test full auto-build run against template routes with Stage View.
6. Full Suite Run:
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:unit`
   - `npm run test:control`
   - `npm run test:e2e:templates`

## Related Files
- `tests/unit/stage-view.spec.ts` (new)
- `tests/unit/project-config-validation.spec.ts`
- `tests/unit/control-runs-api.spec.ts`
- `tests/unit/auto-build-runner.spec.ts`
- `tests/unit/jenkins-build-trigger.spec.ts`
- `tests/e2e/control-page.spec.ts`
- `tests/e2e/template-auto-build.spec.ts`

## Todo List
- [x] Create `tests/unit/stage-view.spec.ts`
- [x] Update config validation and run API unit tests
- [x] Update auto-build runner and build trigger unit tests
- [x] Update control page e2e tests for dialog checkbox and result box
- [x] Run full test suite and verify 100% pass rate

## Success Criteria
- All 367+ existing unit tests continue to pass.
- New stage view unit tests pass.
- Control page e2e tests pass.
- Template e2e tests pass.
