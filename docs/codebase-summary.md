# Codebase summary

This summary is based on refreshed `repomix-output.xml` and current
source/configuration. It covers report/build execution, schema-v1 configuration
and the flat project/job matrix, the Control Server and React UI, report
history/PDF export, offline fixtures, and verification boundaries.

## Repository profile

- Runtime: Node.js 24 or newer; npm 11.13.0; TypeScript 7.0.2.
- Browser/runtime library: Playwright Test 1.62.1 with Chromium, Firefox, and
  WebKit adapters. The standard install script provisions Chromium and WebKit.
- Control Page icon library: `lucide-react`; browser-PDF dependencies `jspdf`
  and `jspdf-autotable` are runtime packages bundled with the Control Page.
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
- Final-report viewer and PDF export (Phases 01–03): Control-only React viewer
  validates saved JSON/manifest identity and shares the escaped body with static
  output. Shipped browser export uses semantic DOM extraction, jsPDF/AutoTable,
  embedded Noto Sans, safe images and links; saved reports remain unchanged.
  Chromium/WebKit verification and dedicated regression helpers are listed below.
- Phase 05 addition (Host Template Mock Server): comprehensive validation and
  testing suite in [`tests/e2e/template-server-integration.spec.ts`](../tests/e2e/template-server-integration.spec.ts)
  covering Developer Hub smoke tests, double-encoded URL path preservation,
  SonarQube auth session guard, concurrent execution with Control Server,
  `config/projects.template.json` schema-v1 validation, end-to-end production
  report capture with Snyk/Sonar evidence, auto-build submission, and Control UI
  matrix rendering with zero cross-origin errors.
- React migration (Phase 03 of the React refactor): accessible Atomic Design
  primitives ([atoms](../src/reporting/control-page/components/atoms/) and
  [molecules](../src/reporting/control-page/components/molecules/)) and
  Tailwind styling in [`src/reporting/control-page/`](../src/reporting/control-page/),
  preserving the active DOM IDs, CSS classes, data attributes, and ARIA contracts.
- Control UI Atomic Design Phase 01 (2026-09-27): introduced Modern Refined Light
  tokens and expanded the atom tier with `Checkbox`, compound `Card`, and
  `IconButton`; refactored `Button`, `Badge`, `Input`, `Select`, `StatusBanner`,
  and `LoadingIndicator`. Details below.
- Control UI Atomic Design Phase 02 (2026-09-27): added reusable
  [`FormField`](../src/reporting/control-page/components/molecules/FormField.tsx) for labels, required state, and helper/error messaging,
  plus [`PageHeader`](../src/reporting/control-page/components/molecules/PageHeader.tsx) for titles, navigation, badges, and action slots.
  Modernized `ConfigSelectorBar`, `CredentialRow`, `BrowserSettingRow`, `LogViewer`,
  `RunResultBox`, `BuildProjectOutcomeRow`, `ProjectRunsTable`,
  `ProjectReportStatusView`, and `ReportExportButton` with selective `lucide-react`
  icons while preserving DOM contracts. Shared prop types are in
  [`component-contracts.ts`](../src/reporting/control-page/types/component-contracts.ts);
  [`molecules/index.ts`](../src/reporting/control-page/components/molecules/index.ts) exports the tier.
