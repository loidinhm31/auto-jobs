# Codebase summary

This summary is based on the refreshed `repomix-output.xml` and checked-in
source/configuration. It covers Stage View monitoring, persistent report
history, guarded project/run deletion, the Control-only React final-report
viewer and shared body renderer, and release-gate boundaries. The viewer phase
is complete; client-side PDF generation remains planned and is not implemented.

## Repository profile

- Package: `auto-jobs` (`0.1.0`), private ESM package.
- Runtime: Node.js 24 or newer; npm 11.13.0; TypeScript 7.0.2.
- Browser/runtime library: Playwright Test 1.62.1 with Chromium, Firefox, and
  WebKit adapters. The standard install script provisions Chromium and WebKit.
- Primary output: immutable static vulnerability reports aggregating Jenkins,
  Snyk, and SonarQube evidence.
- Phase 2 addition: an explicit one-project Jenkins parameterized-build
  workflow that returns a safe in-memory outcome and does not write report
  artifacts.
- Phase 3 addition: a nine-file offline template corpus with a validated build
  detail page and exact default-deny GET/POST routes for deterministic proof.
- Phase 01 addition: a canonical, local `SecretStore` backend for validated
  credential persistence at `config/secrets.local.json`, wired into control
  mode.
- Phase 02 addition: loopback `GET`/`PUT`/`DELETE /api/secrets` routes with
  boolean-only presence maps, optional GET key filtering, bounded JSON patches,
  and Host/Origin/Fetch Metadata/CSRF/content-type security gates. The secrets
  implementation is isolated in a dedicated handler module.
- Phase 03 addition: control-run environment injection. The run executor reads
  one SecretStore snapshot, overlays it on the caller environment for that run,
  passes `runtimeEnvironment` to report/auto-build executors, and redacts stored
  values from control output without mutating `process.env`.
- Phase 04 addition: the loopback Control UI discovers configured credential
  variable names, checks boolean presence, saves non-empty values through the
  CSRF-gated secrets API, and wipes password inputs on save, clear, or close.
- Phase 05 addition: focused SecretStore lifecycle coverage, expanded secrets
  API operation coverage, and Chromium/WebKit Control UI E2E verification for
  dynamic credential persistence, injected execution, and zero leakage.
- Control report management: guarded loopback
  `DELETE /api/reports/projects/:projectId` removes one project subtree under
  the report-root lock and rebuilds surviving aggregates. The control-only
  history page shows retained projects with independent 20-run pagination and
  confirmation-gated project deletion; persisted report HTML stays static.
- Individual report-run deletion (Phases 01–03): guarded loopback
  `DELETE /api/reports/projects/:projectId/runs/:runId` removes one validated
  run under the shared lock, prunes an empty project directory, and rebuilds
  the aggregate. The React history table offers confirmed per-run deletion
  with post-outcome inventory refresh; Chromium/WebKit E2E verifies cancel,
  selected-run removal, sibling preservation, final-run pruning, and aggregate
  refresh.
- Final-report viewer (PDF plan Phase 01): existing per-run URLs open a
  Control-only React page after safe route matching and existing-index
  preflight. It validates saved report JSON/manifest identities and uses the
  escaped full-body renderer shared with static report output; report-only
  serving and persisted HTML remain static.
- Phase 05 addition (Host Template Mock Server): comprehensive validation and
  testing suite in [`tests/e2e/template-server-integration.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/e2e/template-server-integration.spec.ts)
  covering Developer Hub smoke tests, double-encoded URL path preservation,
  SonarQube auth session guard, concurrent execution with Control Server,
  `config/projects.template.json` schema-v1 validation, end-to-end production
  report capture with Snyk/Sonar evidence, auto-build submission, and Control UI
  project card rendering with zero cross-origin errors.
- React migration (Phase 03 of the React refactor): accessible Atomic Design
  primitives ([atoms](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/) and
  [molecules](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/)) and
  Tailwind styling in [`src/reporting/control-page/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/),
  preserving the active DOM IDs, CSS classes, data attributes, and ARIA contracts.
- Phase 06 addition: removal of legacy imperative assets (`control-page.js`,
  `control-page.html`, `control-page.css`); control dashboard frontend is now
  100% React application compiled via Vite with zero legacy assets.
- Control Dashboard Phase 01 addition: successful loads store the selected filename in
  `localStorage` (`jenkins_control_active_config`) and URL (`?config=<name>`).
  Precedence: valid URL candidate > valid stored candidate > first available config.
  The hook result no longer exposes `setActiveConfigName`.
- Bounded report-worker Phase 01: optional top-level `reportWorkers` (integer
  1–4, default 1), one-read direct CLI loading, and a fixed in-process report
  pool with indexed outcomes and per-project failure isolation.
- Bounded-report Phase 02: reject request-level `workerCount` with
  `422 INVALID_WORKER_COUNT`; after ETag verification, reports use the saved count.
  Control auto-build uses it as its pool bound, not a per-project dependency.
- Bounded-report Phase 03: the Dashboard selector edits that saved document
  through shared editor state; dirty/raw-JSON state requires Save before
  report execution. Report POSTs send no `workerCount`; UI and CLI share schema
  validation, and the CLI document loader reads once.
- Stage View completion monitoring: optional auto-build wait (default `true`),
  run and stage parsing, live progress logs, and build-number/result/stage data
  for the Control Page.
- Phase 02 parallel auto-build API: omitted `projectId` selects all enabled
  auto-build projects; a supplied ID selects one. The bounded pool uses saved
  `reportWorkers` (1–4, default 1), preserves config order, and returns a
  `buildProjects` array; run status succeeds only if every outcome has `exitCode === 0`.
- Phase 03 parallel auto-build UI: the action bar exposes all-enabled report and
  build actions plus one shared saved Workers selector. Per-card build buttons
  and the confirmation flow are removed; `RunResultBox` renders ordered
  `BuildProjectOutcomeRow` results with scalar fallback for older records.
