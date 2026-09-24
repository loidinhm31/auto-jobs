# Multi-project configuration

The Jenkins source reads one schema-v1 JSON document, normalizes its enabled
projects, and exposes explicit report and auto-build execution boundaries.
Mode is never inferred from a URL, selector, CLI name, or environment. Direct
callers use the normalized configuration; loopback control runs additionally
overlay a per-run SecretStore snapshot before executor dispatch and expose the
Phase 04 credential modal for presence-only local management. Phase 05 verifies
the persistence, API, and browser contracts around that flow.
The optional top-level `reportWorkers` controls report batches and also bounds
Control API auto-build batches.

The configuration contract is implemented in `src/config/` and consumed by
`src/runner.ts` (report), `src/project/auto-build-runner.ts` (auto-build), or
`src/reporting/report-server-run-executor.ts` (control dispatch).

## Source selection

The report command always reads one explicit schema-v1 JSON document supplied
with `--config`. `runType` classifies a project for the caller's executor; it
is not a source-mode switch and does not select a configuration path.

Structural environment inputs such as `REPORT_SOURCE`,
`PROJECTS_CONFIG_PATH`, `JENKINS_BASE_URL`, `JENKINS_JOB_PATH`,
`JENKINS_BUILD_NUMBER`, and `ARTIFACT_DIR` are rejected. Credential
environment variables named by the JSON remain runtime secret inputs and are
resolved only when the referenced project runs.

## Schema-v1 document

The root requires `schemaVersion: 1` and `projects` with one to 50 entries and
at least one enabled project. Each project requires:

- a unique lowercase filesystem-safe `id`;
- a display `name`;
- an exact absolute HTTP(S) `loginUrl`; and
- an exact absolute HTTP(S) `jobUrl`.

`loginUrl` and `jobUrl` must be credential-free, fragment-free, and on the same
Jenkins origin and base context. `baseUrl`, `jobPath`, `loginPath`,
`triggerMode`, `buildNumber`, `captureFrom`, and other legacy structural keys
are not accepted.

`reportWorkers` is an optional top-level count for report batches and Control API
auto-build batches. It accepts integers 1–4, defaults to 1, and is not valid
under `defaults` or a project; schema-v1 remains unchanged. `ConfigStore` validates
the setting on read/write, so it follows the saved-document and ETag flow.
The Dashboard selector edits this saved value; the Run control stays disabled
until the document has been saved.


`enabled: false` retains an entry without executing it. Optional project and
`defaults` fields cover `timeoutMs`, `browser`, `artifactDir`, selectors,
origin policy, credential references, and source settings for `snyk` and
`sonarqube`.

## Run type and selection

Each project may set `runType` to exactly `'report'` or `'auto-build'`.
Omitting it is safe: normalization stores `runType: 'report'`. The field is
project-only; it is not accepted under `defaults`, and no environment setting
can configure it. Do not add `runType` to `defaults` or rely on environment
configuration to choose an executor. Unknown default keys are rejected by
schema validation, while environment configuration remains reserved for
credential values.

`enabled: false` always excludes a project from execution, regardless of its
`runType`. A mode-aware caller selects projects only after loading and
normalizing the document:

| Helper | Selection contract |
| --- | --- |
| `selectReportProjects(projects)` | Returns a frozen, configuration-ordered list of enabled normalized `report` projects; excludes disabled and `auto-build` entries and throws a configuration error when none remain. |
| `selectAutoBuildProjects(projects)` | Returns a frozen, configuration-ordered list of enabled normalized `auto-build` projects; excludes disabled and `report` entries and throws a configuration error when none remain. |
| `selectAutoBuildProject(projects, projectId)` | Matches one project by exact, non-empty `id`; returns it only when enabled and normalized as `auto-build`. Missing, disabled, and `report` projects are rejected. |

All three helpers are exported from `src/config.ts` and are side-effect free.
The list selectors only identify eligible projects; they do not run or queue
builds. None rewrites a project's mode, infers a target from `jobUrl`, or
submits a Jenkins request. Report collection and auto-build execution remain
separate.

