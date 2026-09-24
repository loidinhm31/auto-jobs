# Phase 02 — Parallel auto-build executor and API

## Context links
- [Master contract and side-effect checklist](./plan.md) · [Selection prerequisite](./phase-01-config-and-run-selection.md) · [UI consumer](./phase-03-control-page-ui-refactor.md).
- Existing flow: `src/reporting/report-server-control-api.ts:69-163`; `src/reporting/report-server-run-manager.ts:14-67,80-172`; `src/reporting/report-server-run-executor.ts:10-126`; `src/project/report-worker-pool.ts:14-75`; `src/project/auto-build-runner.ts:11-58,65-135`; `src/config/report-worker-count.ts:1-21`; `src/reporting/control-page/types/index.ts:87-130`.

## Overview
**Date:** 2026-09-24 · **Priority:** P2 · **Status:** pending · **Effort:** 4h · **Depends on:** phase 01. Accept omitted-ID auto-build POST and run selected projects with at most the saved worker count; expose ordered, redacted per-project outcomes.

## Key Insights
- `handleRunApi` already performs Host/Origin/CSRF/content-type checks via `validateMutationRequest`, validates body and rejects any request-level `workerCount` at lines 76–101; only its lines 119–123 prohibit omitted `projectId`. `StartRunParams`/`ControlRunRecord.projectId` are already optional; no new request shape needed.
- `executeControlRun` reads SecretStore once, verifies config ETag, normalizes once, passes saved `reportWorkers` only to reports, then calls a **single** `autoBuildExecutor` and writes scalar result at lines 74–115. Reuse the verified document/count for builds; do not weaken one-active-run admission in `createRunManager`.
- `executeProjectWorkerPool` uses fixed `min(count, length)` loops, an incrementing index, per-slot catches and ordered results. It owns a shared report browser/artifacts and calls `runProject`: do not call it directly for auto-build. `runAutoBuildProject` owns a separate browser/context/page/deadline per invocation and closes both in `finally`.

## Requirements
1. `POST /api/run` with valid `runType: 'auto-build'` and **omitted** `projectId` returns 202 for one batch run ID; execution selects all enabled auto-build projects from matched config. Explicit valid ID remains targeted. For auto-build requests, a supplied blank, whitespace, null, number or other non-string ID returns 422 before `startRun`; leave report request semantics unchanged. `workerCount` supplied (even on omitted-ID request) still gets `422 INVALID_WORKER_COUNT` first.
2. Use `normalizeReportWorkerCount(configEntry.document.reportWorkers)` or current saved fallback in executor (config schema already validates) and run at most `min(count, selected.length)` build calls simultaneously; no request override and no worker count passed into `AutoBuildRunnerDependencies`. Count 1 serial, count 2–4 bounded; outcome array stays config order despite completion order. All selected projects attempted once, regardless of sibling failure.
3. Per-project `waitForCompletion` and `waitTimeoutMs` remain resolved from project/default; targeted API override remains supported. If caller supplies an existing per-run override on a bulk request, apply it consistently to every selected project (UI sends none); no new checkbox/dialog or override field. Preserve existing Stage View semantics and one POST maximum per project.
4. `ControlRunRecord.result` adds `buildProjects?: readonly AutoBuildRunOutcome[]` (types imported from `src/project/auto-build-runner.ts:20-33`); `RunResult` mirrors the serializable per-project shape in `src/reporting/control-page/types/index.ts:80-97` without loosening safety through arbitrary unknown fields. For a one-project execution retain the current scalar `buildState`, number, result, stages, job/build URL, timestamps/status/error fields alongside the array; for multi-project builds, render/use the array rather than implying first project's scalar status represents all.
5. For a batch, `record.status = 'succeeded'` iff **every** outcome `exitCode === 0` (`succeeded`/`submitted`); otherwise `failed` (including `submission-unknown`, rejected, timeout, failed-before-submit). Update legacy single-target status expectations deliberately to the decided exit-code rule; retain outcome's precise `state` in result. No report artifacts or report executor calls on build mode.
6. Any thrown executor error becomes an indexed `submission-unknown` outcome with `exitCode: 1`, preserving conservative possible-side-effect semantics; no retry. The worker continues. Redact secret values from *every* persisted build outcome string, nested stage fields, logs, and diagnostic errors; never expose form bodies, parameters, crumbs, headers, cookies or raw responses.

## Architecture
`POST /api/run → handleRunApi gate/parse → createRunManager.startRun (single active run) → executeControlRun → SecretStore snapshot + config/ETag/normalize → [targeted selectAutoBuildProject | bulk selectAutoBuildProjects] → shared saved reportWorkers bound → fixed worker loops → existing autoBuildExecutor(project, runtimeEnvironment, effective wait options, contextual onProgress) → indexed AutoBuildRunOutcome[] → sanitized record.result.buildProjects + optional one-project scalar fields → GET /api/run → RunResultBox`. API retains 202 acceptance, GET exposes eventual failure (empty selection, stale ETag or runtime), 409 concurrent-run conflict. Job submission is external and irreversible: no transaction, rollback or automatic retry. Bound covers independent browser processes; be explicit about higher CPU/memory and provider load, max four.

