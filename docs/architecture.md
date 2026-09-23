# Current architecture

This document describes the implemented schema-v1 configuration, report and
target-branch Jenkins auto-build workflows, the local SecretStore backend, the
loopback control secrets API, the Phase 04 credential-management UI, and the
Phase 05 verification boundary. Phase 03 adds per-run SecretStore environment
injection and redaction to control runs. Phase 04 adds a CSRF-aware modal that
discovers referenced variable names, displays presence only, persists
replacements, and wipes password inputs. Phase 05 verifies the persistence,
API, and browser contracts without live services. Phase 3 adds an offline
build-page fixture and exact routes so the auto-build path can be exercised
without live side effects. Phase 01 adds validated local persistence; Phase 02
exposes guarded presence-only `GET`, `PUT`, and `DELETE /api/secrets`
operations. The report command remains report-only; auto-build is an explicit
library boundary and is not inferred from URLs, selectors, CLI names, or
environment.

The runner collects bounded Jenkins, Snyk, and SonarQube evidence and writes a
static normalized vulnerability report. Runtime navigation uses the exact URLs
in the project configuration. Tests may fulfill those exact URLs with
test-only Playwright routes; unmatched network requests are blocked.

See [system architecture](./system-architecture.md) for the component view,
[multi-project configuration](./multi-project-configuration.md) for the
field-level contract, and [release gates](./release-gates.md) for commands and
validation boundaries.

## Scope and operating modes

Production and tests use the same schema-v1 configuration shape:

| Source mode | Configuration | Page behavior |
| --- | --- | --- |
| runtime | schema-v1 project JSON passed with `--config` | real HTTP(S) navigation |
| test | schema-v1 test project JSON plus checked-in `templates/` | exact configured/discovered URLs fulfilled by test-only routes |

Project execution mode is independent of source mode:

| Execution mode | Selection boundary | Side effect |
| --- | --- | --- |
| `report` | all enabled projects normalized as `report` | capture publisher evidence and publish immutable reports |
| `auto-build` | one exact enabled project normalized as `auto-build` | submit one validated parameterized Jenkins form; do not capture reports |

`runType` is an explicit project-only discriminator. An omitted value
normalizes to `report`; it is never inferred and does not itself trigger a
build. The report CLI selects report projects only. A caller that intentionally
selects an auto-build project must invoke the separate auto-build runner.

The project JSON supplies exact Jenkins `loginUrl` and `jobUrl`, a project
`runType`, credential environment-variable names, selectors, source-origin
policy, browser, timeout, and artifact root. The job page is the
report-discovery boundary. Snyk report and summary links and the SonarQube home
link are discovered from that page; SonarQube Overall and Issues links are
followed from the validated home page.

The report CLI runs one browser process for selected report projects. Projects
execute in configuration order, each in a fresh Playwright context, with one
absolute capture deadline. A project failure is captured as an outcome so later
projects can continue. The auto-build runner owns its own one-project browser
and context.

```mermaid
flowchart LR
  Config[Schema-v1 project JSON] --> Normalize[Validate and normalize]
  Normalize --> Dispatch{Explicit caller selection}
  Dispatch -- report --> ReportRunner[Report runner]
  ReportRunner --> Browser[One Playwright browser]
  Browser --> Login[Exact Jenkins login]
  Login --> Job[Exact Jenkins job page]
  Job --> Discover[Discover Snyk and SonarQube links]
  Discover --> Capture[Capture and normalize evidence]
  Capture --> Reports[Per-run reports and aggregate index]
  Dispatch -- auto-build + exact projectId --> BuildRunner[Auto-build runner]
  BuildRunner --> BuildBrowser[Dedicated browser/context]
  BuildBrowser --> BuildLogin[Exact Jenkins login]
  BuildLogin --> BuildJob[Exact Jenkins job page]
  BuildJob --> Trigger[Validate controls and submit once]
  Trigger --> BuildResult[submitted / rejected / submission-unknown]
  TestRoutes[Test-only exact URL routes] -. tests only .-> Browser
```

## Components

- `src/cli.ts` requires one schema-v1 project JSON and invokes the report
  runner. It has no auto-build command or template/runtime source switch.
- `src/config/` validates schema keys, exact HTTP(S) URLs, project-only
  `runType`, credential references, source origins, selectors, and bounded
  runtime settings through the browser-safe shared `assertProjectConfigDocument`
  boundary. Normalization defaults an omitted `runType` to `report`.
- `src/config/project-run-selection.ts` owns the explicit
  `selectReportProjects` and `selectAutoBuildProject` boundaries. Selection is
  pure and has no browser or Jenkins side effect.
- `src/config-selectors.ts` owns selector parsing and immutable defaults,
  including the build link and submit-button selectors.
- `src/config.ts` exposes the loader, normalized contracts, `RunType`, and
  selection helpers from the public configuration surface.
- `src/browser-launcher.ts` centralizes browser choice and environment-driven
  launch options (`PLAYWRIGHT_EXECUTABLE_PATH`, headless flags, and action
  delay) shared by report and auto-build callers.
- `src/runner.ts` enforces one browser for sequential report projects, one
  report root, report-root locking, cleanup, manifest discovery, and aggregate
  publication. `runFromConfig` filters out auto-build projects.
- `src/project/project-workflow.ts` contains the direct report workflow and
  the separate login/job/trigger auto-build workflow.
- `src/project/auto-build-runner.ts` owns one-project auto-build execution,
  fresh context/page creation, absolute deadline handling, redacted outcomes,
  and bounded resource cleanup. It does not allocate report artifacts.
- `src/jenkins/auth.ts` authenticates and opens the exact configured job page.
  `src/jenkins/url-identity.ts` validates exact job and `/build` action
  identities, including nested and repeatedly encoded `job/` segments.
- `src/jenkins/locators.ts` maps configured selectors to Playwright locators
  and reads candidate hrefs without trusting them. `build-trigger-validation.ts`
  enforces structural containers, control counts, class tokens, form method,
  and exact action URL. `build-trigger.ts` performs one guarded submission.
