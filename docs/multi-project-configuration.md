# Multi-project configuration

The Jenkins source reads one schema-v1 JSON document, normalizes its enabled
projects, and exposes explicit report and auto-build execution boundaries.
Mode is never inferred from a URL, selector, CLI name, or environment. The
configuration contract is implemented in `src/config/` and consumed by
`src/runner.ts` (report) or `src/project/auto-build-runner.ts` (auto-build).

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
| `selectReportProjects(projects)` | Returns a frozen list of enabled projects whose normalized `runType` is `report`; disabled and `auto-build` entries are excluded. Throws a configuration error when none remain. |
| `selectAutoBuildProject(projects, projectId)` | Matches one project by exact, non-empty `id`; returns it only when enabled and normalized as `auto-build`. Missing, disabled, and `report` projects are rejected. |

Both helpers are exported from `src/config.ts` and are side-effect free. They
do not rewrite a project's mode, infer a target from `jobUrl`, or submit a
Jenkins request. Callers must choose one helper and one executor; report
collection and the auto-build side effect remain separate.

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

### Credentials

Use `credentials` with `usernameVariable` and `passwordVariable` to name the
environment variables containing a project's credentials. If omitted, the
loader uses `JENKINS_USERNAME` and `JENKINS_PASSWORD`. These credentials are
used for Jenkins authentication and are reused automatically for SonarQube
authentication if the SonarQube dashboard redirects to its login page
(`/sessions/new`). Neither the JSON nor its selectors may contain secret
values.

```json
{
  "schemaVersion": 1,
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

#### Local SecretStore and control API (Phases 01–02)

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
Run executors still resolve caller-provided environment values; SecretStore
environment injection is a later phase.

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

The loader validates the JSON before a browser is launched. A file is a
regular JSON file no larger than 1 MiB. Timeouts, origins, selectors, artifact
identities, and report data are bounded. Enabled projects must share one
browser and one global `artifactDir` for the sequential runner.

## Execution and output

Run file mode explicitly:

```sh
npm run report -- --config config/projects.example.json
```

The command above is illustrative only until the `.invalid` placeholders in
the example are replaced. Provide the environment variables named by the
document separately. The CLI exits nonzero if a project fails, while the
aggregate keeps outcomes for projects that did complete. A failed publisher
capture is represented as `partial`; a workflow or persistence failure is
`failed`.

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

## Sequential and mode boundaries

Enabled report projects run one at a time through one browser process, with a
fresh Playwright context and one absolute workflow deadline per project. Each
project authenticates through its exact `loginUrl`, opens its exact `jobUrl`,
discovers publisher destinations once, and captures the configured Snyk and
SonarQube evidence. There is no job search, trigger, queue/build correlation,
terminal polling, or build-number path in this report workflow.

`runFromConfig` calls `selectReportProjects` before `runConfiguredProjects`, so
`npm run report` never invokes an auto-build project even when both modes are
present in the same file.

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
queue/build, retries after an observed POST, or writes report artifacts. The
current report CLI has no auto-build command; a future control-plane caller
must preserve these selection and confirmation boundaries.

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
