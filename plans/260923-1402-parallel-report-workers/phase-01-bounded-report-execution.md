# Phase 01 — bounded report execution and saved config (DONE — 2026-09-23)

## Context links
- [Master contract](./plan.md) · [Hard brief](./cmd-plan.md) · [Runner/artifact research](./research/researcher-01-runner-and-artifacts.md) · [Control/UI research](./research/researcher-02-control-ui-and-contract.md) (its browser-local recommendation is rejected by user).
- Current code: `src/config/config-types.ts:55-59`, `src/config/project-config-project-validation.ts:16-48`, `src/config/project-config-schema.ts:16-50`, `src/config/project-config-loader.ts:154-169`, `src/config/project-config-normalization.ts:49-84`, `src/runner.ts:26-49,90-195`, `src/project/project-runner.ts:93-189`, `src/artifacts/artifact-paths.ts:87-95,138-203,214-225`. Conventions: [code standards](../../docs/code-standards.md), [system architecture](../../docs/system-architecture.md).

## Overview
**DONE — 2026-09-23; P2; 3h.** Added one optional worker count to schema-v1 documents, retained the old-file default of 1, and made direct CLI and runner honor validated bounds. Replaced sequential report execution with at most four in-process loops while preserving root lifecycle, auto-build and control admission. This phase supplies the schema and pure policy for [phase 02](./phase-02-control-run-contract.md) and the editor contract for [phase 03](./phase-03-dashboard-and-verification.md).

## Key insights
- Current `runConfiguredProjects` holds one root lock through initial recovery/cleanup, one browser, per-project work, browser close, final discovery and aggregate write (`src/runner.ts:90-184`). The lock must remain outside workers.
- `runProject` already owns a project-local staging/report directory, context/page and `WorkflowDeadline`, catching post-allocation failures and closing its context. Runner catches pre-allocation rejections as failed/unallocated. Deadlines start on execution, not queue admission.
- Before Phase 01, `loadProjectConfig` returned normalized projects alone; implementation added a metadata-returning one-read path so `runFromConfig` does not reread the file for document metadata. `ConfigStore` already validates document reads/writes and persists through ETag-guarded saves.
- Schema validation rejects duplicate exact IDs; Phase 01 also rejects duplicate IDs from direct runner calls before artifact-root/browser side effects. Exclusive leaf allocation rejects same-project/same-second path reuse without overwriting prior reports; distinct project IDs still use separate directories at equal timestamps.

## Requirements
- `ProjectConfigDocumentV1.reportWorkers?: number` is top-level and applies to the entire Generate Reports batch. Add to `ROOT_KEYS`; in `assertProjectConfigDocument` validate the present value with a pure shared `normalizeReportWorkerCount(value: unknown)` policy: omitted/`undefined` -> 1, otherwise finite integer in `[1,4]`, with exported `MAX_REPORT_WORKERS = 4`. Reject invalid JSON types (`null`, strings, booleans, arrays/objects), negative, zero, fractions and >4; reject direct-call `NaN`/infinities. No coercion/clamping and no schema-version bump. Unknown `reportWorkers` under `defaults` or a project remains rejected by existing key guards; an auto-build project may exist in a document but never uses the field.
- `RunnerDependencies.workerCount?: number`: validate before artifact-root initialization or browser launch, default 1. Run only enabled report projects selected by CLI/control; effective loop count `Math.min(count, enabled.length)`. No process workers, browser pool, alternate config source or global setting. No changes to `config/projects.example.json`.
- Direct `runFromConfig` must obtain **both** validated document and normalized projects from one file read, select enabled reports and pass `document.reportWorkers ?? 1` to `runConfiguredProjects`; do not separately read file or accept an override through its dependencies. Preserve `loadProjectConfig`'s normalized-array contract for existing non-CLI callers by sharing the internal one-read path with a narrowly named metadata-returning loader.
- Preserve input-indexed outcomes, failure isolation and aggregate `exitCode`/warning semantics. Reject duplicate direct-caller normalized project IDs before root/browser side effects; leave existing same-second run IDs and optional injected suffix unchanged.

## Architecture
- Add `src/config/report-worker-count.ts` with pure default/max/validation, usable by both schema and runner without importing reporting/UI. `assertProjectConfigDocument` adds a `config.reportWorkers` validation issue before returning the document. `ConfigStore.readConfig`/`writeConfig` then automatically round-trip validated field and update ETag on Save; no separate store field or migration.
- In `src/config/project-config-loader.ts`, add a loader returning `{ document, projects }`: call existing safe `readDocument(filePath)` **once**, retain `assertNoLegacyEnvironmentInputs`, normalize that same document with existing environment/secret rules; existing `loadProjectConfig` may delegate and return `.projects`. `runFromConfig` consumes the new result and excludes `workerCount` from caller-supplied dependencies, forwarding saved count after spread so file is authoritative.
- In `runConfiguredProjects`, resolve bound and duplicate IDs before `ArtifactPaths.initialize()`. After initial recovery/cleanup and browser launch, use a shared `nextIndex` claimed synchronously within each of exactly `min(count, length)` async loops. Await each project, catch its rejection into existing failed/unallocated shape and store at `outcomes[index]`. `Promise.all(loops)` precedes browser close; materialize/check all typed slots before aggregate publication. Do not start all projects with `Promise.all(projects.map(...))` or move the root lock into loops.
- Keep `createRunId(now(), runIdSuffix?.())` and exclusive directory allocation. No retries on `EEXIST`, run-ID redesign, generic queue/semaphore or mutable shared credentials.

