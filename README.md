# Jenkins Playwright vulnerability reports

This project collects bounded Snyk and SonarQube evidence from configured
Jenkins job pages and writes static vulnerability reports. The report command
reads an explicit schema-v1 JSON configuration file; checked-in templates are
offline test fixtures.

See [multi-project configuration](./docs/multi-project-configuration.md) for
the schema-v1 contract, [architecture](./docs/architecture.md) and
[system architecture](./docs/system-architecture.md) for design and security
boundaries, [code standards](./docs/code-standards.md) for implementation
conventions, [project overview/PDR](./docs/project-overview-pdr.md) for
requirements, and [release gates](./docs/release-gates.md) for validation
commands.

## Prerequisites

- Node.js 24 or newer.
- npm 11.13.0, declared by `package.json`.
- A supported Chromium and WebKit installation. `npm ci` installs locked
  dependencies; browser provisioning is explicit and does not run in the
  install lifecycle. Run `npm run install:browsers` before native gates.

From the repository root:

```sh
npm ci
```

Firefox remains opt-in. Install it separately with `npx playwright install firefox`.
The native Chromium template gate is `npm run test:e2e:templates`; the native
WebKit template gate is `npm run test:release:webkit`.

## Offline template checks

The checked-in templates are test fixtures, not a report CLI source mode. The
template gate executes the production direct workflow through an exact,
default-deny route map, as well as offline auto-build and template mock server
integration tests:

```sh
npm run test:e2e:templates
```

The offline workflow is also run natively by the WebKit release gate. Neither gate
contacts a live controller or vendor service. Use the explicit configuration
command below for a Jenkins report.

## Schema-v1 Jenkins walkthrough

Save this minimal document as a local, uncommitted `projects.json`:

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
      "loginUrl": "https://jenkins.example.invalid/jenkins/login",
      "jobUrl": "https://jenkins.example.invalid/jenkins/job/service-a/"
    }
  ]
}
```

`jenkins.example.invalid` is a placeholder; replace it with an authorized
Jenkins endpoint. The login and job URLs must be exact, credential-free
HTTP(S) URLs on the same Jenkins origin and base context.

The JSON stores environment-variable names only. Inject the referenced values
from a shell or CI secret store; never put usernames, passwords, tokens,
cookies, or credential-bearing URLs in JSON:

```sh
export JENKINS_USERNAME
export JENKINS_PASSWORD
npm run report -- --config projects.json
```

The report command requires `--config` exactly once. `REPORT_SOURCE`,
`PROJECTS_CONFIG_PATH`, legacy `JENKINS_*` project inputs, and positional
arguments are rejected. See
[config/projects.example.json](./config/projects.example.json) and
[multi-project configuration](./docs/multi-project-configuration.md) for
source-origin and selector settings.

The workflow authenticates through the exact configured `loginUrl`, validates
the authenticated page, opens the exact configured `jobUrl`, discovers publisher
destinations once, and captures the configured Snyk and SonarQube evidence
(authenticating through SonarQube login with the same credentials if
redirected). It does not trigger builds, inspect queues or build identities,
poll terminal status, or select another job.

### Windows PowerShell live run

For a live controller, put the non-secret job configuration in an ignored
local file such as `config/jenkins-example.local.json`:

```json
{
  "schemaVersion": 1,
  "defaults": {
    "credentials": {
      "usernameVariable": "JENKINS_USERNAME",
      "passwordVariable": "JENKINS_PASSWORD"
    },
    "browser": "chromium",
    "artifactDir": "reports",
    "timeoutMs": 300000
  },
  "projects": [
    {
      "id": "example-job",
      "name": "Example Jenkins job",
      "loginUrl": "https://jenkins-example.example-domain.com/login",
      "jobUrl": "https://jenkins-example.example-domain.com/job/replace-with-job/"
    }
  ]
}
```

Replace the placeholder job URL with the exact authorized Jenkins job URL.
Use `Get-Credential` so the password is not written to the JSON file, source
tree, or command history:

```powershell
$credential = Get-Credential -Message 'Jenkins credentials'
$env:JENKINS_USERNAME = $credential.UserName
$env:JENKINS_PASSWORD = $credential.GetNetworkCredential().Password
$configPath = Join-Path (Get-Location) 'config\jenkins-example.local.json'
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Path\To\chrome.exe'
$env:PLAYWRIGHT_HEADLESS = 'true'

