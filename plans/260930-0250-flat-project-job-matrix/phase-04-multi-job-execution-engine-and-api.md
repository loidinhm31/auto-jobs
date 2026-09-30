# Phase 04 — multi-job execution engine and API

## Context links

[Plan](./plan.md) · [Architecture/execution sequence](./architecture-design.md#execution-and-provenance) · [Backend research](./research/researcher-01-backend-schema-exec.md) · [Security and execution standards](../../docs/code-standards.md#control-run-environment-injection) · [Report pipeline](../../docs/report-pipeline.md)

## Overview

- Priority: P2 · Status: Pending · Estimate: 8h.
- One ETag-guarded batch run accepts selected project/column IDs and one mode (`report` or `auto-build`); resolve URLs from saved config, skip blank/whitespace cells, run distinct bounded targets, and report project/column/URL provenance. Report IDs isolate artifact trees and aggregate entries.

## Key insights

- `POST /api/run` currently carries mode + optional one `projectId`. `RunManager` accepts one active run; multiple client POSTs would conflict and permit mixed config snapshots. Send one bounded `targets` batch containing coordinate IDs, **never** URL values.
- `executeControlRun` normalizes all projects and then selects by per-project `runType`; matrix mode must intentionally bypass that legacy mode gate while still respecting `enabled:false` and the selected click-time runType. No per-link run-type field.
- `runConfiguredProjects` requires unique project IDs, one browser and report root, locks root, discovers manifests and publishes one aggregate. `executeAutoBuildWorkerPool` provides ordered bounded execution and catches failures. Reuse both.
- Artifact IDs match `SAFE_ID` up to 81 characters; project IDs max 63, column IDs max 16, plus `--` = 81. Aggregate/history grouping keyed by project ID; virtual ID separates jobs across a single project. Manifest schema v3 and result validators must remain backward-compatible with historical runs.

## Requirements

1. Matrix request `{configName,configEtag,runType,targets:[{projectId,columnId},...]}`; bounded 1–2500 coordinate pairs and existing 1 MiB JSON body/security gate; unknown fields rejected for matrix requests. Server resolves against ETag-matched saved document; duplicate/unknown/disabled references and target-ID collisions reject preflight before any browser opens. Preserve no-target legacy API behavior for existing clients.
2. Deterministic output ordering by saved project order then shared heading order, independent of client array order and worker completion. If a selected cell is whitespace/empty, skip it; if none remain, return explicit invalid-target error (not green success/no-op). Distinguish skipped coordinates in safe response/feedback if useful.
3. Each executable pair yields immutable normalized virtual project whose `id` is `${project.id}--${column.id}`, `name` identifies project and column, `jobUrl` is selected cell URL, `runType` is trigger mode; all other normalized/default fields retain saved values. Validate same Jenkins login context, enabled gate and per-mode root/browser assumptions before side effects. Direct CLI and old no-target API selection continue to honor existing project `runType`.
4. Auto-build uses saved `reportWorkers` (1–4), one browser/context and existing single-submit safeguards per target, ordered outcomes with explicit source project name, column name and URL. Report uses same bounded pool, canonical root lock, unique `<reportRoot>/<targetId>/<runId>/` directories and collision-safe aggregate; expose typed per-target outcomes/report links and provenance, not only global `reportUrl`.
5. Keep single SecretStore snapshot/merged environment, output redaction, CSRF/Origin/Host/security gates, no request-level `workerCount`, no external URL from request, no retry after possible POST, failure isolation and overall failure when any target fails.

## Architecture

`POST -> shared mutation gate -> parse bounded IDs/mode -> RunManager(single active) -> readConfig/require ETag -> upgrade/validate matrix document -> resolve selected pairs + preflight -> normalize source project/settings -> virtualize chosen URL/id/name/runType -> existing report/auto-build pool -> per-target sanitized result`. Reuse `reportExecutor` injection for deterministic tests. Check virtual IDs against other virtual IDs, all real config project IDs, and unrelated existing artifact manifests when safe discovery is available; fail closed instead of merging unrelated history. Existing report root lock and manifest validation must guard any preflight against races with publication; put history collision check under lock/in report runner boundary or otherwise document/close TOCTOU. Never loosen `SAFE_ID` or mutate old directories.

## Related code files

| Action | Path | Planned change |
| --- | --- | --- |
| Create | `src/reporting/control-run-targets.ts` (or nearest small config-layer helper) | Pure saved coordinate resolution, ordering, blank filtering, virtual IDs and collision preflight. |
| Modify | `src/reporting/report-server-control-api.ts` | Parse/validate bounded target array; preserve existing CSRF/body/status/mode guards. |
| Modify | `src/reporting/report-server-run-manager.ts` | Store immutable target coordinates, typed per-target run result; retain single-active lifecycle. |
| Modify | `src/reporting/report-server-run-executor.ts` | Saved-document resolution and mode dispatch, normalized per-target virtual projects; split existing oversized module by responsibility under 200 LOC. |
| Modify | `src/project/auto-build-worker-pool.ts`, `src/project/auto-build-runner.ts` only if necessary | Carry per-cell identity/progress while reusing worker/submission policy. |
| Modify | `src/runner.ts`, `src/project/project-types.ts`, `src/artifacts/artifact-manifest.ts`, `src/artifacts/result-validation.ts`, `src/artifacts/aggregate-index-builder.ts` where required | Typed report provenance and backward-compatible manifest/history validation, collision-safe publication. |
| Modify | `src/reporting/control-page/types/index.ts`, `hooks/useRunPoller.ts`, `components/molecules/RunResultBox.tsx`, `components/molecules/build-project-outcome-row.tsx` | Batch request, per-target build/report result presentation and safe URL/redaction. |
| Modify | `tests/unit/control-run-api.spec.ts`, `tests/unit/control-run-executor-secrets.spec.ts`, `tests/unit/bounded-auto-build-workers.spec.ts`, `tests/unit/bounded-report-workers.spec.ts`, report artifact specs, `tests/e2e/control-page.spec.ts` | Guarded request, worker and artifact behavior. |

## Implementation steps

1. Define shared strict request contract and small `RunTargetCoordinate` type. For `targets` present require nonempty bounded array of objects with exactly two safe string IDs, no duplicate pairs; forbid `projectId` alongside matrix targets; reject unsupported request-level `workerCount` exactly as today. Return 4xx before scheduling on malformed selections. Keep old request form when no targets for API compatibility.
2. Bind immutable coordinates to run record at admission. On execution read saved config and compare ETag before looking up targets. Reject unknown/disabled project, undeclared column, duplicate coordinate, collision, invalid document, or mismatched saved URL before browser launch. Skip whitespace URLs; fail explicit no-executable-targets if all skipped. Resolve in saved row/heading order, not request order. Do not allow request to override URLs, environment, worker count or project settings.
3. Normalize each selected project via existing `normalizeProjectConfigDocument`/URL policy and form one virtual per executable cell, overriding only id/name/jobUrl/runType. Ensure URL login-base validation for **each** nonblank cell and check `artifactDir` equals control report root for report mode; reject mixed browsers before report side effects. Preserve waits, timeout overrides, credential refs, origins, selectors, enabled flags and SecretStore merged env.
4. Dispatch auto-build targets to existing pool with saved `reportWorkers`; preserve ordered progress and `submission-unknown` classification, no retries and overall failed status on any `exitCode !== 0`. Map virtual outcome IDs to typed source coordinates and redact name/URL/stage/error before storing/polling. Keep single-target scalar compatibility if old UI consumers still need it, but `buildProjects` stays authoritative.
5. Dispatch report targets with distinct virtual IDs into existing locked report runner, not sequential POSTs or an unguarded artifact writer. Per-target outcomes and report links should include source project ID/name, column ID/name, job URL, target ID, run ID, status and safe local report URL. Add optional typed provenance to new manifest/data/aggregate contracts where needed; ensure old schema-v3 manifests still validate and are displayed. Persist column name and original project name independently (do not rely solely on a compound display string). Update the existing flat final-report index/viewer to show provenance and accept virtual IDs via existing guarded routes/deletion APIs; do not introduce project or group history nesting.
6. Reject virtual target collisions across selected pairs/current real IDs. Audit retained artifact history before publish under lock; reject a virtual ID already assigned to unrelated provenance, or require explicit archive migration (real remaining decision). Add evidence that two columns from one project create two directories and two aggregate entries and do not overwrite a pre-existing report.
7. Update `RunTriggerRequest`, `useRunPoller`, Execute handler, `RunResultBox` and build rows to display bounded redacted per-cell outcomes, including failures, before final smoke. Keep control logs and results free of stored secret values. Observe one-mode trigger for both `report` and `auto-build` with empty-cell skip.

## Todo list

- [ ] Guarded bounded batch target API; no request URLs or worker override.
- [ ] Saved ETag-matched resolver and safe virtual target generation with collision preflight.
- [ ] Ordered bounded build and report dispatch with existing lock/cleanup and failure semantics.
- [ ] Typed per-target provenance across reports/builds/viewer/aggregate without breaking old manifests.
- [ ] Control polling, UI rendering, redaction and old no-target caller tests.

## Success criteria

- One POST with chosen mode and selected IDs executes exactly selected, enabled, nonblank coordinates. Empty selected URLs skip; all empty rejects; unselected nonempty URLs do not execute. No browser opens for malformed/missing/disabled/collision targets.
- Two columns from same project create two distinct `<reportRoot>/<targetId>/<runId>/` trees, two entries in the existing flat report index and visible original project/column/URL provenance; old history remains valid. Two build targets yield ordered distinct results despite out-of-order completion; overall status reflects partial failure.
- ETag conflict, CSRF/origin rejection, saved worker cap, SecretStore redaction, no double submission and root-lock contention work as before.

## Risk assessment

- **Artifact ID collision with unrelated history:** preflight under root lock, reject ambiguity, operator-guided migration only when necessary.
- **Report result contract/viewer rejects new fields:** coordinate manifest/data/result validator and viewer changes; retain optional compatibility for old historical manifests.
- **Oversized 50×50 batches:** saved 1–4 worker bound, 1 MiB input, maximum 2500 targets, bounded logs/results; measure and cap stored result size before publishing.

## Security considerations

- Resolve targets only from saved ETag-matched config; apply existing exact URL, same-origin, safe-path, selector and credential protections. Bound dimensions/request body and reject proto keys. Redact stored secrets from logs, URLs, outcome fields, warnings, errors/stacks and new provenance DTOs before exposure. No automatic retry of a possibly submitted Jenkins form; report output stays inside canonical locked root.

## Next steps

- Phase 05 exercises real in-process API + fixture runner, report viewer/history and UI flows; update architecture/config/run docs after behavior is proven.

## Real remaining decisions

- Historical virtual ID collision handling when existing artifacts have no source-coordinate metadata: fail closed and request operator archive by default; approve any guided migration only after auditing repository/site data and report-lock capabilities.
