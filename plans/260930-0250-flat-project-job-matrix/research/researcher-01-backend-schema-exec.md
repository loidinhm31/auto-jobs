# Backend Schema & Execution Pipeline Research

**Date:** 2026-09-30  
**Scope:** `src/config/`, `src/reporting/`, runner pipelines, schema compatibility, multi-job execution.

## 1. Schema & Validation Constraints
- **Document Structure (`ProjectConfigDocumentV1`):** `schemaVersion: 1`, `projects: ProjectConfigInput[]`, optional `projectGroups`, `defaults`, `reportWorkers` (`src/config/config-types.ts:65-71`).
- **Strict Key Validation:** `assertProjectConfigDocument` calls `addUnknownKeys` against `ROOT_KEYS` and `PROJECT_KEYS` (`src/config/project-config-project-validation.ts:16-43`). Any unapproved key throws `ConfigError`.
- **Project Shape:** Current project requires `id`, `name`, `loginUrl`, `jobUrl`. Optional: `groupId`, `runType` ('report' | 'auto-build', default 'report'), `enabled` (default true), `waitForCompletion`, `waitTimeoutMs`, `timeoutMs`, `browser`, `artifactDir`, `credentials`, `selectors`, `allowedOrigins`, `sourceOrigins`, `snyk`, `sonarqube`.
- **Defaults & Inheritance:** `defaults` object falls back for browser, artifactDir, credentials, selectors, timeouts, and wait settings (`src/config/project-config-loader.ts:90-123`).

## 2. Config Store & ETag Lifecycle
- **Storage:** `createConfigStore` (`src/reporting/report-server-config-store.ts:53-164`) manages files in canonical config directory with in-memory lock per config file.
- **Integrity & Concurrency:** Computes SHA-256 ETag on file content (`calculateEtag`). Writes require `If-Match` header. `readConfig` and `writeConfig` both validate via `assertProjectConfigDocument`. Write writes to `.tmp` file, flushes/syncs, and atomic-renames.
- **REST API:** `PUT /api/config` enforces `If-Match`. Precondition failure returns 409 `CONFLICT`.

## 3. Run API & Execution Engine
- **Endpoint:** `POST /api/run` (`src/reporting/report-server-control-api.ts:69-150`).
  - Inputs: `configName`, `configEtag`, `runType` ('report' | 'auto-build'), optional `projectId`, `waitForCompletion`, `waitTimeoutMs`.
  - Rejects `workerCount` in body (enforces saved document `reportWorkers`).
- **Run Manager & Executor:** `report-server-run-manager.ts` manages single active run; delegates to `executeControlRun` (`src/reporting/report-server-run-executor.ts:47-188`).
  - Verifies stored ETag against request ETag.
  - Injects stored secrets into environment snapshot.
  - Normalizes document with `normalizeProjectConfigDocument`.
  - **Report Path:** Selects enabled report projects via `selectReportProjects`. Enforces unique project IDs and shared artifact directory. Dispatches to `reportExecutor` (`runConfiguredProjects`) using worker pool (1-4 workers). Artifacts saved under `<artifactDir>/<projectId>/<runId>/`.
  - **Auto-Build Path:** Selects single project or all enabled auto-build projects via `selectAutoBuildProjects`. Dispatches to `executeAutoBuildWorkerPool` (`src/project/auto-build-worker-pool.ts`). Outcomes include per-project state, buildNumber, stages, and exitCode.

## 4. Multi-Job Column Execution Model
- **Spreadsheet Matrix Model:**
  - Root owns `jobColumns: readonly { id: string; name: string }[]`.
  - Project owns `jobs: Record<string, string>` (mapping columnId -> jobUrl) or `jobUrls: Record<string, string>`.
  - Project owns `selectedJobColumns: readonly string[]` (column IDs chosen for execution).
- **Execution Dispatch:**
  - User chooses action (`report` or `auto-build`) at run trigger time.
  - Filter: iterate selected project rows, collect column URLs where column ID is in `selectedJobColumns` and URL is non-empty.
  - **For Auto-Build:** Each `(project, column)` becomes a distinct build task in `executeAutoBuildWorkerPool` with `jobUrl = cellUrl` and execution identity `${project.id}--${column.id}` (or `projectName (${column.name})`).
  - **For Report:** Reports require distinct project output directories `<artifactDir>/<targetId>/<runId>/`. Synthesizing virtual project instances with `id: `${project.id}--${column.id}`` and `name: `${project.name} (${column.name})`` ensures safe isolation without aggregate collision or lock contention.

## 5. Backward Compatibility & Data Preservation
- **Preserving V1 Data:**
  - In-memory migration: On reading a config lacking `jobColumns`, synthesize a single column `{ id: 'default', name: 'Job URL' }` and populate `jobs: { default: project.jobUrl }`.
  - When saving, if maintaining V1 compatibility is desired, set `jobUrl` to the first column or primary selected URL; or formally transition schema to `schemaVersion: 2`.
  - `projectGroups`, `defaults`, and advanced fields (`selectors`, `credentials`, `browser`, etc.) MUST be preserved in the document model and not stripped during save.

## 6. Unresolved Questions
1. Should the config schema increment to `schemaVersion: 2` (clean break with backward-compatible loader for v1), or extend `schemaVersion: 1`?
2. Should `selectedJobColumns` be persisted in the JSON config or kept in frontend session/UI state?
3. In multi-job report execution, how should report viewer URLs and aggregate titles reflect the column name?
