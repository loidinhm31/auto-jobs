# Project overview and PDR

**Product:** `auto-jobs`  
**Document scope:** schema-v1 report capture, optional project-group metadata
and editor lifecycle, persistent aggregate history, bounded execution,
Control Page actions/report management, final-report viewer/PDF export, offline
build fixtures, and dynamic credentials.<br>
**Current milestone:** Control page project groups and cloning — Phase 01 group
schema/document state DONE; Phases 02–04 pending.<br>
**Previous completed milestone:** Final-report PDF export — Phases 01–03 complete
(2026-09-26).<br>
**Earlier completed milestone:** Individual report run deletion — complete
(3/3 phases; verified 2026-09-25).<br>
**Earlier initiative:** Persistent project report management — complete (4/4
phases; Phase 04 approved 2026-09-25).<br>
**Previous initiative:** Control Page Parallel Auto-Build — complete, 100%
(11/11h; Phase 04 DONE, 2026-09-24). Release gate 439/439 passed; typecheck/build
passed; review approved 9.3/10.

## Product summary

`auto-jobs` is a private Node.js/TypeScript Playwright runner for collecting
bounded Snyk and SonarQube vulnerability evidence from exact Jenkins job pages.
It writes immutable static reports for the report path. A direct auto-build
call submits one Jenkins **Build with Parameters** form for an exact selected
target; the loopback Control Page can trigger all enabled `auto-build` projects
in a bounded batch. Both paths return sanitized in-memory outcomes without
collecting reports or writing artifacts. Offline Jenkins fixtures make report
and build journeys deterministic without a live controller.

The root aggregate is rebuilt from validated schema-v3 manifests and current
report outcomes so history-only projects survive configuration changes. An
incomplete inventory blocks replacing the last complete index.

Phase 01 adds a local `SecretStore` persistence seam for the control plane.
It stores validated environment-style key/value pairs in the git-ignored
`config/secrets.local.json` using deterministic, atomic, write-locked updates.
Phase 02 exposes that store through a loopback `/api/secrets` presence API:
responses contain booleans, while PUT/DELETE mutations require Host, Origin,
Fetch Metadata, CSRF, and bounded JSON gates. Control mode constructs the
store and exposes it to the router.

Phase 03 completes the run-executor boundary. Each control run reads one
SecretStore snapshot, overlays it on a fresh copy of the caller environment,
and passes the merged `runtimeEnvironment` to report or auto-build execution.
Stored values override same-named base values without mutating `process.env`;
control logs, warnings, errors, and auto-build result URLs are redacted.

Phase 04 adds the operator-facing credential workflow to the loopback control
page. It discovers the variable names referenced by the active configuration,
checks presence without loading values, and persists only entered replacements
through the guarded `/api/secrets` API. The modal masks values and wipes its
inputs on save, clear, or close; it never reflects plaintext in status text,
URLs, page HTML, or API responses.
Phase 05 adds focused lifecycle and operation tests for the local SecretStore
and `/api/secrets`, plus Chromium/WebKit Control UI E2E scenarios. The gate
proves dynamic credential persistence and injected execution while asserting
zero plaintext leakage from inputs, page HTML, run logs, and API responses.

The product treats Jenkins navigation and build submission as high-risk external
operations. Configuration, target identity, selectors, credentials, deadlines,
and failure semantics are validated before side effects.

## Goals

1. Make report capture deterministic, bounded, and safe for multiple configured
   projects.
2. Permit an intentional Jenkins parameterized build for one exact enabled
   project through direct execution, or all enabled builds through the loopback UI.
3. Keep report capture and build submission mutually exclusive.
4. Preserve target identity: `jobUrl` is the only branch/job identity.
5. Make ambiguous post-submit outcomes visible without risking duplicate builds.
6. Keep credentials and request/form data out of persisted results and logs.
7. Provide deterministic fixture and unit tests without live Jenkins/vendor
   dependencies.
8. Keep future dynamic credential updates isolated from versioned project
   configuration, process-global environment state, and plaintext API output.

## Non-goals

- Searching Jenkins jobs or deriving a branch from a selector, URL fragment, or
  separate `targetBranch` field.
- Editing Jenkins parameters, using **Build Now**, polling queues/builds,
  discovering build numbers, cancellation, or automatic retry.
- Running auto-build from `npm run report` or from an environment-wide switch.
- Capturing Snyk/SonarQube evidence during an auto-build run.
- Claiming that checked-in fixtures or deterministic tests prove a live build.
- Returning dynamic credential values over HTTP or exposing them in diagnostics,
  responses, or logs. Phase 02 exposes presence booleans only.
- Mutating `process.env` or a caller-owned environment when injecting stored
  values. Control-run injection is per-run and does not alter direct
  file-mode/library environment behavior.
- Treating the Phase 05 unit/API/Playwright end-to-end verification as complete
  without recorded test evidence and zero-leakage assertions.

## Users and use cases

| User | Need | Supported boundary |
| --- | --- | --- |
| Report operator | Collect evidence for configured jobs | `npm run report -- --config <path>` |
| Build integration | Submit one selected target-branch build | `selectAutoBuildProject` → `runAutoBuildProject` |
| Control operator | Run selected modes across enabled projects and inspect each result | Loopback Control Page action bar and ordered run results |
| Maintainer | Prove behavior without external services | Unit tests and exact offline fixtures |
| Reviewer | Inspect safe outputs and release gates | Static report root, manifests, and documented commands |
| Control maintainer | Inspect presence and manage local credential values without changing project JSON | `GET`/`PUT`/`DELETE /api/secrets` in loopback control mode |

## Functional requirements

### FR-1: Configuration

- Accept one schema-v1 JSON document with one to 50 projects.
- Require exact credential-free HTTP(S) `loginUrl` and `jobUrl` values on one
  Jenkins origin/base context.
