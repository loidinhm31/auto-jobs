# Phase 03: Run Executor Environment Injection

## Context Links
- Parent Plan: [plan.md](./plan.md)
- Research: [researcher-01-backend-secret-store.md](./research/researcher-01-backend-secret-store.md)
- Target File: `src/reporting/report-server-run-executor.ts`
- Runner Module: `src/runner.ts` & `src/project/auto-build-runner.ts`

## Overview
- **Date**: 2026-09-03
- **Description**: Inject stored secrets from `SecretStore` into the execution environment during `executeControlRun` so that `resolveProjectSecrets` seamlessly finds credentials.
- **Priority**: P1
- **Implementation Status**: **DONE**
- **Review Status**: **DONE** (approved, 10/10)
- **Completed At**: 2026-09-03T17:18:32+07:00
- **Estimated Effort**: 1.0h

## Key Insights
- `resolveProjectSecrets(project, env)` reads credentials from the `env` dictionary passed to `normalizeProjectConfigDocument` and executor dependencies.
- If `env` contains `{ JENKINS_USERNAME: 'val', JENKINS_PASSWORD: 'val' }`, credential resolution succeeds without needing shell environment exports.
- Stored secrets from `secrets.local.json` must take precedence over default `process.env` so that dynamic UI updates take effect immediately.
- Neither `process.env` nor `options.env` should be mutated globally. An immutable copy `runEnv` must be constructed per run.
- Log statements must be sanitized to prevent credential values from leaking into `addLog`.

## Requirements
- Add `secretStore?: SecretStore` to `RunManagerOptions` in `src/reporting/report-server-run-manager.ts`.
- In `executeControlRun` (`src/reporting/report-server-run-executor.ts`):
  1. Retrieve snapshot: `const stored = options.secretStore ? await options.secretStore.readSecrets() : {};`
  2. Construct merged environment:
     ```ts
     const runEnv: NodeJS.ProcessEnv = {
       ...options.env ?? process.env,
       ...stored,
     };
     ```
  3. Pass `runEnv` to `normalizeProjectConfigDocument(configEntry.document, runEnv)`.
  4. Pass `{ runtimeEnvironment: runEnv }` to `reportExecutor` and `autoBuildExecutor`.
- In `addLog`:
  - Ensure secret values are redacted from diagnostic logs before persisting to `record.logs`.

## Architecture
```
executeControlRun(record, options, addLog)
       │
       ├── 1. Read SecretStore snapshot: storedSecrets
       │
       ├── 2. Construct runEnv = { ...process.env, ...storedSecrets }
       │
       ├── 3. normalizeProjectConfigDocument(doc, runEnv)
       │         │
       │         └── resolveProjectSecrets uses runEnv!
       │
       ├── 4. reportExecutor(projects, { runtimeEnvironment: runEnv })
       │      OR autoBuildExecutor(project, { runtimeEnvironment: runEnv })
       │
       └── 5. Progress logs sanitized with redactText(msg, secretValues)
```

## Related Code Files
- Modify: `src/reporting/report-server-run-manager.ts`
- Modify: `src/reporting/report-server-run-executor.ts`
- Modify: `src/reporting/report-server.ts` (pass `secretStore` to `createRunManager`)

## Implementation Steps
1. Update `RunManagerOptions` interface to include `secretStore?: SecretStore`.
2. In `report-server.ts`, pass `secretStore` to `createRunManager`.
3. In `report-server-run-executor.ts`:
   - Load secrets before config normalization.
   - Construct `runEnv` merge.
   - Supply `runEnv` to `normalizeProjectConfigDocument` and executor options.
   - Collect secret values for diagnostic redaction in `addLog`.

## Todo List
- [x] Add `secretStore` to `RunManagerOptions` interface.
- [x] Wire `secretStore` into `createRunManager` in `src/reporting/report-server.ts`.
- [x] Merge stored secrets with base environment in `src/reporting/report-server-run-executor.ts`.
- [x] Pass `runEnv` to `normalizeProjectConfigDocument` and runners.
- [x] Ensure log redaction strips stored secret values from execution logs.

## Success Criteria
- Running a report or auto-build with credentials in `secrets.local.json` succeeds even when shell environment variables are unset.
- Stored secret values never appear in `record.logs`.
- Global `process.env` remains unpolluted.

## Risk Assessment
- **Risk**: Credential values leak into run error messages.
  - **Mitigation**: Use `formatDiagnostic(error, secretValues)` and `redactText` to strip known secret values.

## Security Considerations
- Keep `runEnv` ephemeral and scoped to the run promise.
- Avoid printing child-process command lines with credential arguments.

## Validation
- **Full unit validation**: `npm run test:unit` — **239/239 passed, 0 failed, 0 skipped**.
- **Targeted validation**: executor/secrets control tests — **37/37 passed, 0 failed, 0 skipped**.
- **Code review**: **APPROVED, 10/10**.
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) — **passed, 0 errors**.

## Next Steps
Proceed to Phase 04: Control UI Credential Modal & State.
