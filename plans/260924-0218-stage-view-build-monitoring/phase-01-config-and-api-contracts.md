# Phase 01: Config & API Contracts

> Parent: [plan.md](./plan.md) | Next: [phase-02-stage-view-observation-engine.md](./phase-02-stage-view-observation-engine.md)

**Status:** DONE · **Progress:** 100% · **Completed:** 2026-09-24T03:00:00+07:00

## Context
Operators requested the ability to configure whether auto-build runs wait for Stage View completion or return immediately upon form submission (`waitForCompletion`). The setting should be supported in project configuration schema-v1 (defaulting to `true`) and overrideable via `POST /api/run`.

## Requirements
1. Add `waitForCompletion?: boolean` to `ProjectConfigInput` and `readonly waitForCompletion: boolean` to `NormalizedProjectConfig`.
2. Update `project-config-project-validation.ts` to validate that `waitForCompletion` (if present) is a boolean.
3. Update `project-config-loader.ts` to normalize `waitForCompletion` with default `true`.
4. Update `POST /api/run` body validation in `report-server-control-api.ts` to accept optional `waitForCompletion?: boolean`.
5. Update `StartRunParams` and `ControlRunRecord` in `report-server-run-manager.ts` to persist `waitForCompletion`.
6. Update `executeControlRun` in `report-server-run-executor.ts` to pass effective `waitForCompletion` (`record.waitForCompletion ?? project.waitForCompletion ?? true`) to `autoBuildExecutor`.

## Related Files
- `src/config/config-types.ts`
- `src/config/project-config-loader.ts`
- `src/config/project-config-project-validation.ts`
- `src/reporting/report-server-control-api.ts`
- `src/reporting/report-server-run-manager.ts`
- `src/reporting/report-server-run-executor.ts`
- `tests/unit/project-config-validation.spec.ts`
- `tests/unit/control-runs-api.spec.ts`

## Implementation Steps
1. Add `waitForCompletion` optional boolean field in `src/config/config-types.ts`.
2. Add validator rule in `src/config/project-config-project-validation.ts`: `if (value.waitForCompletion !== undefined && typeof value.waitForCompletion !== 'boolean') issues.push(...)`.
3. In `src/config/project-config-loader.ts`, set `waitForCompletion: project.waitForCompletion !== false`.
4. In `src/reporting/report-server-control-api.ts`, extract `waitForCompletion = typeof data['waitForCompletion'] === 'boolean' ? data['waitForCompletion'] : undefined`.
5. In `src/reporting/report-server-run-manager.ts`, store `waitForCompletion` in `ControlRunRecord`.
6. In `src/reporting/report-server-run-executor.ts`, forward `waitForCompletion` to `autoBuildExecutor`.

## Todo List
- [x] Add `waitForCompletion` to config types
- [x] Add validation for `waitForCompletion` boolean
- [x] Normalize default `true` in project config loader
- [x] Accept `waitForCompletion` in `POST /api/run`
- [x] Record `waitForCompletion` in run manager and pass to executor
- [x] Add unit tests for config validation and API handling

## Success Criteria
- Config schema accepts `waitForCompletion: true` and `waitForCompletion: false`.
- Invalid non-boolean types produce descriptive validation error.
- `POST /api/run` accepts `waitForCompletion` and records it on active run.