## Selector configuration

`selectors` may be supplied in `defaults` and overridden per project. An
override is an object with a supported `kind` (`role`, `label`, `testId`,
`text`, or `css`), a non-empty `value`, an optional accessible `name`, and an
optional `required` boolean. Project values take precedence over defaults.
When `required` is omitted, it defaults to `true`.

The normalized selector set includes these defaults:

| Selector | Kind | Value | Name | Required |
| --- | --- | --- | --- | --- |
| `authLandmark` | `role` | `link` | `Manage Jenkins` | `true` |
| `sonarqubeReport` | `testId` | `sonarqube-report` | — | `true` |
| `snykReport` | `testId` | `snyk-report` | — | `true` |
| `buildParametersLink` | `role` | `link` | `Build with Parameters` | `true` |
| `buildSubmitButton` | `role` | `button` | `Build` | `true` |

The two build selectors are required configuration controls. An explicit
`required: false` override is rejected for either
`buildParametersLink` or `buildSubmitButton`; valid overrides must keep
`required: true`. Their runtime search scopes (`#side-panel` for the
parameter link and `#bottom-sticker` for the submit button) are fixed by the
Jenkins executor and are not configurable CSS.

For example, a defaults override can customize the visible labels while
retaining the invariant:

```json
{
  "selectors": {
    "buildParametersLink": {
      "kind": "role",
      "value": "link",
      "name": "Build with Parameters",
      "required": true
    },
    "buildSubmitButton": {
      "kind": "role",
      "value": "button",
      "name": "Build",
      "required": true
    }
  }
}
```

`selectors` is allowed in both `defaults` and a project entry; `runType` is
not. Unknown selector fields, malformed values, unsafe selector text, and
selector overrides that disable required controls are rejected before browser
launch.

The checked-in [projects.example.json](../config/projects.example.json) shows
an enabled `report` project and a disabled `auto-build` project, with exact
Jenkins URLs, source origins, identities, and per-project credential
references. A minimal valid document is also shown below.

The checked-in example uses `.invalid` placeholder hosts and is not a runnable
Jenkins configuration. Replace its Jenkins/vendor URLs with authorized values
before using it for a live collection.

The checked-in [projects.template.json](../config/projects.template.json) provides
a fully configured, runnable schema-v1 project targeting the local template mock
server (`http://127.0.0.1:4174`). It configures `template-fixture-service` with
mock Jenkins, Snyk, and SonarQube origins, references credential environment
variables `TEMPLATE_FIXTURE_USERNAME` and `TEMPLATE_FIXTURE_PASSWORD`, and sets
the SonarQube `projectId` matching offline fixtures. It is loaded automatically by
the Control Page configuration store and supports offline testing and preview.

### Credentials

Use `credentials` with `usernameVariable` and `passwordVariable` to name the
environment variables containing a project's credentials. If omitted, the
loader uses `JENKINS_USERNAME` and `JENKINS_PASSWORD`. These credentials are
used for Jenkins authentication and are reused automatically for SonarQube
authentication if the SonarQube dashboard redirects to its login page
(`/sessions/new`). Neither the JSON nor its selectors may contain secret
values.

File-mode and direct library calls resolve those names from their supplied
environment. In loopback control mode, the run executor reads the local
SecretStore snapshot and overlays it on the server's base environment, so a
stored value wins when it uses the same name as a base value. The merge is
per-run and does not mutate the caller environment or `process.env`.

```json
{
  "reportWorkers": 2,
  "defaults": {
    "credentials": {
      "usernameVariable": "JENKINS_USERNAME",
      "passwordVariable": "JENKINS_PASSWORD"
    },
    "timeoutMs": 300000,
    "browser": "chromium",
    "artifactDir": "reports"
  },
  "projects": [
    {
      "id": "service-a",
      "name": "Service A",
      "loginUrl": "https://jenkins.example.invalid/jenkins/login",
      "jobUrl": "https://jenkins.example.invalid/jenkins/job/service-a/",
      "runType": "report"
    }
  ]
}
```

