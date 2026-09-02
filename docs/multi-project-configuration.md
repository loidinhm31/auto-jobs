# Multi-project configuration

The Jenkins source reads one schema-v1 JSON document, normalizes its enabled
projects, and exposes an explicit run-mode contract. Mode is never inferred
from a URL, selector, CLI name, or environment. The current implementation is
in `src/config/project-config-schema.ts`, `src/config/project-config-loader.ts`,
`src/config/project-run-selection.ts`, and `src/runner.ts`.

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

Both helpers are exported from `src/config.ts`. They do not rewrite a
project's mode, infer a target from `jobUrl`, or trigger Jenkins actions.
Callers must choose one helper and one executor; the Phase 01 contract keeps
report collection separate from the auto-build side effect.

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

## Sequential and lock boundaries

Enabled projects run one at a time through one browser process, with a fresh
Playwright context per project and one absolute workflow deadline per project.
Each project authenticates through its exact `loginUrl`, opens its exact
`jobUrl`, discovers publisher destinations once, and captures the configured
Snyk and SonarQube evidence. There is no job search, trigger, queue/build
correlation, terminal polling, or build-number path.

`runType: auto-build` does not cause a build in this report workflow. The mode
is acted on only when a caller selects the project with
`selectAutoBuildProject`; Phase 01 adds no trigger, queue, polling, or build
submission behavior. A report dispatcher should pass only
`selectReportProjects(...)` to the report executor.

The schema has no source switch, existing-build mode, job-page override, build
identity, or polling environment inputs. These are intentionally absent from
the direct workflow contract.


## Offline capture fixtures

Offline fixture tests read eight bounded inputs: the Jenkins job and login
snapshots, Snyk HTML and summary JSON, and SonarQube login, home, Overall, and
Issues HTML. They install bounded Playwright context routes at a synthetic
origin and invoke the same capture, normalization, artifact, and rendering
workflow. No Jenkins controller, pipeline, vendor service, or Jenkins
credential is needed. These fixtures are test inputs, not report CLI source
modes.

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
