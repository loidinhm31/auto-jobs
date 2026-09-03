# Phase 01: SecretStore Backend Module

## Context Links
- Parent Plan: [plan.md](./plan.md)
- Research: [researcher-01-backend-secret-store.md](./research/researcher-01-backend-secret-store.md)
- Reference Code: `src/reporting/report-server-config-store.ts`
- Security Doc: `docs/architecture.md`

## Overview
- **Date**: 2026-09-03
- **Description**: Implement `report-server-secret-store.ts` to manage secure, atomic persistence of local secrets in `config/secrets.local.json`.
- **Priority**: P1 (Foundation)
- **Implementation Status**: **DONE**
- **Review Status**: **DONE**
- **Completed At**: 2026-09-03T14:40:00+07:00
- **Estimated Effort**: 1.5h

## Key Insights
- Project configs store variable names (`usernameVariable`), not values.
- `config/secrets.local.json` is already covered by `.gitignore` (`config/*.local.json`).
- File writes must be atomic via temporary sibling file and `fs.rename` to prevent half-written corruptions.
- File permissions should be `0o600` (POSIX owner read/write) with platform graceful fallback for Windows.
- Concurrency must be serialized with an in-memory write lock.

## Requirements
- Target file path: `path.resolve(configRoot, 'secrets.local.json')`.
- Missing file evaluates cleanly to empty map (`{}`).
- Validate keys strictly against variable name regex: `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/`.
- Reject non-string values and oversized payloads (`MAX_CONFIG_FILE_BYTES` = 1 MiB).
- Provide methods:
  - `readSecrets(): Promise<Readonly<Record<string, string>>>`
  - `listSecretNames(): Promise<ReadonlyArray<string>>`
  - `putSecret(name: string, value: string): Promise<void>`
  - `putSecrets(entries: Record<string, string>): Promise<void>`
- Safe serialization with lexicographically sorted keys.

## Architecture
```
┌────────────────────────────────────────────────────────┐
│                      SecretStore                       │
├────────────────────────────────────────────────────────┤
│ - configRoot: string                                   │
│ - targetPath: config/secrets.local.json                │
│ - writeLock: Promise-tail mutex                        │
├────────────────────────────────────────────────────────┤
│ + readSecrets(): Record<string, string>                │
│ + listSecretNames(): string[]                          │
│ + putSecret(name, value): void                         │
│ + putSecrets(entries): void                            │
└────────────────────────────────────────────────────────┘
```

## Related Code Files
- Create: `src/reporting/report-server-secret-store.ts`
- Modify: `src/reporting/report-server.ts` (wire store into server setup)
- Modify: `src/reporting/report-server-constants.ts` (add constants if needed)

## Implementation Steps
1. Define `SecretStore` interface and `createSecretStore(configRoot: string): Promise<SecretStore>`.
2. Implement safe path resolution asserting target parent is canonical `configRoot` and filename is `secrets.local.json`.
3. Implement in-memory write lock pattern matching `report-server-config-store.ts`.
4. Implement atomic write:
   - Create sibling temp file `.secrets.local.<random>.tmp` with mode `0o600` and flag `wx`.
   - Write sanitized JSON string.
   - Sync file handle (`handle.sync()`) and close.
   - Rename temp file to target path (`secrets.local.json`).
   - Clean up temp file on failure.
5. Export factory from `src/reporting/report-server-secret-store.ts`.

## Todo List
- [x] Create `src/reporting/report-server-secret-store.ts` with interface and types.
- [x] Add variable name regex validation and payload boundary checks.
- [x] Implement atomic file writing and `0o600` permissions.
- [x] Implement read/list methods returning read-only views.
- [x] Add error boundary preventing secrets from appearing in error messages.

## Success Criteria
- `readSecrets` returns empty record when `secrets.local.json` is absent.
- `putSecret` writes valid JSON readable only by current user.
- Invalid keys (e.g. `invalid-key!`, traversal attempts) throw validation errors.
- Unhandled errors never echo secret values in error messages.

## Risk Assessment
- **Risk**: Windows does not enforce POSIX `0o600` mode flags.
  - **Mitigation**: Document Windows directory ACL reliance; test with platform guard.
- **Risk**: Concurrent PUT calls overwrite each other.
  - **Mitigation**: Serialized write lock in memory ensures sequential read-modify-write.

## Security Considerations
- Never log raw secrets.
- Never write secrets to any path other than `secrets.local.json`.
- Clean up temporary files in `finally` blocks.

## Next Steps
Proceed to Phase 02: Control Secrets API & Security Gates.