## Related code files
| Action | Exact path | Work |
| --- | --- | --- |
| Create | `src/config/report-worker-count.ts` | One pure default/max/numeric policy. |
| Modify | `src/config/config-types.ts`, `src/config/project-config-project-validation.ts`, `src/config/project-config-schema.ts` | Optional top-level field, root allowlist and document validation. |
| Modify | `src/config/project-config-loader.ts`, `src/runner.ts` | Single-read document-plus-project loader; CLI saved count; direct runner fixed pool/preflight. |
| Create only if needed for module size | `src/project/report-worker-pool.ts` | Extract only index-claim/loop responsibility if runner would otherwise exceed production <200-line convention. |
| Modify | `tests/unit/project-config.spec.ts`, `tests/unit/control-config-api.spec.ts`, `tests/unit/sequential-runner.spec.ts` | Document boundary/round-trip/ETag and serial/CLI contract without duplicating trivial cases. |
| Create | `tests/unit/bounded-report-workers.spec.ts` | Barrier overlap/order/failure/lock and real-artifact edge cases. |
| Leave unchanged | `src/project/project-runner.ts`, `src/artifacts/artifact-paths.ts`, `src/project/auto-build-runner.ts`, `config/projects.example.json` | Preserve context, allocation, auto-build and user-modified example. |

## Implementation steps
1. Add policy and schema top-level field; exercise valid 1/4, omitted 1 and invalid values through `assertProjectConfigDocument`, file loader and `ConfigStore` save/read. Test that old schema-v1 JSON still validates; `defaults.reportWorkers` and `projects[i].reportWorkers` fail as unknown keys. Never modify the checked-in example.
2. Implement shared one-read loader without changing existing normalization behavior/callers. In `runFromConfig`, select reports, forward saved count, exclude dependency override. Use temporary config files and fake browser/projects to prove count 2 overlaps and omitted count remains serial from actual CLI entry function; include an auto-build project to prove report-only selection. `npm run report -- --config <file>` delegates to this path.
3. Validate direct runner dependencies/count and duplicate IDs before any artifact side effects. Replace sequential loop with bounded index-claim loops; reuse exact project dependencies (`browser`, artifacts, environment, clock, suffix, context configurator). Catch each project failure, preserve indexed results, await all loops and keep final aggregate/lock lifecycle intact.
4. Add deterministic four-ID/count-2 barrier: both start, no third starts while blocked, release in reversed order, max active 2 and outcomes in configuration order. Exercise count 1/default, count 4, one project/count 4, a rejecting worker plus queued sibling, duplicate IDs and invalid direct values. Do not use sleeps as overlap proof.
5. Exercise real `runProject` with isolated fake contexts/pages and held workflows; inspect per-ID report/data/manifest paths, failure manifest, staging cleanup, discovery and aggregate. Assert browser closes only after settlement; aggregate absent and lock unavailable while barrier held, both correct after publication. A later same-project invocation using same-second clock must fail safely without changing previous manifest.

## Todo list
- [x] Top-level schema-v1 count and pure policy; old document/default and invalid boundary.
- [x] Single-read loader and CLI saved-count forwarding.
- [x] Direct runner preflight and fixed loops/index-stable outcomes.
- [x] Focused config/API-save, barrier and real-artifact regressions.
## Success criteria
- A saved document's `reportWorkers` round-trips through ConfigStore/ETag; CLI and later control executor can read the same validated value. Missing field yields serial execution; misplaced/invalid field fails before scheduling.
- Barriers prove observable overlap, active count ≤ selected bound and ordered outcomes independent of completion order. One project uses one context; default is one at a time.
- A failed project yields one indexed failed/unallocated result; siblings finish; browser closes once after all workers; final cleanup/discovery/aggregate occur once under lock and failure yields `exitCode=1`.
- Independent immutable manifests, no orphan staging run and no overwritten history on same-project/same-second reuse; invalid direct count/duplicate IDs cause no root/browser side effects.
- **Implementation-stage targeted commands, not run by planner:** `node scripts/run-playwright.mjs playwright test tests/unit/project-config.spec.ts tests/unit/control-config-api.spec.ts tests/unit/bounded-report-workers.spec.ts tests/unit/sequential-runner.spec.ts --config=playwright.unit.config.ts`. Phase 03 owns integrated release gate.

## Risk assessment
- Extra context memory and provider quotas increase with count; cap 4/default 1, no throughput promise. Concurrent `configureContext` must remain context-local; test isolation. If CLI reads config twice, a mid-run edit can split projects/count; the single-read loader prevents this.
- Worker promise leaks can trigger early browser/lock teardown; await all loops. Keep timestamp identity and exclusive `mkdir`; collision still safely fails without overwriting earlier output.

## Security considerations
- Validate persisted field at every document ingress, count again for direct runner callers. Keep URL/project validation, safe config read paths, ETag writes, secret redaction, per-project context/cookies and artifact identity checks. Neither count nor project ID becomes an unvalidated path.

## Next steps
- Phase 01 implementation and validation completed 2026-09-23: all 40 targeted tests and all 353 unit tests passed; TypeScript typecheck reported 0 errors (see [review report](../reports/code-review-260923-1924-phase-01-bounded-report-execution.md)).
- Code review scored 9/10 with no critical issues. It flagged the user-modified `config/projects.example.json`; Main confirmed this pre-existing file was left unchanged.
- Proceed to [Phase 02](./phase-02-control-run-contract.md): consume validated ETag-checked document count and reject request overrides in the control run API.

## Unresolved questions
- None. Cap 4 remains a conservative limit; increasing it needs separate load and provider-quota measurements.
