# /cmd-plan__hard — bounded parallel report collection (NOT IMPLEMENTED)

## Mission
Implement the confirmed saved-document contract in [plan.md](./plan.md) across [runner/config/CLI](./phase-01-bounded-report-execution.md), [control API](./phase-02-control-run-contract.md), then [dashboard/integration](./phase-03-dashboard-and-verification.md). Current runner is sequential; this is a proposed execution brief, not a release record. Background: [runner/artifact research](./research/researcher-01-runner-and-artifacts.md) and [control/UI research](./research/researcher-02-control-ui-and-contract.md). The latter's browser-local/per-request recommendation was **rejected by the user**, not adopted.

## Hard invariants
1. Parallelism applies only to enabled report projects **within one run**. Preserve one-active-run `RunManager`, report-root lock, one shared browser with separate project contexts, absolute per-project deadlines, and one-project auto-build submission. Never parallelize control runs or auto-build.
2. The sole persisted setting is optional top-level schema-v1 `reportWorkers?: number` on the JSON configuration **document**, not in each project or defaults. Shared pure policy permits integers 1–4, omitted/default 1; invalid types and bounds fail document validation before execution. No schema-version bump or example-config edit.
3. Both Generate Reports (after Save) and `npm run report -- --config <file>` use this document value. `ConfigStore` retains existing validation/If-Match ETag saves; CLI loader returns validated document and normalized projects from **one read**. Direct runner library callers may pass a validated optional count, but CLI obtains its count from the document, not a second parameter.
4. Existing `POST /api/run` fields remain `configName`, `configEtag`, `runType`, optional `projectId`. **Any supplied** `workerCount`, including on auto-build, returns `422 INVALID_WORKER_COUNT` before `startRun`. The executor reads ETag-verified `configEntry.document.reportWorkers ?? 1` and passes it to report runner only. No `StartRunParams`/record/GET count, no request override, no manager change.
5. Reuse report-only selection, mutation security, stale-ETag handling and one-active-run 409. Auto-build projects in a document may coexist with `reportWorkers` but are unaffected; count is never sent to its runner. Shared editor updates document and raw JSON/dirty state; Generate Reports remains disabled until Save updates the ETag. No `localStorage` count preference and no `useRunPoller` request-shape change.
6. Fixed-size async loops claim each project once in configuration order, write indexed outcomes, catch per-project rejection and await all workers. Recovery/cleanup precede scheduling; browser close and final cleanup/discovery/aggregate follow settlement **under the same root lock**. Reject duplicate direct IDs before side effects. Retain exclusive leaf allocation and same-second run-ID behavior; no artifact overwrite.

## Implementation/verification checkpoints
- Phase 01: `src/config/config-types.ts`, `project-config-project-validation.ts`, `project-config-schema.ts`, loader, `src/runner.ts`, shared pure count policy and focused config/runner tests. Test old document default, valid/invalid top-level values, rejected project/default fields, single-read CLI count parity, two-of-four overlap/cap/order, sibling failure continuation, one browser close, lock-scoped aggregate and real independent manifests. No sleep-based overlap assertion.
- Phase 02: `src/reporting/report-server-control-api.ts`, `report-server-run-executor.ts` and focused API/executor tests; no manager fields or record updates. Verify any request field rejected 422 before admission, ETag-verified saved count forwarded only to report runner, stale ETag, active-run 409, security gates and auto-build isolation.
- Phase 03: shared config-document editor, `ExecutionSection` selector beside Generate Reports, dashboard props and E2E; leave `ConfigFormBuilder` unchanged. No new browser storage key, request property or poller signature. Verify document switch/reset, unsaved dirty/run disable, Save/ETag/JSON and CLI parity. Synchronize affected docs only after implementation. Full `npm run test:release` once after integration; no gates during this planning task.

## Acceptance matrix
| Case | Observable implementation-stage proof |
| --- | --- |
| 4 report projects / saved 2 | Two enter barrier; no third before release; max active 2; four outcomes in configured order despite reversed completion. |
| Omitted / 1 / 4 / one report | Omitted and 1 are serial; 4 never exceeds four; one selected report opens one context. |
| Invalid document field | Wrong type, 0, 5, negative, fraction and non-finite direct values rejected before scheduling; misplaced project/default value rejected by schema. |
| CLI and UI | Same saved file/count drives direct CLI and dashboard report run; Save changes ETag; unsaved edit never runs; config switch loads own count, no preference leak. |
| Worker rejection | Failed/unallocated outcome remains indexed; queued sibling runs; aggregate exitCode 1; browser/root lock finalize once. |
| Root integrity | Separate directories/manifests, cleanup and discovery after settlement, aggregate under lock; same-project/same-second reuse fails without overwriting earlier history. |
| API | Body with `workerCount` of **any value** rejected 422 `INVALID_WORKER_COUNT` for report and auto-build; omission accepted, report count comes from matched saved document. |
| Safety | Single active run 409, stale ETag and Host/Origin/CSRF/content-type gates, one-project auto-build and SecretStore redaction preserved. |

## Unresolved questions
- None for scope. Raising cap 4 requires separate load/provider-quota evidence.
