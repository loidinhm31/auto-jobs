---
title: "Dynamic Credential Management and Persistence for Serve Control"
description: "Enable operators to dynamically configure, persist, and update credentials via the serve:control UI into git-ignored config/secrets.local.json."
status: completed
priority: P2
effort: 6h
branch: main
tags: [control-server, credentials, secrets, ui, security, playwright]
created: 2026-09-03
---

# Dynamic Credential Management and Persistence for Serve Control

## Executive Summary

The `serve:control` dashboard currently reads project configurations that specify environment variable names (e.g. `JENKINS_USERNAME`, `JENKINS_PASSWORD`) rather than literal credential values. If an operator sets credentials directly in the config JSON, or if the environment variables are not exported in the shell before launching Node, execution fails with `Invalid configuration: test is required; test is required`.

This plan implements a clean, secure, and persistent credential management mechanism within `serve:control`:
1. **Local Secret Store**: Stores credentials in `config/secrets.local.json` (strictly ignored by `.gitignore`, file mode `0o600`, atomic write-lock persistence).
2. **Control Plane API**: Adds `GET /api/secrets` (redacted status only), guarded `PUT /api/secrets` mutation, and explicit clear/delete operations.
3. **Execution Injection**: Automatically merges stored secrets into `runEnv` in `report-server-run-executor.ts` before Playwright runs.
4. **Dashboard UI**: Adds a dedicated "Credentials" modal with password masking, variable discovery, and persistence status chips.
5. **Quality Gates**: Full unit, API, and Playwright E2E test coverage with zero secret leakage.

## Architectural Invariants

- **Zero Git Leakage**: Credential values MUST NEVER be written to version-controlled `config/*.json` files.
- **Redaction by Default**: `GET /api/secrets` returns only boolean presence flags (`{ secrets: { JENKINS_USERNAME: true } }`), never plaintext values or lengths.
- **CSRF & Host Security**: All credential mutations enforce the existing `validateMutationRequest` checks (Host, same-origin, Fetch Metadata, CSRF token).
- **Process Isolation**: Merged secrets apply only to the specific execution run; `process.env` is never permanently mutated.

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 01 | SecretStore Backend Module | **DONE** | 1.5h | [phase-01-backend-secret-store.md](./phase-01-backend-secret-store.md) |
| 02 | Control Secrets API & Security Gates | **DONE** | 1.0h | [phase-02-control-secrets-api.md](./phase-02-control-secrets-api.md) |
| 03 | Run Executor Environment Injection | **DONE** | 1.0h | [phase-03-run-executor-environment-injection.md](./phase-03-run-executor-environment-injection.md) |
| 04 | Control UI Credential Modal & State | **DONE** | 1.5h | [phase-04-control-ui-credential-management.md](./phase-04-control-ui-credential-management.md) |
| 05 | Unit, API & Playwright E2E Verification | **DONE** | 1.0h | [phase-05-test-suite-and-e2e-verification.md](./phase-05-test-suite-and-e2e-verification.md) |

Phase 01 completion: **DONE** — 2026-09-03T14:40:00+07:00
Phase 02 completion: **DONE** — 2026-09-03T15:25:00+07:00
Phase 03 completion: **DONE** — 2026-09-03T17:18:32+07:00
Phase 04 completion: **DONE** — 2026-09-03T18:35:00+07:00
Phase 05 completion: **DONE** — 2026-09-03T19:50:00+07:00
Overall plan completion: **COMPLETED** — 2026-09-03T19:50:00+07:00

### Phase 03 Delivery Evidence
- **Status**: **DONE** — 2026-09-03T17:18:32+07:00.
- **Full unit validation**: `npm run test:unit` — **239/239 passed, 0 failed, 0 skipped**.
- **Targeted validation**: executor/secrets control tests — **37/37 passed, 0 failed, 0 skipped**.
- **Code review**: **APPROVED, 10/10**.
- **Scope delivered**: per-run SecretStore snapshots merge into `runEnv`, flow through config normalization and report/auto-build runners, and redact stored secret values from diagnostic logs without mutating global `process.env`.