- Normalize an omitted project `runType` to `report`.
- Accept only `runType: 'report' | 'auto-build'`; keep it project-only.
- Treat `enabled: false` as an unconditional execution gate.
- Validate selectors, source origins, paths, identities, timeouts, and
  credential-variable references before browser launch.
- Accept optional top-level `reportWorkers` for report batches and Control API
  auto-build batches; save the 1–4 worker bound (default 1) through existing
  schema-v1 validation and ConfigStore ETag flow.

- Accept optional root `projectGroups` and project-only `groupId` as schema-v1
  presentation metadata. Existing documents without either field remain valid.
- Validate at most 50 groups, exact group object keys, unique safe group IDs,
  non-empty safe names of at most 200 characters, and membership references.
  Reject unknown fields, dangling references, and `groupId` under `defaults`.
- Keep group metadata out of normalized execution projects; grouping cannot
  change enabled state, run mode, or configured project order.

### FR-2: Mode selection

- `selectReportProjects(projects)` returns only enabled normalized report
  projects and fails if none remain.
- `selectAutoBuildProject(projects, projectId)` requires one exact non-empty ID
  and resolves one enabled auto-build project.
- `selectAutoBuildProjects(projects)` returns all enabled projects in that mode.
- Control `POST /api/run` accepts optional `projectId`: supplied selects one;
  omission selects all enabled auto-build projects.
- Selection helpers are pure; `runFromConfig` remains report-only.

### FR-3: Report execution

- Use one configured browser and a fresh context plus absolute deadline per
  selected project.
- Apply `reportWorkers` to the batch: run at most `min(count, selected projects)`
  at once using fixed in-process loops; direct runner counts are validated
  before artifact initialization or browser launch.
- In control mode, reject any own `workerCount` property in `POST /api/run` with
  `422 INVALID_WORKER_COUNT` before `startRun`.
- Require the saved configuration ETag to match before execution. Use that
  document's `reportWorkers ?? 1` for report execution and to bound the separate
  control auto-build pool; keep the count out of per-project
  `AutoBuildRunnerDependencies`.
- Preserve selected configuration order in outcomes and continue queued work
  after an individual project failure.
- Authenticate through exact Jenkins login, open exact `jobUrl`, discover
  allowed publisher links once, and capture bounded Snyk/SonarQube evidence.
- Hold the report-root lock through worker settlement, browser close, final
  cleanup, manifest discovery, and aggregate publication.
- Stage, validate, and publish immutable per-run artifacts and an aggregate.
- Rebuild the persistent root index from validated schema-v3 manifests and
  current outcomes; retain history-only projects across configuration changes.
- Refuse to replace the index when `ManifestDiscoveryResult.incomplete` is true;
  allow an empty `projects` array when both history and outcomes are empty.
- Keep aggregate bounds distinct from input configuration: up to 5,050 project
  rows and 5,000 total retained runs, while schema-v1 input remains 1–50 projects.
- Check staged aggregate JSON and HTML independently against the 16 MiB static
  file limit before replacing the prior pair.

### FR-4: Auto-build execution

- Reuse validated login and exact `jobUrl` navigation.
- Require one visible `#side-panel` and one visible configured **Build with
  Parameters** link within it.
- Validate the link as the exact configured job `/build` action before clicking.
- Require one visible `#bottom-sticker`, one configured **Build** button, all
  required Jenkins class tokens, one ancestor `POST` form, and the exact same
  `/build` action.
- Arm request/response observers before clicking and click exactly once.
- Reuse existing page defaults; do not inspect or modify hidden parameter values.
- Control `POST /api/run` may omit `projectId` to run all enabled auto-build
  projects; a supplied ID selects one.
- Run control batches in a separate pool capped at `min(reportWorkers, project
  count)`; preserve configuration order and continue after project failures.

### FR-5: Outcomes and side effects

- Return bounded safe fields: project identity, configured job URL, validated
  build URL, time/status/diagnostic, state/exit code, and observed build number,
  terminal result, and stage details.
- Classify a matching response below HTTP 400 as `submitted`.
- Classify a matching response at or above HTTP 400 as `rejected`.
- Classify an observed matching POST without a determinate response as
  `submission-unknown`.
- Map pre-POST failures to `failed-before-submit` in the auto-build runner.
- Never retry after a matching POST or possible external side effect.
- Store control outcomes in ordered `result.buildProjects`; the run succeeds
  iff every `exitCode === 0`, else it fails. Single-project runs retain scalar
  build summary fields.
- A thrown worker error becomes `submission-unknown` with `exitCode: 1`;
  siblings continue and unknown submissions are never retried.

### FR-6: Resource and secret handling

- Use one absolute `WorkflowDeadline` for each project build workflow.
- Create a fresh Playwright context/page and close resources with bounded
  best-effort cleanup.
- File-mode and direct library execution resolve credential references from the
  caller-supplied environment. Control runs read one current SecretStore
  snapshot at execution start and construct `{ ...env, ...storedSecrets }`;
  stored values take precedence, and neither `process.env` nor the caller
  environment is mutated.
- Normalize against the merged environment; pass `runtimeEnvironment` to the
  report executor or auto-build worker pool.
- Redact every non-empty stored value from control `addLog` messages, report
  warnings, caught errors/stacks, and auto-build `jobUrl`/`buildPageUrl` result
  fields. Clear mutable resolved credential copies during auto-build cleanup.
- Do not write auto-build report artifacts or persist raw request/browser data
  (cookies, headers, bodies, crumbs, queue IDs, or response bodies); safe build
  details may appear in in-memory control-run records.

### FR-7: Local SecretStore backend

- Persist dynamic credential values only in the fixed
  `<configRoot>/secrets.local.json` target, outside schema-v1 project JSON.
- Require an existing canonical real config directory and reject symlinked or
  non-directory roots; never accept a caller-selected path or filename.
