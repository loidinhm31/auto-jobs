---
title: "Bounded Parallel Report Workers"
description: "Persist one bounded report-worker setting per schema-v1 document for both dashboard and CLI runs."
status: complete
priority: P2
effort: 8h
branch: main
tags: [feature, backend, api, frontend, reporting]
created: 2026-09-23
---

# Bounded Parallel Report Workers — implementation plan (COMPLETE)

## Overview
Generate Reports and `npm run report -- --config <file>` share an optional top-level `reportWorkers` setting from their saved schema-v1 JSON document. All three phases are complete: persisted setting validation, bounded execution, the ETag-checked control run contract, and the saved-document dashboard selector are implemented. Phase 03 integration and documentation are complete; targeted verification and the full test/build results reported by Main are recorded below.

## Phases
| Phase | Status / completion | Effort | Dependency | Deliverable |
| --- | --- | ---: | --- | --- |
| [01 Bounded report execution](./phase-01-bounded-report-execution.md) | **DONE — 2026-09-23** | 3h | none | Schema-v1 validation, one-read CLI parity, direct runner bound, fixed project loops, artifact/lifecycle proof |
| [02 Control run contract](./phase-02-control-run-contract.md) | **DONE — 2026-09-23** | 2h | 01 shared policy/schema | Reject request overrides; ETag-verified document drives report executor |
| [03 Dashboard and verification](./phase-03-dashboard-and-verification.md) | **DONE — 2026-09-23** | 3h | 01 schema/editor policy and 02 API contract | Saved-document selector, UI/API/CLI integration, implementation docs synchronized |

## Contract and design decisions
- Add `reportWorkers?: number` to `ProjectConfigDocumentV1` and `ROOT_KEYS`; validate via `assertProjectConfigDocument` using one pure numeric policy (`undefined -> 1`, otherwise finite integer 1–4; reject null, string, boolean, fraction, zero, excess and non-finite direct values). Schema stays version 1; old configs remain valid and default to 1. Do not place count in `defaults`, project entries, SecretStore, environment or `config/projects.example.json`.
- `ConfigStore` already validates document reads/writes and persists via Save/If-Match ETag; use that flow. The dashboard selector sits beside Generate Reports but updates the shared document editor, marks it dirty and synchronizes raw JSON; Generate Reports remains disabled until Save returns the new ETag. Switching configs loads that document's own count, never a browser preference. Saved document is the single source for UI and direct CLI.
- `POST /api/run` continues to carry only `configName`, `configEtag`, `runType` and optional auto-build `projectId`. Reject **any supplied** `workerCount` with `422 INVALID_WORKER_COUNT`, including auto-build; never silently ignore or accept per-request overrides. After reading the config and matching ETag, control executor derives `configEntry.document.reportWorkers ?? 1` for its report runner only. No count in `StartRunParams`, `ControlRunRecord`, GET history or auto-build executor. One-active-run admission is unchanged.
- Direct `runFromConfig` reads the file once through a loader returning both validated document and normalized projects, selects enabled reports and forwards saved count. Direct `runConfiguredProjects` keeps a validated optional `RunnerDependencies.workerCount` (default 1) for library callers; CLI must not override the file with an unrelated dependency count. Effective loops are `min(count, selected enabled report projects)`.
- One browser, isolated context/page/deadline per project, indexed outcomes, per-project failure isolation and one report-root lock spanning recovery, all workers, browser close, final cleanup/discovery and aggregate publication. Preflight duplicate direct project IDs. Preserve exclusive leaf allocation and same-second run-ID behavior; no multiple simultaneous control runs.

## Implementation status — 2026-09-23
- Phase 01 **DONE**: schema-v1 `reportWorkers` validation (1–4; omitted defaults to 1), single-read loader/direct CLI saved-count support, and bounded execution with ordered outcomes and worker failure isolation. Evidence: 40/40 focused tests, 353/353 unit tests, and TypeScript typecheck with 0 errors (code-review report).
- Phase 02 **DONE — 2026-09-23**: reject request-level worker overrides (`422 INVALID_WORKER_COUNT`) before manager admission, and derive worker bound (`configEntry.document.reportWorkers ?? 1`) from the ETag-checked saved document in the report executor only. Preserved single-active-run behavior, auto-build isolation, security gates and SecretStore redaction. Evidence: 16/16 focused unit tests, 360/360 full unit tests, and TypeScript `tsc` with 0 errors; see [code review](../reports/code-review-260923-2117-phase-02-control-run-contract.md).
- Phase 03 **DONE — 2026-09-23**: saved-document dashboard selector, raw JSON and dirty-state integration, ETag-checked save flow, request override omission/rejection, auto-build isolation, and CLI saved-count/default parity. Evidence: 137/137 targeted Playwright tests, TypeScript typecheck with 0 errors, and code review 10/10 ([test report](../reports/tester-260923-2218-phase-03-dashboard-and-verification.md), [review](../reports/code-review-260923-2223-phase-03-dashboard-and-verification.md), [documentation summary](../reports/documentation-260923-2311-bounded-report-workers-phase-03.md)). Main reports full `npm run test` passed (365 unit + 14 E2E) and `npm run build` passed. The direct `npm run report -- --config <fixture>` entrypoint smoke and once-only `npm run test:release` remain deferred to Main's final release audit.
- Review context: [Phase 01 review](../reports/code-review-260923-1924-phase-01-bounded-report-execution.md) flagged the user-modified example config and aligned test expectation; Main confirmed the config pre-existed this work. Both were left unchanged during this status/documentation update.

## Evidence and constraints
- [Runner/artifact research](./research/researcher-01-runner-and-artifacts.md) and [control/UI research](./research/researcher-02-control-ui-and-contract.md) describe current code. The latter recommends browser-local/per-request state; **user rejected that recommendation** in favor of the saved document contract above. Treat it only as background, not implementation instructions.
- [Current architecture](../../docs/architecture.md) records implemented behavior; proposed notes remain explicitly NOT IMPLEMENTED. [System architecture](../../docs/system-architecture.md), [PDR](../../docs/project-overview-pdr.md), [Codebase summary](../../docs/codebase-summary.md), [Standards](../../docs/code-standards.md) and [Release gates](../../docs/release-gates.md) supply existing conventions.
Phase 01 implementation and review evidence are captured in its phase plan and review report. Preserve user-modified `config/projects.example.json`; Markdown stays below 800 lines, production modules below 200 lines, and tests remain deterministic/offline.

## Completion gate (implementation only)
Phase 01/02 evidence is recorded in their phase plans and reviews. Phase 03 targeted checks and review passed; Main reports the full test suite and build passed. Main owns the final release audit: exercise `npm run report -- --config <isolated fixture>` and run `npm run test:release` once after all agent changes land; record actual results before release.

## Unresolved questions
- None. Cap 4 remains a conservative limit; increasing it needs separate load and provider-quota measurements.
