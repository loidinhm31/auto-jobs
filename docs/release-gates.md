# Release gates

This project has deterministic local gates for native browsers, offline report
fixtures, the Phase 3 build-page fixture, the Phase 01 SecretStore backend,
the Phase 02 control secrets API/security boundary, report-management routing
and Chromium/WebKit flows for project and individual report-run deletion, the
Phase 03 control run-environment boundary, the Phase 04 credential dialog,
and the Phase 05 dynamic-credential verification suite. The commands below are
the current release contract; test counts are intentionally not hard-coded
except where a dated verification snapshot is recorded for traceability.

## Gate order

Install dependencies and provision required native browsers before gates:

```sh
npm ci
npm run install:browsers
npm run typecheck
npm run build
npm run test:unit
npm run test:e2e:templates
npm run test:control
npm run test:report
npm run test:release:webkit
```

`npm ci` does not download browsers. `npm run install:browsers` provisions
both Chromium and WebKit before the native gates. `npm run build` compiles TypeScript CLI/server files (`tsc -p tsconfig.build.json`), bundles the Vite Control Dashboard (`vite build --config vite.control.config.ts`) into `.runner-build/reporting/control-page/`, and stages static report assets (`node scripts/copy-report-assets.mjs`). The `test:release` script is the deterministic shorthand for typecheck, build, unit, Chromium template, control UI, generated-report, and WebKit template gates; it does not install dependencies or browsers:

```sh
npm run test:release
```

`test:report` runs generated-report browser checks with a loopback static
server. It covers rendering, CSP headers, escaping/inert HTML, local links,
safe external-link attributes, keyboard traversal, axe checks, responsive
widths, and snapshots. It is separate from the template-navigation gate.

The checked-in template workflow can be gated independently:

```sh
npm run test:e2e:templates
```

This runs the production direct workflow against the saved Jenkins, Snyk, and
SonarQube snapshots through the exact default-deny route map, the offline auto-build
workflow, and the template mock server integration suite (`tests/e2e/template-server-integration.spec.ts`).
It is not a live-vendor or live-Jenkins check.

The native WebKit template gate uses the browser installed on the host:

```sh
npm run test:release:webkit
```

It runs the same production workflow and exact route map without a controller,
vendor service, or published port.

## Phase 3 build-page fixture gate

Run the focused fixture checks directly:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/template-build-fixture.spec.ts \
  --config=playwright.unit.config.ts
node scripts/run-playwright.mjs playwright test \
  tests/e2e/template-auto-build.spec.ts \
  --config=playwright.config.ts
```

The unit suite loads the ninth checked-in template file and rejects drift in
the saved build link, canonical URL, `POST` form/action, `#bottom-sticker`,
button classes/text, or file-size budget. The E2E test runs the production
auto-build workflow against the offline route map and proves
`GET login -> POST login -> GET job -> GET build -> POST build -> GET job`,
exactly one build `POST`, no Snyk/SonarQube requests, and no unmatched route.
These commands do not contact Jenkins or vendor services and do not prove that
a live build was created.

## Report gate

The report command requires an explicit schema-v1 configuration path:

```sh
npm run report -- --config config/projects.example.json
```

The checked-in example uses `.invalid` placeholders and is not a live
controller check. Before an authorized run, replace the placeholders and
export the credential values named by `usernameVariable` and
`passwordVariable`. The JSON stores variable names only.

`--config` is required exactly once. `REPORT_SOURCE`,
`PROJECTS_CONFIG_PATH`, legacy `JENKINS_*` project settings, positional
arguments, and legacy structural keys (`baseUrl`, `jobPath`, `captureFrom`,
and `buildNumber`) are rejected. `loginUrl` and `jobUrl` must be exact,
absolute, credential-free HTTP(S) URLs on one Jenkins origin and base context.

The template-navigation gate remains test-only:

```sh
npm run test:e2e:templates
```

It fulfills exact configured and discovered URLs from checked-in templates
with blocked unmatched network requests. It does not contact Jenkins or
vendors and does not claim live execution. Generated reports are served
separately with `npm run serve:report`.

