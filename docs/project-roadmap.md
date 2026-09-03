# Project roadmap

Last updated: 2026-09-03  
Plan: [Dynamic Credential Management and Persistence for Serve Control](../plans/260903-1251-serve-control-dynamic-credentials/plan.md)

## Overall status

- Status: **Complete**
- Progress: **100%** (6.0 of 6 weighted planned hours; 5 of 5 phases complete)
- Current milestone: **Phase 05 — Unit, API, and Playwright E2E verification DONE**
- Phase 01 completed: **2026-09-03T14:40:00+07:00**
- Phase 02 completed: **2026-09-03T15:25:00+07:00**
- Phase 03 completed: **2026-09-03T17:18:32+07:00**
- Phase 04 completed: **2026-09-03T18:35:00+07:00**
- Phase 05 completed: **2026-09-03**

## Phase progress

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. SecretStore backend module | **DONE** | **100%** | 1.5h | [Phase 01](../plans/260903-1251-serve-control-dynamic-credentials/phase-01-backend-secret-store.md); [review](../plans/260903-1251-serve-control-dynamic-credentials/reports/code-review-260903-1422-secret-store-backend.md) |
| 2. Control secrets API and security gates | **DONE** | **100%** | 1.0h | [Phase 02](../plans/260903-1251-serve-control-dynamic-credentials/phase-02-control-secrets-api.md); [API tests](../tests/unit/control-secrets-api.spec.ts); [security tests](../tests/unit/control-secrets-security.spec.ts); [review](../plans/reports/code-review-260903-1510-phase-02-control-secrets-api.md) |
| 3. Run executor environment injection | **DONE** | 100% | 1.0h | [Phase 03](../plans/260903-1251-serve-control-dynamic-credentials/phase-03-run-executor-environment-injection.md); [validation](../plans/reports/tester-260903-1640-phase-03-run-executor-environment-injection-cycle-2.md) — 239/239 unit, 37/37 targeted, 10/10 review |
| 4. Control UI credential modal and state | **DONE** | **100%** | 1.5h | [Phase 04](../plans/260903-1251-serve-control-dynamic-credentials/phase-04-control-ui-credential-management.md); [validation](../plans/reports/tester-260903-1825-phase-04-control-ui-credential-modal-state-validation.md); [review](../plans/reports/code-review-260903-1829-phase-04-control-ui-credential-modal.md) |
| 5. Unit, API, and Playwright E2E verification | **DONE** | **100%** | 1.0h | [Phase 05](../plans/260903-1251-serve-control-dynamic-credentials/phase-05-test-suite-and-e2e-verification.md); [SecretStore tests](../tests/unit/control-secret-store.spec.ts) 7/7; [API tests](../tests/unit/control-secrets-api.spec.ts) 10/10; [control E2E](../tests/e2e/control-page.spec.ts) 6/6; [review](../plans/reports/code-review-260903-1945-phase05-verification.md) — **APPROVED, 9.5/10** |

## Phase 01 milestone

Delivered the secure local SecretStore foundation:

- Persists only to git-ignored `config/secrets.local.json`.
- Validates secret names and values, enforces the 1 MiB payload limit, and redacts errors.
- Serializes concurrent writes and uses `0o600` temp files, `sync`, and atomic rename.
- Returns immutable secret maps and name lists without exposing plaintext through server wiring.

Validation evidence:

- [Code review](../plans/260903-1251-serve-control-dynamic-credentials/reports/code-review-260903-1422-secret-store-backend.md): approved at 9.5/10 with no critical issues; typecheck, production build, 215 unit tests, and git-ignore verification passed.

## Phase 02 milestone

Delivered the guarded, redacted control-plane secrets API:

- `GET /api/secrets` returns presence-only boolean maps with optional key filtering.
- `PUT` and `DELETE /api/secrets` enforce Host, Origin, Fetch Metadata, and CSRF gates.
- Strict bounded JSON and environment-key validation prevent malformed or unsafe mutations.
- Responses use `Cache-Control: no-store`; plaintext secret values are never returned or logged.

Validation evidence:

- [API tests](../tests/unit/control-secrets-api.spec.ts) and [security tests](../tests/unit/control-secrets-security.spec.ts): 16 passed, 0 failed, 0 skipped.
- [Code review](../plans/reports/code-review-260903-1510-phase-02-control-secrets-api.md): approved with warnings at 9.0/10; no critical issues.
- `npm run typecheck` (`tsc --noEmit`): passed, 0 errors.


## Phase 03 milestone

Delivered per-run executor environment injection:

- Wired the optional `SecretStore` through the run manager and control server into executor runs.
- Merged stored credential snapshots over the base environment for each run only; global `process.env` remains unchanged.
- Passed the merged environment through config normalization and report/auto-build runners.
- Redacted stored secret values from execution diagnostics before logs are persisted.

Validation evidence:

- [Full unit validation](../plans/reports/tester-260903-1640-phase-03-run-executor-environment-injection-cycle-2.md) — **239/239 passed, 0 failed, 0 skipped**.
- [Targeted validation](../plans/reports/tester-260903-1640-phase-03-run-executor-environment-injection-cycle-2.md) — **37/37 passed, 0 failed, 0 skipped**.
- **Code review** — **APPROVED, 10/10**.

## Phase 04 milestone

Delivered the secure `serve:control` credential management experience:

- Added a native Credentials modal with dynamic discovery of required variables and presence-only status badges.
- Added guarded save and clear actions with CSRF protection, password masking, and immediate input cleanup.
- Preserved zero-secret-leakage guarantees across the DOM, API responses, and execution diagnostics.

Validation evidence:

- [Phase 04 validation](../plans/reports/tester-260903-1825-phase-04-control-ui-credential-modal-state-validation.md): **243/243 passed, 0 failed, 0 skipped** (239 unit + 4 control E2E).
- **Axe accessibility audit**: **0 violations**.
- [Phase 04 code review](../plans/reports/code-review-260903-1829-phase-04-control-ui-credential-modal.md): **APPROVED, 9.5/10**.
- **Secret leakage**: zero observed; saved values absent from DOM, API responses, and execution logs.

## Phase 05 milestone

Completed the unit, API, and browser verification for dynamic credentials:

- Added seven isolated `SecretStore` lifecycle tests for missing/empty reads, atomic writes and temporary-file cleanup, POSIX/Windows file handling, invalid and reserved keys, non-string value redaction, concurrent updates, and deletion/bulk operations.
- Extended the secrets API operation tests to cover empty/full/filtered presence maps, guarded single and batch updates, null/action deletion, query/body deletion, persistence, and plaintext-free responses.
- Extended the control-page E2E workflow to cover accessible credential management, Missing/Configured transitions, save/clear/reopen persistence, injected-credential execution, and zero leakage from inputs, page HTML, and run logs.

Validation evidence:

- `npm run typecheck` (`tsc --noEmit`): passed, 0 errors.
- `npm run test:unit`: **248/248 passed, 0 failed, 0 skipped**.
- `npm run test:control`: **6/6 passed, 0 failed, 0 skipped** across Chromium and WebKit.
- Combined Phase 05 evidence: **254/254 passed**; zero secret leakage observed.
- [Phase 05 code review](../plans/reports/code-review-260903-1945-phase05-verification.md): **APPROVED, 9.5/10**.

## Next milestones

1. **Production hardening and release readiness**: retain the non-blocking follow-ups below, including Windows ACL review, before any live credential or Jenkins run.

## Review follow-up

- Reserved prototype keys are explicitly rejected and covered by the Phase 05 SecretStore tests.
- The `415` response maps to `UNSUPPORTED_MEDIA_TYPE`, and direct invalid-Host coverage is present in the control secrets security tests.
- Before live use, review config-directory ACLs on Windows and keep `report-server-secret-store.ts` focused at the 200-line maintainability threshold.

## Changelog

### 0.1.0 (development) — 2026-09-03

- Completed Phase 01 SecretStore backend module at 100%.
- Added atomic, bounded, permission-conscious local secret persistence with redacted error handling.
- Linked Phase 01 implementation and 9.5/10 review evidence.
- Completed Phase 02 Control Secrets API and security gates at 100%.
- Added presence-only GET, guarded PUT/DELETE, strict validation, and zero-leakage coverage.
- Linked Phase 02 targeted test, typecheck, and 9.0/10 review evidence.

- Completed Phase 03 Run executor environment injection at 100%.
- Added per-run stored credential merging, runner propagation, and diagnostic redaction without global environment mutation.
- Recorded Phase 03 validation: 239/239 unit tests, 37/37 targeted tests, and 10/10 code review approval.

- Completed Phase 04 Control UI Credential Modal and State at 100%.
- Added dynamic credential discovery, masked local save/clear flows, persistence status badges, and input cleanup.
- Recorded Phase 04 validation: 243/243 tests passed, 0 Axe violations, zero secret leakage, and 9.5/10 approved code review.

- Completed Phase 05 unit, API, and Playwright E2E verification at 100%.
- Recorded 248/248 unit tests, 6/6 control E2E tests across Chromium and WebKit, 254/254 combined passes, zero secret leakage, and 9.5/10 code review approval.

## Unresolved questions

None.