try {
  npm run report -- --config $configPath
} finally {
  Remove-Item Env:JENKINS_USERNAME, Env:JENKINS_PASSWORD, Env:PLAYWRIGHT_EXECUTABLE_PATH, Env:PLAYWRIGHT_HEADLESS -ErrorAction SilentlyContinue
}
```

The report runner opens the exact configured login URL and expects Jenkins'
standard username, password, and sign-in controls. SSO/MFA requires a
dedicated authentication integration; do not put cookies or tokens in the
project JSON.


## Control page dashboard

The Control Page dashboard provides an interactive web UI on loopback to discover, view, and edit project configurations (`config/*.json`), run report generation or auto-build jobs, inspect live run logs and outcomes, and open generated reports.

Start the control dashboard:

```sh
npm run serve:control
```

Open `http://127.0.0.1:4173/` in your browser.

> **Warning:** **Trigger Auto Build (All Enabled)** starts a Jenkins build
> immediately for every enabled `auto-build` project in the active configuration.
> There is no confirmation dialog; review all Enabled and Run Type settings
> before triggering.

- **Config management**: Edit `enabled`, `runType` (`report` or `auto-build`), and raw JSON with ETag concurrency control. Choose **Workers** (1–4, default 1) for the saved schema-v1 document; count changes update raw JSON and disable both run actions until ETag-protected Save succeeds.
- **Execution**: **Generate Reports (All Enabled)** selects enabled report projects; **Trigger Auto Build (All Enabled)** selects enabled auto-build projects. Both use the same saved `reportWorkers` count to bound concurrency. Project cards retain Enabled and Run Type controls, but no longer have a per-card `.btn-auto-build` action.
- **Results**: Build batches show one ordered outcome per project, including status, optional build number/link, stages, and error details. Older single-project records retain scalar result rendering.
- **Mutual exclusion**: Only one report or auto-build run may be active. The UI disables both actions while a run is queued/running; auto-build submits an immediate batch, while targeted single-project selection remains available to API callers.
- **Security**: The control dashboard is strictly restricted to loopback (`127.0.0.1`) and rejects non-loopback bindings and cross-origin state-modifying requests.
- **Build pipeline**: Bundled via Vite (`vite.control.config.ts`) into `.runner-build/reporting/control-page/` as single-bundle CSS and JS, ensuring strict Content Security Policy (`script-src 'self'`, `style-src 'self'`) compliance without inline styles or eval.


## Final-report PDF export

In Control mode, open a saved report at `/reports/<projectId>/<runId>/index.html` and choose **Export PDF**. The browser downloads `<projectId>-<runId>-report.pdf`; export adds no server endpoint and does not alter saved reports.

- Report headings, prose, metadata, lists, tables, captions, and link text remain selectable/searchable Unicode text. Screenshots stay embedded images; pages are not rasterized.
- The default layout is A4 portrait. Findings-table content wraps and paginates while retaining its columns.
- Validated evidence links become clickable PDF links. Generation does not visit source sites; it loads only safe local or embedded evidence images.
- PDF export is verified in Chromium and WebKit. See the [report pipeline](./docs/report-pipeline.md#client-side-pdf-export) and [Phase 03 release snapshot](./docs/release-gates.md#final-report-pdf-export-phase-03-verification-snapshot-2026-09-26).

## Report server (read-only aggregate preview)

`npm run serve:report` serves an existing static report aggregate under `reports/`. Defaults:
`http://127.0.0.1:4173/`. It requires an existing generated aggregate at the selected root and is read-only.

CLI flags and environment equivalents:

| Purpose | Flag | Environment | Default |
| --- | --- | --- | --- |
| report root | `--root <dir>` | `REPORT_ROOT` (then `ARTIFACT_DIR`) | `reports` |
| bind host | `--host <host>` | `REPORT_HOST` | `127.0.0.1` |
| TCP port | `--port <port>` | `REPORT_PORT` | `4173` |
| LAN opt-in | `--allow-lan` | `REPORT_ALLOW_LAN=1` | disabled |

For a custom local root and port:

```sh
npm run serve:report -- --root reports --host 127.0.0.1 --port 5000
```

For a trusted-LAN preview only:

```sh
npm run serve:report -- --host 0.0.0.0 --allow-lan --port 4173
```

Non-loopback hosts require the explicit LAN opt-in. `0.0.0.0` listens on all
IPv4 interfaces; use a firewall and a trusted network. The server is
unauthenticated, read-only, and limited to safe files under the canonical
report root. Do not expose it to the public internet.

## Template mock server

`npm run serve:templates` builds the project and launches a standalone HTTP server on loopback serving offline template fixtures (Jenkins job, Snyk evidence, SonarQube dashboard/issues, parameterized build):

```sh
npm run serve:templates
```

Open `http://127.0.0.1:4174/` in your browser.

### Developer Hub index page

Visiting `http://127.0.0.1:4174/` or `http://127.0.0.1:4174/index.html` serves the Developer Hub—a dark-themed web dashboard indexing all 9 mock fixture endpoints categorized with service badges, descriptions, and dynamic origin links:

- **Jenkins**:
  - `Jenkins Login` — Authentication test page (`/login`)
  - `Jenkins Job Page` — Main project page linking reports and builds (`/job/template-fixture-job/`)
  - `Jenkins Build (Parameterized)` — Build parameter form with trigger action (`/job/template-fixture-job/build?delay=0sec`)
- **Snyk**:
  - `Snyk Report` — SCA vulnerability scan HTML report artifact (`/snyk-report.html`)
  - `Snyk Summary (JSON)` — Raw JSON findings and severity counts (`/snyk-summary.json`)
- **SonarQube**:
  - `SonarQube Login` — Authentication entrypoint (`/sessions/new`)
  - `SonarQube Home` — Project dashboard (`/dashboard?id=template-fixture-project`), guarded until authenticated
  - `SonarQube Overall` — Overall code quality metrics (`/project/overview?id=template-fixture-project`)
  - `SonarQube Issues` — Issue list with severity facets (`/project/issues?id=template-fixture-project&resolved=false`)

The Developer Hub enforces strict security: HTML-escaped URLs with safe scheme validation (`http:`, `https:`, root-relative), restrictive Content Security Policy (`default-src 'none'; style-src 'unsafe-inline'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store, must-revalidate`, and full support for both `GET` and `HEAD` requests.

CLI flags and environment equivalents:

| Purpose | Flag | Environment | Default |
| --- | --- | --- | --- |
| bind host | `--host <host>` | `TEMPLATE_HOST` | `127.0.0.1` |
| TCP port | `--port <port>` | `TEMPLATE_PORT` | `4174` |
| help | `--help`, `-h` | | |

For a custom port or host:

```sh
npm run serve:templates -- --port 5000
npm run serve:templates -- --host 127.0.0.1 --port 4174
```

### Template project configuration

[config/projects.template.json](./config/projects.template.json) is pre-configured to execute against the template mock server on `http://127.0.0.1:4174`:

```sh
export TEMPLATE_FIXTURE_USERNAME=mock-user
export TEMPLATE_FIXTURE_PASSWORD=mock-password
npm run report -- --config config/projects.template.json
```

Or start the Control Dashboard (`npm run serve:control` at `http://127.0.0.1:4173/`) and select `projects.template.json` from the configuration selector for offline browser preview and test runs.

### Validation and testing

Template mock server functionality, Developer Hub navigation, and runner integration are validated comprehensively by:

```sh
npm run test:e2e:templates
```

This runs `tests/e2e/template-server-integration.spec.ts` alongside navigation and auto-build suites, asserting:
- Developer Hub index rendering across `/` and `/index.html` with security headers and all 9 endpoints.
- End-to-end browser navigation across all fixture endpoints and form POST 302 redirects.
- SonarQube authentication session guarding (login gate before dashboard access).
- URL-encoding preservation for double-encoded `%252F` paths.
- Concurrent execution of Control Server (`4173`) and Template Server (`4174`) without port collisions.
- Validation and normalization of `config/projects.template.json` schema-v1 document.
- Production report generation against the live HTTP mock server producing verified evidence artifacts (`data.json`, `index.html`, 6 Snyk findings, SonarQube facets).
- Production auto-build workflow execution against the mock server.
- Control Dashboard UI loading `projects.template.json` with zero cross-origin or CSP violations.

## Report paths and layout

```text
reports/
├── index.html                 # aggregate report
├── aggregate-data.json        # aggregate JSON
├── assets/report.css
└── <project-id>/<run-id>/
    ├── index.html
    ├── data.json
    ├── manifest.json
    └── requested screenshots
```

`artifactDir` in the JSON selects the report root. The default is `reports/`.
Run directories are immutable and project-local. `test-results/`,
`playwright-report/`, and `.runner-build/` are Playwright/build outputs, not
application reports. A Playwright test trace is test-runner evidence; it is
not the same thing as the runner's normalized report artifacts or requested
vendor screenshots. An optional `trace.zip` reference is allowlisted only when
a run manifest supplies it.

Failure state uses the same project/run identity as successful and partial
runs. The runner persists bounded failure data with the workflow deadline,
then uses a bounded fallback and records a warning if both attempts fail.

## Troubleshooting

- `run npm run report first`: the server root is missing, is not canonical, or
  lacks the generated aggregate marker. Run
  `npm run report -- --config <config.json>` from the repository root, then
  serve the same root. Set `REPORT_ROOT` or `--root` if the report was written
  elsewhere.
- Chromium cannot launch: run `npm run install:browsers`; browser provisioning
  is intentionally separate from `npm ci`.
- File mode rejects configuration: check the explicit `--config` path, ensure
  the JSON is schema-v1, remove legacy structural inputs, and confirm every
  enabled project's referenced credential variables exist in the process
  environment.
- Jenkins rejects the run: check the exact login and job URLs, credentials, and
  browser configuration.
- `Report root is locked by another live or unsafe process`: stop any other
  auto-jobs run using the same report root. New Windows lock owners include
  `processStartedAt`; expired locks are reclaimed only for a dead PID or a
  proven PID-instance mismatch. Legacy locks with a present PID, inaccessible
  process metadata, malformed state, or uncertain ownership remain locked.
  For a confirmed stale legacy lock, quarantine only the exact
  `reports\\.report-root-lock` directory after verifying the lease is expired,
  the host is local, no auto-jobs process is active, and the recorded PID is
  absent or belongs to a later process instance; then retry the command.
- The server cannot bind: choose another `REPORT_PORT`; for a non-loopback
  `REPORT_HOST`, add `--allow-lan` or `REPORT_ALLOW_LAN=1`.
- A report is `partial`: inspect warnings in `data.json` and the aggregate.
  Missing, malformed, ambiguous, or disallowed publisher evidence remains
  visible as partial evidence rather than being fabricated as success.
## Command reference

| Command | Use |
| --- | --- |
| `npm ci` | install locked dependencies without downloading browsers |
| `npm run install:browsers` | explicitly provision Chromium and WebKit |
| `npm run report -- --config <config.json>` | generate a Jenkins report from an explicit schema-v1 file |
| `npm run serve:control` | build and start interactive Control Dashboard on loopback |
| `npm run serve:report` | build and serve `reports/` on loopback (read-only aggregate) |
| `npm run serve:templates` | build and start standalone template fixture mock server on loopback |
| `npm run test:e2e:templates` | run offline template fixture checks & mock server integration tests in Chromium |
| `npm run test:control` | run Control Page API & UI E2E tests in Chromium & WebKit |
| `npm run test:release:webkit` | run the native WebKit template gate |
| `npm run test:report` | run generated-report browser checks |
| `npm run test:unit` | run unit tests |
| `npm run test:release` | run full deterministic release gate suite |
| `npm run typecheck` | TypeScript check without emitting files |
| `npm run build` | compile TypeScript, bundle Vite control dashboard, and copy report assets to `.runner-build/` |

## Security notes

- Keep credentials in environment variables or a trusted CI secret store.
  Schema-v1 files contain variable names only; never inline secrets.
- Jenkins URLs, report links, source origins, paths, diagnostics, and persisted
  artifacts are bounded, redacted, and policy-validated. Authentication state
  is ephemeral.
- The report server has no authentication. Loopback is the safe default;
  LAN exposure is an explicit trusted-network decision.
- Use an isolated report root. The runner rejects unsafe paths and symlinks,
  uses bounded cleanup/publication, and serializes same-host report-root work.
  The lock owner record contains a token, PID, and hostname—not a UID—so the
  lock is not a same-UID authorization boundary or a distributed lock.
- This documentation does not claim live Jenkins or browser execution.