## Phase 2 auto-build gate

The Phase 2 auto-build runner is an explicit library boundary, not a report
CLI mode. `npm run report` always excludes projects whose normalized
`runType` is `auto-build`; this prevents a mixed configuration from causing a
build. No production command currently exposes an auto-build trigger.

Run the focused deterministic tests when reviewing the build workflow:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/jenkins-build-trigger.spec.ts \
  tests/unit/auto-build-runner.spec.ts \
  tests/unit/sequential-runner.spec.ts \
  --config=playwright.unit.config.ts
```

The focused tests cover:

- exact `#side-panel` and `#bottom-sticker` scoping and visible-control
  cardinality;
- exact configured job `/build` URL identity, form `POST`, and required
  Jenkins button class tokens;
- one matching POST, response classification (`submitted` or `rejected`),
  and `submission-unknown` after a request with no determinate response;
- no retry after a possible side effect;
- disabled/wrong-mode rejection, secret redaction, and context/browser
  cleanup; and
- report selection excluding auto-build projects.

These tests use an in-process HTTP server or injected browser/workflow
dependencies. They do not contact a live Jenkins controller and do not prove
that a build was created. Before any authorized live run, apply the exact
side-effect rules in [architecture](./architecture.md) and treat
`submission-unknown` as an indeterminate external side effect.

## Report server gate

`npm run serve:report` first builds the report-server launcher and then serves
an existing report root. Defaults:

```text
root  reports
host  127.0.0.1
port  4173
url   http://127.0.0.1:4173/
LAN   disabled
```

Flags and environment variables:

| Purpose | Flag | Environment | Default |
| --- | --- | --- | --- |
| root | `--root <dir>` | `REPORT_ROOT` (then `ARTIFACT_DIR`) | `reports` |
| host | `--host <host>` | `REPORT_HOST` | `127.0.0.1` |
| port | `--port <port>` | `REPORT_PORT` | `4173` |
| LAN permission | `--allow-lan` | `REPORT_ALLOW_LAN=1` | off |

Local custom root/port:

```sh
npm run serve:report -- --root reports --host 127.0.0.1 --port 5000
```

Trusted-LAN preview:

```sh
npm run serve:report -- --host 0.0.0.0 --allow-lan --port 4173
```

An equivalent environment configuration is:

```sh
REPORT_ROOT=reports REPORT_HOST=0.0.0.0 REPORT_PORT=4173 \
REPORT_ALLOW_LAN=1 npm run serve:report
```

Non-loopback hosts fail without explicit LAN permission. `0.0.0.0` binds all
IPv4 interfaces. The server is read-only, unauthenticated, and serves only
GET/HEAD requests below a canonical root containing the generated aggregate
`index.html`. Use a firewall and a trusted network; this is not public
hosting.

## Template mock server gate

`npm run serve:templates` first builds the server and starts the standalone template mock HTTP server on loopback. Navigating to `http://127.0.0.1:4174/` or `http://127.0.0.1:4174/index.html` serves the Developer Hub index page, detailing all 9 mock endpoints across Jenkins, Snyk, and SonarQube with links and descriptions.

Flags and defaults:
- Host: `127.0.0.1` (or `--host <host>`, env: `TEMPLATE_HOST`)
- Port: `4174` (or `--port <port>`, env: `TEMPLATE_PORT`)
- Help: `--help`, `-h`

Run focused unit tests for the template server and CLI:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/template-server-cli.spec.ts \
  tests/unit/template-server.spec.ts \
  --config=playwright.unit.config.ts
```

### Phase 05 template server validation and integration gate

The integration suite tests the standalone HTTP mock server end-to-end against real browser sessions, production report generation, auto-build execution, and concurrent Control Server operations:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/e2e/template-server-integration.spec.ts \
  --config=playwright.template.config.ts
```

Or as part of the full template suite:

```sh
npm run test:e2e:templates
```

