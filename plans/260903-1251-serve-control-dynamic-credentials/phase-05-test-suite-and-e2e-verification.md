# Phase 05: Unit, API & Playwright E2E Verification

## Context Links
- Parent Plan: [plan.md](./plan.md)
- Unit Specs: `tests/unit/control-config-api.spec.ts`, `tests/unit/control-run-api.spec.ts`
- E2E Spec: `tests/e2e/control-page.spec.ts`

## Overview
- **Date**: 2026-09-03
- **Description**: Add unit tests for `SecretStore`, API tests for `/api/secrets`, and Playwright E2E browser tests covering the full credential lifecycle in `serve:control`.
- **Priority**: P1
- **Implementation Status**: **DONE**
- **Review Status**: **APPROVED**
- **Completed At**: 2026-09-03T19:50:00+07:00
- **Estimated Effort**: 1.0h

## Key Insights
- Existing tests in `tests/unit/` use Playwright test runner with temporary directories (`fs.mkdtempSync`) and clean in-memory report servers.
- The E2E test in `tests/e2e/control-page.spec.ts` launches Chromium, navigates to the control page, and verifies DOM interactions.
- We need coverage across three distinct boundaries:
  1. `SecretStore` unit tests: isolated file I/O, atomicity, permission flags, key validation.
  2. Control API unit tests: `GET /api/secrets` presence redaction, `PUT /api/secrets` CSRF/Origin enforcement.
  3. E2E browser test: Operator opens Credentials dialog, saves credentials, and triggers a run that successfully resolves secrets.

## Requirements
- Create `tests/unit/control-secret-store.spec.ts`:
  - Verify empty store on missing file.
  - Verify `putSecret` creates `secrets.local.json` atomically.
  - Verify `0o600` file mode on POSIX.
  - Verify invalid key rejection (e.g. `traversal/key`, non-identifier).
  - Verify concurrent writes serialize cleanly.
- Create or extend `tests/unit/control-secrets-api.spec.ts`:
  - `GET /api/secrets` returns boolean map without secret values.
  - `PUT /api/secrets` with valid CSRF updates file and returns presence.
  - `PUT /api/secrets` without CSRF returns 403.
  - `PUT /api/secrets` with invalid origin returns 403.
- Update `tests/e2e/control-page.spec.ts`:
  - Add test: operator opens Credentials modal, sees `Missing` badge, fills password fields, clicks Save, and sees badge transition to `Configured`.
  - Verify that triggering a run after credential entry succeeds without `test is required` errors.

## Architecture
```
Test Suite Hierarchy
├── 1. Unit Tests (tests/unit/control-secret-store.spec.ts)
│      └── File system atomicity, 0o600 mode, key validation, concurrent locks
│
├── 2. API Security Tests (tests/unit/control-secrets-api.spec.ts)
│      └── GET redaction, PUT CSRF gate, Origin gate, JSON boundary validation
│
└── 3. Browser E2E Tests (tests/e2e/control-page.spec.ts)
       └── Modal interaction, password input, badge transition, execution resolution
```

## Related Code Files
- Create: `tests/unit/control-secret-store.spec.ts`
- Create: `tests/unit/control-secrets-api.spec.ts`
- Modify: `tests/e2e/control-page.spec.ts`

## Implementation Steps
1. Write `tests/unit/control-secret-store.spec.ts` exercising `SecretStore` against isolated temporary directories.
2. Write `tests/unit/control-secrets-api.spec.ts` testing HTTP endpoints against a test server instance.
3. Update `tests/e2e/control-page.spec.ts` to include credential configuration in the browser lifecycle.
4. Run `npm run test:unit` and `npm run test:control` to verify all quality gates pass.

## Todo List
- [x] Implement `tests/unit/control-secret-store.spec.ts`.
- [x] Implement `tests/unit/control-secrets-api.spec.ts`.
- [x] Add credential lifecycle test to `tests/e2e/control-page.spec.ts`.
- [x] Run `npm run typecheck` and ensure zero diagnostic errors.
- [x] Run `npm run test:unit` to ensure all unit tests pass.
- [x] Run `npm run test:control` to verify E2E browser interactions pass.

## Success Criteria
- 100% pass rate on new unit tests.
- Zero credential leakage in test snapshots, responses, or error traces.
- E2E test proves persistence across page reloads.

## Risk Assessment
- **Risk**: Flaky E2E test due to animation or modal timing.
  - **Mitigation**: Use Playwright `toBeVisible()` web-first assertions and native dialog state checks.

## Security Considerations
- Clean up all temporary secret files in `afterEach` hooks.
- Assert that neither mock tokens nor test passwords remain in persistent directories.

## Verification Evidence & Delivery
- **Implementation Status**: **DONE** — 2026-09-03T19:50:00+07:00
- **Review Status**: **APPROVED (9.5/10)** — [Phase 05 Code Review](../reports/code-review-260903-1945-phase05-verification.md)
- **Typecheck**: `npm run typecheck` passed with 0 errors.
- **Unit Validation**:
  - `tests/unit/control-secret-store.spec.ts`: 7/7 passed (~0.98s).
  - `tests/unit/control-secrets-api.spec.ts`: 10/10 passed (~1.4s).
  - Full suite `npm run test:unit`: 248/248 passed (21.8s).
- **E2E Validation**: `npm run test:control` across Chromium and WebKit: 6/6 passed (5.5s).
- **Security & Integrity**:
  - Zero credential leakage verified in DOM, API text, and run execution logs.
  - POSIX 0o600 file mode and Windows fallback asserted.
  - Concurrency verified with 25 concurrent write operations.
  - Persistence across browser reload verified.

## Next Steps
All phases (Phase 01 through Phase 05) completed. Proceed to final plan closure and release verification.
