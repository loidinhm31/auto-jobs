# Phase 03: Auto-Build Runner & Log Streaming

> Parent: [plan.md](./plan.md) | Prev: [phase-02-stage-view-observation-engine.md](./phase-02-stage-view-observation-engine.md) | Next: [phase-04-control-page-ui-enhancements.md](./phase-04-control-page-ui-enhancements.md)

**Status:** DONE · **Progress:** 100% · **Completed:** 2026-09-24T03:00:00+07:00

## Context
Connect the Stage View observation engine to the auto-build runner workflow and the reporting execution engine. When `waitForCompletion` is enabled, the runner must determine pre-build state, trigger the build, wait for redirect to `jobUrl`, monitor Stage View to completion, and stream stage transition logs to the Control Dashboard in real-time.

## Requirements
1. Update `JenkinsBuildTriggerResult` in `src/jenkins/build-trigger.ts` to include optional `buildNumber?: string`, `buildResult?: string`, and `stages?: StageViewStage[]`.
2. Update `triggerParameterizedBuild`:
   - If `waitForCompletion: true`:
     - Read latest run ID on `config.jobUrl` before navigating to build parameters.
     - Submit parameterized build form.
     - Follow redirect to `config.jobUrl`.
     - Call `waitForStageViewCompletion(page, latestRunId, deadline, onProgress)`.
     - Return terminal status (`submitted` if completed with SUCCESS, `failed` if FAILED/UNSTABLE/ABORTED, `timeout` if timed out).
   - If `waitForCompletion: false`:
     - Keep existing behavior: submit build, wait for POST response, immediately return `state: 'submitted'`.
3. Update `AutoBuildRunOutcome` in `src/project/auto-build-runner.ts` to include `buildNumber`, `buildResult`, and `stages`.
4. Update `executeControlRun` in `src/reporting/report-server-run-executor.ts`:
   - Pass `onProgress: (msg) => safeAddLog(msg)` to stream live Stage View events directly to `record.logs`.
   - Record `buildNumber`, `buildResult`, and `stages` in `record.result`.
   - Set `record.status = 'succeeded'` for `SUCCESS`, or `record.status = 'failed'` for `FAILED`/`ABORTED`/`timeout`.

## Related Files
- `src/jenkins/build-trigger.ts`
- `src/project/auto-build-runner.ts`
- `src/project/project-workflow.ts`
- `src/reporting/report-server-run-executor.ts`
- `tests/unit/auto-build-runner.spec.ts`
- `tests/unit/jenkins-build-trigger.spec.ts`

## Implementation Steps
1. In `src/jenkins/build-trigger.ts`, accept `waitForCompletion?: boolean` and `onProgress?: (msg: string) => void`.
2. Wire `waitForStageViewCompletion` into the post-submit workflow.
3. In `src/project/auto-build-runner.ts`, propagate `waitForCompletion` and progress logging to the workflow.
4. In `src/reporting/report-server-run-executor.ts`, forward `onProgress` to `safeAddLog`.
5. Populate structured result with build number, terminal status, and stage breakdown.

## Todo List
- [x] Add `waitForCompletion` and `onProgress` to build trigger
- [x] Implement pre-build run detection and post-redirect stage view observation in trigger
- [x] Update `AutoBuildRunOutcome` with rich build details
- [x] Update `executeControlRun` to map terminal build state and stream logs
- [x] Update unit tests in `auto-build-runner.spec.ts` and `jenkins-build-trigger.spec.ts`

## Success Criteria
- Instant submission works unchanged when `waitForCompletion: false`.
- Full Stage View tracking runs and reports real build outcome when `waitForCompletion: true`.
- Stage transitions stream in real-time to execution logs.