The `template-server-integration.spec.ts` suite covers 11 deterministic checks:
- **Developer Hub index page**: Serves `/` and `/index.html` with security headers (`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store, must-revalidate`), category badges, dynamic links to all 9 mock endpoints, and zero browser console errors.
- **Fixture endpoint navigation**: Navigates to all 9 Developer Hub links in Chromium and asserts valid rendered HTML / JSON content.
- **Jenkins form POST login flow**: Submits credentials on `/login` form and follows 302 redirect to the configured job page.
- **SonarQube session authentication**: Guards `/dashboard` until `/sessions/new` form POST succeeds, then renders the authenticated project dashboard.
- **Parameterized build form submission**: Submits build parameters on `#bottom-sticker` form and verifies 302 redirect back to the job page.
- **Double-encoded slash preservation**: Requests job URL containing `%252F` and confirms no double-decoding or malformed path errors.
- **Concurrent server isolation**: Spawns Control Server (`127.0.0.1:4173`) and Template Server (`127.0.0.1:4174`) concurrently without port conflicts and validates distinct HTML responses.
- **Schema-v1 config validation**: Parses and validates `config/projects.template.json` via `loadProjectConfig`, ensuring origin normalization and credential variable mapping.
- **Production report execution**: Executes `runConfiguredProjects` against the live HTTP template server, generating verified report artifacts (`data.json`, `index.html`) with 6 Snyk findings and SonarQube facet counts.
- **Production auto-build execution**: Executes `runAutoBuildProject` against the live HTTP template server, verifying `submitted` state with 302 response.
- **Control Page UI integration**: Loads `projects.template.json` in the Control Dashboard UI, asserting project card rendering and zero cross-origin or CSP errors in the browser console.

## Control server gate

`npm run serve:control` first builds the server and starts the interactive Control Dashboard on loopback.

Flags and defaults:
- Mode: control (`--control`)
- Host: `127.0.0.1` (refuses LAN / non-loopback bindings)
- Port: `4173`
- Config root: `config/` (or `--config-root <dir>`)
- Report root: `reports/` (or `--root <dir>`)

Deterministic testing of the Control API and UI is executed via:
```sh
npm run test:control
```
which exercises config reading/atomic saving, validation errors, report and auto-build execution contracts, and WCAG A/AA accessibility scanning in Chromium and WebKit.

### Control project and run deletion API gates

Run the focused control-only DELETE API contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-reports-delete-api.spec.ts \
  --config=playwright.unit.config.ts
```

The suite checks the request and ID boundaries, empty-body/content-type/method
rules, missing and repeated deletes, lock-contention `409` without lock-path
leakage, prefix-sibling preservation, and symlink/depth preflight. Injected
removal and aggregate-publication failures verify lock release and safe
post-failure disk state. Successful deletion preserves config, shared assets,
and sibling projects, and publishes a valid empty aggregate when deleting the
last project. Tests use isolated temporary roots and do not contact Jenkins or
vendors. The tree preflight enforces 32 levels, 4,096 entries, and 256 MiB.

### Individual report-run deletion gate

Run the focused unit/API contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-reports-run-delete-api.spec.ts \
  --config=playwright.unit.config.ts
```

The eight-test suite uses temporary report/config roots and the in-process
Control Server. It verifies a successful run deletion preserves sibling runs
and republishes the aggregate, deleting the final validated run prunes the
empty project directory and permits an empty aggregate, malformed routes and
missing targets fail with `400`/`404`, root-lock contention returns `409`
without leaking the lock path, missing/invalid CSRF returns `403`, non-DELETE
methods return `405` with `Allow: DELETE`, and an injected removal failure
leaves run files intact and releases the lock. This unit suite is included in
`npm run test:unit`; it does not contact Jenkins or vendors.

Run the focused browser contract in both configured browsers:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/e2e/control-report-management.spec.ts \
  --config=playwright.control.config.ts \
  --grep='individual.*run|last remaining run'