## Related code files
| Action | Path and current range | Work |
| --- | --- | --- |
| Modify | `src/reporting/report-server-control-api.ts:93-143` | Keep worker override/security precedence; allow omission; reject present invalid ID before manager admission. |
| Modify | `src/reporting/report-server-run-executor.ts:24-115` | Branch selection by optional ID, dispatch pool, contextual logs, sanitize every outcome, aggregate status/result; keep report path untouched. |
| Modify | `src/reporting/report-server-run-manager.ts:21-55,116-163` | Add typed `buildProjects` result; keep one-active-run lifecycle, injection point and GET response. |
| Create only if needed for <200-line modules | `src/project/auto-build-worker-pool.ts` | Small fixed-loop indexed scheduler using injectable existing `autoBuildExecutor`; no report browser/artifact imports or generic task framework. |
| Verify unchanged | `src/project/auto-build-runner.ts:55-135`, `src/project/report-worker-pool.ts:26-75`, `src/config/report-worker-count.ts:1-21` | Preserve per-build safety/cleanup; reuse scheduling shape, shared numeric policy. |
| Update in phase 04 | `tests/unit/control-run-api.spec.ts:9-48,107-228`, `tests/unit/control-run-executor-secrets.spec.ts:187-304`, `tests/unit/bounded-report-workers.spec.ts:76-165` | Extend API/executor proof; use report-pool barrier testing pattern, not its implementation. |

## Implementation Steps
1. In `handleRunApi`, leave `workerCount` rejection before project ID handling. For auto-build, inspect `Object.hasOwn(data, 'projectId')`: if present require a nonblank string; otherwise leave `projectId` undefined. Preserve report and targeted POST behavior, HTTP 202/409/422 semantics, guard conditions and existing wait option validation.
2. In executor, after matched `readConfig`/normalization choose `record.projectId === undefined ? selectAutoBuildProjects(normalized) : [selectAutoBuildProject(normalized, record.projectId)]`. Fail on empty before starting any worker. Derive bounded count from that same config entry using existing numeric policy. Continue to pass a distinct per-project progress callback containing project ID, passed through `safeAddLog`.
3. Implement at most `Math.min(workerCount, projects.length)` loops with a synchronous cursor/index claim before each `await`, one result slot per input. Calls retain `runtimeEnvironment: runEnv`, existing wait overrides/project defaults and progress callback; no new pool-wide browser or artifact lock. Catch throw per slot, store conservative unknown-submission failure and continue; `await Promise.all` loops and verify all slots before completing. Do not use fail-fast `Promise.all(projects.map(...))`.
4. Sanitize each outcome before persistence: copy typed fields, redact known text fields (`projectName`, `jobUrl`, `buildPageUrl`, `error`, `buildNumber`, `buildResult`, stage `name`/`status`/`duration`, etc.) and logs using the SecretStore snapshot. Keep outcome IDs/order and exitCode; avoid serializing raw errors or untrusted fetch bodies. Scalar compatibility only when exactly one outcome, from that sanitized object.
5. Set terminal aggregate status from `every(outcome.exitCode === 0)`; persist `buildProjects`. Surface summary/log counts without reporting a mixed batch as success. Preserve report dispatch, ETag concurrency rejection, 409 one-active-run, and no report artifact publication on auto-build.

## Todo list
- [ ] Allow only omitted or nonblank string `projectId` for build requests; preserve security and workerCount validation precedence.
- [ ] Implement bounded, ordered, per-project-isolated build pool using existing runner and injected executor.
- [ ] Add sanitized typed batch DTO plus one-project scalar compatibility and aggregate terminal status.
- [ ] Verify ETag, zero-target, active-run and irreversible-side-effect boundaries before UI wiring.

## Success Criteria
- With 4 enabled builds and saved count 2, exactly two start before release; as one completes another starts; max active 2; each selected ID invoked once; returned `buildProjects` ordered as config, even when completion order differs.
- Default/explicit 1 executes serially; count 4 never exceeds 4; report/disabled projects never submitted; empty selection/stale ETag starts no builds. One failed/unknown build yields `failed` aggregate but siblings complete; one-project legacy scalar fields remain observable.
- Existing auth/CSRF/Host/Origin/content-type, 422 request override, 409 active-run and per-project wait/deadline tests remain meaningful; secrets do not appear in any GET result/log/stage/URL. Focused proof commands appear in phase 04.

## Risk Assessment
- Jenkins submission may have succeeded before an injected executor throws: mark `submission-unknown`, **never retry** or claim failed-before-submit. Other workers settle normally.
- Multiple independent browsers increase resources; fixed max 4 from validated saved schema. Do not share Playwright context/auth between projects or accidentally introduce report artifact writes.
- Existing single-project status `submission-unknown` may be asserted elsewhere: audit/adjust consumer tests for explicit new `exitCode` aggregate semantics while preserving detailed outcome state; do not quietly hide a test failure.

## Security Considerations
- Preserve loopback, exact Host/Origin/Fetch Metadata/CSRF/content-type protections in `validateMutationRequest`; no side-effectful pre-admission bypass. ETag and config normalization precede execution. Do not log secrets or accept request workerCount; redact all batch outcome fields and stage text. Each underlying runner must still enforce credential-free URL, allowed origin, exact Jenkins form/action and one guarded submission. Never auto-retry unknown submissions.

## Next steps
- Phase 03 consumes `buildProjects` and sends omitted-ID POST from the immediate action button. Phase 04 verifies deterministic concurrency/failure/security via injected executor before a fixture-backed browser journey.
