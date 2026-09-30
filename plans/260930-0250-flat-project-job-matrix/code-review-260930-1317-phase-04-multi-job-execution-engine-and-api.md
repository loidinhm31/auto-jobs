# Code Review: Phase 04 — Multi-job Execution Engine and API

## Score: 9.6 / 10

### Scope
- **Files reviewed**:
  - `src/reporting/control-run-targets.ts` (177 LOC)
  - `src/reporting/control-run-targets-validation.ts` (187 LOC)
  - `src/reporting/control-run-targets-collision.ts` (35 LOC)
  - `src/reporting/control-run-matrix-executor.ts` (139 LOC)
  - `src/reporting/report-server-control-api.ts` (170 LOC)
  - `src/reporting/report-server-run-manager.ts` (183 LOC)
  - `src/reporting/report-server-run-executor.ts` (199 LOC)
  - `src/config/config-types.ts` (124 LOC)
  - `src/result-types.ts` (188 LOC)
  - `src/artifacts/artifact-manifest.ts` (53 LOC)
  - `src/artifacts/result-validation.ts` (426 LOC)
  - `src/artifacts/result-sanitizer.ts` (180 LOC)
  - `src/artifacts/aggregate-manifest-reader.ts` (310 LOC)
  - `src/artifacts/aggregate-index-builder.ts` (143 LOC)
  - `src/project/project-manifest.ts` (49 LOC)
  - `src/project/auto-build-runner.ts` (139 LOC)
  - `src/reporting/control-page/types/index.ts` (177 LOC)
  - `src/reporting/control-page/hooks/useRunPoller.ts` (261 LOC)
  - `src/reporting/control-page/pages/DashboardPage.tsx` (197 LOC)
  - `src/reporting/control-page/components/molecules/RunResultBox.tsx` (186 LOC)
  - `src/reporting/control-page/components/molecules/build-project-outcome-row.tsx` (167 LOC)
  - `src/reporting/control-page/components/molecules/report-project-outcome-row.tsx` (55 LOC)
  - `src/reporting/control-page/components/molecules/index.ts` (18 LOC)
  - `tests/unit/control-run-targets.spec.ts` (418 LOC)
  - `tests/unit/control-matrix-run-api.spec.ts` (379 LOC)
  - `tests/unit/control-matrix-components.spec.ts` (288 LOC)
  - `tests/e2e/control-page.spec.ts`
- **Lines of code analyzed**: ~3,763 LOC production code + ~1,100 LOC test code.
- **Review focus**: Security validation, execution isolation, virtual target collision preflight, deterministic ordering, backward compatibility, secret redaction, and UI presentation.
- **Updated plans**:
  - `plans/260930-0250-flat-project-job-matrix/phase-04-multi-job-execution-engine-and-api.md`
  - `plans/260930-0250-flat-project-job-matrix/plan.md`

---

## Overall Assessment
Phase 04 implementation delivers a robust, secure, and well-modularized multi-job matrix execution engine and API:
1. **Security & Input Validation**: Strict coordinate gating (`projectId` max 63 safe chars, `columnId` max 16 safe chars, max 2,500 coordinates, exact 2 keys per coordinate). Matrix requests forbid client-provided URLs, environment overrides, or worker counts. Coordinate resolution executes purely against ETag-matched saved configurations.
2. **Execution & Collision Safety**: Target virtualization (`${projectId}--${columnId}`, bounded to 81 safe chars) guarantees clean artifact subtree isolation (`<reportRoot>/<targetId>/<runId>/`). Preflight check `assertNoArtifactCollisions` audits on-disk historical manifests under root lock, failing closed if virtual IDs collide with unrelated or legacy provenance.
3. **Deterministic Ordering**: Normalization and dispatch follow saved project document order followed by shared column heading order, ensuring deterministic output independent of client request array order or asynchronous worker completion.
4. **Backward Compatibility**: `validProvenance` in `result-validation.ts` accepts `undefined`, preserving 100% compatibility with historical schema-v3 manifests. Single-target legacy `projectId` requests remain fully functional.
5. **Code Architecture**: Backend modules strictly adhere to the <200 LOC rule (`control-run-targets.ts`: 177, `control-run-targets-validation.ts`: 187, `control-run-matrix-executor.ts`: 139, `report-server-run-executor.ts`: 199).
6. **Verification Quality**: 101/101 tests passed (79 unit, 22 Chromium E2E). Typecheck and production build pass with 0 errors.