```

These isolated-root flows verify cancellation leaves both run directories
intact, confirmation removes only the selected run while preserving its sibling
and visible row, aggregate refresh, final-run pruning and empty-state
publication, and lock-conflict feedback. Axe finds no violations on the
individual-run confirmation dialog and action. This browser gate does not
contact Jenkins or vendors.

### Control report-management UI gate

Run the focused UI and hook contract unit tests:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-delete-run-ui.spec.ts \
  --config=playwright.unit.config.ts
```

`npm run test:control` includes `tests/e2e/control-report-management.spec.ts`
under Chromium and WebKit (`playwright.control.config.ts`). It covers dashboard
navigation/back, empty/history-only inventories, independent 20/21-run
pagination, cancel/Escape dismissal, confirmed project/run deletion, sibling
preservation, final-project/final-run empty-state refresh, and 409/500 feedback.
Axe scans cover the retained-history table/actions and per-run confirmation
dialog, with zero violations; direct on-disk assertions verify the results.
`tests/unit/control-assets-routing.spec.ts` runs under `npm run test:unit` and
checks the control-only `/reports/index.html` GET/HEAD CSRF shell, CSP and HEAD
body boundary, plus the report-mode static-index route.

### Individual report-run deletion Phase 03 verification snapshot (2026-09-25)

| Command/scope | Result |
| --- | --- |
| `npm run typecheck` / `npm run build` | Passed; 0 TypeScript errors |
| `npm run test:unit` | 454/454 passed |
| `npm run test:control` (Chromium + WebKit) | 40/40 passed |
| `npm run test:report` | 5/5 passed |
| Combined test suites | 499/499 passed; none failed or skipped |
| Axe accessibility scans | 0 violations on audited views |
| Code review | Approved, 9.5/10; no blockers |

The browser checks verify cancellation, selected-run removal, sibling
preservation, final-run pruning, aggregate refresh, and accessibility. These
phase-specific results do not claim the separate post-integration
`npm run test:release` command was run. Evidence: [phase checklist](../plans/260925-0701-individual-report-run-deletion/phase-03-verification-and-release-gates.md), [test report](../plans/reports/phase03-tester-260925-1517-phase-03-verification-and-release-gates.md), [review](../plans/reports/code-reviewer-260925-1521-phase-03-verification-and-release-gates.md).

### Phase 01 control asset routing gate

Run the focused control asset pipeline and routing contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-assets-routing.spec.ts \
  --config=playwright.unit.config.ts
```

The `control-assets-routing.spec.ts` suite verifies:
- `loadControlAssets` successfully reads Vite-compiled assets from `.runner-build/reporting/control-page/` (`index.html`, `assets/control-page.css`, and `assets/control-page.js`);
- `renderControlPageHtml` injects the CSRF token into `<meta name="csrf-token">` and safely escapes HTML characters and regex replacement patterns (`$$`, `$&`);
- `getControlCss` and `getControlJs` return non-empty strings;
- `createReportServer` in loopback control mode serves `GET /`, `GET /assets/control-page.css`, and `GET /assets/control-page.js` with `CONTROL_CSP` and `Cache-Control: no-store` headers.

### Phase 02 control hooks and interface contracts gate

Run the focused control page hooks, utility, and interface contracts suite:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-hooks-and-types.spec.ts \
  --config=playwright.unit.config.ts
```

The `control-hooks-and-types.spec.ts` suite verifies:
- `discoverRequiredCredentialKeys` correctly extracts keys from project credentials and fallback defaults (`JENKINS_USERNAME` / `JENKINS_PASSWORD`), handling legacy `credentialVariables` objects and string arrays;
- `ControlApiError` formats HTTP status and optional error codes, while `getCsrfTokenFromDom` extracts `<meta name="csrf-token">` contents;
- `useControlApi` injects `x-csrf-token` headers into mutating requests (`POST`, `PUT`, `DELETE`) on same-origin endpoints while omitting them on `GET`;
- `useRunPoller` executes exponential backoff on transient errors up to 5 retries, terminates on fatal 4xx errors or terminal states (`succeeded`, `failed`, `submission-unknown`), and cleans up timers and `AbortController` handles;
- Full lifecycle end-to-end against live loopback control endpoints: config manager list/load/ETag-conflict/save, credential manager presence/patch/delete, browser settings presence/update/clear, and run poller `202 Accepted` execution lifecycle.