Set the referenced names in the shell or CI secret store before running. Do
not put usernames, passwords, tokens, cookies, or credential-bearing URLs in
the JSON, source tree, traces, screenshots, or reports.

#### Local SecretStore and control API/UI (Phases 01–05)

Dynamic credential persistence is deliberately separate from the schema-v1
document. In control mode, `createReportServer` initializes
`createSecretStore(configRoot)` and fixes its target to
`<configRoot>/secrets.local.json`; the directory must already exist, be a real
directory, and not be a symlink. The filename is not configurable.

`secrets.local.json` is covered by the repository's `config/*.local.json`
ignore rule. Store content is a JSON object capped at 1 MiB. Keys must match
`/^[A-Za-z_][A-Za-z0-9_]{0,127}$/` and must not be `__proto__`,
`prototype`, or `constructor`; values must be strings. Missing or empty files
read as an empty map; malformed JSON, arrays, non-string values, invalid names,
oversized files, and non-regular/symlinked files fail closed.

The backend exposes `readSecrets`, `listSecretNames`, `putSecret`,
`putSecrets`, `deleteSecret`, and `deleteSecrets`. Reads return frozen
snapshots. Mutations perform a latest-file read/modify/write under an
in-process lock, sort keys, and atomically replace the target through an
exclusive sibling temporary file (`0o600`, sync, close, rename). Secret values
are never returned by a names-only listing or included in diagnostics. POSIX
mode bits are not a Windows ACL boundary; protect the config directory with
appropriate user/CI ACLs.

Control mode exposes the store through `ReportServerHandle` and
`ControlRouterContext`; `/api/secrets` is the HTTP boundary:

| Request | Contract |
| --- | --- |
| `GET /api/secrets` | Returns `200 { "secrets": { "NAME": true } }` for all stored names. |
| `GET /api/secrets?keys=NAME_A,NAME_B` | Validates each requested key and returns a filtered map where each value is `true` (present) or `false` (absent). |
| `PUT /api/secrets` | Accepts `{ "name": "NAME", "value": "VALUE" }` or a non-empty `{ "secrets": { "NAME": "VALUE" } }` patch; returns the full post-update presence map. |
| `DELETE /api/secrets?name=NAME` | Deletes one valid key and returns the full post-delete presence map. |
| `DELETE /api/secrets` | Accepts JSON `{ "name": "NAME" }` or `{ "names": ["NAME"] }`; returns the full post-delete presence map. |

PUT also accepts null values in a secrets object or `action: "delete"` in
the single-entry form to remove a key. The router checks the exact Host on
every request. PUT/DELETE additionally require the exact same-origin
HTTP(S) Origin, accepted `Sec-Fetch-Site`/`Sec-Fetch-Mode`, the generated
CSRF token, and `application/json` content type; bodies are bounded at 1 MiB.
Responses contain presence booleans only and set `Cache-Control: no-store`.
Control-run execution reads a current SecretStore snapshot, constructs a
fresh merged environment, and passes it to the selected report or auto-build
executor. Secret values are not included in the `/api/run` request or API
responses.

The loopback Control UI's **Credentials** dialog derives the deduplicated,
sorted variable names referenced by the active document (project references
before defaults, then `JENKINS_USERNAME`/`JENKINS_PASSWORD` fallbacks). It
requests `GET /api/secrets?keys=...` and renders only boolean presence badges
with blank password inputs. Non-empty trimmed replacements use the CSRF-bearing
JSON PUT; each Clear action uses the CSRF-bearing bodyless DELETE. Successful
save/clear and every close wipe input values, so status text, page HTML, and
API payloads never contain plaintext values.

#### Phase 05 verification

The dedicated `tests/unit/control-secret-store.spec.ts` suite runs against
isolated temporary directories and verifies missing/empty reads, atomic
`secrets.local.json` replacement with temporary-file cleanup, POSIX/Windows
permission handling, invalid and reserved key rejection, non-string value
errors without secret leakage, concurrent write preservation, and deletion or
bulk operations. `tests/unit/control-secrets-api.spec.ts` verifies boolean-only
presence maps, filtered reads, guarded single/batch updates, null/action
deletion, query/body deletion, persistence, and plaintext-free responses.

