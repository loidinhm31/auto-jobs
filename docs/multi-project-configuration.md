# Multi-project configuration

The V1 runner reads one schema-versioned JSON document and executes enabled
projects sequentially. Project IDs are lower-case filesystem-safe identifiers;
the runner creates immutable `reports/<project>/<build>/<run>/` directories.

```json
{
  "schemaVersion": 1,
  "defaults": {
    "credentials": {
      "usernameVariable": "JENKINS_USERNAME",
      "passwordVariable": "JENKINS_PASSWORD"
    },
    "artifactDir": "reports",
    "browser": "chromium"
  },
  "projects": [
    {
      "id": "service-a",
      "name": "Service A",
      "baseUrl": "https://jenkins.example/jenkins",
      "jobPath": "service-a",
      "snyk": { "reportPath": "artifact/snyk-results.html", "projectId": "service-a" },
      "sonarqube": { "homeUrl": "https://sonarqube.example/dashboard?id=service-a" }
    }
  ]
}
```

Set `PROJECTS_CONFIG_PATH` to the document. Credentials are environment
variable names, never credential values. A project may override the default
references with `credentialVariables: { "username": "SERVICE_A_USER",
"password": "SERVICE_A_PASSWORD" }`. Keep those values in the CI secret
store or local shell environment; do not put them in JSON, fixtures, traces,
screenshots, or reports.

`enabled: false` keeps a project in the document without executing it. The
enabled sequence is the execution order. The aggregate report records every
outcome and keeps going after a project failure; the CLI exits nonzero if any
project failed.

V1 keeps the accepted sequential, single-process invariant: enabled projects
run one at a time in configuration order through one runner/browser process,
with a fresh context for each project. Atomic aggregate publication is not a
cross-process lock. Deployments that share one report root between invocations
must serialize those invocations; concurrent aggregate writers are unsupported.

All enabled projects use one browser in a sequential run. `browser` defaults to
`chromium`; Firefox and WebKit require explicit selection. The fixture gate
passed 3/3 in Chromium and 3/3 in Firefox. Default Firefox fallback coverage is
a deferred/accepted residual. WebKit is unavailable on this host because
`libicu74` and `libjpeg-turbo8` are unavailable.

For the disposable Compose controller, use
`playwright-vulnerability-report` as the parameterized fail-closed control. Its
`FIXTURE_VARIANT` values are `pass`, `failed`, `empty`, and `malformed`; the
`Build with Parameters` control is detected before interaction. Use
`playwright-vulnerability-report-build-now` for the minimal non-parameterized
Build Now correlation path. Both jobs are seeded on the same controller and
use the same compact fixture corpus: `reports/manifest.json`, semantic Snyk
HTML/JSON, and SonarQube home/Overall/Issues HTML plus JSON. Variants may
intentionally remove or replace publisher files, while the Build Now job uses
the normal corpus.

The configuration contract does not close remote/live vendor capture, pre-build
failure aggregation, whole-directory rollback, or staging/temp-root
enumeration; each is a deferred/accepted residual. Pre-build failures remain
sanitized project outcomes without a build-linked report, and publication
rollback is file-scoped. See [Release gates](./release-gates.md) for the exact
final Phase 7 evidence and release boundary.
