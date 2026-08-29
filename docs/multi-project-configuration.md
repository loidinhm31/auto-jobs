# Multi-project configuration

The Jenkins source reads one schema-v1 JSON document, normalizes its enabled
projects, and runs them sequentially in configuration order. The current
implementation is in `src/config/project-config-schema.ts`,
`src/config/project-config-loader.ts`, and `src/runner.ts`.

## Source selection

`REPORT_SOURCE` accepts `templates` or `jenkins` and defaults to `templates`.

- Template mode creates its own synthetic schema-v1 project from the checked-in
  files under `templates/`. It does not parse `PROJECTS_CONFIG_PATH`, use
  Jenkins credentials, or contact Jenkins.
- Jenkins mode calls the project-config loader. In this mode,
  `PROJECTS_CONFIG_PATH` is honored and selects file mode; when it is absent,
  legacy environment inputs are adapted into one project.

File mode and legacy structural inputs are mutually exclusive. Do not set
`PROJECTS_CONFIG_PATH` together with inputs such as `JENKINS_BASE_URL`,
`JENKINS_JOB_PATH`, `JENKINS_BUILD_NUMBER`, or `ARTIFACT_DIR`. Credential
environment variables referenced by the JSON are resolved at run time and are
not themselves configuration structure.

## Schema-v1 document

The root requires `schemaVersion: 1` and `projects` with one to 50 entries and
at least one enabled project. Each project requires:

- a unique lowercase filesystem-safe `id`;
- a display `name`;
- `baseUrl` (or the compatibility alias `jenkinsUrl`); and
- a relative `jobPath`.

`enabled: false` retains an entry without executing it. Optional project and
`defaults` fields cover `loginPath`, `triggerMode` (`ui` only), bounded
timeouts/poll intervals, `browser`, `artifactDir`, selectors, origin policy,
credential references, `buildNumber`, and source settings for `snyk` and
`sonarqube`.

The checked-in [projects.example.json](../config/projects.example.json) shows
two projects with source paths, source origins, identities, and per-project
credential references. A minimal valid document is also shown in the root
[README](../README.md).

The checked-in example uses `.invalid` placeholder hosts and is not a runnable
Jenkins configuration. Replace its Jenkins/vendor URLs and job paths with
authorized values before using it for a live collection.

### Credentials

Use either `credentials` with `usernameVariable`/`passwordVariable`, or the
compatibility `credentialVariables` shape with `username`/`password`. Both
shapes name environment variables; neither accepts secret values. If omitted,
the loader falls back to `JENKINS_USERNAME` and `JENKINS_PASSWORD`.

```json
{
  "schemaVersion": 1,
  "defaults": {
    "credentials": {
      "usernameVariable": "JENKINS_USERNAME",
      "passwordVariable": "JENKINS_PASSWORD"
    }
  },
  "projects": [
    {
      "id": "service-a",
      "name": "Service A",
      "baseUrl": "https://jenkins.example.invalid/jenkins",
      "jobPath": "service-a"
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
    "reportPath": "artifact/snyk-results.html",
    "projectId": "service-a"
  },
  "sonarqube": {
    "homeUrl": "https://sonarqube.example.invalid/dashboard?id=service-a",
    "projectId": "service-a"
  }
}
```

The snippet is an extension to a project entry, not a standalone document.
`reportPath` must remain within the Jenkins base context. `homeUrl` and all
observed redirects must be HTTP(S), credential-free, and within the Jenkins
base context or an explicit allowed origin. Origin values are bare origins,
not paths. Credential-like query keys/values, traversal, unsafe job paths,
queries/fragments in base URLs, and duplicate or invalid SonarQube project IDs
are rejected.

The loader validates the JSON before a browser is launched. A file is a regular
JSON file no larger than 1 MiB. Timeouts, poll intervals, origins, selectors,
artifact identities, and report data are bounded. Enabled projects must share
one browser and one global `artifactDir` for the sequential runner.

## Execution and output

Run file mode explicitly:

```sh
REPORT_SOURCE=jenkins \
PROJECTS_CONFIG_PATH="$PWD/config/projects.example.json" \
npm run report
```