`tests/e2e/control-page.spec.ts` exercises the operator flow in Chromium and
WebKit: accessible dialog discovery, Missing/Configured badges, guarded save
and clear requests, persistence after close/reopen and reload, a failed run
before credentials are configured, and a successful run after
SecretStore-injected credentials. It asserts that submitted values are wiped
from inputs and absent from page HTML and run logs. The completed verification
recorded 7/7 SecretStore tests, 10/10 API operation tests, 248/248 unit tests,
and 6/6 control-page E2E checks (254/254 combined), with zero leakage
observed.

### Control-run environment injection (Phase 03)

`createReportServer` passes the control-mode `SecretStore` to
`createRunManager` through the optional `RunManagerOptions.secretStore`
dependency. When `POST /api/run` starts execution,
`report-server-run-executor.ts` reads one snapshot and creates:

```ts
const runEnv = { ...env, ...storedSecrets };
```

The merged `runEnv` is used for config normalization and passed as
`runtimeEnvironment` to `runConfiguredProjects` for report mode or
`runAutoBuildProject` for auto-build mode. This keeps SecretStore values out of
project JSON and avoids process-global environment mutation. A control run
uses the store values present at its execution snapshot; later API mutations
apply to later runs.

The executor collects all non-empty stored values as a redaction set. It
redacts `addLog` messages, report warnings, caught errors and stacks, and
auto-build `jobUrl`/`buildPageUrl` result fields before recording the run.
The report URL is derived from a validated local relative path. The direct
`npm run report` path remains environment-driven.

## Source settings and validation

Source settings are optional but useful for complete evidence:

```json
{
  "sourceOrigins": {
    "snyk": ["https://snyk.example.invalid"],
    "sonarqube": ["https://sonarqube.example.invalid"]
  },
  "snyk": {
    "projectId": "service-a"
  },
  "sonarqube": {
    "projectId": "service-a"
  }
}
```

The snippet is an extension to a project entry, not a standalone document.
`allowedOrigins` and `sourceOrigins` contain bare origins, not paths.
Observed redirects and publisher links must be HTTP(S), credential-free, and
within the Jenkins base context or an explicitly allowed origin. Credential-
like query keys/values, traversal, unsafe selectors, URL fragments, duplicate
IDs, and invalid project identities are rejected.

The loader validates the JSON before browser launch. The report CLI uses
`loadProjectConfigWithDocument` to read the file once and retain both the
validated document and normalized projects; `loadProjectConfig` keeps its
normalized-array return contract. A file is a regular JSON file no larger than
1 MiB. Timeouts, origins, selectors, artifact identities, and report data are
bounded. Projects selected for one report batch share a browser and an
`artifactDir`.


## Execution and output

Run file mode explicitly:

```sh
npm run report -- --config config/projects.example.json
```

The command above is illustrative only until the `.invalid` placeholders in
the example are replaced. Provide the environment variables named by the
document separately for file mode. Control-mode callers populate
`secrets.local.json` through the guarded `/api/secrets` API instead; the
control executor overlays that snapshot only for the selected run. The CLI
exits nonzero if a project fails, while the aggregate keeps outcomes for
projects that did complete. A failed publisher capture is represented as
`partial`; a workflow or persistence failure is `failed`.

The default report root is `reports/`, or the configured `artifactDir`. Each
run is immutable and uses:

```text
<artifactDir>/
├── index.html
├── aggregate-data.json
├── assets/report.css
└── <project-id>/<run-id>/
    ├── index.html
    ├── data.json
    ├── manifest.json
    └── requested screenshots
```

Success, partial, and failure attempts use the same project/run path. Failure
data includes the direct schema-3 state and bounded diagnostics; persistence
uses a bounded fallback after the workflow deadline and records a warning if
both persistence attempts fail.

## Bounded report pool and mode boundaries

