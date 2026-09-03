# Project roadmap

Last updated: 2026-09-03T14:40:00+07:00  
Plan: [Dynamic Credential Management and Persistence for Serve Control](../plans/260903-1251-serve-control-dynamic-credentials/plan.md)

## Overall status

- Status: **In progress**
- Progress: **25%** (1.5 of 6 weighted planned hours; 1 of 5 phases complete)
- Current milestone: **Phase 01 — SecretStore Backend Module DONE**
- Phase 01 completed: **2026-09-03T14:40:00+07:00**

## Phase progress

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. SecretStore backend module | **DONE** | **100%** | 1.5h | [Phase 01](../plans/260903-1251-serve-control-dynamic-credentials/phase-01-backend-secret-store.md); [review](../plans/260903-1251-serve-control-dynamic-credentials/reports/code-review-260903-1422-secret-store-backend.md) |
| 2. Control secrets API and security gates | Pending | 0% | 1.0h | [Phase 02](../plans/260903-1251-serve-control-dynamic-credentials/phase-02-control-secrets-api.md) |
| 3. Run executor environment injection | Pending | 0% | 1.0h | [Phase 03](../plans/260903-1251-serve-control-dynamic-credentials/phase-03-run-executor-environment-injection.md) |
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

## Next milestones

1. **Phase 02 — Control secrets API and security gates (0%)**: expose redacted secret status and guarded mutation/clear operations.
2. **Phase 03 — Run executor environment injection (0%)**: apply stored secrets per execution without mutating `process.env`.
3. **Phase 04 — Control UI credential modal and state (0%)**: provide discovery, masking, persistence status, and clear actions.
4. **Phase 05 — Unit, API, and Playwright E2E verification (0%)**: complete end-to-end security and regression evidence.

## Review follow-up

- Non-blocking review recommendation: reject prototype keys (`__proto__`, `prototype`, `constructor`) in a follow-up hardening change before production release.
- Keep `report-server-secret-store.ts` focused; it is at the 200-line maintainability threshold.

## Changelog

### 0.1.0 (development) — 2026-09-03

- Completed Phase 01 SecretStore backend module at 100%.
- Added atomic, bounded, permission-conscious local secret persistence with redacted error handling.
- Linked Phase 01 implementation and 9.5/10 review evidence.

## Unresolved questions

None.