The command above is illustrative only until the `.invalid` placeholders in
the example are replaced. Provide the environment variables named by the
document separately. The CLI
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
└── <project-id>/
    ├── <build-number>/<run-id>/
    │   ├── index.html
    │   ├── data.json
    │   ├── manifest.json
    │   └── requested screenshots
    └── pre-build/<run-id>/
        ├── data.json
        └── manifest.json
```

The `pre-build` location is used for failures before Jenkins provides a build
identity. It has no fabricated build number or build URL and normally has no
build-linked `index.html`. Failure persistence is best-effort: the runner
attempts to write bounded failure data, a manifest, diagnostics, and available
artifacts, but a write/render/publish failure can leave the outcome without a
complete run directory.

## Sequential and lock boundaries

Enabled projects run one at a time through one browser process, with a fresh
Playwright context per project and one absolute workflow deadline per project.
Existing-build mode performs no trigger action. Without `buildNumber`, Jenkins
V1 supports only a non-parameterized UI `Build Now`; parameterized jobs are
detected before interaction and rejected.

The runner uses a private report-root filesystem lease to serialize concurrent
work through discovery and aggregate publication. The owner record contains a
random token, PID, hostname, acquisition time, and expiry; it has no UID field.
Therefore “same-host/same-UID” is not an authorization guarantee. Recovery is
limited to an expired same-host owner whose PID is demonstrably dead (or a
bounded incomplete claim); foreign-host, malformed, live-owner, and symlinked
locks fail closed. Distributed filesystems and uncoordinated foreign-host
writers are outside V1.

Report and staging roots must be canonical, non-overlapping directories.
Project/build/run path segments are validated, temporary publication uses
atomic replacement/rollback, and cleanup inspects only the exact configured
roots within entry, byte, age, lease, and removal budgets. Unsafe, malformed,
active, oversized, symlinked, or ambiguous entries are preserved with bounded
warnings.

## Disposable Jenkins fixture

The Compose fixture seeds two jobs on one controller:

- `playwright-vulnerability-report` is parameterized with
  `FIXTURE_VARIANT=pass|failed|empty|malformed`. `pass` keeps the normal
  compact publisher corpus; `failed` archives it before returning a failed
  build; `empty` removes publisher directories; `malformed` substitutes
  malformed publisher files.
- `playwright-vulnerability-report-build-now` has no parameters and exercises
  the non-parameterized Build Now correlation path with the normal corpus.

Neither job runs a real Snyk or SonarQube scanner. The fixture archives
`reports/manifest.json`, Snyk HTML/JSON, and SonarQube home/overall/issues
HTML/JSON files. Use [docker-compose.yml](../docker-compose.yml) for startup;
its `JENKINS_PORT` value is the host port and maps to container port 8080.
`docker-compose.webkit.yml` is a separate browser gate and publishes no
ports.

Do not use fixture credentials outside disposable local development. Stop with
`docker compose down`; use `docker compose down -v` only when intentionally
discarding the named `jenkins_home` volume and its history.

## Offline template source

Template mode reads six bounded inputs: the Jenkins snapshot, Snyk HTML and
summary JSON, and SonarQube home, Overall, and Issues HTML. It installs bounded
Playwright context routes at a synthetic origin and invokes the same capture,
normalization, artifact, and rendering boundaries as the Jenkins workflow.
No Jenkins controller, pipeline, vendor service, or Jenkins credential is
needed. `PROJECTS_CONFIG_PATH` is not consulted in this mode.

The checked-in template Snyk page and summary describe six findings (critical
2, high 4); the Docker Jenkins fixture is a separate four-finding corpus
(critical 0, high 1, medium 2, low 1). These are fixture data, not live
service observations.

## Artifact and trace distinction

Application report artifacts are normalized `data.json`, contract-validated
`manifest.json`, generated `index.html` when a build-linked report can be
rendered, and requested Snyk/SonarQube screenshots. The Playwright test runner
uses `test-results/` (and the HTML/blob report locations selected by its
configuration) for test evidence. Its traces are test traces, not vendor
report evidence. An optional `trace.zip` name is accepted by the application
manifest allowlist only when it is actually supplied; do not assume it exists,
especially for a pre-build failure.

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