`runFromConfig` reads the validated document and normalized projects together,
selects enabled `report` projects, and passes the saved `reportWorkers` value
to the runner. Omission means one worker. The count applies to the whole batch:
the runner starts `min(reportWorkers, selected projects)` fixed in-process
loops, with one browser and a fresh Playwright context plus absolute workflow
deadline per project. Direct `runConfiguredProjects` callers may instead pass
`workerCount`; the same 1–4 policy is checked before artifact initialization
or browser launch.

Workers claim the next project index synchronously and store outcomes in the
matching slot, so aggregate order remains the selected configuration order
regardless of completion order. A project rejection is recorded as a
failed/unallocated outcome; its worker continues with queued projects, and all
loops settle before the browser closes. One report-root lock remains held
through worker settlement, browser close, cleanup, manifest discovery, and
aggregate publication.

`runFromConfig` selects enabled report projects, so `npm run report` never
executes an auto-build project in a mixed document. It reads the config once
through `loadProjectConfigWithDocument`; CLI and Dashboard validation share
`assertProjectConfigDocument`.

The Dashboard's `ExecutionSection` action bar contains **Generate Reports (All
Enabled)** (`#btn-run-reports`), **Trigger Auto Build (All Enabled)**
(`#btn-run-auto-build`), and one shared **Workers** selector
(`#select-workers`, 1–4, default 1) backed by the document's top-level
`reportWorkers`. Changing the count updates raw JSON and marks the document
dirty; both actions require a successful ETag-protected Save before execution.
The report action selects all enabled report projects; the build action
immediately selects all enabled `auto-build` projects without `projectId`.
Project cards retain Enabled and Run Type editing but have no build trigger;
there is no per-build confirmation dialog. The same saved count bounds both
worker pools.

A report `POST /api/run` carries `configName`, `configEtag`, and `runType`.
Auto-build requests may omit `projectId` to select every enabled auto-build project or
supply one ID to select a single project. Neither mode accepts a request-level
`workerCount`; the API returns `422 INVALID_WORKER_COUNT`. After ETag validation,
the saved count goes to report execution and bounds control auto-build workers.


### Control auto-build batch API

`POST /api/run` requires `configName`, `configEtag`, and
`runType: 'auto-build'`; `projectId` is optional. Omission selects every enabled
normalized auto-build project; a non-empty ID selects only that project. A
blank/non-string ID returns `422 INVALID_PROJECT_ID`. Request-level
`workerCount` returns `422 INVALID_WORKER_COUNT`.

The saved `reportWorkers` setting (1–4, default 1) bounds concurrent projects;
the pool runs at most `min(reportWorkers, selected projects)` and retains config
order. A thrown project executor becomes `submission-unknown` with
`exitCode: 1`; sibling builds continue.

`POST` returns `202 { id, status }`; poll `GET /api/run?id=<id>`. The terminal
record includes every project outcome in `result.buildProjects`, including for
a single-project run. Run status is `succeeded` iff every outcome has
`exitCode === 0`; otherwise it is `failed`. Single-project results also retain
their scalar build summary fields.

### Explicit auto-build execution

An integration that intentionally performs a build must first normalize the
document, select one exact project, and then call the separate runner:

```ts
const project = selectAutoBuildProject(projects, projectId);
const outcome = await runAutoBuildProject(project);
```

`selectAutoBuildProject` rejects an empty or missing ID, an unknown project,
disabled projects, and projects whose normalized `runType` is `report`.
`runAutoBuildProject` additionally fails closed if the supplied project is
disabled or not `auto-build`; it resolves credential references, creates one
browser/context/page, applies one absolute deadline, and always performs
bounded cleanup.

The auto-build workflow opens the exact configured job, validates one visible
**Build with Parameters** link in `#side-panel`, validates one visible
**Build** button and `POST` form in `#bottom-sticker`, and clicks once. Its
result is one of `submitted`, `rejected`, `submission-unknown`, or
`failed-before-submit`. It never changes parameters, searches jobs, polls a
queue/build, retries after an observed POST, or writes report artifacts.
Control-mode auto-build uses the same runner through its bounded worker pool
and supplies the merged `runtimeEnvironment`; direct integrations supply their
own environment. The report CLI still has no auto-build command. The Control
API supports one selected project or the enabled batch when `projectId` is
omitted.