- Treat a missing/empty file as `{}`. Require a JSON object no larger than
  `MAX_SECRET_FILE_BYTES` (1 MiB), keys matching
  `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/` except `__proto__`, `prototype`, and
  `constructor`, and string values.
- Provide `readSecrets`, `listSecretNames`, `putSecret`, `putSecrets`,
  `deleteSecret`, and `deleteSecrets`. Return frozen snapshots and sorted names.
- Serialize read-modify-write updates under an in-memory lock and replace the
  target atomically through an exclusive sibling temporary file (`0o600`,
  sync, close, rename). Remove temporary files after failed writes.
- Keep secret values out of errors and diagnostics. The `config/*.local.json`
  ignore rule prevents the local file from entering version control.
- In control mode, expose the store through `ReportServerHandle` and
  `ControlRouterContext`; Phase 02 exposes guarded presence-only API operations
  described in FR-8, and Phase 03 passes the store through `RunManagerOptions`
  into the run executor for per-run environment injection.

### FR-8: Control secrets API

- Route exact `GET`, `PUT`, and `DELETE /api/secrets` paths from loopback
  control mode through a dedicated modular handler.
- Enforce Host validation for every request. For PUT/DELETE, require exact
  same-origin HTTP(S) Origin, accepted Fetch Metadata, timing-safe CSRF, and
  `application/json` (except bodyless DELETE).
- Support full and filtered GET presence maps with boolean values only.
- Accept single or batch PUT patches with valid environment-style names and
  string values; support null/`action: "delete"` removal. Support query or
  JSON body deletion forms.
- Bound JSON bodies at 1 MiB and return `Cache-Control: no-store`; never
  return plaintext values in success or error responses.
- Return clear status boundaries: 400 for malformed input, 403 for rejected
  security gates, 415 for mutation content type, 503 for missing store, and
  405 with `Allow` for unsupported methods.

### FR-9: Control UI credential modal and state