### Phase 03 control atomic components gate

Run the focused atomic and molecular component contract suite:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-atomic-components.spec.ts \
  --config=playwright.unit.config.ts
```

The [`control-atomic-components.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/unit/control-atomic-components.spec.ts) suite verifies the atomic and molecular component contracts:
- [`Badge`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Badge.tsx#L31): strictly renders required variant classes (`badge-idle`, `badge-queued`, `badge-running`, `badge-succeeded`, `badge-failed`, `badge-unknown` for `unknown` and `submission-unknown`), credential states (`badge-configured`, `badge-missing`), and browser unconfigured state (`badge-missing` class with `"Not Set"` text);
- [`Button`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Button.tsx#L5): renders variant classes (`btn-primary`, `btn-secondary`, `btn-danger`, `btn-outline`), default `type="button"`, compact `btn-sm` sizing, disabled state, and loading spinner;
- [`Input`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Input.tsx#L5): associates label via `htmlFor`, displays error with `role="alert"` and `aria-invalid="true"`, and defaults `type="password"` with `autoComplete="off"`;
- [`Select`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Select.tsx#L5): renders native `<select>` with options array, value binding, and `aria-label`;
- [`StatusBanner`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/StatusBanner.tsx#L5): renders `role="status"` and `aria-live="polite"`, variant classes (`info`, `success`, `error`), and toggles `.hidden` on visibility changes;
- [`LoadingIndicator`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/LoadingIndicator.tsx#L5): renders `aria-live="polite"`, `.credentials-loading` class, and `.hidden` toggle;
- [`CredentialRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/CredentialRow.tsx#L8): verifies exact DOM structure (`.credential-row`, `label[for="secret-input-${key}"]`, `Badge`, password `<input id="secret-input-${key}" class="credential-input" autocomplete="off">`, and `.btn-clear-credential[data-key="${key}"]` rendered only when configured);
- [`BrowserSettingRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/BrowserSettingRow.tsx#L28): verifies exact element IDs for headless selection (`#badge-browser-headless`, `#browser-headless-select`, `#btn-clear-browser-headless`) and binary path input (`#badge-browser-executable-path`, `#browser-executable-path-input`, `#btn-clear-browser-executable-path`);
- [`ConfigSelectorBar`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx#L7): verifies element IDs (`#config-select`, `#btn-reload`, `#btn-save`, `#btn-credentials`, `#btn-browser-settings`) and ensures `#btn-save` is disabled when not dirty;
- [`LogViewer`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/LogViewer.tsx#L23): renders `<pre id="run-logs" role="log" aria-live="polite" class="log-pre">`, handles string logs and timestamped `RunLogEntry[]` entries, and defaults to `"No active run."`;
- [`RunResultBox`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/RunResultBox.tsx#L5): keeps `#run-result-box`, renders report results and ordered `buildProjects` rows, and preserves scalar build-result fallback and errors.
- [`BuildProjectOutcomeRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/build-project-outcome-row.tsx): renders each project's identity, result/state badge, optional build number/link, stages, and error without an empty link.
- [`ExecutionSection`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/ExecutionSection.tsx): verifies the exact all-enabled action labels/IDs, one `Workers` selector (`#select-workers`, 1–4), and disabled states.

The 2026-09-24 focused run passed 25/25 checks; this is component-level proof,
not the project-wide release gate.

### Phase 04 credential dialog gate

`npm run test:control` also exercises the browser-facing credential workflow
against an isolated loopback server and temporary config/report roots. The
Control UI contract includes:

- an accessible native Credentials dialog and loading/error states;
- discovery of configured credential-variable names with default fallbacks;
- filtered, presence-only `GET /api/secrets?keys=...` rendering;
- password-masked inputs and **Configured**/**Missing** badges;
- CSRF-bearing JSON save and per-key bodyless clear requests;
- persistence/status transitions followed by immediate input wiping; and
- close/reopen cleanup, with no submitted test value in page HTML.

This browser gate proves the UI/API boundary and zero-leakage DOM behavior. It
does not contact Jenkins or vendor services; per-run SecretStore injection and
diagnostic redaction remain covered by the Phase 03 gate below.

## Phase 02 control-run worker-count gate

Run the focused API and executor contracts:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-run-api.spec.ts \
  tests/unit/bounded-auto-build-workers.spec.ts \
  tests/unit/control-run-executor-secrets.spec.ts \
  --config=playwright.unit.config.ts
```

The API suite covers omitted-ID selection, invalid project IDs, and rejection of
request-level `workerCount` with `422 INVALID_WORKER_COUNT` before `startRun`.
The pool suite verifies the worker bound, configuration-order outcomes,
per-project error isolation, and saved-count integration for omitted-ID
selection. Executor coverage checks the saved report count and stale ETag;
per-project auto-build dependencies remain free of a pool count. All tests use
local fixtures and injected executors; they do not contact Jenkins or vendors.

## Phase 03 run-executor environment gate

Run the focused control-run contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-run-executor-secrets.spec.ts \
  --config=playwright.unit.config.ts
```

The suite uses isolated `ConfigStore`/`SecretStore` roots and injected
executors. It proves that both report and auto-build control runs receive
stored values through `runtimeEnvironment`, stored values override same-named
base values, and the base environment remains unchanged. It also proves
redaction of stored values from `addLog` messages, report warnings, thrown
errors, and auto-build result URLs, including the asynchronous
`createRunManager` path. The fixture builders are shared from
`tests/unit/control-run-executor-fixture.ts`.

This gate performs local filesystem I/O and injected executor calls only. It
does not contact Jenkins or vendor services and does not replace the report,
auto-build, or control UI gates.

## Phase 01 SecretStore gate

Run the focused backend contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/report-server-secret-store.spec.ts \
  --config=playwright.unit.config.ts
```

The test uses isolated temporary config/report roots and verifies:

- environment-style key validation and rejection of traversal/dashed/dotted or
  numeric-leading names;
- missing/empty, malformed, array/null, non-string, and non-existent-root
  handling;
- sorted JSON persistence, frozen read/list snapshots, bulk updates and
  deletions, and the 1 MiB boundary;
- concurrent read-modify-write preservation under the in-memory lock;
- secret values absent from validation errors; and
- `createReportServer(..., { mode: 'control' })` wiring the store to the
  server handle and fixed `secrets.local.json` path.

This gate performs local filesystem I/O only. It does not itself execute a
report or auto-build run and does not contact Jenkins or prove Windows ACL
enforcement. The Phase 03 gate below covers per-run environment injection. On
Windows, review the config-directory ACL separately because POSIX `0o600` mode
bits are advisory.

## Phase 05 dynamic-credentials verification gate

Run the focused Phase 05 additions directly:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-secret-store.spec.ts \
  tests/unit/control-secrets-api.spec.ts \
  --config=playwright.unit.config.ts
```

The `control-secret-store.spec.ts` suite uses an isolated temporary config
directory and verifies missing/empty reads, atomic `secrets.local.json` writes
with no temporary-file residue, POSIX `0o600` handling with a Windows-safe
fallback, invalid/traversal/reserved key rejection, non-string value errors
without value leakage, concurrent write preservation, and single/bulk
deletion. The API operation suite verifies empty/full/filtered boolean
presence maps, CSRF/origin-guarded single and batch updates, null/action
deletion, query/body deletion, disk persistence, and plaintext-free responses.

Run the complete unit and control-page gates as the release evidence:

```sh
npm run typecheck
npm run test:unit
npm run test:control
```

`npm run test:control` runs `tests/e2e/control-page.spec.ts` in Chromium and
WebKit. The 2026-09-24 Phase 04 browser suite passed 20/20. Its old
build-confirmation and per-card build interactions have been replaced: E2E
asserts those controls are absent and exercises the immediate all-enabled action,
shared `#select-workers`, save/dirty gating, and a batch POST without
`projectId` or `workerCount`. Control scenarios use temporary configs and
injected executors; they do not contact Jenkins or vendor services.

### Phase 04 Parallel Auto-Build verification snapshot

| Command/scope | Result |
| --- | --- |
| `npm run test:release` | **439/439 passed**: unit 399, template E2E 13, control E2E 20, report 5, WebKit 2 |
| `npm run typecheck` | Passed; 0 TypeScript errors |
| `npm run build` | Passed |
| Code review | Approved, 9.3/10 |

Evidence: [test report](../plans/reports/phase04-tester-260924-1548-phase04-testing-and-verification.md) · [code review](../plans/reports/code-review-260924-1552-phase-04-testing-and-verification.md).

The 2026-09-03 Phase 05 verification snapshot recorded:

| Command/scope | Result |
| --- | --- |
| `npm run typecheck` | 0 TypeScript errors |
| `tests/unit/control-secret-store.spec.ts` | 7/7 passed |
| `tests/unit/control-secrets-api.spec.ts` | 10/10 passed |
| `npm run test:unit` | 248/248 passed |
| `npm run test:control` (Chromium + WebKit) | 6/6 passed |
| Combined unit and control E2E checks | 254/254 passed |
| Secret leakage checks | Zero observed |

Phase 03 React refactor addition:
- The original React refactor baseline recorded 21/21 atomic-component checks; the current contract above includes the updated action bar and result rows.

### Phase 06 legacy cleanup and release verification gate

Phase 06 eliminated all legacy imperative control page files, ensuring only modern React assets compiled by Vite exist in the build output and runtime:

- **Deleted legacy files**:
  - `src/reporting/control-page/control-page.js` (imperative DOM scripting replaced by React components and hooks)
  - `src/reporting/control-page/control-page.html` (legacy template replaced by `src/reporting/control-page/index.html`)
  - `src/reporting/control-page/control-page.css` (legacy CSS replaced by Tailwind CSS and `styles/globals.css`)
- **Staging & build verification**:
  - `scripts/copy-report-assets.mjs` stages exclusively `report.css` to `.runner-build/reporting/report.css` and no longer copies any legacy control files.
  - `vite build --config vite.control.config.ts` bundles all React components into `.runner-build/reporting/control-page/` (`index.html`, `assets/control-page.css`, `assets/control-page.js`).
  - `report-server-control-page.ts` loads exclusively from `.runner-build/reporting/control-page/`.
- **Post-cleanup verification baseline**:

| Command/scope | Result |
| --- | --- |
| `npm run typecheck` | 0 TypeScript errors |
| `npm run build` | Clean Vite bundle + asset staging |
| `npm run test:unit` | 292/292 passed |
| `npm run test:control` (Chromium + WebKit) | 8/8 passed (4 scenarios × 2 browsers) |
| Combined unit and control E2E checks | 300/300 passed |
| Secret leakage checks | Zero observed |

These checks prove local persistence, API/UI contracts, and no-leakage
invariants; they do not prove a live Jenkins build or vendor-service run.

## Phase 02 control secrets API gate

Run the focused HTTP contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-secrets-api.spec.ts \
  tests/unit/control-secrets-security.spec.ts \
  --config=playwright.unit.config.ts
```

These tests create isolated loopback control servers and verify:

- `GET /api/secrets` returns an empty or sorted boolean presence map;
- `GET /api/secrets?keys=...` validates requested names and reports missing
  names as `false`;
- `PUT /api/secrets` accepts single and batch patches, persists string values,
  supports null/`action: "delete"` removal, and never echoes plaintext;
- `DELETE /api/secrets` supports query and JSON name lists and returns the
  resulting presence map;
- Host validation runs before dispatch, while mutations require same-origin
  Origin, accepted Fetch Metadata, the generated CSRF token, and JSON content
  type;
- invalid keys/values/bodies return `400`, invalid mutation gates return `403`,
  non-JSON mutation bodies return `415`, unsupported methods return `405` with
  `Allow`, and a missing store returns `503`; and
- all API responses use `Cache-Control: no-store` and contain no secret value.

The gate writes only isolated temporary SecretStore files and does not contact
Jenkins or vendor services. It proves request-level API behavior, not Windows
ACL enforcement or run-executor behavior; per-run environment merging and
redaction are covered by the Phase 03 gate above.

## Browser-fixture boundary

The report workflow does not depend on a Jenkins controller. Current
acceptance uses native Playwright tests and the checked-in nine-file offline
corpus, including `templates/jenkins-template/template-build.html`. The
build-detail route is synthetic, exact, default-deny, and test-only;
controller/container experiments are outside the report and fixture contracts.

## Artifact verification

Before a release decision, inspect only the intended report root:

```text
reports/
├── index.html
├── aggregate-data.json
├── assets/report.css
└── <project-id>/<run-id>/
    ├── index.html
    ├── data.json
    ├── manifest.json
    └── requested screenshots
```

The application runner's artifacts are normalized data, a contract-validated
manifest, generated report HTML, and requested vendor screenshots.
`test-results/` contains Playwright test-runner output; its traces are test
traces, not runner/vendor report traces. An optional `trace.zip` is retained
only if a run manifest supplies that exact allowlisted reference.

Failure artifact persistence retains the allocated project/run identity. The
runner uses the workflow deadline first and a bounded fallback for failure
persistence, then records a warning if both attempts fail. Review the
aggregate and warnings rather than treating directory presence alone as proof
of complete evidence.

The report root and staging root must be canonical non-overlapping
directories. Publication is staged and bounded; cleanup preserves unsafe,
active, malformed, oversized, symlinked, and ambiguous entries. The private
report-root lease coordinates same-host work using token/PID/hostname owner
data. It has no UID field, is not a same-UID authorization boundary, and is
not a distributed lock.

## Persistent aggregate index gate

Run the focused deterministic contracts:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/aggregate-index-builder.spec.ts \
  tests/unit/persistent-aggregate-bounds.spec.ts \
  --config=playwright.unit.config.ts
```

The suites cover current outcomes and retained history, empty aggregate
construction, rejection of incomplete discovery, the 5,050 project ceiling,
discovery-limit signaling, and rejection of oversized staged aggregate output
without replacing the prior pair. The tests use in-memory manifests and
temporary report roots; they do not contact Jenkins or vendor services.
See [report pipeline](./report-pipeline.md) for the persisted index contract.

## Security checks

- Never inline credentials in JSON, shell history, fixtures, logs, or examples.
  Use environment-variable references, the local SecretStore in control mode,
  or a trusted CI secret store.
- Native browser gates do not contact Jenkins or vendor services. Keep any
  authorized runtime credentials in environment variables or a trusted CI
  secret store; control runs read a per-run SecretStore snapshot instead of
  mutating `process.env`.
- The runner validates origins, rejects credential-like URL data and traversal,
  redacts diagnostics, keeps authentication state ephemeral, and does not copy
  raw vendor HTML into generated reports. The control executor additionally
  redacts every non-empty stored value from logs, warnings, errors/stacks, and
  auto-build result URL fields.
- The report server has no authentication. Keep it on loopback unless a
  trusted-LAN decision, firewall, and `--allow-lan`/`REPORT_ALLOW_LAN=1` are in
  place.
- Do not use a live Jenkins collector with production jobs, untrusted forks,
  or unreviewed endpoints. This documentation pass does not claim that live
  Jenkins or browser execution was verified.

## Test-count and evidence policy

Previous handoff notes reported different unit-test snapshots (121, 143, 152,
157, and 160) as the code changed. Those counts describe historical commits,
not a single current baseline. This document reports no current count without
running the relevant command; the command output is the release evidence.

Native browser, fixture startup, and live Jenkins results are environment
evidence only when their commands are freshly run in the target environment.
