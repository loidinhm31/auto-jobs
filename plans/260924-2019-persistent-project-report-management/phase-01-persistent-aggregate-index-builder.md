# Phase 01 — Persistent aggregate index builder

## Context links

- [Plan](./plan.md) · [Backend research](./research/researcher-01-report.md) · [Architecture, artifact lifecycle](../../docs/architecture.md) · [Code standards](../../docs/code-standards.md)
- Existing: `src/runner.ts`, `src/artifacts/aggregate-manifest-reader.ts`, `src/artifacts/aggregate-report-publisher.ts`, `src/artifacts/result-validation.ts`, `src/reporting/aggregate-report-renderer.ts`, `src/result-types.ts`.

## Overview

- **Date:** 2026-09-24. **Description:** Build one all-project aggregate from validated retained manifests plus current outcomes; use same builder from runner and deletion API. **Priority:** P2. **Implementation status:** Done (100%; completed 2026-09-24). **Review status:** approved.

## Key Insights

- `discoverRunManifests` already validates project/run identities and referenced artifacts; it returns bounded diagnostics and at most 5,000 manifests. Runner currently discovers them but `outcomes.map(aggregateSummary)` hides historical-only IDs and warns they were ignored.
- `AggregateProjectSummary` permits missing `runId`/`reportPath`, so a configured outcome without a validated run can be shown without inventing a link. Historical-only names/states must come from validated manifest, not current config or old aggregate JSON.
- `result-validation.ts` currently caps aggregate projects at **50**, while validated history across configurations can exceed 50; reconcile that bound with the discovery cap before asserting all-project coverage.
- Static HTML says “configured projects”; revise index copy/empty state to refer to retained/validated reports. Keep `REPORT_CSP` scriptless.
- `validAggregateProject` also bounds IDs to 80 characters while `SAFE_ID` accepts up to 81 (one initial character + 80); align validator with the actual shared ID contract, not a new regex.
- **Empty-root blocker:** `isValidAggregateResult` currently rejects `projects.length === 0`; deleting the last retained project must still publish a valid empty index. Allow zero rows while retaining schema/timestamp/warning validation.

## Requirements

### Functional

1. Every retained validated project's latest state and complete bounded history remains in `reports/aggregate-data.json` and `reports/index.html` after each report run, even when absent from the newly selected config. Incomplete discovery must not publish a partial replacement index.
2. Active outcome overrides that project's displayed state/name/current run if present; historical runs derive only from discovery. A current failed outcome with no validated report has no fabricated links; historical-only state/name/current report derive from latest validated manifest.
3. Malformed/unvalidated manifests contribute warnings, never rows/links; run-less configured projects do not crash or emit fake historical runs. A pure history rebuild (deletion path) excludes projects without validated history.
4. Preserve deterministic project order: active projects in outcome order, then historical-only IDs sorted; sort each project's runs latest-first by validated `observedAt`, with stable `runId` tie-break. Pick current historical state/name from that first run, never filesystem discovery order.

### Non-functional

- No second aggregate schema/store; use `writeAggregateDataPair` through current writer or directly. O(projects + runs) grouping rather than rescanning history per outcome. Keep 5,000-manifest discovery and 16 MiB static-serving bounds; a typed incomplete-discovery signal and prepublication byte check must fail without replacing the previous pair instead of silently omitting projects/runs. Sanitize warnings.
- New TS module kebab-case, <200 lines; any modified oversized runner should shrink by extracting existing aggregate logic. ESM `.js` imports and strict types.

## Architecture

### System design

- Pure `src/artifacts/aggregate-index-builder.ts` receives `ManifestDiscoveryResult`, optional ordered `ProjectOutcome[]`, timestamp, and caller warnings; returns `AggregateReportResult`. No filesystem I/O or config coupling inside builder. Adjust validation cap only to the bounded discoverable maximum and preserve remaining per-project/total limits.

### Component interactions

- Runner holds report-root lock → `discoverRunManifests` → builder(discovery, outcomes, warnings) → existing pair publisher → return unchanged `RunnerExecutionResult` structure. Deletion later calls same builder(discovery, empty outcomes, diagnostics) under same lock.

### Data flow
- Validated `project.id`/`name`, `run.runId`/`observedAt`, `state`, optional safe job URL, sanitized warnings, optional validated report path → grouped runs → latest metadata/links → merge active outcomes → aggregate validation → journaled JSON+HTML pair.

## Related code files

