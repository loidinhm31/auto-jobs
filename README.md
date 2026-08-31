# Jenkins Playwright vulnerability reports

This project collects bounded Snyk and SonarQube evidence from Jenkins builds
and writes static vulnerability reports. The report command reads an explicit
schema-v1 JSON configuration file; checked-in templates are test fixtures.

See [multi-project configuration](./docs/multi-project-configuration.md) for
the schema-v1 contract, [architecture](./docs/architecture.md) for design and
security boundaries, and [release gates](./docs/release-gates.md) for the
validation matrix.

## Prerequisites

- Node.js 24 or newer.
- npm 11.13.0, declared by `package.json`.
- A supported Chromium installation. `npm ci` installs the locked dependencies
  and runs the package `install` lifecycle, which provisions Chromium through
  `playwright install chromium`. If dependencies were installed with
  `--ignore-scripts`, run `npm run install` explicitly.

From the repository root:

```sh
npm ci
```

Firefox and WebKit are opt-in. Use `npx playwright install firefox` for local
Firefox work. The WebKit release gate runs in the pinned Ubuntu container
defined by `docker-compose.webkit.yml`; downloading WebKit alone does not make
an arbitrary Linux host ABI-compatible.

## Offline template checks

The checked-in templates are test fixtures, not a report CLI source mode:

```sh
npm run test:e2e:templates
```

The fixture checks bounded Jenkins, Snyk, and SonarQube snapshot handling
without contacting a live controller or vendor service. Use the explicit
configuration command below for a Jenkins report.

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

The workflow authenticates through `loginUrl`, resolves `jobUrl`, submits a
non-parameterized UI `Build Now`, correlates the resulting build, waits for
terminal status, and captures publisher evidence. Parameterized jobs are
detected before interaction and rejected. There is no configured existing-build
or job-page capture mode.

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

## Local Jenkins fixture

The Compose fixture is disposable and loopback-bound. `JENKINS_PORT` is the
host port; Compose maps `127.0.0.1:${JENKINS_PORT:-8080}` to container port
`8080`:

```sh
export JENKINS_PORT=18080
export JENKINS_USERNAME
export JENKINS_PASSWORD
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

The same Compose files work with a Docker-compatible Podman setup. On Fedora,
rootless Podman may need `XDG_RUNTIME_DIR` set and its socket available.

The fixture seeds two jobs:

- `playwright-vulnerability-report` is parameterized. Its
  `FIXTURE_VARIANT` choices are `pass`, `failed`, `empty`, and `malformed`.
  The first is the normal corpus; `failed` archives before failing, `empty`
  removes publisher reports, and `malformed` substitutes malformed evidence.
- `playwright-vulnerability-report-build-now` has no parameters and exercises
  the supported Build Now correlation boundary with the normal corpus.

The fixture does not run real Snyk or SonarQube scanners. Stop it with
`docker compose down`; add `-v` only for an explicit reset that removes the
`jenkins_home` volume and its build history.

## Report server

The default server URL is `http://127.0.0.1:4173/`. It requires an existing
generated aggregate at the selected root and has no authentication.

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

## Report paths and layout

```text
reports/
├── index.html                 # aggregate report
├── aggregate-data.json        # aggregate JSON
├── assets/report.css
└── <project-id>/
    ├── <build-number>/<run-id>/
    │   ├── index.html
    │   ├── data.json
    │   ├── manifest.json
    │   └── requested screenshots
    └── pre-build/<run-id>/    # failed before Jenkins build identity
```

`artifactDir` in the JSON selects the report root. The default is `reports/`.
Run directories are project-local and cleaned on normal completion when safe.
`test-results/`, `playwright-report/`, and `.runner-build/` are Playwright/build
outputs, not application reports. A Playwright test trace is test-runner
evidence; it is not the same thing as the runner's normalized report artifacts
or requested vendor screenshots. An optional `trace.zip` reference is
allowlisted only when a run manifest supplies it.

A failure before Jenkins returns a build number is stored under `pre-build`
without a fabricated Jenkins identity. It normally has failure JSON and a
manifest, not a build-linked `index.html`; do not infer that a pre-build
failure has a report or test trace. Failure artifact persistence is
best-effort: the runner attempts to retain bounded diagnostics and available
artifacts, but a write/render/publish failure can leave only the aggregate
outcome and a warning.

## Troubleshooting

- `run npm run report first`: the server root is missing, is not canonical, or
  lacks the generated aggregate marker. Run
  `npm run report -- --config <config.json>` from the repository root, then
  serve the same root. Set `REPORT_ROOT` or `--root` if the report was written
  elsewhere.
- Chromium cannot launch: run `npm run install`; if `npm ci --ignore-scripts`
  was used, browser provisioning was intentionally skipped.
- File mode rejects configuration: check the explicit `--config` path, ensure
  the JSON is schema-v1, remove legacy structural inputs, and confirm every
  enabled project's referenced credential variables exist in the process
  environment.
- Jenkins rejects the run: check the exact login and job URLs, credentials,
  browser, and whether the selected job is parameterized.
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
| `npm ci` | install locked dependencies and run normal install lifecycle |
| `npm run install` | explicitly provision Chromium |
| `npm run report -- --config <config.json>` | generate a Jenkins report from an explicit schema-v1 file |
| `npm run test:e2e:templates` | run offline template fixture checks |
| `npm run serve:report` | build and serve `reports/` on loopback |
| `npm run typecheck` | TypeScript check without emitting files |
| `npm run build` | compile the CLI/report server to `.runner-build/` |
| `npm run test:unit` | run unit tests |
| `npm run test:report` | run generated-report browser checks |
| `npm run test:release` | run typecheck, build, unit, and report gates |

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
- `docker compose config` renders interpolated values and can expose the
  Jenkins password. Prefer `docker compose config --quiet`; never paste
  rendered configuration or secret-bearing command output into logs/issues.
- Do not run a no-build-number live flow against production, an untrusted fork,
  or an unreviewed Jenkins job. This documentation pass did not verify live
  Jenkins or browser execution.
