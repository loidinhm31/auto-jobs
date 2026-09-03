# Project roadmap

Last updated: 2026-09-03T17:18:32+07:00  
Plan: [Dynamic Credential Management and Persistence for Serve Control](../plans/260903-1251-serve-control-dynamic-credentials/plan.md)

## Overall status

- Status: **In progress**
- Progress: **58%** (3.5 of 6 weighted planned hours; 3 of 5 phases complete)
- Current milestone: **Phase 03 — Run executor environment injection DONE**
- Phase 01 completed: **2026-09-03T14:40:00+07:00**
- Phase 02 completed: **2026-09-03T15:25:00+07:00**
- Phase 03 completed: **2026-09-03T17:18:32+07:00**

## Phase progress

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. SecretStore backend module | **DONE** | **100%** | 1.5h | [Phase 01](../plans/260903-1251-serve-control-dynamic-credentials/phase-01-backend-secret-store.md); [review](../plans/260903-1251-serve-control-dynamic-credentials/reports/code-review-260903-1422-secret-store-backend.md) |
| 2. Control secrets API and security gates | **DONE** | **100%** | 1.0h | [Phase 02](../plans/260903-1251-serve-control-dynamic-credentials/phase-02-control-secrets-api.md); [API tests](../tests/unit/control-secrets-api.spec.ts); [security tests](../tests/unit/control-secrets-security.spec.ts); [review](../plans/reports/code-review-260903-1510-phase-02-control-secrets-api.md) |
| 3. Run executor environment injection | **DONE** | 100% | 1.0h | [Phase 03](../plans/260903-1251-serve-control-dynamic-credentials/phase-03-run-executor-environment-injection.md); [validation](../plans/reports/tester-260903-1640-phase-03-run-executor-environment-injection-cycle-2.md) — 239/239 unit, 37/37 targeted, 10/10 review |
| 4. Control UI credential modal and state | Pending | 0% | 1.5h | [Phase 04](../plans/260903-1251-serve-control-dynamic-credentials/phase-04-control-ui-credential-management.md) |
| 5. Unit, API, and Playwright E2E verification | Pending | 0% | 1.0h | [Phase 05](../plans/260903-1251-serve-control-dynamic-credentials/phase-05-test-suite-and-e2e-verification.md) |

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

## Next milestones

1. **Phase 04 — Control UI credential modal and state (0%)**: provide discovery, masking, persistence status, and clear actions.
2. **Phase 05 — Unit, API, and Playwright E2E verification (0%)**: complete end-to-end security and regression evidence.
 
## Review follow-up

- Non-blocking review recommendation: reject prototype keys (`__proto__`, `prototype`, `constructor`) in a follow-up hardening change before production release.
- Non-blocking Phase 02 follow-up: body-less `DELETE /api/secrets?name=...` currently encounters the shared JSON content-type gate; align the UI/request contract or gate behavior.
- Non-blocking Phase 02 follow-up: normalize the 415 error code to `UNSUPPORTED_MEDIA_TYPE` and add any remaining direct Host-header regression coverage.
- Keep `report-server-secret-store.ts` focused; it is at the 200-line maintainability threshold.

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

## Unresolved questions

None.
