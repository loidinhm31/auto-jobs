---
title: "Control Page Parallel Auto-Build"
description: "Use one saved worker setting for bounded report and auto-build batches, with immediate dashboard actions and per-project results."
status: in-progress
priority: P2
effort: 11h
branch: main
tags: [feature, frontend, backend, api, refactor]
created: 2026-09-24
---

# Control Page Parallel Auto-Build — implementation plan

## Overview
One enabled/mode-selected project belongs to exactly one action: **Generate Reports (All Enabled)** selects enabled `report` projects; **Trigger Auto Build (All Enabled)** selects enabled `auto-build` projects and submits immediately, without a confirmation dialog. The existing schema-v1 top-level `reportWorkers` (default 1; integer 1–4) remains the persisted, ETag-protected setting for **both** actions; its dashboard label is **Workers**. Phases 01–03 are complete; Phase 04 covers integrated verification.

## Phases and progress
Overall status: **In progress** · **82%** (9 of 11 planned hours; 3 of 4 phases DONE).

| Phase | Status / progress | Effort | Depends on | Deliverable |
| --- | --- | ---: | --- | --- |
| [01 Config and run selection](./phase-01-config-and-run-selection.md) | **DONE** · 100% · 2026-09-24 | 2h | none | Shared saved-count contract; `selectAutoBuildProjects` and single-ID preservation |
| [02 Parallel executor and API](./phase-02-parallel-auto-build-executor-and-api.md) | **DONE** · 100% · 2026-09-24 | 4h | 01 | Optional-ID API, bounded build pool, ordered per-project outcomes |
| [03 Control Page UI](./phase-03-control-page-ui-refactor.md) | **DONE** · 100% · 2026-09-24 | 3h | 02 result contract | Two immediate action buttons, shared Workers selector, dialog removal, multi-result view; review 9.2/10, 399/399 unit tests, typecheck/build passed ([review](../reports/code-review-260924-1459-phase-03-control-page-ui-refactor.md)) |
| [04 Testing and verification](./phase-04-testing-and-verification.md) | Pending · 0% | 2h | 01–03 | Focused behavioral proof, browser surface, once-only integrated gate |

## Preflight contract
- Keep `runType: 'report' | 'auto-build'` per project, omitted mode ⇒ `report`; `enabled: false` excludes both. No schema version bump, new worker field, browser-local setting, request-level `workerCount`, per-project worker setting, or change to direct CLI report semantics.
- Preserve `POST /api/run` with `runType: 'auto-build', projectId: '<id>'` as targeted execution; omitted `projectId` means all enabled auto-build projects. Reject invalid/blank supplied IDs rather than treating them as omitted. Keep CSRF/Host/Origin/content-type gates, ETag match, one active control run and `422 INVALID_WORKER_COUNT` precedence.
- Save `reportWorkers` through current editor → `PUT /api/config`/`If-Match` → new ETag. Both actions stay disabled while config dirty, unavailable or triggering; server reads the matched saved document (1–4, default 1). No POST override.
- Batch concurrency ≤ `min(reportWorkers, selected project count)`; preserve configuration order in result, isolate failures, never retry a possible Jenkins submission. Aggregate succeeds only when every outcome has `exitCode: 0`; otherwise fails. `record.result.buildProjects` contains per-project sanitized `AutoBuildRunOutcome`; single-target scalar result fields remain for existing clients.

## Side-effect review checklist (implementation gate)
- [ ] Explicit all-enabled button conveys immediate Jenkins submissions; clicking once creates one control run, no per-project button or modal; no accidental submit on selection/config edit.
- [ ] Validate config/ETag and select all targets before launching; disabled/report projects and empty build selection cause **zero** Jenkins POSTs; requests remain guarded, a second active run returns 409.
- [ ] Bound independent browser/workflow lifecycles; one failure or indeterminate submission cannot cancel siblings or silently schedule a retry; no report artifact publication in build mode.
- [ ] Redact secret-bearing logs, URLs, errors, project/stage text before persisting/serializing all batch outcomes; keep credential-free URL/origin/form validation at each underlying build invocation.
- [ ] Update consumers/tests/docs referencing dialog, card button, `Report workers` label and previous auto-build isolation assertion; preserve existing report and targeted build contracts unless explicitly superseded here.

## Design choice and verification boundary
Reuse the fixed-loop/indexed-outcome pattern of `src/project/report-worker-pool.ts:26-75`; do **not** feed auto-build into that report-specific browser/artifact runner. Use existing `runAutoBuildProject` per project so launch/context/deadline/cleanup and no-retry submission safeguards remain intact. A small build-specific pool may live under `src/project/` if needed to keep production modules below 200 lines. Scope tests to observable selection, bounded scheduling, partial failure, API/security, saved count, UI interaction/result display; Main runs the project-wide release gate once after integration. After implementation, align relevant architecture/user docs; do not edit source or docs in this planning task.

## Unresolved questions
None; preserve targeted scalar responses and use the batch contract above for omitted-ID runs.
