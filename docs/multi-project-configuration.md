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

## Offline template report (default)

The normal report command consumes the checked-in template snapshots directly.
It runs Playwright against bounded synthetic-origin context routes, so the
Jenkins controller and vendor credentials are not needed:

```sh
ARTIFACT_DIR=reports \
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' \
npm run report
```

Open `reports/index.html`. The project run contains the normalized Snyk
summary/detail findings, SonarQube Type/Severity facets, provenance, and the
three source screenshots. The checked-in Snyk summary and six visible detail
cards now agree at `2/4` critical/high, and the page metadata reports six
vulnerabilities and six vulnerable dependency paths. The separate archived
Jenkins fixture also remains consistent at `0/1/2/1` with four findings.

## Authorized live Jenkins report

Recreate the disposable controller after changing Docker fixtures so the
container receives the current files:

```sh
JENKINS_PORT=18080 docker compose up --build -d jenkins
```

From the directory where the report should be written (for example `tmp/`),
run the legacy compatibility path with vendor identities separate from the
runner project ID:

```sh
ARTIFACT_DIR=reports \
JENKINS_BASE_URL=http://127.0.0.1:18080 \
JENKINS_JOB_PATH=playwright-vulnerability-report-build-now \
JENKINS_USERNAME=local-admin \
JENKINS_PASSWORD=local-fixture-password \
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' \
SNYK_PROJECT_ID=service-a SONARQUBE_PROJECT_ID=service-a \
REPORT_SOURCE=jenkins npm run report
```

The expected local result is `local-build-now: success`. This is the explicit
live-Jenkins path; the default command above does not use the pipeline or
controller. Open
`reports/index.html` (or serve `reports/` over HTTP) and follow the run link.
`reports/<project>/<build>/<run>/` contains normalized `data.json`,
`manifest.json`, local screenshots, and generated HTML. `test-results/`
belongs only to Playwright test-runner output; it is ignored and is not the
application report root. The saved files under `templates/` are consumed as
bounded source snapshots in offline mode, but are not copied as production
HTML/CSS into reports. Generated reports use
the local `reports/assets/report.css` stylesheet and retain only normalized
vendor evidence plus requested screenshots.

The configuration contract does not close remote/live vendor capture. Remote/live
Snyk/SonarQube capture and the optional Jenkins contract remain opt-in and
blocked here without an authorized endpoint and trusted CI secret-store access.
Pre-build failures remain sanitized project outcomes without a build-linked
report. Whole-directory publication rollback, bounded staging/temp-root
recovery, aggregate crash recovery, and same-host locking are closed within V1;
bounded preservation still keeps malformed, oversized, symlinked, active, and
ambiguous entries. See [Release gates](./release-gates.md) for the exact current
commands, counts, artifact paths, and release boundary.

Current continuation evidence (2026-08-26) is 152 unit + 5 Chromium and 152
unit + 5 WebKit (including the template-backed runner); Jenkins is 152 unit +
15 E2E + 1 expected skip; Build Now is 1/1; and the focused edge regression is
60/60 plus the delayed-publisher browser regression 1/1. With the default
`ARTIFACT_DIR`, generated evidence paths are the ignored
`reports/`, `.report-runtime-*`, `playwright-report/index.html`,
`test-results/`, and `.runner-build/`; they are not release inputs. The report
command cleans its per-run `.report-runtime-*` directory on normal completion
and bounds stale-directory pruning after an interrupted process. The package
also disables Node's optional compile cache for its managed children. If the
Node 24/npm 11 parent process fails before a script starts because its default
`/tmp/node-compile-cache` is quota-constrained, prefix the command with
`NODE_DISABLE_COMPILE_CACHE=1`; package scripts cannot change the parent after
it has started.

Historical Phase 2/4 findings are resolved or explicitly accepted at the
architecture boundary. The remaining V1 acceptance is owned by the runner
maintainers, dated 2026-08-25, and must be reviewed/expired by 2026-09-25 and
before any remote/live or untrusted-input enablement. The pinned Ubuntu WebKit
runner and digest are unchanged:
`mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
Direct host WebKit remains unsupported on this Fedora host.