- Phase 04 auto-build verification (2026-09-24): E2E replaced obsolete build-confirmation/per-card interactions with absent-control checks and immediate batch action, shared `#select-workers`, saved/dirty gating, and request assertions without `projectId`/`workerCount`. `npm run test:release` passed 439/439 (unit 399, template E2E 13, control E2E 20, report 5, WebKit 2); typecheck/build passed; review approved 9.3/10.
- Persistent aggregate index builder: pure projection of current report
  outcomes and validated history. Incomplete discovery blocks publication;
  aggregate data allows zero projects, up to 5,050 project rows, and staged
  JSON/HTML files up to 16 MiB each.
- Project-report deletion preflights the canonical target under the shared
  report-root lock: symlinks and non-file entries fail closed, with limits of
  32 levels, 4,096 entries, and 256 MiB. It removes the whole selected subtree,
  counts validated runs, and republishes surviving history; failed refresh
  attempts recovery without claiming deleted files were restored.
- Phase 04 verification (2026-09-25): `npm run test:unit` 443/443,
  `npm run test:control` 34/34, and `npm run test:report` 5/5 (482 passed).
  Coverage includes aggregate retention/bounds, DELETE security and failure
  recovery, the read-only report boundary, and Chromium/WebKit management UX.
  No code-coverage metrics were collected.
- Individual report-run deletion Phase 03 verification (2026-09-25): typecheck
  and build passed; unit 454/454, Control 40/40, and report 5/5 passed
  (499 total). Chromium/WebKit browser checks include zero Axe violations,
  cancellation, selected-run/sibling disk state, final-run pruning, and
  aggregate refresh. Coverage metrics were not collected.
- Repomix XML compaction refreshed for this summary. Its security check
  excluded `tests/unit/config.spec.ts` and `tests/unit/reporting-renderer.spec.ts`
  because of credential-shaped URL examples.

## Entry points and scripts