- **Modify:** `src/runner.ts` (remove local historical/summary logic, call builder); `src/artifacts/aggregate-manifest-reader.ts` and `src/artifacts/artifact-manifest.ts` (typed complete/incomplete discovery result, migrate callers); `src/artifacts/aggregate-report-publisher.ts` (preflight both staged output sizes against static serving bound before replacing the pair); `src/artifacts/result-validation.ts` (raise 50-project ceiling consistently with discovery, accept zero-project aggregate, align aggregate project-ID length with `SAFE_ID`, preserve 5,000 total run bound); `src/reporting/aggregate-report-renderer.ts` (accurate index wording); relevant existing unit tests asserting old outcome-only behavior.
- **Create:** `src/artifacts/aggregate-index-builder.ts` (pure common builder, typed entrypoint). No new aggregate snapshot/database.
- **Delete:** obsolete local `HistoricalRun`/`aggregateSummary` helper and ignored-unconfigured warning branch in `src/runner.ts`; no unrelated files.

## Implementation Steps

1. Trace imports/callers of `runConfiguredProjects`, `writeAggregateData`, `writeAggregateDataPair`, and aggregate validator. Record old outcome-only assumptions in existing tests before cutover.
2. Move historical-run projection and URL-derived job ID/branch sanitization from `runner.ts` into builder. Group `discovery.manifests` by validated project ID, map each run exactly once; preserve validated optional `reportPath` only, normalized relative manifest links, bounded warnings.
3. Order each project's runs newest-first from validated `manifest.run.observedAt` with stable `runId` tie-break; choose latest project name/state/current `runId` and optional report link. When no report exists for latest, omit `reportPath` rather than pointing to an older run as “current”; history still lists older valid links.
4. Overlay each active outcome on its matching historical row or add ephemeral current-only row. Keep its own failure/warnings, only choose a current link when the active `runId` has a validated linked manifest; do not drop non-active historical IDs.
5. Reconcile `MAX_AGGREGATE_PROJECTS` (now 50), aggregate project-ID length (now 80 vs `SAFE_ID`'s 81), and output limits against 5,000 discovered runs plus at most 50 active outcomes; use explicit bounds accommodating both. Expose a typed incomplete flag when directory, artifact-read, or manifest count budget is exhausted; runner must surface a bounded error and keep the prior pair instead of publishing incomplete history. Check staged JSON/HTML byte sizes against `MAX_STATIC_FILE_BYTES` before replacing existing pair; do not truncate. Permit an empty `projects` array so deleting the last retained project publishes a valid JSON+HTML pair. Preserve schema v3 and sanitized warnings.
6. Integrate builder into runner inside existing root lock, replacing outcome-only mapping and “ignored historical” warning. Preserve outcome ordering, exit code and `RunnerExecutionResult` fields. Update renderer's count/empty wording; keep report pages static.
7. Add targeted behavioral coverage under phase 04 for config switch, historical-only, failed/current-only, latest-run selection, invalid manifests and bounds.

## Todo list

- [x] Extract pure grouped builder and stable latest-run selection.
- [x] Integrate runner and raise aggregate project bound safely.
- [x] Correct index copy and migrate obsolete outcome-only expectations.
- [x] Prove output data/HTML persist across runs/config changes.

## Success Criteria

- **Definition of done:** Config A reports remain visible after config B runs; valid unconfigured IDs persist; active failed/no-manifest project has no fake report link; malformed manifests are warned/skipped; generated pair passes existing validation.
- **Validation methods:** isolated temp-root runner smoke on two distinct configs with injected browser/project execution, inspect resulting JSON and HTML, then targeted aggregate/runner unit cases. Phase 04 owns final cross-project suite.

## Risk Assessment

- **50-row schema cap vs history:** widen bounded cap explicitly; test >50 IDs without allowing unbounded output.
- **Latest-run ambiguity:** use validated timestamp then stable run ID and test ties.
- **Current failure without manifest:** keep ephemeral row only in active-run result; do not invent deletion eligibility or stale links.
- **Discovery/serving limits:** client paging does not expand 5,000-manifest or 16 MiB file ceilings. Fail publication explicitly with old pair intact if discovery is incomplete or outputs cannot be served. Preserve new run artifacts on disk for later capacity work.

## Security Considerations

- **Auth/authorization:** pure builder and static index perform no mutation; write remains under caller's report-root lock. Deletion authorization belongs to phase 02, not this module.
- **Data protection:** only validated manifest-derived paths, escaped renderer output, sanitized persisted warnings; no raw diagnostic/credentials or filesystem path from manifest used for actions.

## Next steps

- Phase 02 consumes builder's history-only mode for locked refresh; phase 03 consumes resulting root index and aggregate JSON; phase 04 verifies cutover end to end.
