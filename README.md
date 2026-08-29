# Jenkins Playwright vulnerability reports

This project collects bounded Snyk and SonarQube evidence from a Jenkins build
and writes a static vulnerability report. The default path is offline and uses
the checked-in synthetic templates; it does not contact Jenkins.

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

## Quick offline walkthrough

```sh
npm run report
npm run serve:report
```

Open `http://127.0.0.1:4173/`. `npm run report` defaults to
`REPORT_SOURCE=templates` and reads six bounded, checked-in synthetic inputs:
the Jenkins snapshot, Snyk HTML/summary JSON, and SonarQube home/overall/issues
snapshots. It uses Playwright routes at a synthetic origin, not Jenkins or a
vendor service. The aggregate is written to `reports/index.html`; project runs
are below `reports/`.

The generated report contains normalized data and requested screenshots. The
source template HTML/CSS is used as input and is not copied into the generated
report. `npm run serve:report` builds the small report-server launcher and
serves the existing report root read-only.

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
      "baseUrl": "https://jenkins.example.invalid/jenkins",
      "jobPath": "service-a"
    }
  ]
}
```

`jenkins.example.invalid` is a placeholder; replace it with an authorized
Jenkins endpoint and matching job path before a live run.

The JSON stores environment-variable names only. Inject the referenced values
from a shell, CI secret store, or equivalent process environment; never put
usernames, passwords, tokens, cookies, or credential-bearing URLs in JSON:

```sh
# These names must already be supplied by your shell or CI secret store.
export JENKINS_USERNAME
export JENKINS_PASSWORD

REPORT_SOURCE=jenkins \
PROJECTS_CONFIG_PATH="$PWD/projects.json" \
npm run report
```

This sample omits `buildNumber`, so the Jenkins workflow can issue one UI
`Build Now`. Add a positive `buildNumber` when the run must inspect an existing
build without triggering one.

`REPORT_SOURCE=jenkins` is required for this file to be read. The default
template mode ignores `PROJECTS_CONFIG_PATH` and builds its synthetic document.
When file mode is selected, legacy project inputs such as
`JENKINS_BASE_URL`/`JENKINS_JOB_PATH` must not be combined with it. Add
source-specific paths, identities, and allowed origins when the live Jenkins
job publishes Snyk or SonarQube evidence; see
[config/projects.example.json](./config/projects.example.json).

## Legacy Jenkins environment mode

This deprecated compatibility mode is used when `PROJECTS_CONFIG_PATH` is
unset and `REPORT_SOURCE=jenkins` is selected. Required values are supplied at
runtime:

```sh
export JENKINS_BASE_URL
export JENKINS_USERNAME
export JENKINS_PASSWORD
export JENKINS_JOB_PATH
JENKINS_TRIGGER_MODE=ui REPORT_SOURCE=jenkins npm run report
```

Defaults and controls include:

- `JENKINS_LOGIN_PATH=/login`, `JENKINS_TRIGGER_MODE=ui`;
- `JENKINS_TIMEOUT_MS=300000`, `JENKINS_POLL_INTERVAL_MS=1000`;
- `PLAYWRIGHT_BROWSER=chromium`, `ARTIFACT_DIR=reports`;
- optional positive `JENKINS_BUILD_NUMBER`, which selects an existing build.

If no build number is supplied, the live workflow may click Jenkins `Build
Now` on a non-parameterized job. A parameterized job is detected and rejected
before interaction; it is never submitted by this V1 runner. Treat a missing
build number as a mutating live operation and use an isolated disposable job.

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

`ARTIFACT_DIR` selects the report root for the runner. The default staging root
is a sibling `artifacts/` directory. Temporary `.report-runtime-*` directories
are project-local and cleaned on normal completion when safe. `test-results/`,
`playwright-report/`, and `.runner-build/` are Playwright/build outputs, not
application reports. A Playwright test trace is test-runner evidence; it is not
the same thing as the runner's normalized report artifacts or requested vendor
screenshots. An optional `trace.zip` reference is allowlisted only when a run
manifest supplies it.

A failure before Jenkins returns a build number is stored under `pre-build`
without a fabricated Jenkins identity. It normally has failure JSON and a
manifest, not a build-linked `index.html`; do not infer that a pre-build
failure has a report or test trace. Failure artifact persistence is
best-effort: the runner attempts to retain bounded diagnostics and available
artifacts, but a write/render/publish failure can leave only the aggregate
outcome and a warning.

## Troubleshooting

- `run npm run report first`: the server root is missing, is not canonical, or
  lacks the generated aggregate marker. Run `npm run report` from the
  repository root, then serve the same root. Set `REPORT_ROOT` or `--root` if
  the report was written elsewhere.
- Chromium cannot launch: run `npm run install`; if `npm ci --ignore-scripts`
  was used, browser provisioning was intentionally skipped.
- `PROJECTS_CONFIG_PATH` appears ignored: set `REPORT_SOURCE=jenkins`. Template
  mode does not parse the project file.
- File mode rejects configuration: remove legacy structural inputs, check that
  the JSON is schema-v1, and confirm every enabled project's referenced
  credential variables exist in the process environment.
- Jenkins rejects the run: check the base URL/job path, credentials, browser,
  and whether the selected job is parameterized. Use `JENKINS_BUILD_NUMBER`
  to inspect an existing build instead of triggering one.
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
| `npm run report` | generate an offline template report by default |
| `REPORT_SOURCE=jenkins npm run report` | opt into Jenkins collection |
| `npm run report:jenkins` | Jenkins collection shorthand |
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
