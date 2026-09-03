---
title: "Dynamic Credential Management and Persistence for Serve Control"
description: "Enable operators to dynamically configure, persist, and update credentials via the serve:control UI into git-ignored config/secrets.local.json."
status: in-progress
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
2. **Control Plane API**: Adds `GET /api/secrets` (redacted status only) and `PUT /api/secrets` (CSRF/Host-guarded mutation).
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
| 02 | Control Secrets API & Security Gates | pending | 1.0h | [phase-02-control-secrets-api.md](./phase-02-control-secrets-api.md) |
| 03 | Run Executor Environment Injection | pending | 1.0h | [phase-03-run-executor-environment-injection.md](./phase-03-run-executor-environment-injection.md) |
| 04 | Control UI Credential Modal & State | pending | 1.5h | [phase-04-control-ui-credential-management.md](./phase-04-control-ui-credential-management.md) |
| 05 | Unit, API & Playwright E2E Verification | pending | 1.0h | [phase-05-test-suite-and-e2e-verification.md](./phase-05-test-suite-and-e2e-verification.md) |

Phase 01 completion: **DONE** — 2026-09-03T14:40:00+07:00

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
- [ ] Ensure `SecretStore` supports `deleteSecret(name: string): Promise<void>`.
- [ ] Ensure `DELETE /api/secrets` or `PUT /api/secrets` with clear action removes keys.
- [ ] Add optional local secret loading helper to `src/cli.ts` / `scripts/run-report.mjs` when `config/secrets.local.json` exists.