- Control UI Atomic Design Phase 03 (2026-09-27) introduced the grouped board,
  project cards, and `ConfigFormBuilder`. The later flat-matrix cutover removes
  those surfaces; see [Control Dashboard and flat project/job matrix](#control-dashboard-and-flat-projectjob-matrix-phase-02)
  for the current page architecture.
- Typed slot templates (`DashboardLayout`, `ReportManagementLayout`, and
  `FinalReportLayout`) are exported from `components/templates/index.ts`.
- The five tiers are atoms → molecules → organisms → templates → pages. The
  matching page components coordinate hooks/local state and fill template
  slots; templates own page shells.
- `App.tsx` selects routes and composes atom `Card`/`Button` in `NotFoundView`.
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
- Project groups and document lifecycle (Phase 01): optional root
  `projectGroups` definitions and project-only `groupId` are validated at the
  shared schema boundary; Control editor transitions are immutable. Group
  metadata remains outside normalized execution projects, and
  `replacementRevision` changes only on successful document replacement or
  valid raw-JSON Apply, not on edits or Save acknowledgement.
- Phase 01 job-matrix schema: optional root `jobColumns` plus project `jobs`
  cells and `selectedJobColumns` are validated as expanded schema-v1 fields;
  scalar `jobUrl` mirrors the first nonblank column. Pure
  `projectLegacyMatrixDocument` projects legacy documents in memory. The
  Control UI applies that projection on load and after save; loading alone
  never writes the file, and explicit Save persists the expanded document.
  Runtime loading and the report CLI still execute scalar `jobUrl`, not the
  selected columns.
- Flat-matrix UI Phase 02: `ProjectsJobMatrix` renders project rows, shared
  columns and URL cells, target controls, and row/column actions; Raw JSON is the
  escape hatch for other schema fields.
- Flat-matrix state Phase 03: pure project/default and matrix transition modules
  feed one editor model; dedicated hooks dispatch matrix and legacy-group edits.
  Clones deep-copy settings and column URLs, recompute `jobUrl`, start disabled
  and ungrouped, and reset `selectedJobColumns` to `[]`. Schema issue collection
  is extracted to `src/reporting/control-page/utils/config-document-validation.ts`.
  Edits sync raw JSON, validation, and dirty state. Only successful document
  replacement or valid raw Apply advances `replacementRevision`; ordinary edits
  and Save acknowledgement do not. Config-load sequence guards discard stale
  responses. Validated full-document Saves use `If-Match`; 409/412 preserve the
  draft, while success adopts the returned document and ETag.
- Stage View completion monitoring: optional auto-build wait (default `true`),
  run and stage parsing, live progress logs, and build-number/result/stage data
  for the Control Page.
- Legacy no-target auto-build API: omitted `projectId` selects all enabled
  auto-build projects; a supplied ID selects one. The bounded pool uses saved
  `reportWorkers` and preserves configuration order in `buildProjects`.
- Control UI execution actions use the shared saved Workers selector; the flat
  matrix supplies selected cells rather than per-project build buttons.
- Flat project/job matrix Phase 04: `POST /api/run` accepts one explicit mode
  and up to 2,500 `{ projectId, columnId }` targets, resolved from the
  ETag-matched saved document. It sorts by project/column order, skips blank
  cells, and creates `${projectId}--${columnId}` virtual projects. Report and
  auto-build results include source/column provenance; report artifacts use
  distinct target IDs and optional schema-v3 provenance remains backward
  compatible. Saved `reportWorkers` bounds both paths; legacy no-target API and
  scalar report CLI behavior remain unchanged. Phase 04 review passed 101/101
  checks (79 unit, 22 Chromium E2E); typecheck/build passed, review 9.6/10.
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
- Final-report PDF Phase 03 snapshot (2026-09-26): 557/557 checks passed
  (505 unit, 40 Control, 5 report visual, 7 WebKit PDF); typecheck/build passed.
  Focused PDF scenarios passed 7/7 in Chromium and WebKit; see the
  [review](../plans/260925-1729-final-report-pdf-export/code-review-260926-1707-phase-03-verification-and-documentation.md).
- Refreshed `repomix-output.xml`: 442 files and 3,146,720 tokens packed; Repomix reported no suspicious files.

## Entry points and scripts

| Entry point | Responsibility |
| --- | --- |
| `scripts/run-report.mjs` | Builds the report launcher and invokes the report CLI. |
| `src/cli.ts` | Parses the explicit `--config` path and reports project outcomes. |
| `src/config.ts` | Public config types/loaders, worker policy, strict schema and job-matrix validation, pure legacy projection, and project selectors. |
| `src/runner.ts` | Saved-count report dispatch, bounded multi-project execution, and aggregate publication. |
| `src/artifacts/aggregate-index-builder.ts` | Builds the validated aggregate from current outcomes and retained manifests without file I/O. |
| `src/project/report-worker-pool.ts` | Fixed in-process loops with indexed outcomes and per-project failure isolation. |
| `src/project/auto-build-runner.ts` | One-project auto-build workflow with optional Stage View wait and rich build outcome. |
| `src/project/auto-build-worker-pool.ts` | Bounded concurrent project loops with configuration-ordered outcomes and per-project failure isolation. |
| `src/jenkins/build-trigger.ts` | Exact build-page/form validation, one guarded POST, and optional completion wait. |
| `src/jenkins/stage-view.ts` | Detects a newly triggered run and observes it to terminal status under the workflow deadline. |
| `src/jenkins/stage-view-parser.ts` | Parses the Stage View run rows, stage statuses, names, and durations. |
| `src/jenkins/stage-view-types.ts` | Defines run identity, overall statuses, completion result, and stage details. |
| `src/templates/template-report-fixture.ts` | Public fixture facade, HTTP server exports, and template project document builder. |
| [`src/templates/template-server.ts`](../src/templates/template-server.ts) | Standalone native Node.js HTTP server serving Developer Hub index page (`/`, `/index.html`) with 9 mock endpoints and offline template fixtures on port 4174. |
| `src/templates/template-server-cli.ts` | CLI entrypoint and argument parser (`--host`, `--port`) for the standalone template mock HTTP server. |
| `src/templates/template-fixture-loader.ts` | Loads and validates the complete offline fixture. |
| `src/templates/template-fixture-routes.ts` | Installs exact default-deny browser routes. |
| `src/reporting/report-server-secret-store.ts` | Validates and atomically persists local secrets; persistence only. |
| `src/reporting/report-server-run-manager.ts` | Owns the single-active run lifecycle, target coordinates, optional SecretStore, and ordered report/build results. |
| `src/reporting/report-server-run-executor.ts` | Takes one SecretStore snapshot and dispatches legacy or matrix report/auto-build execution with redaction. |
| `src/reporting/control-run-targets.ts`, `control-run-targets-validation.ts`, `control-run-targets-collision.ts` | Validate and resolve bounded project/column coordinates against saved config; skip blank cells, check virtual IDs, and fail closed on report-history collisions. |
| `src/reporting/control-run-matrix-executor.ts` | Runs resolved virtual targets through existing bounded report/build pools and records per-target outcomes/provenance. |
| `src/reporting/report-server-control-api.ts` | Parses legacy or strict matrix `POST /api/run` requests; re-exports the modular secrets handler. |
| `src/reporting/control-page/types/index.ts` | Defines coordinate request types and typed per-target report/build results. |
| `src/reporting/report-server-control.ts` | Validates Host, serves Control Dashboard, history and exact per-run React shells after final-index preflight; sends unmatched report paths to static serving. |
| `src/reporting/report-server-control-page.ts` | Loads Vite-built HTML, CSS, and JS assets from `.runner-build/reporting/control-page/`, injects CSRF tokens, and caches assets. |
| `src/reporting/report-server.ts` | Creates the store in control mode, passes it to the run manager, and exposes it on the server handle. |
| `src/reporting/control-page/` | Control Dashboard frontend sources (types, utils, headless hooks, components, styles) bundled via Vite into `.runner-build/reporting/control-page/`. |
| `src/reporting/control-page/types/component-contracts.ts`, `components/molecules/index.ts`, `components/templates/index.ts` | Shared UI/layout contracts and public molecule/template exports, including form-field, page-header, and three layout prop types. |
| `src/reporting/control-page/hooks/matrix-document-transitions.ts` | Immutable project, column, cell, selection, and matrix-clone transitions. |
| `src/reporting/control-page/hooks/config-document-transitions.ts` | Pure project/default add, update, remove, and report-worker transitions. |
| `src/reporting/control-page/hooks/useConfigDocumentEditor.ts`, `use-matrix-editor-handlers.ts`, `use-legacy-group-handlers.ts` | Shared editor lifecycle plus dedicated matrix and legacy-group transition dispatch. |
| `src/reporting/control-page/hooks/useConfigManager.ts`, `src/reporting/control-page/utils/config-document-validation.ts` | Sequence-guarded config loads, schema issue extraction, and validated `If-Match` saves/conflicts. |
| `src/reporting/control-page/components/organisms/projects-job-matrix.tsx`, `matrix-row.tsx`, `matrix-toolbar.tsx`, `add-column-dialog.tsx` | Spreadsheet-style project rows, actions, column creation, and table composition. |
| `src/reporting/control-page/components/molecules/job-column-header.tsx`, `project-job-cell.tsx`, `project-job-selection.tsx`, `matrix-row-settings.tsx`, `config-defaults-dialog.tsx` | Matrix column, URL, target-selection, per-project settings, and defaults controls. |
| `tests/unit/control-matrix-components.spec.ts`, `tests/unit/project-job-matrix.spec.ts` | Matrix UI behavior and schema projection/validation contracts. |
| `src/reporting/control-page/App.tsx`, `HeaderBar.tsx` | Select Dashboard, report history, or final-report view by pathname and provide history navigation. |
| `src/reporting/project-report-route.ts` | Browser-safe matching and validation for safe final-report route IDs and exact index/directory forms. |
| `src/reporting/project-report-body-renderer.ts` | Composes the complete escaped evidence body shared by React and static output. |
| `src/reporting/control-page/pages/final-project-report-page.tsx`, `hooks/use-project-report.ts` | Render validated per-run evidence and expose loading/missing/invalid/load-error states. |
| `src/reporting/control-page/components/molecules/ReportExportButton.tsx`, `hooks/use-report-pdf-export.ts` | Ready-report toolbar action, export state/re-entry guard, and visible error handling. |
| `src/reporting/control-page/utils/export-report-pdf.ts`, `report-pdf-content.ts`, `report-pdf-layout.ts`, `report-pdf-table-renderer.ts` | Semantic DOM extraction and browser-side jsPDF/AutoTable composition with pagination, links, and images. |
| `src/reporting/control-page/utils/report-pdf-fonts.ts`, `report-pdf-image-loader.ts`, `src/reporting/control-page/assets/fonts/` | Register embedded OFL Noto Sans regular/bold fonts and load safe report evidence images. |
| `tests/unit/control-final-report-pdf-export.spec.ts`, `control-final-report-pdf-scenarios.spec.ts` | Real Control-server downloads; verify Unicode text, embedded images, PDF links/page boxes, pagination, mobile viewport, debounce, missing assets, and offline integrity. |
| `src/reporting/control-page/utils/clone-project-draft.ts` | Deep-clones raw project input, generates suffix-aware bounded ID and name, resets `enabled: false`, and strips `groupId`. |
| `tests/unit/helpers/pdf-parser.ts` | Inflate FlateDecode streams and decode ToUnicode maps to inspect text, page boxes, image dimensions, and URI annotations in memory. |
| `tests/unit/helpers/report-pdf-fixture-constants.ts`, `report-pdf-fixtures.ts` | Build isolated report roots with source URLs, screenshots, Unicode content, findings, and scenario options. |
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

The schema-v1 document accepts optional root `projectGroups` definitions and
project-level `groupId` references, validated with bounded identities and
membership. These presentation fields are excluded from normalized runtime
projects. Immutable group transitions remain available, but the Dashboard has
no group-management UI; matrix edits preserve existing group metadata.

The same document may include shared `jobColumns` and per-project
`jobs`/`selectedJobColumns`. Validation requires complete declared cells, safe
unique column IDs, exact URLs in the login context, valid unique selections,
and a scalar `jobUrl` mirror of the first nonblank cell. The Control UI applies
`projectLegacyMatrixDocument` in memory; only Save writes expanded fields.
Control matrix execution sends coordinate targets; see the
[batch contract](./multi-project-configuration.md#control-batch-matrix-runs-phase-04).
The runtime loader and report CLI still execute scalar `jobUrl`.

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

`POST /api/run` carries `configName`, `configEtag`, and one explicit `runType`.
Legacy requests without `targets` retain project selection: report mode selects
enabled report projects; auto-build may select one optional `projectId` or all
enabled auto-build projects. Matrix requests instead send 1–2,500 unique
`{ projectId, columnId }` coordinates, never URLs. They reject `projectId`,
unknown fields, and `workerCount`; malformed requests fail before admission.

After run admission, `executeControlRun` reads the current SecretStore map once:

```ts
const runEnv = { ...env, ...storedSecrets };
```

The executor checks the config ETag, normalizes the saved document against
`runEnv`, then resolves matrix coordinates by saved project and column order.
Disabled/unknown projects, undeclared columns, unsafe URLs, and target-ID
collisions fail before browser launch; blank cells are skipped and an
all-blank batch fails. Project-level `runType` does not gate matrix targets;
the request mode applies to every selected cell.

Resolved cells become `${projectId}--${columnId}` virtual projects retaining
saved settings and carrying source-project/column/URL provenance. The report
runner and bounded auto-build pool use ETag-matched `reportWorkers ?? 1`;
worker outcomes stay ordered and siblings continue after failure. Report rows
expose status and local report links; build rows expose build/stage details and
`exitCode`. Batch status is `succeeded` only when all targets succeed. Report
history collisions in report batches fail closed; schema-v3 provenance is
optional, so older manifests remain valid.

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

### Control UI design tokens and Atomic Design components (Phases 01–04)

The Control UI uses five tiers—atoms (primitives), molecules (focused
interactions), organisms (page sections), templates (page shells), and pages
(state/lifecycle coordinators). Pages bind hooks/local state and fill typed
template slots; templates own outer layout. Existing DOM IDs, classes, data
attributes, and ARIA contracts remain covered by Control UI tests.

1. **Styling and utility infrastructure**:
   - `styles/globals.css`: Tailwind directives plus Modern Refined Light `:root` tokens for surfaces (`--bg-color`, `--card-bg`, `--surface`, `--subtle-surface`), text (`--text-main`, `--text-secondary`, `--text-muted`), borders (`--border-color`, `--border-default`, `--border-strong`), primary/secondary/danger base-hover-text pairs, semantic status colors, `--focus-ring`, and `--mono-font`. Global `:focus-visible`, skip-link, visually-hidden, and reduced-motion rules live here.
   - [`cn`](../src/reporting/control-page/utils/cn.ts#L4) (`utils/cn.ts`): Wraps `clsx` and `twMerge` to reconcile Tailwind utility classes with legacy class tokens without style precedence collisions.

2. **Atomic primitives (`components/atoms/`, exported from `index.ts`):**
   - `Button`: defaults to the secondary variant and standard size; supports `primary`, `secondary`, `danger`, `outline`, and `ghost`, `sm`/`md`/`lg`/`default` sizes, loading feedback, and Radix's slot-based `asChild` composition.
   - `Badge`: maps status, credential, and browser-setting states to semantic classes; supports an optional decorative dot (`aria-hidden`).
   - `Checkbox`: native controlled/uncontrolled checkbox with optional visible label, accessible-name fallback, and `onCheckedChange`.
   - `Card`: compound `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter`; every part supports Radix's slot-based `asChild` composition.
   - `IconButton`: composes `Button`, accepts an icon node or children, and resolves its accessible name from `aria-label`, `ariaLabel`, `title`, or `tooltip` (fallback: `Action`).
   - `Input`: native input with optional label/error, `aria-invalid`/`aria-describedby`, and text/off/false defaults for type/autocomplete/spell-check; preserves `credential-input` styling.
   - `Select`: native select with options or children and optional associated label or accessible name.
   - `StatusBanner`: info/success/error variants; errors use `role="alert"` and assertive live announcements, other states use polite status announcements.
   - `LoadingIndicator`: hideable `role="status"` indicator with polite live announcements and a default loading message.
3. **Compound molecules ([`components/molecules/`](../src/reporting/control-page/components/molecules/))**:
   - [`FormField`](../src/reporting/control-page/components/molecules/FormField.tsx): Associates a label with its child ID, announces required state, and renders helper text or a `role="alert"` error; errors take precedence over helper text.
   - [`PageHeader`](../src/reporting/control-page/components/molecules/PageHeader.tsx): Composes an `h1`/`h2` title with an optional subtitle, breadcrumb or back link, badges, and action slot.
   - [`CredentialRow`](../src/reporting/control-page/components/molecules/CredentialRow.tsx): Renders `.credential-row` containing `.credential-field` (`label[for="secret-input-${key}"]` and `Badge`), and `.credential-input-group` (`<input id="secret-input-${key}" type="password" class="credential-input" autocomplete="off" />`). When `isConfigured` is true, renders `<button class="btn btn-secondary btn-sm btn-clear-credential" data-key="{key}">Clear</button>`.
   - [`BrowserSettingRow`](../src/reporting/control-page/components/molecules/BrowserSettingRow.tsx): Renders browser setting controls with contract-specified IDs: badges (`#badge-browser-headless`, `#badge-browser-executable-path`), controls (`#browser-headless-select`, `#browser-executable-path-input`), and clear buttons (`#btn-clear-browser-headless`, `#btn-clear-browser-executable-path`).
   - [`ConfigSelectorBar`](../src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx): Renders the configuration selector and action buttons, preserves their IDs, and gates Save on dirty/loading/saving state; its actions use selective Lucide icons.
   - [`LogViewer`](../src/reporting/control-page/components/molecules/LogViewer.tsx): Renders the accessible `#run-logs` log, formats strings or timestamped entries, defaults to `"No active run."`, autoscrolls on updates, and offers a copy action.
   - [`RunResultBox`](../src/reporting/control-page/components/molecules/RunResultBox.tsx): Renders per-target `reportProjects` and ordered `buildProjects` rows, scalar build results for legacy records, and errors.
   - [`BuildProjectOutcomeRow`](../src/reporting/control-page/components/molecules/build-project-outcome-row.tsx): Shows project/column provenance, state/result, build number, safe build link, stages, and errors.
   - [`ProjectRunsTable`](../src/reporting/control-page/components/molecules/project-runs-table.tsx): Displays paginated run history with local report/manifest links and optional per-run deletion actions.
   - [`ProjectReportStatusView`](../src/reporting/control-page/components/molecules/ProjectReportStatusView.tsx): Presents loading, missing, invalid, and load-error states; renders no status content when the report is ready.
   - [`ReportExportButton`](../src/reporting/control-page/components/molecules/ReportExportButton.tsx): Enables export only for a ready report and exposes progress and accessible error feedback.
   - `types/component-contracts.ts` defines typed molecule props; `components/molecules/index.ts` re-exports the tier. Selected actions and status states use `lucide-react` icons.

### Control Dashboard and flat project/job matrix (Phases 02–04)

The React Control UI keeps the five-tier atoms → molecules → organisms →
templates → pages structure. `DashboardPage` coordinates configuration
loading/editing and supplies the matrix, Raw JSON, execution controls, current
run, credentials, and browser settings to `DashboardLayout`. Report history
and final-report viewing use separate page/template pairs.

`ProjectsJobMatrix` renders one horizontally scrollable semantic table with one
row per project: enabled state, editable ID/name, one URL cell for each shared
job column, fixed per-row target checkboxes, and settings/clone/remove actions.
The toolbar adds projects/columns and opens defaults. Add-column initializes
blank cells across rows; headers rename columns or require confirmation before
removal, which drops its cells/selections and recomputes scalar `jobUrl`.
Settings expose login URL, browser, timeouts, artifact directory, credential
references, enabled, and `waitForCompletion`; other schema fields stay in Raw
JSON. Cells link only validated HTTP(S) URLs, and selected empty cells are
warned.

`matrix-document-transitions.ts` applies immutable edits. The shared document
editor validates changes, synchronizes structured edits with Raw JSON, tracks
dirty state, and saves through the existing ETag boundary. Legacy documents are
projected to matrix form in memory; only explicit Save writes that expanded
form. Clone appends a deep-copied project and its job cells/selections as a
disabled row, assigns a bounded unique ID/name, and removes `groupId`; it is not
a separate pending-draft flow.

Project-group fields remain schema-validated and ordinary matrix edits preserve
them, but the Dashboard has no group controls. The old grouped board and form
editor (`ProjectsGrid`, `ProjectCard`, project-group board/column/dialog
components, `ConfigFormBuilder`, and `ConfigProjectEditor`) were removed with
no compatibility aliases.

The Dashboard derives coordinate targets from `selectedJobColumns` on enabled
rows. Preview counts nonblank targets and blank cells; actions require a valid,
clean, saved document, a nonblank selection, and no active run. One action sends
one `POST /api/run` for `report` or `auto-build`, with coordinate IDs rather
than URLs. The server resolves those coordinates from saved config and applies
the selected run mode to every cell; it does not use the scalar `jobUrl` mirror
for matrix dispatch. Legacy no-target requests keep project-based selection.

Each cell runs as `${projectId}--${columnId}` and yields ordered report or build
outcomes with source project/column identity. Report outcomes include per-target
local links and status; build outcomes include build details and exit codes.
Saved `reportWorkers` bounds both pools. Report provenance is persisted as
optional schema-v3 metadata; older history remains readable. The report CLI
continues to execute scalar `jobUrl`. No per-cell mode control exists.

The Phase 02 review snapshot records 73/73 unit checks and 22/22 Chromium E2E
checks; see the [review](../plans/260930-0250-flat-project-job-matrix/code-review-260930-0941-phase-02-spreadsheet-matrix-ui-components.md).
Phase 04 review passed 79 unit and 22 Chromium E2E checks (101/101); typecheck
and build passed, review approved 9.6/10. See the
[Phase 04 review](../plans/260930-0250-flat-project-job-matrix/code-review-260930-1317-phase-04-multi-job-execution-engine-and-api.md).

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
| `src/config/project-group-validation.ts` | Validates bounded optional group definitions, safe IDs/names, uniqueness, and project references in the shared document schema. |
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
| `src/reporting/control-page/utils/clone-project-draft.ts` | Shared deep-clone helper used by matrix cloning; applies bounded identity suffixes, disables the copy, and removes `groupId`. |
| `src/reporting/control-page/hooks/` | Headless React hooks for config selection/loading, document editing, credentials, browser settings, run polling, and report deletion/export. |
| `src/reporting/control-page/hooks/config-document-transitions.ts` | Immutable project, defaults, and report-worker count transitions for the editor document. |
| `src/reporting/control-page/hooks/matrix-document-transitions.ts` | Immutable matrix column, cell, selection, project-add, and project-clone transitions. |
| `src/reporting/control-page/hooks/project-group-transitions.ts` | Pure immutable group metadata transitions; no group-management UI is mounted on Dashboard. |
| `src/reporting/control-page/components/atoms/` | Accessible UI primitives, including `Badge`, `Button`, `Card`, `Checkbox`, `IconButton`, `Input`, `LoadingIndicator`, `Select`, and `StatusBanner`. |
| `src/reporting/control-page/components/molecules/` | Shared form, credential, browser, status, report, and matrix controls; matrix includes `JobColumnHeader`, `ProjectJobCell`, `ProjectJobSelection`, `MatrixRowSettings`, and `ConfigDefaultsDialog`. |
| `src/reporting/control-page/components/organisms/` | Current Dashboard includes `ProjectsJobMatrix`, `MatrixRow`, `MatrixToolbar`, `AddColumnDialog`, `RawJsonSection`, `ExecutionSection`, and `RunStatusCard`; report history and final-report views remain separate. |
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
| `tests/unit/project-group-validation.spec.ts`, `project-group-transitions.spec.ts`, `config-document-editor-groups.spec.ts` | Group schema/reference boundaries, immutable membership transitions, and document replacement versus edit/Save revision behavior. |
| `tests/unit/clone-project-draft.spec.ts` | Project draft cloning, suffix-aware bounded ID and name generation, nested data independence, capacity guards, and replacementRevision reset. |
| `tests/unit/control-project-transitions.spec.ts` | Group and clone transition boundaries: membership move/delete invariants, clone identity bounds, nested mutation independence, and capacity/collision guards. |
| `tests/unit/control-atomic-components.spec.ts` | Static-rendered contracts for atoms, `FormField`/`PageHeader`, preserved row/selector DOM, logs/results, and `ExecutionSection`. |
| `src/templates/template-fixture-loader.ts` | Reads nine files and assembles synthetic URLs and rewritten HTML. |
| `src/templates/template-fixture-routes.ts` | Exact response lookup, login/SonarQube/build POST exceptions, and sanitized miss recording. |
| `tests/unit/report-server-secret-store.spec.ts` | Phase 01 backend contract and control-mode wiring coverage. |
| `tests/unit/control-secret-store.spec.ts` | Phase 05 SecretStore lifecycle coverage: empty reads, atomic file cleanup, platform permissions, key/value rejection, concurrent writes, and deletion. |
| `src/templates/template-report-fixture.ts` | Public facade exports plus explicit `templateProjectDocument` run type. |
| `templates/jenkins-template/template-build.html` | Minimal saved-origin build page with canonical URL, `POST` form, `#bottom-sticker`, and classed `Build` button. |
| `templates/` | Offline Jenkins, Snyk, and SonarQube fixture corpus, including the build detail page. |
| `tests/unit/template-build-fixture.spec.ts` and `tests/e2e/template-auto-build.spec.ts` | Build fixture drift, exact redirect, route, budget, and production auto-build coverage. |
| [`tests/unit/template-server.spec.ts`](../tests/unit/template-server.spec.ts) | Loopback binding, Developer Hub index page (`/`, `/index.html`, 9 mock endpoints, HEAD, security headers, XSS prevention), GET/HEAD fixture routing, POST redirects, SonarQube auth guard, 404/405/400 errors, and graceful shutdown coverage. |
| `tests/unit/template-server-cli.spec.ts` | CLI argument parsing, environment variable overrides, port validation, help flags, signal cleanup, and process execution tests. |
| [`tests/e2e/template-server-integration.spec.ts`](../tests/e2e/template-server-integration.spec.ts) | End-to-end integration and validation tests for the standalone template mock HTTP server, Developer Hub smoke flows, concurrent Control Server execution, `projects.template.json`, production report capture, and auto-build submission. |

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
[`tests/e2e/template-server-integration.spec.ts`](../tests/e2e/template-server-integration.spec.ts)
extends template test coverage with 11 integration checks, bringing the unified
template test gate (`npm run test:e2e:templates`) to 13 passing checks across
navigation, auto-build, and real HTTP mock server execution.
The React UI and matrix contracts are covered by
`tests/unit/control-hooks-and-types.spec.ts`,
`tests/unit/control-atomic-components.spec.ts`,
`tests/unit/control-matrix-components.spec.ts`,
`tests/unit/project-job-matrix.spec.ts`, and
`tests/e2e/control-page.spec.ts`. Matrix tests cover cells, columns, selections,
settings, immutable transitions, and the legacy projection. Control-page E2E
scenarios exercise matrix edits, Raw JSON synchronization, valid Apply, and
rejection of invalid/schema-invalid Apply.

The worker-selector scenarios verify the default and 1–4 values, JSON sync,
dirty/run gating, saved-config persistence, and configuration switching. They
also verify report/auto-build requests omit `workerCount` and crafted requests
with that field return `422 INVALID_WORKER_COUNT`. Credential, browser-settings,
execution-injection, and zero-leakage scenarios remain covered in Chromium and
WebKit.

Historical Active Config Persistence & Form Builder Phase 04 tests continue to
cover active-config resolution (valid URL > stored filename > first available),
stale/empty candidates, storage-safe access, URL state preservation, project
creation, immutable field/default updates, deletion invariants, and schema
validation. Its desktop/mobile Axe audit recorded zero violations at 1280×800
and 375×667 and no horizontal page overflow; this is a prior milestone snapshot.

The 2026-09-23 Active Config Phase 04 release audit recorded
`npm run test:release` at 371/371 (100%), with typecheck/build passing and code
review approval at 10/10. This is historical release evidence, not evidence for
the current matrix or post-integration release gate.


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