- `src/reports/snyk/` and `src/reports/sonarqube/` validate allowed links,
  handle SonarQube login redirects when required, capture bounded visible
  evidence, and normalize source-specific results.
- `src/artifacts/` creates immutable report paths, writes validated files,
  manages staging leases and aggregate recovery, and performs bounded cleanup.
- `src/reporting/` renders static HTML/CSS and serves only files below a
  canonical report root.
- `src/reporting/report-server-control.ts` validates the Host header for every
  control request, dispatches API paths, routes built control assets
  (`/`, `/assets/control-page.css`, `/assets/control-page.js`), and carries the optional
  `ControlRouterContext.secretStore` dependency.
- `src/reporting/control-page/` contains the Control Dashboard frontend sources:
  server data contracts (`types/index.ts`), shared UI component prop interfaces
  (`types/component-contracts.ts`), key discovery utilities (`utils/discoverCredentialKeys.ts`),
  Tailwind class merge utility ([`utils/cn.ts`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/utils/cn.ts#L4)),
  headless React hooks (`hooks/useControlApi.ts`, `hooks/useConfigManager.ts`,
  `hooks/useConfigDocumentEditor.ts` for document/raw-JSON editing and
  validation, `hooks/useCredentialsManager.ts`, `hooks/useBrowserSettings.ts`,
  `hooks/useRunPoller.ts`),
  atomic design UI primitives ([`components/atoms/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/):
  [`Badge`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Badge.tsx#L31),
  [`Button`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Button.tsx#L5),
  [`Input`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Input.tsx#L5),
  [`Select`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Select.tsx#L5),
  [`StatusBanner`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/StatusBanner.tsx#L5),
  [`LoadingIndicator`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/LoadingIndicator.tsx#L5)),
  compound molecules ([`components/molecules/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/):
  [`CredentialRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/CredentialRow.tsx#L8),
  [`BrowserSettingRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/BrowserSettingRow.tsx#L28),
  [`ConfigSelectorBar`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx#L7),
  `ConfigProjectEditor`, `ConfigDefaultsEditor`,
  [`LogViewer`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/LogViewer.tsx#L23),
  [`RunResultBox`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/RunResultBox.tsx#L5)),
  compound organisms ([`components/organisms/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/):
  [`HeaderBar`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/HeaderBar.tsx),
  [`ProjectsGrid`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/ProjectsGrid.tsx),
  [`ProjectCard`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/ProjectCard.tsx),
  [`ExecutionSection`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/ExecutionSection.tsx),
  [`RunStatusCard`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/RunStatusCard.tsx),
  [`RawJsonSection`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/RawJsonSection.tsx),
  [`CredentialsDialog`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/CredentialsDialog.tsx),
  [`BrowserSettingsDialog`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/BrowserSettingsDialog.tsx),
  [`BuildConfirmDialog`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/BuildConfirmDialog.tsx)),
  layout templates ([`components/templates/DashboardLayout.tsx`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/templates/DashboardLayout.tsx)),
  pages ([`pages/DashboardPage.tsx`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/pages/DashboardPage.tsx)),
  error boundary ([`components/ErrorBoundary.tsx`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/ErrorBoundary.tsx)),
  and application markup (`index.html`, [`App.tsx`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/App.tsx), `main.tsx`, [`styles/globals.css`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/styles/globals.css)),
  bundled by `vite.control.config.ts` into `.runner-build/reporting/control-page/` with
  single-bundle JS/CSS and no inline scripts/styles for strict CSP compliance. Legacy imperative
  assets (`control-page.js`, `control-page.html`, `control-page.css`) have been removed (Phase 06).
- `src/reporting/report-server-control-page.ts` reads Vite-built assets from
  `.runner-build/reporting/control-page/`, injects the instance CSRF token into
  `index.html`, and provides cached CSS and JS.
- `scripts/copy-report-assets.mjs` stages `report.css` to
  `.runner-build/reporting/report.css` without overwriting Vite outputs.
- `src/reporting/report-server-control-api.ts` remains the config/run handler
  facade and re-exports `handleSecretsApi`; the implementation lives in
  `report-server-control-secrets-api.ts`.
- `src/reporting/report-server-control-secrets-api.ts` implements the
  presence-only `/api/secrets` GET/PUT/DELETE contract, bounded JSON parsing,
  key/value validation, and SecretStore updates.
- `src/reporting/report-server-control-security.ts` centralizes control
  security headers plus Host, Origin, Fetch Metadata, timing-safe CSRF, and
  mutation content-type gates.
- `src/reporting/report-server-run-manager.ts` owns the single-active-run
  lifecycle and carries the optional `SecretStore` dependency into execution.
- `src/reporting/report-server-run-executor.ts` snapshots stored secrets,
  builds the per-run environment, dispatches report/auto-build executors, and
  redacts control-run logs and result diagnostics.
- `src/templates/template-report-fixture.ts` is the public template facade; it
  re-exports the supported loader, response, route, types, and size-boundary API.
- `src/templates/template-fixture-types.ts` defines the fixture, response, route
  miss/recorder, file-identity, read-budget, artifact-link, and Sonar route contracts.
- `src/templates/template-fixture-file-io.ts` resolves a canonical template root
  and performs descriptor/no-follow, identity, symlink, and byte-budgeted reads.
- `src/templates/template-fixture-html.ts` owns bounded HTML parsing, URL checks,
  canonical/form/link rewrites, artifact selection, and exact fixture matching.
- `src/templates/template-fixture-sonarqube.ts` validates SonarQube identities
  and rewrites dashboard/issues links for the synthetic fixture origin.
- `src/templates/template-fixture-build-validation.ts` derives the build link
  from `#side-panel` and validates build canonical, form, sticker, and button controls.
- `src/templates/template-fixture-loader.ts` reads and validates the nine saved
  inputs, derives build/report/Sonar destinations, and assembles the fixture.
- `src/templates/template-fixture-routes.ts` fulfills exact fixture URLs and
  records sanitized default-deny route misses.
- `templates/jenkins-template/template-build.html` is the minimal saved-origin
  build-detail page used for canonical/action and DOM-contract validation.
- `templates/` is the checked-in browser fixture corpus. Test-only routes map
  exact URLs from saved pages to those files and abort unmatched network.

## Configuration boundary

### Schema-v1 file mode

The root object has `schemaVersion: 1`, `projects`, and optional `defaults`.
There must be one to 50 projects and at least one enabled entry. Each project
requires a unique safe ID, display name, exact Jenkins `loginUrl`, and exact
Jenkins `jobUrl`; it may also set project-only `runType`.
Login and job URLs must share one canonical Jenkins origin and base context.

The runtime command receives the JSON path explicitly:

```text
npm run report -- --config config/<projects>.json
```

The file is validated before browser launch. Unknown keys, duplicate IDs,
missing enabled projects, unsafe selectors, invalid or credential-bearing URLs,
unsafe paths, embedded secret values, and out-of-range settings are rejected.
Legacy structural keys such as `baseUrl`, `jobPath`, `captureFrom`, and
`buildNumber`, plus structural environment inputs such as `REPORT_SOURCE`,
`PROJECTS_CONFIG_PATH`, and legacy `JENKINS_*` project settings, are rejected.

### Run mode and selector contract

`runType` accepts exactly `'report'` or `'auto-build'`. Missing input is
normalized to `'report'`, preserving existing schema-v1 documents as report
projects. `runType` is deliberately absent from `ProjectConfigDefaults`, so
`defaults.runType` is rejected as an unknown key. No environment setting is
read for mode selection; do not use environment configuration to mass-enable
auto-build.

Selection happens on normalized projects:

| Helper | Contract |
| --- | --- |
| `selectReportProjects(projects)` | Returns a frozen list containing only enabled projects with `runType === 'report'`; disabled and auto-build entries never enter the report set. It fails when no enabled report project exists. |
| `selectAutoBuildProject(projects, projectId)` | Requires an exact, non-empty project ID and returns one project only when it is enabled and `runType === 'auto-build'`; missing, disabled, and report projects fail closed. |

The helpers are exported by `src/config.ts`. They do not rewrite modes,
derive branch identity, or submit a Jenkins request. `runFromConfig` passes
only `selectReportProjects(...)` to the report executor. The explicit
`runAutoBuildProject(...)` boundary accepts one selected project and is the
only Phase 2 path that reaches the Jenkins build trigger.

All selector fields are available under `defaults.selectors` and
`projects[*].selectors`; project values override defaults. The normalized
defaults are:

| Selector | Kind | Value | Name | Required |
| --- | --- | --- | --- | --- |
| `authLandmark` | `role` | `link` | `Manage Jenkins` | `true` |
| `sonarqubeReport` | `testId` | `sonarqube-report` | — | `true` |
| `snykReport` | `testId` | `snyk-report` | — | `true` |
| `buildParametersLink` | `role` | `link` | `Build with Parameters` | `true` |
| `buildSubmitButton` | `role` | `button` | `Build` | `true` |

`buildParametersLink` and `buildSubmitButton` must remain required. Omitting
`required` defaults it to `true`; an explicit `required: false` override is
rejected for either field. Their Jenkins search scopes (`#side-panel` and
`#bottom-sticker`, respectively) remain runtime code rather than configurable
CSS. Selector values do not change the configured `jobUrl` or branch identity.

### Credential and control-plane implementation map

| Path | Responsibility |
| --- | --- |
| `src/types.ts` | Defines `RunType` and the complete selector shape. |
| `src/config/*` | Validates, normalizes, and selects project run contracts; environment helpers keep mode out of legacy configuration. |
| `src/config-selectors.ts` | Defines selector kinds, parsing, and build-control defaults. |
| `src/config.ts` | Re-exports config types, loader, and selection helpers. |
| `src/jenkins/runner-config.ts` | Carries required build selectors into Jenkins runner configuration. |
| `config/projects.example.json` | Shows explicit enabled report and disabled auto-build project entries. |
| `config/projects.template.json` | Pre-configured runnable schema-v1 document for local template fixture mock server testing. |
| `src/reporting/report-server-constants.ts` | Defines the fixed secret filename and 1 MiB secret-file/body boundaries. |
| `src/reporting/report-server-secret-store.ts` | Canonical, atomic, locked local secret persistence and validated read/list/update/delete operations. |
| `src/reporting/report-server-control-security.ts` | Applies control security headers and Host/Origin/Fetch Metadata/CSRF/content-type gates. |
| `src/reporting/report-server-control-secrets-api.ts` | Implements the modular presence-only secrets API handler. |
| `src/reporting/report-server-control-api.ts` | Owns config/run handlers and re-exports the secrets handler as the API facade. |
| `src/reporting/report-server-control.ts` | Validates Host, routes `/api/secrets`, and carries the optional `SecretStore` context dependency. |
| `src/reporting/report-server.ts` | Creates the `SecretStore` in loopback control mode and exposes it on `ReportServerHandle`. |
| `src/reporting/report-server-run-manager.ts` | Owns the single-active-run lifecycle and carries the optional `SecretStore` dependency. |
| `src/reporting/report-server-run-executor.ts` | Reads one SecretStore snapshot, merges the run environment, dispatches the selected executor, and redacts control-run output. |
| `tests/unit/report-server-secret-store.spec.ts` | Exercises Phase 01 persistence and control-server wiring. |
| `tests/unit/control-secret-store.spec.ts` | Exercises Phase 05 SecretStore lifecycle, atomic-file cleanup, platform permission handling, key/value validation, concurrent writes, and deletion. |
| `tests/unit/control-secrets-api.spec.ts` | Exercises Phase 05 endpoint presence, guarded patch/delete semantics, filtering, persistence, and plaintext-free responses. |
| `tests/unit/control-secrets-security.spec.ts` | Exercises redaction, validation, method/content-type handling, and security gates. |

### Secret resolution

The JSON retains only names such as:

```json
{
  "credentials": {
    "usernameVariable": "JENKINS_USERNAME",
    "passwordVariable": "JENKINS_PASSWORD"
  }
}
```

At run time, the corresponding environment values are required for each
enabled project. Values are not copied into normalized configuration,
diagnostics, URLs, screenshots, traces, storage state, or reports. The JSON
must never contain passwords, tokens, cookies, or credential-bearing URLs.

Phase 01 adds a separate local `SecretStore` backend for control-plane
credential persistence. `createSecretStore(configRoot)` canonicalizes an
existing, non-symlinked directory and fixes the target to
`config/secrets.local.json`; callers cannot choose a filename or path. A
missing or empty file reads as an empty map. Existing content must be a JSON
object no larger than `MAX_SECRET_FILE_BYTES` (1 MiB), with keys matching
`/^[A-Za-z_][A-Za-z0-9_]{0,127}$/`, excluding `__proto__`, `prototype`, and
`constructor`, and string values.

`readSecrets()` and `listSecretNames()` return frozen snapshots. Mutations use
`putSecret`, `putSecrets`, `deleteSecret`, or `deleteSecrets`; each validates
names and values, reads the latest map under an in-memory write lock, sorts
keys, and serializes deterministic JSON. Writes create an exclusive sibling
temporary file with mode `0o600`, write and sync it, close it, then rename it
over the fixed target. A failed rename removes the temporary file and leaves
the previous target in place. Windows does not enforce POSIX mode bits as an
ACL boundary, so directory ACLs remain the protection boundary there.

Control mode initializes one store alongside `ConfigStore` and exposes it on
the server handle and router context. Phase 02 routes `/api/secrets` through
the dedicated handler described below.

### Control-run environment injection (Phase 03)

`executeControlRun` reads one `SecretStore` snapshot at execution start and
creates a new environment object with `{ ...env, ...storedSecrets }`. Stored
values therefore take precedence over the caller-supplied environment, while
neither the caller object nor `process.env` is mutated. The merged object is
used for config normalization and passed as `runtimeEnvironment` to either
the report executor or the auto-build executor. Direct CLI/library callers
without a control run continue to resolve credentials from their supplied
environment.

All non-empty values from the snapshot form the control-run redaction set.
`addLog` messages, report warnings, caught error messages/stacks, and
auto-build `jobUrl`/`buildPageUrl` result fields are redacted before they are
stored in the control run record. The local report URL is generated only from
the validated report-relative path. Downstream auto-build execution also
clears its mutable resolved credential copy during cleanup.

### Control secrets API contract

`handleControlRequest` rejects an invalid Host before dispatching an API route.
`handleSecretsApi` returns a presence map and never serializes secret values:

| Request | Input and gates | Result |
| --- | --- | --- |
| `GET /api/secrets` | Exact bound Host; optional `keys=NAME_A,NAME_B` filter | `200 { "secrets": { "NAME_A": true } }` for stored names |
| `PUT /api/secrets` | Host, same-origin Origin, accepted Fetch Metadata, CSRF token, JSON content type, and ≤1 MiB JSON object | `200` full post-update presence map |
| `DELETE /api/secrets?name=NAME` | Same mutation gates and valid query name | `200` full post-delete presence map |
| `DELETE /api/secrets` | Same gates and `{ "name": "NAME" }` or `{ "names": ["NAME"] }` JSON body | `200` full post-delete presence map |

PUT accepts a single `{ "name": "NAME", "value": "VALUE" }` object or a
non-empty `{ "secrets": { "NAME": "VALUE" } }` patch. A null patch value or
`action: "delete"` removes a key. Filtered GET responses include each valid
requested key with `true` or `false`; unfiltered responses include sorted
stored names with `true`. Invalid keys/values/bodies return `400`; invalid
mutation security returns `403`; wrong content type returns `415`; an absent
store returns `503`; unsupported methods return `405` with `Allow`. Every API
response uses `Cache-Control: no-store`.

### Test configuration

Tests load the same schema-v1 shape with non-routable fixture URLs. The
test-only router reads nine checked-in files below `templates/`, derives the
build detail URL from the unique saved Jenkins link, derives Snyk and SonarQube
destinations from saved canonical pages, and fulfills only exact synthetic URLs.
Fixture paths are canonical, traversal- and symlink-safe, size-bounded, and
never read from runtime project JSON.

## Phase 3 template fixture and route contract

`loadTemplateReportFixture(env, origin?)` resolves the checked-in template root
(or the optional `TEMPLATES_DIR` override), reads nine bounded files, and fails
before browser startup when a saved identity or DOM contract drifts. The
per-file limit is 4 MiB and the cumulative fixture limit remains 16 MiB.

Build identity is derived, never hand-constructed:

1. `extractSidePanelBuildLink` requires exactly one `Build with Parameters`
   anchor in the saved Jenkins `#side-panel`, then validates its approved
   origin, same-job `/build` path, and optional `delay=0sec` query.
2. `validateBuildTemplate` requires one canonical URL matching that discovered
   build page, one `POST` form with the same exact `/build` action, one
   `#bottom-sticker`, and one `Build` submit button with all required Jenkins
   class tokens.
3. The loader rewrites only the selected job anchor and validated build form
   action to the synthetic fixture origin; unrelated saved links remain untouched.

The route sequence is:

```text
GET loginUrl -> POST loginActionUrl -> GET jobUrl -> GET buildPageUrl
-> POST buildActionUrl -> 303 Location: jobUrl -> GET jobUrl
```

`templateResponse` matches all nine fixture URLs exactly, including query and
fragment identity. `installTemplateReportRoutes` permits only `GET`/`HEAD` for
those responses plus the exact Jenkins login actions, the same-origin
SonarQube `/sessions/new` authentication path, and exact build-action `POST`.
The build `POST` returns `303` with only the exact job URL; form data is neither
read nor reflected. Every other method or URL aborts, and the recorder retains
at most 32 sanitized method/origin/path misses. Report mode never follows the
build anchor, so its request sequence remains report-only.

The focused unit and E2E contracts are
`tests/unit/template-build-fixture.spec.ts` and
`tests/e2e/template-auto-build.spec.ts`; they prove fixture drift rejection,
exact build redirect, one build `POST`, and no Snyk/SonarQube capture in
auto-build mode.

## Per-project workflow

### Report workflow

The report path submits credentials only to the configured Jenkins login
destination, validates the final authenticated page, opens the exact
configured job page, discovers publisher links once, and captures evidence
from those destinations. It never searches for another job, opens a build
page, submits a form, inspects queues or build identities, polls terminal
status, or accepts a build-number override.

### Auto-build workflow

The auto-build path reuses the same credential resolution, login validation,
exact job navigation, and one absolute `WorkflowDeadline`, then:

1. requires exactly one visible `#side-panel`;
2. resolves the configured **Build with Parameters** locator within that
   container and validates its href as the exact configured job `/build` action;
3. navigates to that validated detail page;
4. requires exactly one visible `#bottom-sticker`, one visible configured
   **Build** button, all three Jenkins class tokens
   (`jenkins-button`, `jenkins-button--primary`, and
   `jenkins-!-build-color`), and exactly one ancestor form;
5. requires form method `POST` and validates the resolved action as the same
   exact job `/build` action;
6. arms request/response observers, clicks once, and returns only the
   configured job URL, validated build-page URL, timestamp, state, and
   optional response status.

The trigger never reads or returns form bodies, parameters, crumb values,
headers, cookies, or response bodies. After a matching POST is observed, a
missing/indeterminate response is `submission-unknown`; it is not retried.
An HTTP response below 400 is `submitted`, while a response at or above 400 is
`rejected`. Failures before a matching POST surface as sanitized
`JenkinsFlowError` values and become `failed-before-submit` at the runner
boundary. Auto-build does not invoke source capture or report persistence.

Every configured, discovered, redirected, and final URL in either path must be
credential-free HTTP(S) and inside its allowed canonical origin. A single
absolute deadline covers the workflow; context/browser cleanup is bounded and
best-effort.

## Evidence capture and result contract

After authentication, capture starts from the exact configured Jenkins job
page. Every configured, discovered, redirected, and final URL must be
credential-free HTTP(S) and inside its allowed canonical origin.

The Snyk adapter selects one exact report link and one unambiguous summary JSON
link from the validated Jenkins job page. The SonarQube adapter follows one
validated dashboard sequence: Home (authenticating through the SonarQube login
page using the project's configured Jenkins credentials if redirected),
Overall with `codeScope=overall`, then Issues for the same project identity.
Tests fulfill these exact browser URLs from the checked-in template files;
runtime opens them normally.

Visible findings are normalized, deduplicated, ordered, and capped. Missing or
malformed evidence, mismatched counts, disallowed links, and screenshot
failures remain warnings or incomplete source state; they are never fabricated
as success. Overall contributes provenance evidence, while Issues extraction is
limited to bounded Type and Severity facets.

The result and manifest record the validated Jenkins job page, capture
timestamp, source navigation, normalized evidence, warnings, and artifacts.
They do not fabricate trigger, queue, build-number override, or terminal
evidence. A project is `success` only when both configured source captures are
found with no warnings; a completed workflow with incomplete evidence is
`partial`; workflow or persistence failure is `failed`.

## Artifact lifecycle

Every project attempt receives an immutable run ID and is staged, validated,
and published under the configured report root:

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

Project and run IDs are validated before becoming path segments. Failure
artifacts use the same project/run identity without fabricating a Jenkins build
folder or status. Persistence is best-effort; the aggregate still records the
outcome when possible. Playwright test traces under `test-results/` are test
evidence, not vendor report evidence.

## Locking, cleanup, and server modes

The private report-root lease coordinates same-host work using token, PID,
hostname, acquisition timestamp, and expiry. It is not a distributed lock or
an authorization boundary. Stale recovery requires an expired same-host owner
whose PID is demonstrably dead; malformed, live-owner, foreign-host, and
symlinked locks fail closed.

Cleanup inspects only configured canonical report/staging roots, enforces
bounded age/entry/byte/removal budgets, refuses symlink traversal, and
preserves active, malformed, oversized, or ambiguous entries with warnings.

### Report Server (`npm run serve:report`)

`npm run serve:report` builds the launcher and serves an existing aggregate
under `reports/` by default (`127.0.0.1:4173`). It does not generate reports.
`REPORT_ROOT`, `REPORT_HOST`, `REPORT_PORT`, and explicit LAN opt-in control
serving only; the server is read-only, unauthenticated, and limited to
GET/HEAD below the canonical root.

### Control Server (`npm run serve:control`)

`npm run serve:control` builds and launches the interactive loopback control
dashboard (`127.0.0.1:4173`). It exposes:

- Safe config discovery (`GET /api/configs`) and atomic updates
  (`PUT /api/config`) with ETag and schema validation;
- Single-mode execution (`POST /api/run`) for `report` or `auto-build` runs;
- Run status and live logs (`GET /api/run`);
- Local immutable report links (`GET /reports/...`); and
- Presence-only credential status and guarded updates/deletes under
  `GET`/`PUT`/`DELETE /api/secrets`.

Control mode initializes `SecretStore` against the configured `configRoot`.
The secrets endpoint reads and writes only the fixed `secrets.local.json`
target. It returns `{ "secrets": { "<name>": true } }` for stored names;
`GET /api/secrets?keys=A,B` reports each requested valid name as `true` or
`false`. PUT accepts a single name/value or a non-empty secrets object; null
values and `action: "delete"` remove entries. DELETE accepts a `name` query or
JSON `name`/`names` body.

Control mode is restricted strictly to loopback (`127.0.0.1` / `localhost`) and
refuses LAN binding. The router checks the exact Host before dispatch. Every
mutation additionally requires an exact same-origin HTTP(S) Origin, accepted
`Sec-Fetch-Site`/`Sec-Fetch-Mode` values, the generated CSRF token, and
`application/json` (except bodyless DELETE). Bodies are capped at the 1 MiB
control limit. All responses set `Cache-Control: no-store`; secret values
never appear in API success or error responses.

The page's **Credentials** dialog derives a deduplicated, sorted key list from
the active configuration, then calls the filtered presence GET. It renders
blank password inputs with **Configured**/**Missing** badges. Save sends only
non-empty trimmed values through the CSRF-bearing JSON PUT; clear sends a
CSRF-bearing bodyless DELETE for one key. Successful save/clear and every
dialog close wipe input values, so the browser retains no submitted or
unsaved plaintext. Status text and API responses contain names/presence only.

When `POST /api/run` starts a control run, the run executor reads the current
SecretStore snapshot and merges it over the supplied base environment without
mutating `process.env`. It passes that `runtimeEnvironment` to both report and
auto-build executors. Control logs, warnings, errors, and auto-build result
URLs are redacted with all non-empty stored values before persistence.

### Template Server (`npm run serve:templates`)

`npm run serve:templates` builds the project and launches the standalone template mock HTTP server on loopback (`127.0.0.1:4174` by default). It serves offline template fixtures (Jenkins job pages, parameterized build, Snyk evidence, and SonarQube dashboards/issues) dynamically in memory for interactive browser preview and offline test runs.

The server operates on its own origin/port (`4174`) completely separated from the Control Server (`4173`) to maintain strict Same-Origin Policy isolation. Configurable via `--host` (`TEMPLATE_HOST`, default `127.0.0.1`) and `--port` (`TEMPLATE_PORT`, default `4174`). Graceful shutdown is wired to SIGINT and SIGTERM.

#### Developer Hub Index Page (`GET /`, `GET /index.html`)

The template server exposes a built-in Developer Hub index page on `GET /` and `GET /index.html` (along with `HEAD`), generated by [`buildDeveloperHubHtml`](file:///G:/ws/sharing/auto-jobs/src/templates/template-server.ts#L78) from [`DeveloperHubEndpoints`](file:///G:/ws/sharing/auto-jobs/src/templates/template-server.ts#L51). It provides a responsive dark-themed dashboard indexing all 9 offline fixture endpoints categorized with service badges, descriptions, and dynamic origin links:
- **Jenkins**:
  - `Jenkins Login`: authentication entrypoint (`/login`)
  - `Jenkins Job Page`: main project page linking reports and builds (`/job/template-fixture-job/`)
  - `Jenkins Build (Parameterized)`: build parameter form with trigger action (`/job/template-fixture-job/build?delay=0sec`)
- **Snyk**:
  - `Snyk Report`: vulnerability scan HTML report artifact (`/snyk-report.html`)
  - `Snyk Summary (JSON)`: raw JSON summary of SCA findings and severity counts (`/snyk-summary.json`)
- **SonarQube**:
  - `SonarQube Login`: authentication entrypoint (`/sessions/new`)
  - `SonarQube Home`: project dashboard (`/dashboard?id=template-fixture-project`), guarded until authenticated
  - `SonarQube Overall`: overall code quality metrics (`/project/overview?id=template-fixture-project`)
  - `SonarQube Issues`: issue list with severity facets (`/project/issues?id=template-fixture-project&resolved=false`)

Security and delivery specifications:
- Pre-buffered in UTF-8 memory during [`createTemplateServer`](file:///G:/ws/sharing/auto-jobs/src/templates/template-server.ts#L433) startup for zero per-request render overhead.
- Strict security headers: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store, must-revalidate`.
- Defends against XSS via HTML escaping and safe URL validation (`validateSafeHubUrl`), rejecting non-HTTP/HTTPS schemes such as `javascript:` or `data:`.

#### Template Server Validation & Integration (Phase 05)

The standalone template mock server and its accompanying configuration are validated via [`tests/e2e/template-server-integration.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/e2e/template-server-integration.spec.ts), executed through [`playwright.template.config.ts`](file:///G:/ws/sharing/auto-jobs/playwright.template.config.ts).

The test harness exercises the following architectural boundaries:
- **Smoke test automation**: Browser navigation across the Developer Hub and all 9 mock fixture endpoints, verifying HTTP 200/302 status codes, expected HTML/JSON contents, and absence of browser console errors.
- **Session authentication guarding**: Simulates SonarQube's authentication lifecycle where unauthenticated visits to `/dashboard` serve the login page until a form POST on `/sessions/new` marks the session authenticated.
- **URL path encoding preservation**: Ensures double-encoded slash sequences (`%252F`) in Jenkins job paths round-trip accurately through Node.js HTTP request parsing without double-decoding defects.
- **Server process isolation**: Confirms Control Server (`4173`) and Template Server (`4174`) bind and run concurrently on loopback without port collisions or cross-origin interference.
- **Schema-v1 config validation**: Validates [`config/projects.template.json`](file:///G:/ws/sharing/auto-jobs/config/projects.template.json) parsing and normalization through `loadProjectConfig`, confirming proper mapping of `TEMPLATE_FIXTURE_USERNAME` and `TEMPLATE_FIXTURE_PASSWORD`.
- **End-to-end report collection**: Dispatches `runConfiguredProjects` against the live HTTP template server, confirming creation of compliant `reports/template-fixture-service/{run-id}/` report artifacts (`index.html`, `data.json`) containing parsed Snyk and SonarQube evidence.
- **Auto-build execution**: Dispatches `runAutoBuildProject` against the live HTTP template server, validating form submission and 302 redirect.
- **Control Page UI integration**: Mounts `projects.template.json` within the Control Dashboard UI, asserting clean project card rendering with zero cross-origin or CSP security violation console errors.

### Control Dashboard Atomic Design Components and Contract Fidelity

The Control Dashboard frontend refactor implements Atomic Design principles, cleanly separating presentational UI components from stateful hooks while ensuring 100% contract fidelity with existing Playwright E2E tests:

1. **Styling and class resolution**:
   - [`globals.css`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/styles/globals.css) binds Tailwind base, components, and utility layers with theme custom properties mapped from legacy control CSS (`--bg-color`, `--card-bg`, `--text-main`, `--text-muted`, `--border-color`, `--primary`, `--secondary`, `--danger`, `--focus-ring`, `--mono-font`). It declares high-contrast `:focus-visible` outlines, accessible skip links (`.skip-link`), hidden utilities (`.visually-hidden`, `.hidden`), and reduced motion overrides (`@media (prefers-reduced-motion: reduce)`).
   - [`cn`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/utils/cn.ts#L4) (`utils/cn.ts`) integrates `clsx` and `twMerge` to eliminate Tailwind class conflicts while allowing legacy class selectors to pass through unimpeded.

2. **Atomic UI Primitives ([`components/atoms/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/))**:
   - [`Badge`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Badge.tsx#L31): Renders `<span className="badge badge-{variant}">`. Supports run lifecycle variants (`idle`, `queued`, `running`, `succeeded`, `failed`, `unknown`, `submission-unknown`), credential states (`configured` -> `badge-configured`, `missing` -> `badge-missing`), and browser setting states (`not-set` -> `badge-missing` class with `"Not Set"` label). Supports `forwardRef` and custom children.
   - [`Button`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Button.tsx#L5): Renders accessible button elements (`type="button"`) with variant classes (`btn-primary`, `btn-secondary`, `btn-danger`, `btn-outline`), compact sizing (`btn-sm`), disabled/loading state handling with accessible spinner, and arbitrary `data-*` attribute pass-through.
   - [`Input`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Input.tsx#L5): Form input wrapper supporting `text` and `password` types, `htmlFor` label linkage, `role="alert"` error announcements with `aria-invalid="true"`, and secure defaults (`autoComplete="off"`, `spellCheck={false}`).
   - [`Select`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/Select.tsx#L5): Native `<select>` wrapper supporting options arrays or child nodes, optional field labels, and `aria-label`.
   - [`StatusBanner`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/StatusBanner.tsx#L5): Displays top-level notification alerts (`<div id="status-banner" role="status" aria-live="polite">`) with `info`, `success`, and `error` styling, hidden via `.hidden` when inactive.
   - [`LoadingIndicator`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/atoms/LoadingIndicator.tsx#L5): Renders polite status updates (`aria-live="polite"`) with `.credentials-loading` styling and visibility toggling.

3. **Molecular Compound Components ([`components/molecules/`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/))**:
   - [`CredentialRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/CredentialRow.tsx#L8): Renders credential configuration rows matching the exact legacy DOM hierarchy: `.credential-row` wrapper, `.credential-field` label with dynamic `for="secret-input-${key}"` and `Badge`, and `.credential-input-group` containing password `<input id="secret-input-${key}" class="credential-input" autocomplete="off">`. When configured, exposes `<button class="btn btn-secondary btn-sm btn-clear-credential" data-key="{key}">Clear</button>`.
   - [`BrowserSettingRow`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/BrowserSettingRow.tsx#L28): Renders browser setting controls adhering to exact test IDs for headless selection (`#badge-browser-headless`, `#browser-headless-select`, `#btn-clear-browser-headless`) and executable path input (`#badge-browser-executable-path`, `#browser-executable-path-input`, `#btn-clear-browser-executable-path`).
   - [`ConfigSelectorBar`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx#L7): Controls active configuration selection (`<select id="config-select">`), reload action (`#btn-reload`), save action (`#btn-save`, disabled unless `isDirty`), and modal open triggers (`#btn-credentials`, `#btn-browser-settings`).
   - [`LogViewer`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/LogViewer.tsx#L23): Streaming run log output `<pre id="run-logs" role="log" aria-live="polite" class="log-pre">`, formatting string logs or `RunLogEntry[]` timestamped records and auto-scrolling to the latest log output.
   - [`RunResultBox`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/molecules/RunResultBox.tsx#L5): Execution outcome box `<div id="run-result-box" class="run-result-box">`, displaying validated report links matching `/reports/`, Jenkins build links, and error diagnostics (`.run-error-msg`).

4. **Contract Fidelity Guarantees**:
   - **DOM ID and Class Compatibility**: Every element ID, class token, and `data-*` attribute targeted by Playwright test locators is preserved without modification.
   - **Raw JSON Editor Preservation**: The configuration editor retains a standard `<textarea id="raw-json-textarea">` to ensure native Playwright `.fill()` and `.textContent` operations succeed without complex DOM interceptors.
   - **Accessibility**: Includes explicit ARIA roles (`role="status"`, `role="log"`, `role="alert"`), `aria-live="polite"` live regions, and `label[for]` associations.
   - **Zero Leakage**: Credential inputs enforce `type="password"`, `autoComplete="off"`, and input value clearing on submission, clear, and dialog closure.

5. **Compound Organisms and Page Assembly (Phase 04)**:
   - Integrates atomic primitives and molecules into feature-complete panels: [`HeaderBar`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/HeaderBar.tsx), [`ProjectsGrid`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/ProjectsGrid.tsx), [`ProjectCard`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/ProjectCard.tsx), [`ExecutionSection`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/ExecutionSection.tsx), [`RunStatusCard`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/RunStatusCard.tsx), [`RawJsonSection`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/RawJsonSection.tsx), [`CredentialsDialog`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/CredentialsDialog.tsx), [`BrowserSettingsDialog`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/BrowserSettingsDialog.tsx), and [`BuildConfirmDialog`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/organisms/BuildConfirmDialog.tsx).
   - Layout template ([`DashboardLayout`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/templates/DashboardLayout.tsx)) provides structure with skip links and alert regions.
   - Page view ([`DashboardPage`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/pages/DashboardPage.tsx)) and Root ([`App`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/App.tsx), [`ErrorBoundary`](file:///G:/ws/sharing/auto-jobs/src/reporting/control-page/components/ErrorBoundary.tsx)) integrate hooks for unified state management.

6. **Phase 06 Legacy Cleanup**:
   - Completely removed legacy imperative files: `src/reporting/control-page/control-page.js`, `control-page.html`, and `control-page.css`.
   - The loopback dashboard frontend is 100% React, compiled via Vite into `.runner-build/reporting/control-page/` (`index.html`, `assets/control-page.css`, `assets/control-page.js`).
   - `scripts/copy-report-assets.mjs` stages only `report.css`.

### Configuration form builder and Dashboard integration (Phases 02–03)

`ConfigFormBuilder` is a document-controlled organism that composes the
`ConfigProjectEditor` and `ConfigDefaultsEditor` molecules. The project editor
edits project fields and credential environment-variable references, with
project references inheriting defaults when overrides are absent. The defaults
editor handles timeout, browser, artifact directory, and default credential
references. Credential inputs accept variable names only; they do not accept
secret values.

`useConfigDocumentEditor` separates document/raw-JSON synchronization, dirty
state, validation, raw JSON Apply, and document mutations from
`useConfigManager`. The immutable add, update, remove, and defaults transitions
are in `hooks/config-document-transitions.ts`. Both this browser editor and the
runtime config loader use the browser-safe `assertProjectConfigDocument`
boundary in `src/config/project-config-schema.ts`. `useConfigManager` retains
configuration listing/loading and the existing API save flow, including the
current ETag in `If-Match` and conflict handling.

`DashboardPage` supplies `ConfigFormBuilder` and `RawJsonSection` to
`DashboardLayout`; the builder-first grid uses two columns at desktop (`lg`) and
stacks on mobile. Both are wired to `useConfigManager`: the form receives
manager-owned document state and mutation actions, while the raw editor receives
its JSON draft and Apply action. Form mutations update the document and
regenerate formatted JSON. Raw edits remain a draft until explicit
**Apply & Validate**; invalid JSON or configuration leaves the current form
model unchanged. Existing `#raw-json-textarea` and `#config-select` selectors
remain. This Phase 03 integration does not change configuration APIs, the
save/ETag (`If-Match`) flow, run behavior, or credential behavior.

## Test and release boundary

The deterministic order is `npm ci`, `npm run install:browsers`,
`npm run typecheck`, `npm run build`, `npm run test:unit`,
`npm run test:e2e:templates`, `npm run test:control`, `npm run test:report`,
and `npm run test:release:webkit`. `npm run build` compiles TypeScript
CLI/server code to `.runner-build/`, bundles the Vite Control Dashboard into
`.runner-build/reporting/control-page/`, and copies `report.css` via
`scripts/copy-report-assets.mjs`. `npm run test:release` is the shorthand
for typecheck, build, unit, template, control, generated-report, and WebKit
gates. Template tests use exact-URL test-only routes and checked-in fixtures;
they do not claim live Jenkins or vendor execution. Runtime smoke validation
requires an authorized project JSON and injected credentials and is never part
of the deterministic suite.

Phase 2, Phase 3, and Phase 03 focused unit coverage is in
`tests/unit/jenkins-build-trigger.spec.ts`,
`tests/unit/auto-build-runner.spec.ts`,
`tests/unit/template-build-fixture.spec.ts`, and the report-selection
assertions in `tests/unit/sequential-runner.spec.ts`. Phase 01 control asset
routing coverage in `tests/unit/control-assets-routing.spec.ts` verifies built
asset loading from `.runner-build/reporting/control-page/`, CSRF replacement and
escaping, non-empty CSS/JS assets, and loopback HTTP security headers.
Phase 02 control hooks and interface contracts coverage in
`tests/unit/control-hooks-and-types.spec.ts` verifies credential variable discovery,
CSRF auto-injection, run poller exponential backoff and terminal state transitions,
and end-to-end hook integration with loopback config, secrets, and run APIs.
Phase 03 atomic design components coverage in
`tests/unit/control-atomic-components.spec.ts` verifies 21 unit checks across
all atom primitives (`Badge`, `Button`, `Input`, `Select`, `StatusBanner`, `LoadingIndicator`)
and compound molecules (`CredentialRow`, `BrowserSettingRow`, `ConfigSelectorBar`,
`LogViewer`, `RunResultBox`), verifying DOM ID and CSS class fidelity, accessibility
roles/live regions, disabled/loading states, and data attribute bindings.
Phase 03 run-environment coverage is in
`tests/unit/control-run-executor-secrets.spec.ts`; its fixture helpers are in
`tests/unit/control-run-executor-fixture.ts`. It proves SecretStore injection
for report and auto-build runs, stored-over-base environment precedence,
non-mutation of the base environment, and redaction of logs, warnings, errors,
and manager-level run output.

Phase 04 control-page coverage and Phase 05 browser verification use
`tests/e2e/control-page.spec.ts`. The control suite proves config/run/UI
behavior, accessible credential management, dynamic key discovery,
Missing/Configured transitions, guarded save/clear operations, persistence
after reload, injected-credential execution, browser settings management,
and zero leakage from cleared inputs, page HTML, and run logs. Its four scenarios
run in Chromium and WebKit, producing eight E2E checks.

Phase 05 SecretStore/API unit additions are
`tests/unit/control-secret-store.spec.ts` and
`tests/unit/control-secrets-api.spec.ts`. The first has seven isolated
lifecycle checks; the second has ten operation checks. The security suite
continues to cover plaintext redaction, Host/Origin/Fetch Metadata/CSRF gates,
bounded JSON validation, content-type handling, unsupported methods, and
store-availability errors.

Phase 06 legacy cleanup removed all legacy control page files (`control-page.js`,
`control-page.html`, `control-page.css`). Deterministic unit suites include 292
passed checks (including 21 atomic component tests), 8/8 control E2E checks,
zero secret leakage, and zero TypeScript errors. None of these deterministic
checks contacts a live Jenkins controller or vendor service.