- Render a native Credentials dialog from the loopback control page with
  accessible labels, loading/error status, password-masked inputs, and
  **Configured**/**Missing** presence badges.
- Derive a deduplicated, sorted key list from project credential references
  and defaults, falling back to `JENKINS_USERNAME` and `JENKINS_PASSWORD`.
- Fetch only boolean presence using `GET /api/secrets?keys=...`; never load
  stored values into the page.
- Save only non-empty trimmed values through CSRF-protected JSON
  `PUT /api/secrets`; update badges and wipe submitted inputs on success.
- Clear one key through CSRF-protected bodyless
  `DELETE /api/secrets?name=...`; mark it missing and wipe its input.
- Wipe all credential input values and modal messages on dialog close, and
  keep secret values out of labels, status messages, URLs, page HTML, and API
  success/error payloads.

### FR-10: Offline build-page fixture

- Keep `templates/jenkins-template/template-build.html` minimal, inert, and
  free of credentials, scripts, external assets, production hosts, and report links.
- Load nine fixture files through canonical, no-follow, identity-checked reads
  under the existing 4 MiB per-file and 16 MiB cumulative limits.
- Derive the build detail URL from the unique saved `#side-panel`
  **Build with Parameters** anchor; validate its origin, exact same-job
  `/build` path, and allowed `delay=0sec` query.
- Validate one matching build canonical URL, one `POST` form/action, one
  `#bottom-sticker`, and one classed `Build` submit button before route setup.
- Fulfill only exact synthetic fixture URLs. The exact build `POST` returns a
  `303` redirect to the exact fixture job URL; all other methods/URLs abort and
  record bounded sanitized misses.
- Keep fixture helpers modular and preserve `template-report-fixture.ts` as the
  public facade. Report mode does not follow the build route.

### FR-11: Control Page batch actions and outcome presentation

- Keep the action bar as the only execution surface:
  **Generate Reports (All Enabled)** (`#btn-run-reports`), **Trigger Auto
  Build (All Enabled)** (`#btn-run-auto-build`), and one shared **Workers**
  selector (`#select-workers`, 1–4).
- The selector uses saved schema-v1 `reportWorkers` (default 1), applies to both
  bounded pools, and is not sent as request-level `workerCount`.
- Report selects enabled report projects; auto-build immediately selects enabled
  `auto-build` projects by omitting `projectId`. Keep per-ID API support.
- Enabled and `runType` controls define targets; no per-card `.btn-auto-build`,
  confirmation dialog, or run-on-edit behavior.
- Count edits mark the document dirty; require ETag-protected Save before
  execution. Keep actions disabled without a document and while runs are
  queued/running.
- Render ordered `buildProjects` rows with project identity, state/result,
  optional build number/link, stages, and errors. Keep the report link and
  scalar fallback for older single-project records.

### FR-12: Control API project-report deletion

- Expose `DELETE /api/reports/projects/:projectId` only in loopback control
  mode; validate Host/Origin/Fetch Metadata/CSRF gates and apply the body rules.
- Validate one safe project ID, acquire the report-root lock without waiting,
  and refuse deletion when discovery is incomplete or no validated runs exist.
- Preflight the canonical target subtree before mutation: reject symlinks and
  non-file entries, and bound traversal to 32 levels, 4,096 entries, and
  256 MiB. Delete the whole selected subtree, count only validated runs, and
  preserve configuration, sibling projects, and shared assets; return 409 on
  report-root lock contention.
- Rebuild both aggregate files from complete surviving manifest history after
  removal. If post-removal refresh fails, attempt recovery and report the
  completed deletion separately from the index-refresh failure.

### FR-13: Control report-management page

- Add same-tab **Reports** navigation from the Control Dashboard to
  `/reports/index.html` and a return link to `/`; in control mode, exact
  `GET`/`HEAD` serves the CSRF-bearing React shell with `CONTROL_CSP`, while
  report-only mode and all other report routes keep their existing behavior.
- Read all retained projects from `/reports/aggregate-data.json`, independent
  of active configuration; show safe local report links and history-only
  projects. A missing index or valid `projects: []` displays an empty state;
  schema-invalid data is flagged as corrupt, while parse/fetch failures show
  the load error.
- Paginate each project's newest-first runs independently by 20. Disable
  deletion when a project has no retained runs.
- Require an accessible labeled permanent-deletion confirmation; cancel leaves
  disk/UI unchanged, and pending state prevents duplicate submission.
- Send a bodyless CSRF-bearing `DELETE /api/reports/projects/:projectId` through
  the shared control API client. Refresh inventory on success or `404`, show
  retry guidance on `409`, and surface other errors without promising rollback.
- Keep mutation controls/tokens out of persisted `reports/index.html`;
  `serve:report` stays read-only. Cover route security and navigation,
  pagination, and deletion in unit and Chromium/WebKit E2E tests.

### FR-14: Control API individual report-run deletion

- Expose `DELETE /api/reports/projects/:projectId/runs/:runId` only through
  loopback control mode. Validate both safe IDs, Host/Origin/Fetch Metadata/CSRF,
  JSON content type when a body is present, and an empty-or-`{}` body.
- Acquire the shared report-root lock without waiting. Require complete
  validated-manifest discovery, a canonical target run directory, and a
  validated target run; reject unsafe filesystem entries and bound preflight
  to 32 levels, 4,096 entries, and 256 MiB.
- Remove only the requested run, preserve siblings, and prune its project
  directory only if the directory is empty. Republish both aggregate files from
  surviving manifests under the same lock.
- Return `200` with `{ success: true, projectId, runId, remainingRunsCount }`;
  return `404 RUN_NOT_FOUND` for an absent/unvalidated target and `409
  REPORT_ROOT_LOCKED` for contention. If refresh fails after removal, report
  that the run was deleted and attempt best-effort index recovery.
- Cover observable deletion, preservation, pruning, aggregate, invalid/missing
  target, security, method, lock, and failure behavior in
  `tests/unit/control-reports-run-delete-api.spec.ts`.

### FR-15: Control UI per-run deletion
- Give each retained run row a **Delete** action that opens an accessible Radix
  confirmation naming the project and run and warning that only this run and
  its artifacts will be permanently removed.
- Cancel or Escape sends no request. While deleting, disable dialog controls
  and show a spinner on the confirm button to prevent duplicate submission.
- Confirm through the shared CSRF-aware client with a bodyless
  `DELETE /api/reports/projects/:projectId/runs/:runId`.
- On success, close the dialog, show success feedback, and refresh the
  aggregate. On `404`, show stale-run feedback and refresh as well. Keep the
  dialog open with retry guidance for `409`; surface other failures without
  promising rollback.
- Reflect the refreshed inventory after the last run is removed, without a
  full-page reload. Keep persisted report HTML and `serve:report` read-only;
  browser coverage verifies cancellation, sibling preservation, and final-run
  removal.

### FR-16: Control-only final-report viewer (PDF export Phase 01)

- Preserve each existing final-report URL. In Control mode, match only
  `/reports/<projectId>/<runId>/index.html` and its directory forms using the
  browser-safe route parser and safe ID rules; reject ambiguous encoded paths.
- Before serving a React shell for a final-report URL, preflight the canonical
  existing run index. Serve the shell only for GET/HEAD, redirect directory
  forms to the explicit index URL, and return 405 for other methods. Keep
  unmatched artifact paths on the existing static handler.
- Fetch `data.json` and `manifest.json` without cache, abort requests on
  unmount, and validate both saved schemas. Require route/data/manifest project
  and run identities, project name, timestamp, state, and Jenkins job URL to
  agree before exposing a ready report model.
- Present loading, missing, invalid, and load-error states; render report
  content only after validation. Compose the complete report body through the
  renderer shared with static output, preserving its escaped sections, links,
  anchors, screenshots, warnings, and footer.
- The React HTML sink may receive only that locally generated escaped body,
  never saved report HTML or vendor markup. Scope styles to the report surface;
  do not weaken either CSP or change persisted report-only output.
- Keep `/reports/index.html` as the distinct history-management page. Phase 01
  delivers no PDF generation/download UI; Phase 02 consumes the validated ready
  report surface.

### FR-17: Client-side final-report PDF export (Phases 02–03; shipped)

- Add an accessible **Export PDF** action to the Control-only final-report
  viewer. Keep it disabled until the validated report is ready and while an
  export is active; keep the action/status UI outside the report content.
- Read the locally generated report surface through a narrow semantic DOM
  adapter. Preserve headings, badges, prose, metadata, lists, tables, evidence
  figures/captions, anchors, and footer in document order; omit only export
  chrome and hidden UI.
- Compose selectable/searchable text and real-text tables with browser-side
  `jspdf` and `jspdf-autotable`; keep evidence screenshots as images. Use A4
  portrait by default with wrapped table content.
- Bundle and embed local Noto Sans regular/bold TrueType font data under its
  included SIL Open Font License. Do not request fonts from a remote service.
- Preserve safe evidence/reference URLs as PDF link annotations and resolve
  report-local anchors to PDF destinations. Do not visit linked source sites
  during generation; load only safe report-local or embedded images.
- Download one `<projectId>-<runId>-report.pdf` directly in the browser. Do not
  add a PDF server endpoint, print dialog, upload, report regeneration, or
  mutation of saved artifacts.
- Keep duplicate invocation and generation failures visible and retryable;
  preserve the viewer, static report output, and existing CSP.
- Verify Unicode text, screenshot images, A4 page boxes and pagination, link
  annotations, mobile export, rapid-click debouncing, missing-asset errors, and
  saved-report immutability in Chromium and WebKit.

### FR-18: Project groups and configuration document state

- Store optional group definitions on the schema-v1 root as
  `projectGroups: { id, name }[]`; store optional single membership as
  `projects[*].groupId`. Do not duplicate project IDs inside group definitions
  or add `groupId` to defaults or normalized execution types.
- Allow absent/empty group lists, up to 50 definitions, and at most one group
  per project. Group IDs are unique within groups and match
  `/^[a-z0-9][a-z0-9-]{0,62}$/u`; names are non-empty safe strings of at most
  200 characters. Reject duplicate group IDs, invalid fields, and dangling
  membership references through the shared browser/server schema validator.
- Preserve compatibility for documents without group metadata. Persist group
  changes through the existing configuration document/ETag flow; add no API
  endpoint or separate storage file.
- Apply group creation, rename, deletion, and membership replacement through
  immutable document transitions. Deleting a group only removes its definition
  and clears its members' `groupId`; it never removes projects. Membership
  replacement moves selected projects into the target, ungroups unchecked
  target members, and leaves unrelated assignments and project order intact.
- Keep no-op or invalid-target transitions from replacing the document or
  marking it dirty. Synchronize structured edits with raw JSON and validate
  before saving.
- Increment `replacementRevision` only after successful document replacement
  or valid raw-JSON Apply. Do not increment for normal edits or Save
  acknowledgement; failed loads and invalid Apply do not signal replacement.
  Expose it so transient form/dialog consumers can reset state on replacement.
- Cover limits and reference validation, immutable group transitions,
  membership moves/deletion, no-op dirty behavior, and replacement-vs-save
  lifecycle in the focused group-validation, group-transition, and editor
  lifecycle unit contracts.

### FR-19: Project draft cloning

- Enable cloning any configured project in `ConfigFormBuilder` into an independent editable draft.
- Generate bounded unique IDs (`<id>-copy`, `-copy-2`) capped at 63 characters and bounded names (`<name> (copy)`) capped at 200 characters.
- Default clones to `enabled: false` and ungrouped state (no `groupId`).
- Deeply copy nested configuration settings via `structuredClone` to prevent mutational aliasing between draft and source.
- Provide full draft lifecycle: Cancel discards draft without document changes; Save Project adds to board; global Save persists to disk.
- Reset draft state on `replacementRevision` increments (file load/switch or raw Apply).


## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Safety | Fail closed on invalid origins, actions, selectors, cardinality, forms, modes, or identities. |
| Idempotency | No automatic retry after a matching build POST; preserve unknown state. |
| Security | Credential-free URLs, environment references or local SecretStore values (never project JSON), boolean-only secret API responses, strict mutation gates, CSRF-aware credential UI, DOM input wiping, bounded diagnostics, and no hidden-form inspection. |
| Persistence | Secret updates are bounded, sorted, serialized under an in-process lock, atomically renamed, and close their file handle on write/sync failure; rename failures clean up temporary files. |
| Availability | Report projects continue after a project failure; cleanup is bounded. |
| Determinism | Unit and fixture tests use injected dependencies or exact default-deny routes. |
| Maintainability | Keep one responsibility per module, strict TypeScript, and production files below 200 lines when changed. |
| Documentation | Keep each Markdown file below 800 lines and link only verified paths. |

## Persistent aggregate index acceptance criteria

- [x] `buildAggregateIndex` combines complete discovery and current outcomes
  without file I/O, preserves current outcome order, and retains history-only
  projects.
- [x] Incomplete discovery is rejected; empty discovery and no outcomes produce
  a valid aggregate with `projects: []`.
- [x] Aggregate validation allows up to 5,050 project rows and 5,000 total run
  entries without changing the 1–50 schema-v1 input limit.
- [x] The publisher rejects either staged file above 16 MiB before replacing
  the existing aggregate pair.
- [x] Focused coverage exists in `aggregate-index-builder.spec.ts` and
  `persistent-aggregate-bounds.spec.ts`.

## Persistent report-management Phase 04 acceptance criteria

- [x] Aggregate construction covers empty and incomplete inventories,
  history-only projects, current outcomes, run ordering and tie breaks,
  run-less outcomes without fake links, and malformed-manifest exclusion.
- [x] Aggregate boundaries cover 5,050 project rows, incomplete discovery,
  16 MiB staged-file rejection with the existing pair intact, and retention
  across distinct configuration runs.
- [x] DELETE API coverage verifies request/security and ID boundaries, missing
  and repeated deletion, live-lock `409`, subtree preflight, sibling/config/
  asset preservation, and valid empty schema-v3 publication.
- [x] Injected removal and publication failures verify lock release and safe
  on-disk outcomes; best-effort refresh/recovery is attempted without claiming
  that deleted files were restored.
- [x] Chromium/WebKit management-page coverage verifies independent 20/21-run
  pagination, cancellation and Escape dismissal, lock and server-error
  feedback, final-project empty state, and on-disk results.
- [x] Phase 04 validation recorded 443 unit, 34 control, and 5 report checks
  passing (482 total); no coverage metrics were collected. The code review
  recorded a clean typecheck and approval at 9.8/10.

## Phase 01 acceptance criteria

- [x] `createSecretStore(configRoot)` fixes the target to
  `secrets.local.json` below an existing canonical real directory.
- [x] Missing/empty files read as an empty map; malformed JSON, arrays/null,
  invalid names, non-string values, non-regular/symlinked files, and oversized
  payloads fail closed.
- [x] `readSecrets` and `listSecretNames` return frozen snapshots; mutations
  support single/bulk put and single/bulk deletion with deterministic sorted
  keys.
- [x] Concurrent read-modify-write updates are serialized in memory, writes
  use an exclusive `0o600` temporary sibling plus sync/close/rename, and
  rename failures remove temporary files while write/sync failures close the
  file handle.
- [x] Errors do not include secret values; Windows mode-bit limitations are
  documented as an ACL concern.
- [x] Control mode creates the store and exposes it through the server handle
  and router context; Phase 02 adds the guarded presence-only HTTP API, and
  Phase 03 wires the store into each control run without mutating
  `process.env`.

## Dynamic-credentials Phase 02 acceptance criteria

- [x] Exact `/api/secrets` GET/PUT/DELETE routes are dispatched through the
  modular secrets handler in control mode.
- [x] GET returns only boolean presence maps, supports validated `keys` filters,
  and never returns stored values.
- [x] PUT accepts single and batch patches, persists string values, supports
  null/`action: "delete"` removal, and returns only post-update presence.
- [x] DELETE accepts a query name or JSON name/names body and returns only
  post-delete presence.
- [x] Host is checked before dispatch; mutations require exact Origin,
  accepted Fetch Metadata, timing-safe CSRF, JSON content type, and bounded
  request bodies.
- [x] Invalid keys/values/bodies, wrong content type, unsupported methods, and
  missing store produce bounded status/error contracts; all responses use
  `Cache-Control: no-store` and omit plaintext.

## Dynamic-credentials Phase 03 acceptance criteria

- [x] `RunManagerOptions.secretStore` is optional, and control-mode
  `createReportServer` passes its `SecretStore` to `createRunManager`.
- [x] `executeControlRun` reads one current SecretStore snapshot, builds
  `{ ...env, ...storedSecrets }`, and uses the merged environment for config
  normalization and both report/auto-build executor dependencies.
- [x] Stored values override same-named base values without mutating the base
  environment or `process.env`; direct file-mode/library callers remain
  environment-driven.
- [x] Non-empty stored values are redacted from control logs, report warnings,
  caught errors/stacks, and auto-build result URL fields before run-record
  persistence.
- [x] `control-run-executor-secrets.spec.ts` covers report and auto-build
  injection, precedence, non-mutation, redaction, and asynchronous
  `createRunManager` integration using shared fixture helpers.

## Dynamic-credentials Phase 04 acceptance criteria

- [x] The loopback control page exposes an accessible Credentials dialog with
  dynamic discovery of referenced variable names and fallback defaults.
- [x] Opening the dialog performs a filtered presence-only GET and renders
  blank password inputs with **Configured**/**Missing** badges.
