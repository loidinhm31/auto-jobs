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

V1 keeps the accepted sequential project invariant: enabled projects run one at
a time in configuration order through one runner/browser process, with a fresh
context for each project. The local/same-host V1 lifecycle and report-root lock
residuals are closed: a private same-host/same-UID lease serializes concurrent
invocations through discovery and aggregate publication, with bounded stale
recovery. Distributed filesystems and uncoordinated foreign-host writers
remain unsupported.

All enabled projects use one browser in a sequential run. `browser` defaults to
`chromium`; Firefox and WebKit require explicit selection. The fixture gate
passed 3/3 in Chromium and 3/3 in Firefox, including the default safe-page
fallback. WebKit is unavailable on this host because `libicu74` and
`libjpeg-turbo8` are unavailable; use the pinned Ubuntu runner.

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

The configuration contract does not close remote/live vendor capture. Remote/live
Snyk/SonarQube capture and the optional Jenkins contract remain opt-in and
blocked here without an authorized endpoint and trusted CI secret-store access.
Pre-build failures remain sanitized project outcomes without a build-linked
report. Whole-directory publication rollback, bounded staging/temp-root
recovery, aggregate crash recovery, and same-host locking are closed within V1;
bounded preservation still keeps malformed, oversized, symlinked, active, and
ambiguous entries. See [Release gates](./release-gates.md) for the exact current
commands, counts, artifact paths, and release boundary.

Current continuation evidence is 130 unit + 5 Chromium and 130 unit + 5
WebKit; Jenkins is 13 E2E + 1 expected skip; Build Now is 1/1; and the focused
regression is 22/22. Generated evidence paths are the ignored
`playwright-report/index.html`, `test-results/`, and `.runner-build/`; they are
not release inputs.

Historical Phase 2/4 findings are resolved or explicitly accepted at the
architecture boundary. The remaining V1 acceptance is owned by the runner
maintainers, dated 2026-08-25, and must be reviewed/expired by 2026-09-25 and
before any remote/live or untrusted-input enablement. The pinned Ubuntu WebKit
runner and digest are unchanged:
`mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
Direct host WebKit remains unsupported on this Fedora host.