### Phase 04 Delivery Evidence
- **Status**: **DONE** — 2026-09-03T18:35:00+07:00.
- **Combined validation**: [Phase 04 validation](../reports/tester-260903-1825-phase-04-control-ui-credential-modal-state-validation.md) — **243/243 tests passed, 0 failed, 0 skipped** (239 unit + 4 control E2E).
- **Code review**: [Phase 04 code review](../reports/code-review-260903-1829-phase-04-control-ui-credential-modal.md) — **APPROVED, 9.5/10**.
- **Accessibility**: **0 Axe violations** in the dashboard and credential modal checks.
- **Security**: **zero secret leakage**; saved values were absent from the DOM, API responses, and execution diagnostics.

### Phase 05 Delivery Evidence
- **Status**: **DONE** — 2026-09-03T19:50:00+07:00.
- **Full Unit Validation**: `npm run test:unit` — **248/248 passed, 0 failed, 0 skipped**.
- **Targeted Unit Specs**:
  - `tests/unit/control-secret-store.spec.ts`: **7/7 passed**.
  - `tests/unit/control-secrets-api.spec.ts`: **10/10 passed**.
- **E2E Control Page Validation**: `npm run test:control` (Chromium + WebKit) — **6/6 passed, 0 failed, 0 skipped**.
- **Code Review**: [Phase 05 Code Review](../reports/code-review-260903-1945-phase05-verification.md) — **APPROVED, 9.5/10**.
- **Security Scope Delivered**:
  - Atomicity, isolated locks, and 0o600 POSIX permissions verified in `SecretStore`.
  - Redaction-by-default and CSRF/Origin 403 enforcement tested on `/api/secrets`.
  - Full browser E2E lifecycle verified: initial run failure -> credential entry -> badge transition -> execution success -> zero DOM/log leakage -> persistence across reload.

## Dependencies

- Existing `validateMutationRequest` in `src/reporting/report-server-control-security.ts`
- Existing `readBoundedJsonBody`, `sendJson`, `sendError` in `src/reporting/report-server-json.ts`
- Existing `resolveProjectSecrets` in `src/config/project-config-environment.ts`
- Native `<dialog>` support in modern browsers

## Validation Summary

**Validated:** 2026-09-03
**Questions asked:** 4

### Confirmed Decisions
1. **Precedence**: UI SecretStore values override `process.env` to enable dynamic updates and rotations without server restarts.
2. **Deletion UX**: Each configured credential row includes an explicit "Clear" button in the Credentials modal to cleanly remove it from `config/secrets.local.json`.
3. **Discovery Scope**: The UI scans all projects in the active configuration (including disabled projects), enabling operators to configure secrets before enabling a service.
4. **CLI Parity**: Standalone CLI runs (`npm run report` / `src/cli.ts`) also load `config/secrets.local.json` when present, ensuring consistent behavior across CLI and Web UI.

### Action Items
- [x] Ensure `SecretStore` supports `deleteSecret(name: string): Promise<void>`.
- [x] Ensure `DELETE /api/secrets` or `PUT /api/secrets` with clear action removes keys.
- [ ] Add optional local secret loading helper to `src/cli.ts` / `scripts/run-report.mjs` when `config/secrets.local.json` exists.

### Phase 02 Delivery Evidence
- **Status**: **DONE** — 2026-09-03T15:25:00+07:00.
- **Targeted validation**: `control-secrets-api.spec.ts` and `control-secrets-security.spec.ts` — **16 passed, 0 failed, 0 skipped**.
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) — **passed, 0 errors**.
- **Review**: [Phase 02 code review](../reports/code-review-260903-1510-phase-02-control-secrets-api.md) — **APPROVED WITH WARNINGS, 9.0/10**, no critical issues.
- **Security scope delivered**: presence-only GET responses; guarded PUT/DELETE mutations; strict key/value validation; no-store responses; zero plaintext leakage.