- [x] Save sends only non-empty trimmed values through the CSRF-gated JSON
  PUT contract, updates badges, and clears submitted input values.
- [x] Per-key clear sends the CSRF-gated bodyless DELETE contract, marks the
  key missing, removes its clear action, and clears the input.
- [x] Dialog close wipes every credential input and modal message, and no
  secret value is reflected in page HTML, status text, URLs, or API output.
- [x] `tests/e2e/control-page.spec.ts` proves modal accessibility, presence
  transitions, persistence/reopen behavior, input wiping, and zero leakage.

## Dynamic-credentials Phase 05 acceptance criteria

- [x] `tests/unit/control-secret-store.spec.ts` verifies missing/empty reads,
  atomic `secrets.local.json` writes without temporary-file residue,
  POSIX/Windows permission handling, invalid and reserved names, non-string
  value rejection without leakage, concurrent writes, and single/bulk
  deletion.
- [x] `tests/unit/control-secrets-api.spec.ts` verifies empty/full/filtered
  boolean presence maps, guarded single and batch updates, null/action
  deletion, query/body deletion, persistence, and plaintext-free responses.
- [x] `tests/e2e/control-page.spec.ts` verifies accessible dynamic credential
  discovery, Missing/Configured transitions, save/clear/reopen and reload
  persistence, execution failure before credentials, successful execution
  after SecretStore injection, and zero leakage from inputs, page HTML, and
  run logs in Chromium and WebKit.