| Entry point | Responsibility |
| --- | --- |
| `scripts/run-report.mjs` | Builds the report launcher and invokes the report CLI. |
| `src/cli.ts` | Parses the explicit `--config` path and reports project outcomes. |
| `src/config.ts` | Public configuration exports, single-read document loader, worker-count policy, types, validation, normalization, and `selectReportProjects`, `selectAutoBuildProjects`, and `selectAutoBuildProject`. |
| `src/runner.ts` | Saved-count report dispatch, bounded multi-project execution, and aggregate publication. |
| `src/artifacts/aggregate-index-builder.ts` | Builds the validated aggregate from current outcomes and retained manifests without file I/O. |
| `src/project/report-worker-pool.ts` | Fixed in-process loops with indexed outcomes and per-project failure isolation. |
| `src/project/auto-build-runner.ts` | Explicit one-project auto-build API with optional Stage View wait and rich build outcome. |
| `src/project/auto-build-worker-pool.ts` | Bounded concurrent project loops with configuration-ordered outcomes and per-project failure isolation. |
| `src/jenkins/build-trigger.ts` | Exact build-page/form validation, one guarded POST, and optional completion wait. |
| `src/jenkins/stage-view.ts` | Detects a newly triggered run and observes it to terminal status under the workflow deadline. |
| `src/jenkins/stage-view-parser.ts` | Parses the Stage View run rows, stage statuses, names, and durations. |
| `src/jenkins/stage-view-types.ts` | Defines run identity, overall statuses, completion result, and stage details. |
| `src/templates/template-report-fixture.ts` | Public fixture facade, HTTP server exports, and template project document builder. |
| [`src/templates/template-server.ts`](file:///G:/ws/sharing/auto-jobs/src/templates/template-server.ts) | Standalone native Node.js HTTP server serving Developer Hub index page (`/`, `/index.html`) with 9 mock endpoints and offline template fixtures on port 4174. |
| `src/templates/template-server-cli.ts` | CLI entrypoint and argument parser (`--host`, `--port`) for the standalone template mock HTTP server. |
| `src/templates/template-fixture-loader.ts` | Loads and validates the complete offline fixture. |
| `src/templates/template-fixture-routes.ts` | Installs exact default-deny browser routes. |
| `src/reporting/report-server-secret-store.ts` | Validates and atomically persists local secrets; persistence only. |
| `src/reporting/report-server-run-manager.ts` | Owns the single-active control-run lifecycle and carries the optional `SecretStore` dependency. |
| `src/reporting/report-server-run-executor.ts` | Reads one SecretStore snapshot, merges `runEnv`, dispatches report or bounded auto-build pools, stores outcomes, and redacts control-run output. |
| `src/reporting/report-server-control-secrets-api.ts` | Handles presence-only `/api/secrets` GET/PUT/DELETE requests and SecretStore updates. |
| `src/reporting/report-server-control-security.ts` | Enforces control security headers and Host/Origin/Fetch Metadata/CSRF/content-type gates. |
| `src/reporting/report-server-control-api.ts` | Owns config/run handlers; omitted auto-build `projectId` selects a batch; re-exports the modular secrets handler. |
| `src/reporting/control-page/types/index.ts` | Defines optional `RunTriggerRequest.projectId`, `AutoBuildProjectResult.exitCode`, and `RunResult.buildProjects`. |
| `src/reporting/report-server-control.ts` | Validates Host, serves Control Dashboard, history and exact per-run React shells after final-index preflight; sends unmatched report paths to static serving. |
| `src/reporting/report-server-control-page.ts` | Loads Vite-built HTML, CSS, and JS assets from `.runner-build/reporting/control-page/`, injects CSRF tokens, and caches assets. |
| `src/reporting/report-server.ts` | Creates the store in control mode, passes it to the run manager, and exposes it on the server handle. |
| `src/reporting/control-page/` | Control Dashboard frontend sources (types, utils, headless hooks, components, styles) bundled via Vite into `.runner-build/reporting/control-page/`. |
| `src/reporting/control-page/App.tsx`, `HeaderBar.tsx` | Select Dashboard, report history, or final-report view by pathname and provide history navigation. |
| `src/reporting/project-report-route.ts` | Browser-safe matching and validation for safe final-report route IDs and exact index/directory forms. |
| `src/reporting/project-report-body-renderer.ts` | Composes the complete escaped evidence body shared by React and static output. |
| `src/reporting/control-page/pages/final-project-report-page.tsx`, `hooks/use-project-report.ts` | Render validated per-run evidence and expose loading/missing/invalid/load-error states. |
| `src/reporting/control-page/pages/ReportManagementPage.tsx` | Loads the aggregate independently of active configuration and composes confirmed project/run deletion flows. |
| `src/reporting/control-page/hooks/use-delete-reports.ts`, `use-delete-run.ts` | Use the shared CSRF-aware client, refresh inventory, and surface mutation feedback. |
| `ProjectReportHistoryCard.tsx`, `project-runs-table.tsx`, `DeleteReportsConfirmationDialog.tsx`, `DeleteRunConfirmationDialog.tsx` | Compose project history, 20-run pagination, and confirmed deletion controls. |
| `vite.control.config.ts` | Vite configuration for Control Dashboard: React plugin, Tailwind CSS, single-bundle outputs, and CSP-compliant asset emission. |

Useful package scripts include `typecheck`, `build` (compiles TypeScript, bundles the Vite control dashboard into `.runner-build/reporting/control-page/`, and stages report assets), `test:unit`,
`test:e2e:templates`, `test:control`, `test:report`, `test:release:webkit`,
`test:release`, `report`, `report:template`, `serve:control`,
`serve:report`, and `serve:templates`. There is no production auto-build CLI command in this phase.

## Configuration and run contracts

Configuration is one schema-v1 JSON document passed through `--config`. The
optional top-level `reportWorkers` (1–4, default 1) bounds report batches and
control auto-build batches. The loader validates before browser launch and
exposes the validated document with normalized projects through
`loadProjectConfigWithDocument`; `loadProjectConfig` retains its normalized-
array contract. The browser editor uses the same `assertProjectConfigDocument`
schema boundary.

Each project requires a safe `id`, display `name`, exact credential-free
Jenkins `loginUrl`, and exact credential-free `jobUrl` on one Jenkins origin
and base context. `enabled: false` remains an execution gate.

`waitForCompletion?: boolean` is accepted in `defaults` or per project;
project values override defaults. If both are absent, the normalized default
is `true`. It applies to auto-build only; the report flow ignores it.

`RunType` is the project-only union `'report' | 'auto-build'`. Missing input
normalizes to `'report'`; it is not present in `ProjectConfigDefaults` and is
not read from an environment variable. `selectReportProjects` returns a frozen,
configuration-ordered list of enabled normalized report projects and fails if
none remain. `selectAutoBuildProjects` returns a frozen, configuration-ordered
list of enabled normalized auto-build projects and fails if none remain.
The targeted `selectAutoBuildProject` requires an exact, non-empty project ID
and returns one enabled normalized auto-build project; missing, disabled, or
report projects fail closed. All three helpers are pure selection boundaries,
exported from `src/config.ts`.

Selectors can be supplied at `defaults.selectors` and overridden at
`projects[*].selectors`. The complete normalized set is `authLandmark`,
`sonarqubeReport`, `snykReport`, `buildParametersLink`, and
`buildSubmitButton`. The build defaults are an accessible role link named
`Build with Parameters` and an accessible role button named `Build`; both are
`required: true`. An explicit `required: false` for either build selector is
rejected. Build-control search scopes remain runtime executor rules.

Credentials in schema-v1 projects are represented only by environment-variable
names. Legacy structural environment inputs and credential-bearing URLs are
rejected; raw secrets are not persisted in normalized projects, diagnostics,
screenshots, or reports. File-mode and direct library callers resolve these
names from their supplied environment. In control mode, Phase 03 overlays one
SecretStore snapshot on a fresh per-run environment and passes it through
`runtimeEnvironment`; stored values win on collisions, and `process.env` is
unchanged. `config/projects.example.json` demonstrates an enabled report
project and a disabled auto-build project using `.invalid` placeholders;
`config/projects.template.json` provides a pre-configured runnable document for
the local template fixture mock server (`http://127.0.0.1:4174`).

## Runtime pipelines

### Report path

1. Parse one explicit configuration path.
2. Validate schema keys, project identity, exact URLs, origins, selectors,
   credential references, paths, and bounded options.
3. Normalize defaults, including `runType: 'report'`, selectors, origins, and
   absolute artifact roots.
4. Select enabled report projects with `selectReportProjects`.
5. Read the document and normalized projects together once; use optional
   top-level `reportWorkers` (integer 1–4, default 1) for the whole report batch.
6. Launch one configured browser and start `min(reportWorkers, selected
   projects)` fixed in-process loops, each using a fresh context and absolute
   deadline. Store outcomes by configuration index and continue after failures.
7. Authenticate at the exact Jenkins login URL, open the exact job URL, and
   discover allowed Snyk/SonarQube destinations.
8. Normalize bounded evidence and publish per-run artifacts plus an aggregate
   index. Keep the report-root lock through worker settlement and publication.

The report path never searches jobs, opens a build page, submits a build form,
inspects queues/build identities, polls terminal status, or accepts a
build-number override.

### Auto-build path

An integration must normalize the document, call
`selectAutoBuildProject(projects, projectId)`, and pass only that project to
`runAutoBuildProject`. The runner rejects disabled or wrong-mode inputs before
launch, resolves credentials, creates one browser/context/page, and shares one
`WorkflowDeadline` across login, submission, and cleanup.

The workflow validates the exact job's **Build with Parameters** link and
`POST` form, then clicks once. When waiting is enabled, it snapshots the latest
Stage View run ID before submission; after an accepted POST it returns to the
job page and monitors a newer run (or a fresh in-progress run if no baseline
was available). The monitor polls under the shared deadline, emits stage
transition logs, and stops at `SUCCESS`, `FAILED`, `UNSTABLE`, or `ABORTED`.

With waiting disabled, an accepted response returns `submitted` immediately.
HTTP status at or above 400 is `rejected`; a matching POST with no determinate
response is `submission-unknown`. Pre-POST errors become sanitized
`failed-before-submit`, and the runner never retries after a possible side
effect. With waiting enabled, `SUCCESS` maps to `succeeded`, the other terminal
results map to `failed`, and timeout returns any build details already seen.

The in-memory outcome carries `buildNumber`, `buildResult`, and the stage
breakdown (`name`, `status`, and optional duration), alongside existing safe
job/build URLs, timestamp, response status, and error fields. Form bodies,
parameters, crumbs, headers, cookies, response bodies, and queue IDs are not
exposed. Auto-build does not capture reports or write report artifacts.

### Control-run environment injection

`POST /api/run` carries the config name/ETag, explicit `runType`, and optional
auto-build `projectId`; it never carries secret values. After the run manager
accepts the request, `executeControlRun` reads the current SecretStore map once
and creates:

```ts
const runEnv = { ...env, ...storedSecrets };
```

The executor normalizes the project document against `runEnv`, then passes
`runtimeEnvironment: runEnv` to `runConfiguredProjects` or the bounded
auto-build pool, which invokes `runAutoBuildProject` for each project. The
caller environment and `process.env` are unchanged. SecretStore updates affect
later runs, not a snapshot already in progress.

For auto-build, omitted `projectId` selects all enabled auto-build projects; a supplied ID
selects one. The bounded pool stores configuration-ordered outcomes in
`result.buildProjects`, including for one-project runs. The run succeeds only
when every outcome has `exitCode === 0`; thrown project errors become
`submission-unknown` outcomes with `exitCode: 1`, and siblings continue.

The report trigger body contains `configName`, `configEtag`, and `runType`;
auto-build may also carry `projectId`. Both modes reject request-level
`workerCount` with `422 INVALID_WORKER_COUNT`. The ETag-matched saved
`reportWorkers ?? 1` is passed to report execution and bounds the auto-build
worker pool; neither mode accepts a worker-count override from the request.

Every non-empty stored value is included in the control redaction set. The
executor redacts `addLog` messages, report warnings, caught error messages and
stacks, and auto-build `jobUrl`/`buildPageUrl` result fields before recording
the run. Local report URLs come only from validated relative report paths.

### Control UI credential workflow (Phases 04–05)

The `/` page renders a per-server CSRF token into a meta tag. The browser
discovers credential-variable names from the loaded project document, applying
project references before defaults and falling back to
`JENKINS_USERNAME`/`JENKINS_PASSWORD`; names are deduplicated and sorted.
Opening **Credentials** calls `GET /api/secrets?keys=...` and renders blank
password inputs with boolean **Configured**/**Missing** badges. Values are never
loaded into the page.

Save collects only non-empty, trimmed inputs and sends
`PUT /api/secrets` with `{ "secrets": { ... } }`. `apiFetch` attaches the
CSRF header to the mutation; the server additionally checks Host, same-origin
Origin, Fetch Metadata, JSON content type, and body size. On success the UI
clears submitted inputs and updates presence badges. Per-row **Clear** sends
bodyless `DELETE /api/secrets?name=...`; success clears the input, marks it
**Missing**, and removes the clear action. Dialog close clears every input and
the modal message, including unsaved values; reopening performs a fresh
presence lookup.

Secret values exist only transiently in an active password input and the
mutation request body. They are not reflected in labels, status messages,
URLs, page HTML after save/close, or API success/error payloads. The browser
contract in `tests/e2e/control-page.spec.ts` covers modal accessibility,
dynamic key discovery, Missing/Configured transitions, save/clear/reopen
state, injected-credential execution, input wiping, and absence of test
secrets from page HTML and run logs. The control configuration uses Chromium
and WebKit projects, so the four browser scenarios produce eight E2E checks.

### Control UI atomic design components and contract fidelity (Phase 03 React refactor)

The Control Dashboard UI uses Atomic Design principles to isolate visual primitives and compound molecules while guaranteeing 100% contract fidelity with existing Playwright E2E locators:

1. **Styling and utility infrastructure**:
   - [`globals.css`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/styles/globals.css): Declares Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`), maps CSS variable design tokens (`--bg-color`, `--card-bg`, `--text-main`, `--text-muted`, `--border-color`, `--primary`, `--secondary`, `--danger`, `--focus-ring`, `--mono-font`), sets `:focus-visible` outline rings, and defines critical accessibility utilities (`.skip-link`, `.visually-hidden`, `.hidden`, `@media (prefers-reduced-motion: reduce)`).
   - [`cn`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/utils/cn.ts#L4) (`utils/cn.ts`): Wraps `clsx` and `twMerge` to reconcile Tailwind utility classes with legacy class tokens without style precedence collisions.

2. **Atomic primitives ([`components/atoms/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/))**:
   - [`Badge`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Badge.tsx#L31): Renders `<span className="badge badge-{variant}">`. Maps status variants (`idle`, `queued`, `running`, `succeeded`, `failed`, `unknown`, `submission-unknown`), credential states (`configured` -> `badge-configured`, `missing` -> `badge-missing`), and browser setting unconfigured state (`not-set` -> class `badge-missing` with text `'Not Set'`). Supports `forwardRef`.
   - [`Button`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Button.tsx#L5): Renders `<button type="button" className="btn btn-{variant} ...">`. Supports variants (`primary`, `secondary`, `danger`, `outline`), size `sm` (`btn-sm`), disabled state, loading spinner, and arbitrary `data-*` attributes (`data-key`). Supports `forwardRef`.
   - [`Input`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Input.tsx#L5): Accessible input wrapper with `id`, default `type="text"`, optional label via `htmlFor`, error message with `role="alert"` and `aria-invalid="true"`, default `autoComplete="off"` and `spellCheck=false`. Supports `forwardRef`.
   - [`Select`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Select.tsx#L5): Native `<select>` wrapper supporting options or custom children, associated label or `aria-label`, and `forwardRef`.
   - [`StatusBanner`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/StatusBanner.tsx#L5): Notification banner rendering `<div id="status-banner" role="status" aria-live="polite" className="status-banner {variant} ...">`. Toggles `.hidden` when not visible.
   - [`LoadingIndicator`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/LoadingIndicator.tsx#L5): Status indicator with `aria-live="polite"`, class `credentials-loading`, and `.hidden` toggle when not visible.

3. **Compound molecules ([`components/molecules/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/))**:
   - [`CredentialRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/CredentialRow.tsx#L8): Renders `.credential-row` containing `.credential-field` (`label[for="secret-input-${key}"]` and `Badge`), and `.credential-input-group` (`<input id="secret-input-${key}" type="password" class="credential-input" autocomplete="off" />`). When `isConfigured` is true, renders `<button class="btn btn-secondary btn-sm btn-clear-credential" data-key="{key}">Clear</button>`.
   - [`BrowserSettingRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/BrowserSettingRow.tsx#L28): Renders browser setting controls with contract-specified IDs: badges (`#badge-browser-headless`, `#badge-browser-executable-path`), controls (`#browser-headless-select`, `#browser-executable-path-input`), and clear buttons (`#btn-clear-browser-headless`, `#btn-clear-browser-executable-path`).
   - [`ConfigSelectorBar`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx#L7): Renders configuration selector (`<select id="config-select" aria-label="Select Configuration">`) and toolbar buttons (`#btn-reload`, `#btn-save`, `#btn-credentials`, `#btn-browser-settings`). Enforces `#btn-save` disabled when `!isDirty || isSaving || isLoading`.
   - [`LogViewer`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/LogViewer.tsx#L23): Renders `<pre id="run-logs" role="log" aria-live="polite" class="log-pre">`. Formats strings or `RunLogEntry[]` timestamps (`[${timestamp}] ${message}`), defaults to `"No active run."`, and auto-scrolls on log updates.
   - [`RunResultBox`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/RunResultBox.tsx#L5): Renders report results, ordered `buildProjects` rows, scalar build results for older records, and error messages in `#run-result-box`.

4. **Organism Assembly and Phase 06 Legacy Cleanup**:
   - Compound organisms ([`components/organisms/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/)): `HeaderBar`, `ProjectsGrid`, `ProjectCard`, `ExecutionSection`, `RunStatusCard`, `RawJsonSection`, `CredentialsDialog`, and `BrowserSettingsDialog`; the per-card build-confirmation flow was removed in Phase 03.
   - Phase 06 cleanup removed all legacy imperative assets (`control-page.js`, `control-page.html`, `control-page.css`). The application is 100% React compiled into `.runner-build/reporting/control-page/` by Vite.
   - Current component contracts are exercised in `tests/unit/control-atomic-components.spec.ts`, including the new action-bar and multi-result behavior.


### Control Dashboard config form builder (integrated; Active Config Phase 02–04)

`ConfigFormBuilder` is a document-controlled organism that composes the
`ConfigProjectEditor` and `ConfigDefaultsEditor` molecules. The project editor
handles project fields and credential environment-variable references, with
project references inheriting defaults when overrides are absent. The defaults
editor handles timeout, browser, artifact directory, and default credential
references. Credential controls accept variable names only, never secret
values.

For auto-build projects, `ConfigProjectEditor` persists optional
`waitForCompletion` settings; no per-run modal override remains. The action bar
contains `#btn-run-reports`, `#btn-run-auto-build`, and the shared saved
`Workers` selector (`#select-workers`, 1–4); edits mark the document dirty and
both actions wait for ETag-conditional Save. `RunResultBox` renders ordered
`BuildProjectOutcomeRow` entries with identity, status/result, optional build
number/link, stages, and error; older scalar build results remain supported.


`useConfigDocumentEditor` owns document/raw-JSON synchronization, validation,
dirty state, Apply, and mutations. `updateProjectDocumentReportWorkers` writes
the top-level saved count; `DashboardPage` binds the shared `Workers` selector
to that transition. Changes update the same document/raw JSON and mark it dirty.
Valid raw-JSON Apply updates the schema-validated model; invalid input leaves
the applied model unchanged. Both actions remain disabled for dirty or
unavailable config and while a run is queued/running.

## Local SecretStore backend

`src/reporting/report-server-secret-store.ts` is a persistence-only module.
`createSecretStore(configRoot)` canonicalizes an existing, real config
directory and fixes the target to `config/secrets.local.json`; no path or
filename is accepted from callers. The file is covered by
`config/*.local.json` in `.gitignore`.

The store accepts only a JSON object of string values no larger than
`MAX_SECRET_FILE_BYTES` (1 MiB). Keys must match
`/^[A-Za-z_][A-Za-z0-9_]{0,127}$/` and exclude `__proto__`, `prototype`, and
`constructor`; missing or empty files return `{}`. Malformed JSON, arrays/null,
non-string values, invalid keys, oversized files, non-regular files, and
symlinks are rejected. `readSecrets()` returns a frozen map;
`listSecretNames()` returns sorted frozen names. `putSecret`, `putSecrets`,
`deleteSecret`, and `deleteSecrets` validate names and use a latest-file
read-modify-write inside one in-memory lock.

Writes serialize lexicographically sorted keys to an exclusive sibling
temporary file with mode `0o600`, sync and close it, then rename it over the
fixed target. Failed renames remove the temporary file. Secret values are not
included in errors or diagnostics. On Windows, mode bits are not an ACL
boundary; protect the config directory with user/CI ACLs.

`src/reporting/report-server.ts` creates one store in control mode and returns
it on `ReportServerHandle`; `src/reporting/report-server-control.ts` carries it
on `ControlRouterContext`. The router validates Host before dispatching
`/api/secrets`, whose implementation is isolated in
`report-server-control-secrets-api.ts`; `report-server-control-api.ts` keeps the
config/run facade and re-export. During control execution, the run manager
carries the optional store to `report-server-run-executor.ts`, which merges a
snapshot into `runtimeEnvironment` for either mode without mutating
`process.env`.

## Control secrets API

`GET /api/secrets` returns `{ "secrets": { "<name>": true } }` for all stored
names. `GET /api/secrets?keys=A,B` validates requested environment-style names
and returns each as `true` (present) or `false` (absent). PUT requires the
shared mutation gate and accepts `{ "name": "NAME", "value": "VALUE" }` or a
non-empty `{ "secrets": { "NAME": "VALUE" } }` patch. Null patch values and
`action: "delete"` remove entries. DELETE accepts `?name=NAME` or JSON
`{ "name": "NAME" }`/`{ "names": ["NAME"] }`. PUT/DELETE return the full
post-operation presence map; no endpoint response contains a secret value.

Mutations use `validateMutationRequest`: exact Host and same-origin Origin,
accepted `Sec-Fetch-Site`/`Sec-Fetch-Mode`, timing-safe CSRF, JSON content type
(bodyless DELETE excepted), and the 1 MiB bounded JSON body parser. Invalid
input returns 400, failed gates 403, non-JSON mutations 415, an unavailable
store 503, and unsupported methods 405 with `Allow`. Shared JSON responses
set `Cache-Control: no-store`.

## Module map

| Directory/module | Boundary |
| --- | --- |
| `src/config/` | Schema validation, field validation, normalization, secret resolution, and project mode selection. |
| `src/config/project-config-schema.ts` | Browser-safe `assertProjectConfigDocument` boundary shared by runtime config loading and Control Dashboard document editing. |
| `src/config-selectors.ts` | Selector kinds, parsing, and immutable selector defaults. |
| `src/browser-launcher.ts` | Shared browser selection and environment-driven launch options. |
| `src/jenkins/auth.ts` | Credential submission, authenticated-page validation, and exact job navigation. |
| `src/jenkins/url-identity.ts` | Exact job identity and exact job-action (`/build`) validation. |
| `src/jenkins/locators.ts` | Configured Playwright locator mapping and href resolution. |
| `src/jenkins/build-trigger-validation.ts` | Build-page structure, control cardinality, classes, form method, and action checks. |
| `src/jenkins/build-trigger.ts` | Single parameterized-build submission and outcome classification. |
| `src/project/project-workflow.ts` | Report workflow plus separate login/job/trigger auto-build workflow. |
| `src/project/auto-build-runner.ts` | One-project auto-build lifecycle, redaction, and cleanup. |
| `src/project/project-runner.ts` | Report run state, capture, failure artifacts, and report outcomes. |
| `src/artifacts/` | Run identities, staging leases, publication, manifest discovery, cleanup, and aggregate recovery. |
| `src/artifacts/report-project-deletion.ts` | Safe whole-project subtree deletion, bounded filesystem preflight, report-root lock handling, and aggregate rebuild. |
| `src/artifacts/report-run-deletion.ts` | Safe single-run deletion, bounded target preflight, report-root lock handling, empty-project pruning, and aggregate rebuild. |
| `src/reporting/` | HTML rendering, report links, view models, static serving, and control API routing. |
| `src/reporting/report-server-secret-store.ts` | Canonical fixed-file secret persistence, validation, frozen snapshots, atomic writes, in-memory locking, and deletion. |
| `src/reporting/report-server-constants.ts` | Shared report/control limits plus `SECRETS_FILE_NAME`, `MAX_SECRET_FILE_BYTES`, and control body limits. |
| `src/reporting/report-server-control-security.ts` | Security headers and Host/Origin/Fetch Metadata/timing-safe CSRF/content-type validation. |
| `src/reporting/report-server-control-secrets-api.ts` | Modular `/api/secrets` GET/PUT/DELETE handler, presence-map construction, bounded input, and store operations. |
| `src/reporting/report-server-control-api.ts` | Config/run handlers and re-export facade for the secrets handler. |
| `src/reporting/report-server-control-reports-api.ts` | Guarded whole-project and per-run DELETE routes plus request validation. |
| `tests/unit/control-reports-delete-api.spec.ts` | Whole-project deletion security/body gates, lock and prefix safety, filesystem preflight, empty aggregate, and injected removal/publication failure handling. |
| `tests/unit/control-reports-run-delete-api.spec.ts` | Per-run deletion, sibling preservation, final-project pruning, request validation, lock contention, CSRF, method handling, and injected removal failure coverage. |
| `src/reporting/report-server-control.ts` | Host preflight, control and built-asset routing, and `ControlRouterContext` dependencies. |
| `src/reporting/report-server-control-page.ts` | Asset loader: reads built HTML, CSS, and JS from `.runner-build/reporting/control-page/`, injects CSRF tokens, and caches buffers. |
| `src/reporting/report-server.ts` | Report/control server lifecycle; creates the SecretStore only in control mode. |
| `src/reporting/control-page/` | Control Dashboard frontend sources (`index.html`, `main.tsx`, `styles/globals.css`, React components and hooks) bundled into `.runner-build/reporting/control-page/`. |
| `src/reporting/control-page/types/` | Data contracts (`index.ts`) and shared UI component prop interfaces (`component-contracts.ts`). |
| `src/reporting/control-page/utils/cn.ts` | Merges Tailwind CSS and conditional classes using `clsx` and `twMerge`. |
| `src/reporting/control-page/utils/discoverCredentialKeys.ts` | Discovers required project credential variables with defaults and fallback resolution. |
| `src/reporting/control-page/utils/config-selection.ts` | Reads, resolves, and persists the active configuration preference in `localStorage` and the `config` URL parameter. |
| `src/reporting/control-page/hooks/` | Headless React hooks: `useControlApi`, `useConfigManager` (active configuration plus API/ETag flow), `useConfigDocumentEditor` (document/raw-JSON editing and validation), `useCredentialsManager`, `useBrowserSettings`, and `useRunPoller`. |
| `src/reporting/control-page/hooks/config-document-transitions.ts` | Immutable add, update, remove, defaults, and report-worker count transitions for the editor document. |
| `src/reporting/control-page/components/atoms/` | Atomic UI primitives: `Badge`, `Button`, `Input`, `Select`, `StatusBanner`, and `LoadingIndicator` with forwardRef support and variant contracts. |
| `src/reporting/control-page/components/molecules/` | Compound molecules: `CredentialRow`, `BrowserSettingRow`, `ConfigSelectorBar`, `ConfigProjectEditor`, `ConfigDefaultsEditor`, `LogViewer`, `RunResultBox`, and `BuildProjectOutcomeRow`. |
| `src/reporting/control-page/components/organisms/ConfigFormBuilder.tsx` | Integrated config-form organism mounted by `DashboardPage` beside `RawJsonSection`; shares document state with the raw editor. |
| `vite.control.config.ts` | Vite configuration for Control Dashboard: React plugin, Tailwind CSS, single-bundle outputs, and CSP-compliant asset emission. |
| `scripts/copy-report-assets.mjs` | Asset copy script: stages `src/reporting/report.css` into `.runner-build/reporting/`. |
| `src/reporting/report-server-run-manager.ts` | Single-active control-run lifecycle and optional SecretStore dependency. |
| `src/reporting/report-server-run-executor.ts` | Per-run SecretStore snapshot, environment merge, mode dispatch, and redaction. |
| `src/security/` | Origin, base-path, relative URL, credential-like URL, traversal, and containment checks. |
| `src/templates/template-fixture-types.ts` | Fixture, response, route recorder, file-identity, read-budget, artifact-link, and Sonar route contracts. |
| `src/templates/template-fixture-file-io.ts` | Canonical root resolution, no-follow reads, identity/symlink checks, and 4 MiB/16 MiB budgets. |
| `src/templates/template-fixture-html.ts` | HTML parsing, URL policy, canonical/form/link rewrites, artifact selection, and exact URL matching. |
| `src/templates/template-fixture-sonarqube.ts` | Saved SonarQube identity checks and dashboard/issues rewrites. |
| `src/templates/template-fixture-build-validation.ts` | Saved `#side-panel` build-link discovery and build-page DOM/action validation. |
| `tests/unit/control-secrets-api.spec.ts` | HTTP endpoint operations: presence maps, filtering, single/batch patch, deletion, persistence, and no plaintext response. |
| `tests/unit/control-secrets-security.spec.ts` | API redaction, Host/Origin/Fetch Metadata/CSRF/content-type gates, input validation, methods, and missing-store behavior. |
| `tests/unit/control-run-executor-fixture.ts` | Shared isolated config, record, result, and completion helpers for run-executor tests. |
| `tests/unit/control-run-api.spec.ts` | Verifies omitted `projectId` request acceptance and request-level `workerCount`/invalid-ID rejection. |
| `tests/unit/bounded-auto-build-workers.spec.ts` | Verifies concurrency bounds, configuration-order outcomes, sibling failure isolation, saved-count pool dispatch, and aggregate status. |
| `tests/unit/control-run-executor-secrets.spec.ts` | Report/auto-build injection, precedence, non-mutation, redaction, ETag-checked report worker count, and auto-build isolation. |
| `tests/unit/control-hooks-and-types.spec.ts` | Hook/API lifecycles, active-config persistence, and document-level report-worker transition coverage. |
| `tests/unit/control-atomic-components.spec.ts` | Atomic/molecular contracts for the shared Workers/action bar and ordered multi-project plus scalar-fallback result presentation. |
| `src/templates/template-fixture-loader.ts` | Reads nine files and assembles synthetic URLs and rewritten HTML. |
| `src/templates/template-fixture-routes.ts` | Exact response lookup, login/SonarQube/build POST exceptions, and sanitized miss recording. |
| `tests/unit/report-server-secret-store.spec.ts` | Phase 01 backend contract and control-mode wiring coverage. |
| `tests/unit/control-secret-store.spec.ts` | Phase 05 SecretStore lifecycle coverage: empty reads, atomic file cleanup, platform permissions, key/value rejection, concurrent writes, and deletion. |
| `src/templates/template-report-fixture.ts` | Public facade exports plus explicit `templateProjectDocument` run type. |
| `templates/jenkins-template/template-build.html` | Minimal saved-origin build page with canonical URL, `POST` form, `#bottom-sticker`, and classed `Build` button. |
| `templates/` | Offline Jenkins, Snyk, and SonarQube fixture corpus, including the build detail page. |
| `tests/unit/template-build-fixture.spec.ts` and `tests/e2e/template-auto-build.spec.ts` | Build fixture drift, exact redirect, route, budget, and production auto-build coverage. |
| [`tests/unit/template-server.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/unit/template-server.spec.ts) | Loopback binding, Developer Hub index page (`/`, `/index.html`, 9 mock endpoints, HEAD, security headers, XSS prevention), GET/HEAD fixture routing, POST redirects, SonarQube auth guard, 404/405/400 errors, and graceful shutdown coverage. |
| `tests/unit/template-server-cli.spec.ts` | CLI argument parsing, environment variable overrides, port validation, help flags, signal cleanup, and process execution tests. |
| [`tests/e2e/template-server-integration.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/e2e/template-server-integration.spec.ts) | End-to-end integration and validation tests for the standalone template mock HTTP server, Developer Hub smoke flows, concurrent Control Server execution, `projects.template.json`, production report capture, and auto-build submission. |

## Artifacts and test boundaries

Report roots contain `index.html`, `aggregate-data.json`, CSS assets, and
`<project-id>/<run-id>/` directories with `index.html`, `data.json`,
`manifest.json`, and requested screenshots. Auto-build runs do not allocate
these report artifacts. Test-runner traces and reports in `test-results/` or
`playwright-report/` are test evidence, not vendor evidence.

The pure `buildAggregateIndex` builder keeps current outcomes in configuration
order and retains history-only projects. The manifest reader sets
`ManifestDiscoveryResult.incomplete` when its manifest or directory/artifact
budgets are reached; the builder rejects incomplete discovery and the runner
skips aggregate publication. The schema-v3 aggregate accepts `projects: []` for
zero-project index and up to 5,050 project rows, separate from the schema-v1
input limit of 50 projects. Aggregate validation also caps total retained runs
at 5,000. Before publication, the publisher checks both staged JSON and HTML
against the 16 MiB static-file limit and preserves the previous pair on
oversize rejection.

The control-only `DELETE /api/reports/projects/:projectId` removes a whole
project subtree after complete validated-manifest discovery. The
`DELETE /api/reports/projects/:projectId/runs/:runId` endpoint removes only one
validated run, prunes an empty project directory, and republishes both aggregate
files from surviving manifests under the same report-root lock.

Focused coverage lives in `tests/unit/aggregate-index-builder.spec.ts` and
`tests/unit/persistent-aggregate-bounds.spec.ts`.

The deterministic release sequence is documented in
[release gates](./release-gates.md). Template tests fulfill exact URLs from
checked-in files with default-deny routes and do not contact Jenkins or vendor
services. `template-build-fixture.spec.ts` validates the ninth file and
`template-auto-build.spec.ts` proves one build POST without Snyk/Sonar capture.
The Phase 05 template server validation gate in
[`tests/e2e/template-server-integration.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/e2e/template-server-integration.spec.ts)
extends template test coverage with 11 integration checks, bringing the unified
template test gate (`npm run test:e2e:templates`) to 13 passing checks across
navigation, auto-build, and real HTTP mock server execution.
The Phase 03 UI contracts are covered by
`tests/unit/control-hooks-and-types.spec.ts`,
`tests/unit/control-atomic-components.spec.ts`, and
`tests/e2e/control-page.spec.ts`. Unit coverage exercises the document
transition and selector options. The two report-worker E2E scenarios verify
the default and selectable counts, raw-JSON synchronization, dirty/run gating,
save and reload persistence, configuration switching, report/auto-build POST
payloads without `workerCount`, and `422 INVALID_WORKER_COUNT` for crafted
requests.

Report-management route behavior is covered by
`tests/unit/control-assets-routing.spec.ts`; browser flows are covered by
`tests/e2e/control-report-management.spec.ts` and run in Chromium and WebKit via
`npm run test:control`. Scenarios include navigation/back, empty and
history-only inventories, independent 20/21-run pagination, cancellation and
Escape dismissal, deletion with sibling preservation, final-project empty
state, and 409/500 feedback. Assertions compare on-disk project and aggregate
state.

The Active Config Persistence & Form Builder Phase 04 also covers active-config
resolution (valid URL > stored filename > first available), stale/empty
candidates, storage-safe access, URL state preservation, collision-free project
creation, immutable field/default updates, deletion invariants, and schema
validation. Other Control Page scenarios cover credentials, browser settings,
execution injection, and zero plaintext leakage. Browser scenarios run in
Chromium and WebKit; desktop/mobile Axe scans require zero violations and no
horizontal overflow.

The 2026-09-23 Active Config Phase 04 release audit recorded
`npm run test:release` at 371/371 (100%), with typecheck/build passing and code
review approval at 10/10. This is a prior milestone snapshot, not evidence for
the bounded-report Phase 03 changes.


## Offline template fixture flow

`loadTemplateReportFixture(env, origin?)` resolves the canonical `templates/`
root (or `TEMPLATES_DIR`), reads the Jenkins login/job/build pages, Snyk HTML
and summary, and SonarQube login/home/Overall/Issues pages. It enforces a
4 MiB per-file and 16 MiB cumulative budget, validates saved origins and
identities, then remaps only approved links/actions to a synthetic origin.

The build page identity comes from the unique saved `Build with Parameters`
anchor in `#side-panel`; the loader does not construct a branch path. The
build template must have one matching canonical URL, one `POST` action, one
`#bottom-sticker`, and one `Build` button with all three Jenkins class tokens.

`templateResponse` serves only exact fixture URLs. `installTemplateReportRoutes`
allows exact `GET`/`HEAD` responses, exact Jenkins login actions, the
same-origin SonarQube `/sessions/new` authentication path, and the exact build
`POST`. Unknown requests abort and record only bounded method/origin/path
fields. The route state for SonarQube login is context-local.

`templateProjectDocument(env, fixture, runType)` emits one normalized schema-v1
project; `runType` defaults to `report`, while the auto-build E2E passes
`auto-build` explicitly. Report mode never follows the build route.

## Security and maintenance boundaries

- Keep runtime credentials in the supplied environment or a trusted CI secret
  store; local values belong only in git-ignored
  `config/secrets.local.json`. Control runs overlay a SecretStore snapshot on
  a fresh environment object and never mutate `process.env`. Never commit
  values, cookies, tokens, or credential-bearing URLs.
- Keep SecretStore keys environment-style, reject reserved prototype names, and
  bound payloads. Use frozen snapshots, sorted deterministic JSON, latest-file
  read-modify-write locking, exclusive temporary files, sync/close/rename, and
  rename-failure cleanup. Write/sync errors close handles; POSIX `0o600` mode
  is advisory on Windows, so config-directory ACLs are required.
- Keep `/api/secrets` loopback-only and route exact paths through the modular
  handler. Host-check every request; require Origin, accepted Fetch Metadata,
  timing-safe CSRF, JSON content type, and bounded bodies for mutations.
- Return only boolean presence maps from the API, set `Cache-Control: no-store`,
  and keep secret values out of success/error responses and diagnostics.
- Keep credential values out of the Control UI after each save, clear, or
  close. Render only variable names, boolean presence, and bounded messages;
  do not echo values into DOM attributes, URLs, HTML, or API responses.
- Treat `jobUrl` as the sole Jenkins job/branch identity; do not add a second
  branch field or infer identity from selector data.
- Keep mode selection explicit and project-scoped; never mass-enable auto-build
  from defaults, environment, URL shape, or CLI naming.
- Validate both build controls structurally before any POST and never inspect
  hidden form values.
- Treat an observed POST with no determinate response as an external
  side-effect uncertainty; do not retry automatically.
- Preserve canonical report/staging roots, symlink checks, bounded cleanup,
  immutable report identities, CSP headers, and safe local-link validation.
- Update [multi-project configuration](./multi-project-configuration.md) for
  field-level changes, [architecture](./architecture.md) for data-flow
  changes, and [code standards](./code-standards.md) for implementation rules.