The schema has no source switch, existing-build mode, job-page override, build
identity, or polling environment inputs. These are intentionally absent from
the direct workflow contract.


## Offline capture fixtures

Offline fixture tests read nine bounded inputs: Jenkins job, login, and build
snapshots; Snyk HTML and summary JSON; and SonarQube login, home, Overall, and
Issues HTML. `loadTemplateReportFixture` validates saved identities, derives
the build page from the unique job-page link, rewrites approved URLs to a
synthetic origin, and invokes the same capture or auto-build workflow.

Fixture responsibilities are split across
`src/templates/template-fixture-types.ts`,
`src/templates/template-fixture-file-io.ts`,
`src/templates/template-fixture-html.ts`,
`src/templates/template-fixture-sonarqube.ts`,
`src/templates/template-fixture-build-validation.ts`,
`src/templates/template-fixture-loader.ts`, and
`src/templates/template-fixture-routes.ts`.
`src/templates/template-report-fixture.ts` is the public facade.

Routes fulfill only exact fixture `GET`/`HEAD` URLs, the Jenkins/SonarQube login
POST exceptions, and the exact build action `POST`. A build POST returns
`303 Location: <jobUrl>`; unknown methods/URLs abort and record sanitized
misses. No Jenkins controller, pipeline, vendor service, or credential is
needed. These fixtures are test inputs, not report CLI source modes.

The checked-in template Snyk page and summary describe six findings (critical
2, high 4). These are fixture data, not live service observations.

For standalone HTTP serving and Control Page execution, `npm run serve:templates`
hosts these fixtures at `http://127.0.0.1:4174`. The companion configuration
[config/projects.template.json](../config/projects.template.json) executes against
this server without requiring Playwright route interception. Opening `http://127.0.0.1:4174/`
or `http://127.0.0.1:4174/index.html` serves the Developer Hub index page, detailing all 9
mock endpoints across Jenkins, Snyk, and SonarQube with links and descriptions.

Phase 05 validates this integration end-to-end in
[`tests/e2e/template-server-integration.spec.ts`](../tests/e2e/template-server-integration.spec.ts):
- Verifies manual smoke test automation: Developer Hub rendering with security headers (`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`), browser navigation to all 9 endpoints, Jenkins form POST login redirects, SonarQube auth session guard, parameterized build form submission, and `%252F` double-encoded slash path preservation.
- Verifies concurrent execution of the Control Server (`127.0.0.1:4173`) and Template Server (`127.0.0.1:4174`) on distinct loopback ports without collision.
- Verifies schema-v1 loading and normalization of `config/projects.template.json`.
- Executes production report collection against the live template server, generating verified report artifacts (`data.json`, `index.html`) with exact Snyk (6 findings) and SonarQube facet evidence.
- Executes production auto-build workflow against the live template server, verifying `submitted` state with 302 redirect.
- Verifies Control Page UI renders the template project card from `projects.template.json` without cross-origin or CSP violations.

## Artifact and trace distinction


Application report artifacts are normalized `data.json`, contract-validated
`manifest.json`, generated `index.html`, and requested Snyk/SonarQube
screenshots. The Playwright test runner uses `test-results/` (and the
HTML/blob report locations selected by its configuration) for test evidence.
Its traces are test traces, not vendor report evidence. An optional
`trace.zip` name is accepted by the application manifest allowlist only when
it is actually supplied; do not assume it exists.

## Security boundary

The renderer escapes values and validates external links. The server sends a
restrictive CSP response header, refuses traversal/symlink escapes, and serves
only GET/HEAD from a canonical report root. Credentials and authentication
state are ephemeral; storage state and raw vendor HTML are not persisted.
Caller-managed permissions on report/staging roots are an operational choice,
not an authorization boundary: another same-host writer with access to the
root can race publication. Use a trusted isolated root for sensitive runs.

For the complete command and release boundary, see
[release-gates.md](./release-gates.md). This repository documentation does not
claim that a live Jenkins or browser execution has been run.
