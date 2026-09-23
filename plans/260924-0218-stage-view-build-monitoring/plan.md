---
title: "Jenkins Stage View Build Monitoring & Status Tracking"
description: "Track Jenkins Stage View builds to terminal status and expose configurable completion waiting and live results in the Control Page."
status: completed
priority: P2
effort: not tracked
branch: main
tags: [jenkins, stage-view, build-monitoring, control-page, api]
created: 2026-09-24
---

# Plan: Jenkins Stage View Build Monitoring & Status Tracking

> Directory: `plans/260924-0218-stage-view-build-monitoring`
> Parent: none | Dependencies: none
> Target: Stage View completion monitoring, configurable wait toggle, and live control page status

## Overview
Add Stage View completion monitoring to the Jenkins auto-build workflow. After submitting the parameterized build form, follow redirect to `jobUrl`, track the newly initiated build in Jenkins Stage View (`#pipeline-box`) until terminal status (`SUCCESS`, `FAILED`, `UNSTABLE`, `ABORTED`), stream live stage transitions to the Control Dashboard logs, and report final status and stage summaries. Support configurable `waitForCompletion` toggle (default true) both in project config and Control Page confirmation modal.

**Overall status:** Complete · **100%** (5/5 phases DONE; completed 2026-09-24T03:00:00+07:00).

## Preflight Contract Summary
- **Output**: Config schema update, Stage View observation module, auto-build runner workflow update, API parameter, and Control Page UI checkbox + rich result card.
- **Acceptance Criteria**: Auto-build monitors Stage View to terminal state when `waitForCompletion` is true; streams stage progress logs; updates Control Page status to `succeeded` or `failed` with build number and result; preserves instant `submitted` behavior when `waitForCompletion` is false.
- **Scope Boundary**: In-scope: Stage View DOM tracking, live stage logs, control page toggle and status display. Out-of-scope: Jenkins server plugins, webhook listeners, pipeline script modification.

## Phases
| Phase | Title | Status | Progress | Completed | Link |
|---|---|---|---:|---|---|
| 01 | Config & API Contracts | DONE | 100% | 2026-09-24T03:00:00+07:00 | [phase-01-config-and-api-contracts.md](./phase-01-config-and-api-contracts.md) |
| 02 | Stage View Observation Engine | DONE | 100% | 2026-09-24T03:00:00+07:00 | [phase-02-stage-view-observation-engine.md](./phase-02-stage-view-observation-engine.md) |
| 03 | Auto-Build Runner & Log Streaming | DONE | 100% | 2026-09-24T03:00:00+07:00 | [phase-03-auto-build-runner-integration.md](./phase-03-auto-build-runner-integration.md) |
| 04 | Control Page UI Enhancements | DONE | 100% | 2026-09-24T03:00:00+07:00 | [phase-04-control-page-ui-enhancements.md](./phase-04-control-page-ui-enhancements.md) |
| 05 | Testing, Fixture & E2E Verification | DONE | 100% | 2026-09-24T03:00:00+07:00 | [phase-05-testing-and-verification.md](./phase-05-testing-and-verification.md) |

Phase 04 scope note: the optional `ConfigProjectEditor` toggle remains deferred; `waitForCompletion` is configurable through project JSON and the run-confirmation modal.

## Quality & Security Gates
- Typecheck: `npm run typecheck` passes with zero errors.
- Build: `npm run build` succeeds cleanly.
- Unit Tests: `npm run test:unit` passes 100%.
- Control Tests: `npm run test:control` passes 100%.
- Template Tests: `npm run test:e2e:templates` passes 100%.
- Credentials: Zero secret leakage in logs, DOM, or API responses.