---

## Critical Issues
*None*.

---

## Warnings
*None*.

---

## Suggestions

### 1. Distinguish `'partial'` status badge in `ReportProjectOutcomeRow`
- **Location**: `src/reporting/control-page/components/molecules/report-project-outcome-row.tsx:34`
- **Observation**: `isSuccess ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'` styles `'partial'` runs with a red failure badge.
- **Recommendation**: Add an amber badge case (`project.status === 'partial' ? 'bg-amber-100 text-amber-800' : ...`) to clearly differentiate partial outcomes from total failures.

### 2. Prioritize `outcome.projectId` match in `executeMatrixRun`
- **Location**: `src/reporting/control-run-matrix-executor.ts:113-115`
- **Observation**: `const target = resolvedTargets[idx] ?? resolvedTargets.find((t) => t.virtualProjectId === outcome.projectId);` checks index before ID lookup.
- **Recommendation**: Check `resolvedTargets.find((t) => t.virtualProjectId === outcome.projectId) ?? resolvedTargets[idx]` to guarantee correct provenance mapping even if outcomes are ever re-ordered or filtered.

### 3. Defensive non-string check in `resolveRunTargets`
- **Location**: `src/reporting/control-run-targets.ts:117`
- **Observation**: `rawUrl === undefined || rawUrl.trim().length === 0` assumes `rawUrl` is a string if present.
- **Recommendation**: Use `typeof rawUrl !== 'string' || rawUrl.trim().length === 0` to safeguard against unexpected non-string schema deviations.

### 4. Whitespace churn and LOC in `useRunPoller.ts`
- **Location**: `src/reporting/control-page/hooks/useRunPoller.ts` (261 LOC)
- **Observation**: File has significant indentation changes (1-space vs 2-space) and exceeds the 200 LOC target.
- **Recommendation**: Revert unintentional whitespace-only diffs and extract timer/polling lifecycle sub-helpers in Phase 05.

### 5. Retain optional `queuedAt?: string` in frontend `RunRecord`
- **Location**: `src/reporting/control-page/types/index.ts:130`
- **Observation**: `queuedAt?: string` was replaced with `targets?: readonly RunTargetCoordinate[]`.
- **Recommendation**: Keep `queuedAt?: string` alongside `targets` for complete alignment with `report-server-run-manager.ts:31`.

---

## Positive Observations
- **Zero Client URL Trust**: Client sends coordinate tuples only (`projectId`, `columnId`). Server resolves and validates URLs against `loginUrl` via `deriveJenkinsBaseUrl`.
- **Strict Redaction**: Target names, column names, job URLs, error messages, and warnings are passed through `redactText` before reaching client logs, run records, or responses.
- **Root Lock & Safe ID Boundaries**: Virtual IDs stay strictly within 81 characters (`SAFE_PROJECT_ID_REGEX` 63 chars + `--` + `COLUMN_ID_REGEX` 16 chars = 81 chars), conforming to `SAFE_ID` rules.
- **Single Active Run Enforcement**: Run manager rejects concurrent submissions with 409 conflict.
- **All-Empty Rejection**: If all selected matrix cells are blank/empty, server rejects with explicit error, preventing empty run no-ops.

---

## Validation Commands & Results
- `npm run typecheck`: **PASSED** (`tsc --noEmit`, 0 errors)
- `npm run build`: **PASSED** (Vite build in 808ms, 2,166 modules transformed, report assets copied)
- `npx playwright test tests/unit/control-run-targets.spec.ts tests/unit/control-matrix-run-api.spec.ts tests/unit/control-matrix-components.spec.ts tests/unit/control-run-api.spec.ts tests/unit/control-run-executor-secrets.spec.ts tests/unit/bounded-auto-build-workers.spec.ts tests/unit/bounded-report-workers.spec.ts --config=playwright.unit.config.ts`: **PASSED** (79 passed in 1.3s)
- `node scripts/run-playwright.mjs npx playwright test tests/e2e/control-page.spec.ts tests/e2e/control-report-management.spec.ts --project=chromium-control --config=playwright.control.config.ts`: **PASSED** (22 passed in 7.1s)
- Total test coverage: **101 passed, 0 failed**.

---

## Unresolved Questions
*None*.