- [x] Phase 05 verification records `npm run typecheck` with 0 errors,
  `npm run test:unit` at 248/248, `npm run test:control` at 6/6, and
  254/254 combined unit and control E2E checks with zero secret leakage.

## Bounded-report Phase 02 acceptance criteria

- [x] `POST /api/run` rejects any own `workerCount` property with HTTP 422
  `INVALID_WORKER_COUNT` before `startRun`.
- [x] Execution requires the saved config ETag to match the request and derives
  the report `workerCount` from `reportWorkers ?? 1` in that matched document.
- [x] Control auto-build uses the saved count to bound its worker pool; it is
  not passed through per-project `AutoBuildRunnerDependencies`.
- [x] `control-run-api.spec.ts` and `control-run-executor-secrets.spec.ts` cover
  request rejection, ETag-bound count forwarding, and auto-build isolation.


## Phase 2 acceptance criteria

- [x] Exact job-action URL validation rejects sibling jobs, foreign origins,
  prefixes, encoded path tricks, fragments, and unexpected queries.
- [x] Build link and submit button are scoped to the required structural
  containers with exact visible cardinality.
- [x] Build form method and action are validated before any click.
- [x] Matching POST is observed once; response state is retained as submitted,
  rejected, or unknown; no automatic retry occurs.
- [x] Auto-build runner rejects disabled/wrong-mode projects, redacts errors,
  and closes context/browser resources.
- [x] Report execution excludes auto-build projects and retains existing report
  capture/artifact behavior.
- [x] Focused unit tests cover the trigger, auto-build runner, and report
  selection boundary without live Jenkins calls.

## Phase 3 acceptance criteria

- [x] The loader fails before browser startup when the saved build link,
  canonical URL, form/action, sticker, or button contract drifts.
- [x] Build identity is derived from saved links/canonicals rather than a
  hard-coded branch or project field.
- [x] The exact build `GET`/`POST` route and `303` redirect are fulfilled
  offline; unknown requests remain default-deny and misses are sanitized.

- [x] Auto-build E2E proves one build `POST`, exact request order, and no
  Snyk/SonarQube capture requests; report flow remains unchanged.
- [x] Fixture implementation is split into focused sub-200-line modules behind
  the supported public facade.


## Operational constraints

