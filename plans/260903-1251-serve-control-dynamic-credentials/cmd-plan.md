# Implementation Plan: Serve Control Dynamic Credentials

> Quick access overview for tracking implementation progress.

## Overview
- **Goal**: Allow operators to set, persist, and update credentials via the `serve:control` web UI without modifying version-controlled JSON files.
- **Target File**: `config/secrets.local.json` (git-ignored)
- **Branch**: main | **Status**: pending | **Total Effort**: 6h

## Phase Index

- [ ] **Phase 01: SecretStore Backend Module** (1.5h)
  - Path: [`phase-01-backend-secret-store.md`](./phase-01-backend-secret-store.md)
  - Core: Atomic write-lock persistence, mode 0o600, safe path assertion.
- [ ] **Phase 02: Control Secrets API & Security Gates** (1.0h)
  - Path: [`phase-02-control-secrets-api.md`](./phase-02-control-secrets-api.md)
  - Core: `GET /api/secrets` (redacted), `PUT /api/secrets` (CSRF/Host validated).
- [ ] **Phase 03: Run Executor Environment Injection** (1.0h)
  - Path: [`phase-03-run-executor-environment-injection.md`](./phase-03-run-executor-environment-injection.md)
  - Core: Merge stored secrets into `runEnv` in `executeControlRun`; redact logs.
- [ ] **Phase 04: Control UI Credential Modal & State** (1.5h)
  - Path: [`phase-04-control-ui-credential-management.md`](./phase-04-control-ui-credential-management.md)
  - Core: Native `<dialog>`, discover required variables, password inputs, save flow.
- [ ] **Phase 05: Unit, API & Playwright E2E Verification** (1.0h)
  - Path: [`phase-05-test-suite-and-e2e-verification.md`](./phase-05-test-suite-and-e2e-verification.md)
  - Core: SecretStore unit tests, API tests, E2E browser credential lifecycle test.
