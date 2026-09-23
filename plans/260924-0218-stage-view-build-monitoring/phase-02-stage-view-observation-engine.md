# Phase 02: Stage View Observation Engine

> Parent: [plan.md](./plan.md) | Prev: [phase-01-config-and-api-contracts.md](./phase-01-config-and-api-contracts.md) | Next: [phase-03-auto-build-runner-integration.md](./phase-03-auto-build-runner-integration.md)

**Status:** DONE · **Progress:** 100% · **Completed:** 2026-09-24T03:00:00+07:00

## Context
When an auto-build is triggered on Jenkins, the parameterized build form redirects back to `jobUrl`. On `jobUrl`, Jenkins renders the Pipeline Stage View (`#pipeline-box .cbwf-stage-view table.jobsTable`). We need a dedicated, resilient DOM observation and polling engine that detects the newly triggered run and monitors it until all stages finish and the run reaches a terminal state.

## Requirements
1. Create `src/jenkins/stage-view.ts` with DOM query utilities for Jenkins Stage View.
2. Read Stage View headers: extract stage names from `thead th[class*="stage-header-name-"]`.
3. Read latest existing run: locate topmost row in `table.jobsTable tbody tr.job`, read `data-runid` and status classes.
4. Detect newly triggered run: locate the row where `data-runid > previousRunId` (or newly prepended row with `in-progress-run` / new run ID).
5. Track stage progress: read each `td.stage-cell-N`, its status class (`SUCCESS`, `FAILED`, `UNSTABLE`, `in-progress-run`, `NOT_EXECUTED`), and duration text.
6. Stream stage transitions via callback `onProgress?: (message: string) => void`.
7. Detect terminal status from row classes:
   - `SUCCESS`: all stages succeeded.
   - `FAILED`: one or more stages failed.
   - `UNSTABLE`: build unstable.
   - `ABORTED`: build cancelled.
8. Handle queue / polling delay: poll every 2-3s; reload page `await page.reload()` every ~10s if the DOM does not auto-update via Jenkins SSE/AJAX.
9. Bounded by `WorkflowDeadline`: throw or return `timeout` if `deadline.remainingMs()` expires.

## Related Files
- `src/jenkins/stage-view.ts` (new)
- `src/jenkins/build-trigger.ts`
- `src/jenkins/runner-config.ts`
- `templates/jenkins-template/template.html`
- `tests/unit/stage-view.spec.ts` (new)

## Implementation Steps
1. Define types in `src/jenkins/stage-view.ts`:
   - `StageViewStage`: `{ index: number; name: string; status: string; duration?: string }`
   - `StageViewRunStatus`: `'SUCCESS' | 'FAILED' | 'UNSTABLE' | 'ABORTED' | 'in-progress' | 'unknown'`
   - `StageViewRun`: `{ runId: number; buildNumber: string; status: StageViewRunStatus; stages: StageViewStage[] }`
   - `StageViewObservationResult`: `{ completed: boolean; run?: StageViewRun; error?: string }`
2. Implement `readLatestStageViewRun(page: Page): Promise<{ runId: number; buildNumber: string } | undefined>`.
3. Implement `readStageNames(page: Page): Promise<string[]>`.
4. Implement `readRunDetails(page: Page, row: Locator, stageNames: string[]): Promise<StageViewRun>`.
5. Implement `waitForStageViewCompletion(page, previousRunId, deadline, onProgress)`:
   - Wait for `#pipeline-box`.
   - Poll for new run ID.
   - On change in stage status, invoke `onProgress`.
   - On terminal status, return final run details.
6. Add comprehensive unit tests in `tests/unit/stage-view.spec.ts`.

## Todo List
- [x] Create `src/jenkins/stage-view.ts`
- [x] Implement header stage names parser
- [x] Implement run detection by `data-runid`
- [x] Implement stage status and duration parser
- [x] Implement polling and page refresh loop with deadline enforcement
- [x] Write unit tests for stage view parsing and polling states

## Success Criteria
- Accurately parses Stage View table from `template.html`.
- Identifies new build runs and tracks stage transitions to terminal status.
- Respects `WorkflowDeadline` without hanging.