Before an authorized build, an operator or integration must verify the exact
controller, project ID, configured `jobUrl`, decoded nested job/branch segments,
enabled flag, explicit `auto-build` mode, and credential-variable availability.
Jenkins parameter defaults are accepted as rendered; automation does not alter
them. A `submission-unknown` outcome requires manual/controller-side
reconciliation before any future attempt.

The checked-in `config/projects.example.json` remains non-runnable with
`.invalid` placeholders and a disabled auto-build example. Keep live project
configuration and secret values outside the repository.

For Phases 01–05, local values may be persisted only in
`config/secrets.local.json`, which is ignored by `config/*.local.json`; keep
that file and its directory protected by the operator/CI account's ACLs.
The Phase 02 API remains loopback-only and exposes presence booleans. Phase 03
control runs consume a per-run snapshot from that store; Phase 04 manages
presence and guarded updates through the modal while wiping its input values.
Phase 05 verifies those persistence, API, and UI boundaries locally without
contacting Jenkins or vendor services. Direct report CLI and library runs still
require the environment variables named by project configuration.

## Traceability

| Requirement area | Primary implementation | Documentation |
| --- | --- | --- |
| Schema and mode selection | `src/config/`, `src/config.ts` | [multi-project configuration](./multi-project-configuration.md) |
| Report runner | `src/runner.ts`, `src/project/project-runner.ts` | [architecture](./architecture.md) |
| Persistent aggregate index | `src/artifacts/aggregate-index-builder.ts`, `aggregate-manifest-reader.ts`, `aggregate-report-publisher.ts`, `result-validation.ts` | [report pipeline](./report-pipeline.md) |
| Jenkins identity and trigger | `src/jenkins/url-identity.ts`, `src/jenkins/build-trigger*.ts` | [system architecture](./system-architecture.md) |
| Auto-build lifecycle | `src/project/project-workflow.ts`, `src/project/auto-build-runner.ts` | [codebase summary](./codebase-summary.md) |
| Local secret persistence | `src/reporting/report-server-secret-store.ts`, `src/reporting/report-server-constants.ts` | [architecture](./architecture.md), [multi-project configuration](./multi-project-configuration.md), [code standards](./code-standards.md) |
| Control secrets API and security gates | `src/reporting/report-server-control-secrets-api.ts`, `src/reporting/report-server-control-api.ts`, `src/reporting/report-server-control-security.ts`, `src/reporting/report-server-control.ts` | [system architecture](./system-architecture.md), [architecture](./architecture.md), [code standards](./code-standards.md) |
| Control UI credential management | `src/reporting/control-page/` (React application: `App.tsx`, `components/`, `hooks/`) | [system architecture](./system-architecture.md), [codebase summary](./codebase-summary.md) |
| Control report-management navigation and deletion | `src/reporting/control-page/pages/ReportManagementPage.tsx`, `src/reporting/control-page/hooks/use-delete-reports.ts`, `src/reporting/report-server-control.ts` | [architecture](./architecture.md), [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Persistent report-management verification | `src/artifacts/report-project-deletion.ts`, `tests/unit/aggregate-index-builder.spec.ts`, `tests/unit/persistent-aggregate-bounds.spec.ts`, `tests/unit/control-reports-delete-api.spec.ts`, `tests/e2e/control-report-management.spec.ts` | [report pipeline](./report-pipeline.md), [release gates](./release-gates.md) |
| Individual report-run deletion API/UI | `src/reporting/report-server-control-reports-api.ts`, `src/artifacts/report-run-deletion.ts`, `src/reporting/control-page/hooks/use-delete-run.ts`, `src/reporting/control-page/components/molecules/project-runs-table.tsx`, `src/reporting/control-page/components/organisms/ProjectReportHistoryCard.tsx`, `src/reporting/control-page/components/organisms/DeleteRunConfirmationDialog.tsx`, `src/reporting/control-page/pages/ReportManagementPage.tsx`; `tests/unit/control-reports-run-delete-api.spec.ts`, `tests/e2e/control-report-management.spec.ts` | [report pipeline](./report-pipeline.md), [release gates](./release-gates.md) |
| Control final-report viewer (Phase 01) | `src/reporting/project-report-route.ts`, `src/reporting/report-server-control.ts`, `src/reporting/project-report-body-renderer.ts`, `src/reporting/control-page/pages/final-project-report-page.tsx`, and `src/reporting/control-page/hooks/use-project-report.ts`; `tests/unit/project-report-route.spec.ts`, `tests/unit/control-final-report-route.spec.ts`, `tests/unit/reporting-renderer.spec.ts`, `tests/unit/use-project-report.spec.ts` | [architecture](./architecture.md), [report pipeline](./report-pipeline.md), [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Client-side PDF export (Phase 02) | `ReportExportButton.tsx`, `use-report-pdf-export.ts`, `report-pdf-content.ts`, `report-pdf-layout.ts`, `report-pdf-table-renderer.ts`, `report-pdf-fonts.ts`, `report-pdf-image-loader.ts`, `export-report-pdf.ts`; `tests/unit/report-pdf-content.spec.ts`, `tests/unit/report-pdf-layout.spec.ts`, `tests/unit/report-pdf-fonts.spec.ts`, `tests/unit/use-report-pdf-export.spec.ts`, `tests/unit/control-final-report-pdf-export.spec.ts` | [architecture](./architecture.md), [report pipeline](./report-pipeline.md), [system architecture](./system-architecture.md) |
| Secrets API verification | `tests/unit/control-secrets-api.spec.ts`, `tests/unit/control-secrets-security.spec.ts` | [release gates](./release-gates.md) |
| Control-mode wiring | `src/reporting/report-server-control.ts`, `src/reporting/report-server.ts` | [system architecture](./system-architecture.md) |
| SecretStore verification | `tests/unit/report-server-secret-store.spec.ts`, `tests/unit/control-secret-store.spec.ts` | [release gates](./release-gates.md) |
| Run-executor environment injection | `src/reporting/report-server-run-manager.ts`, `src/reporting/report-server-run-executor.ts`, `src/reporting/report-server.ts` | [architecture](./architecture.md), [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Template fixture loading and routes | `src/templates/template-fixture-*.ts`, `src/templates/template-report-fixture.ts` | [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Build fixture contract | `templates/jenkins-template/template-build.html`, `tests/unit/template-build-fixture.spec.ts`, `tests/e2e/template-auto-build.spec.ts` | [architecture](./architecture.md) |
| Control actions and results | `ExecutionSection`, `DashboardPage`, `ProjectCard`, `ProjectsGrid`, `RunResultBox`, `BuildProjectOutcomeRow`; `tests/unit/control-atomic-components.spec.ts` | [architecture](./architecture.md), [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Release evidence | `tests/unit/jenkins-build-trigger.spec.ts`, `tests/unit/auto-build-runner.spec.ts`, `tests/unit/sequential-runner.spec.ts`, `tests/unit/control-run-executor-secrets.spec.ts`, `tests/unit/control-secret-store.spec.ts`, `tests/unit/control-secrets-api.spec.ts`, `tests/e2e/control-page.spec.ts`, and Phase 3 fixture tests | [release gates](./release-gates.md) |
| Side-effect policy | `src/jenkins/build-trigger.ts`, `src/project/auto-build-runner.ts` | [architecture](./architecture.md), [release gates](./release-gates.md) |

Dynamic-credentials Phases 01–05 remain complete through the local store,
guarded presence API, per-run environment injection/redaction, Control UI
credential workflow, and unit/API/Playwright verification. Control Page
Parallel Auto-Build is also complete (4/4 phases, 11/11h; 2026-09-24):
`npm run test:release` passed 439/439; typecheck/build passed; review approved
9.3/10. Its E2E now verifies the immediate batch action and absence of obsolete
build-confirmation/per-card controls. Preserve server-side configuration and
security checks, saved worker-count/ETag boundaries, explicit all-enabled build
intent, safe outcome mapping, and no process-global credential mutation. The
report CLI still has no production auto-build command.

## Changelog

### 0.1.0 (development) — 2026-09-26

- Completed Final-report PDF export Phases 01–03 on 2026-09-26: Control-only
  validated viewer, client-side jsPDF/AutoTable export, and verified Unicode
  text, embedded screenshots, A4 pagination, and evidence links. Evidence:
  557/557 checks; typecheck/build passed; focused PDF tests 7/7 in Chromium and
  7/7 in WebKit; review 9.5/10 ([Phase 03](../plans/260925-1729-final-report-pdf-export/phase-03-verification-and-documentation.md), [review](../plans/reports/code-review-260926-1707-phase-03-verification-and-documentation.md)).

### 0.1.0 (development) — 2026-09-25

- Completed Persistent Project Report Management Phase 04: verified aggregate
  retention and publication bounds, guarded deletion, filesystem preflight,
  failure recovery, caller boundaries, and browser-visible management behavior.
- Final test evidence: `npm run test:unit` 443/443, `npm run test:control`
  34/34, and `npm run test:report` 5/5 (482 passed; none failed or skipped).
  No code-coverage metrics were collected. Review approved 9.8/10 with
  `npm run typecheck` clean ([phase](../plans/260924-2019-persistent-project-report-management/phase-04-verification-and-caller-migration.md), [test report](../plans/reports/phase04-tester-260925-0048-verification-and-caller-migration.md), [review](../plans/reports/code-review-260925-0053-phase-04-verification-and-caller-migration.md)).
- Completed Individual report run deletion through Phase 03: verified
  cancellation, selected-run/sibling preservation, final-run pruning, and
  aggregate refresh in Chromium and WebKit; Axe reported 0 violations.
  `npm run typecheck`, `npm run build`, `npm run test:unit` (454/454),
  `npm run test:control` (40/40), and `npm run test:report` (5/5) passed;
  review approved 9.5/10 with no blockers ([phase](../plans/260925-0701-individual-report-run-deletion/phase-03-verification-and-release-gates.md), [test report](../plans/reports/phase03-tester-260925-1517-phase-03-verification-and-release-gates.md), [review](../plans/reports/code-reviewer-260925-1521-phase-03-verification-and-release-gates.md)).


### 0.1.0 (development) — 2026-09-24

- Added the persistent aggregate-index builder: validated history and current
  outcomes share one index; incomplete discovery cannot replace it; the index
  supports zero projects, 5,050 project rows, and 16 MiB staged-file limits.

- Completed Phase 03 Control Page UI refactor: shared saved Workers selector,
  all-enabled report/build actions, no per-card build control or confirmation
  dialog, and ordered per-project result rows with scalar fallback.
- Documented Phase 03 Control report management: navigation to retained
  history, independent 20-run pagination, and confirmation-gated project
  deletion; persisted report HTML remains static and read-only.

- Focused `control-atomic-components.spec.ts` passed 25/25.
- Completed Phase 04 Testing and verification on 2026-09-24; `npm run test:release` passed 439/439, typecheck/build passed, and code review approved 9.3/10 ([phase plan](../plans/260924-1158-control-page-parallel-auto-build/phase-04-testing-and-verification.md), [test report](../plans/reports/phase04-tester-260924-1548-phase04-testing-and-verification.md), [review](../plans/reports/code-review-260924-1552-phase-04-testing-and-verification.md)).

### 0.1.0 (development) — 2026-09-03

- Completed Phase 03 run-executor environment injection and redaction for
  control-mode report and auto-build runs.

- Completed Phase 04 Control UI credential modal/state with dynamic discovery,
  guarded persistence/clear actions, presence badges, and zero-leakage input
  cleanup.

- Completed Phase 05 unit, API, and Playwright E2E verification with
  254/254 checks passing, zero secret leakage, and approved 9.5/10 review.
