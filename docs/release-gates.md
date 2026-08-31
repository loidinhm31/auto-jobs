# Release gates

This project has deterministic local gates and an optional disposable Jenkins
fixture gate. The commands below are the current release contract; test counts
are intentionally not hard-coded because they change with the test suite.

## Gate order

Install dependencies and provision the browser before type-checking or running
tests:

```sh
npm ci
npm run typecheck
npm run build
npm run test:unit
npm run test:report
```

The package `install` lifecycle invoked by ordinary `npm ci` provisions
Chromium with `playwright install chromium`. If dependencies were installed
with `npm ci --ignore-scripts`, run `npm run install` before the gates. The
`test:release` script is the deterministic shorthand for the last four steps;
it does not run `npm ci` or install a missing browser:

```sh
npm run test:release
```

`test:report` runs generated-report browser checks with a loopback static
server. It covers rendering, CSP headers, escaping/inert HTML, local links,
safe external-link attributes, keyboard traversal, axe checks, responsive
widths, and snapshots. It is separate from the template-navigation gate.

The checked-in template navigation can be gated independently:

```sh
npm run test:e2e:templates
```

This follows the saved Jenkins, Snyk, and SonarQube snapshots with
JavaScript disabled; it is not a live-vendor or live-Jenkins check.

The pinned WebKit gate runs in the image and command defined by
`docker-compose.webkit.yml`:

```sh
npm run test:release:webkit
```

That service mounts the repository, isolates `node_modules` in a named volume,
runs `npm ci --ignore-scripts`, and then runs `npm run test:release`. The image
provides the browser and publishes no ports. A host WebKit download does not
install the system-library ABI required by this image's browser.

## Report gate

The report command requires an explicit schema-v1 configuration path:

```sh
npm run report -- --config config/projects.example.json
```

The checked-in example uses `.invalid` placeholders and is not a live
controller check. Before an authorized run, replace the placeholders and
export the credential values named by `usernameVariable` and
`passwordVariable`. The JSON stores variable names only.

`--config` is required exactly once. `REPORT_SOURCE`,
`PROJECTS_CONFIG_PATH`, legacy `JENKINS_*` project settings, positional
arguments, and legacy structural keys (`baseUrl`, `jobPath`, `captureFrom`,
and `buildNumber`) are rejected. `loginUrl` and `jobUrl` must be exact,
absolute, credential-free HTTP(S) URLs on one Jenkins origin and base context.

The template-navigation gate remains test-only:

```sh
npm run test:e2e:templates
```

It fulfills exact configured and discovered URLs from checked-in templates
with blocked unmatched network requests. It does not contact Jenkins or
vendors and does not claim live execution. Generated reports are served
separately with `npm run serve:report`.

The report runner uses a project-local `.report-runtime-*` directory for
managed temporary files and attempts bounded cleanup after completion. The
default staging root is a sibling `artifacts/` directory. `test-results/`,
`playwright-report/`, and `.runner-build/` are test/build outputs, not report
release inputs.

## Report server gate

`npm run serve:report` first builds the report-server launcher and then serves
an existing report root. Defaults:

```text
root  reports
host  127.0.0.1
port  4173
url   http://127.0.0.1:4173/
LAN   disabled
```

Flags and environment variables:

| Purpose | Flag | Environment | Default |
| --- | --- | --- | --- |
| root | `--root <dir>` | `REPORT_ROOT` (then `ARTIFACT_DIR`) | `reports` |
| host | `--host <host>` | `REPORT_HOST` | `127.0.0.1` |
| port | `--port <port>` | `REPORT_PORT` | `4173` |
| LAN permission | `--allow-lan` | `REPORT_ALLOW_LAN=1` | off |

Local custom root/port:

```sh
npm run serve:report -- --root reports --host 127.0.0.1 --port 5000
```

Trusted-LAN preview:

```sh
npm run serve:report -- --host 0.0.0.0 --allow-lan --port 4173
```

An equivalent environment configuration is:

```sh
REPORT_ROOT=reports REPORT_HOST=0.0.0.0 REPORT_PORT=4173 \
REPORT_ALLOW_LAN=1 npm run serve:report
```

Non-loopback hosts fail without explicit LAN permission. `0.0.0.0` binds all
IPv4 interfaces. The server is read-only, unauthenticated, and serves only
GET/HEAD requests below a canonical root containing the generated aggregate
`index.html`. Use a firewall and a trusted network; this is not public
hosting.

## Disposable Jenkins fixture gate

The optional Compose fixture is test-only. It exercises the local Jenkins
fixture suites and is not a report CLI source mode or a production gate. The
mapping is:

```text
127.0.0.1:${JENKINS_PORT:-8080}  ->  container port 8080
```

Validate Compose without printing interpolated secrets, then start the
fixture:

```sh
export JENKINS_PORT=18080
export JENKINS_USERNAME
export JENKINS_PASSWORD
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

The fixture seeds a parameterized
`playwright-vulnerability-report` job with `FIXTURE_VARIANT` values
`pass`, `failed`, `empty`, and `malformed`, plus a non-parameterized
`playwright-vulnerability-report-build-now` job. Neither job runs a real
Snyk or SonarQube scanner.

Run fixture-backed tests only when the disposable controller is intended:

```sh
npm run test:e2e
npm run test:e2e:build-now
```

These scripts' `JENKINS_BASE_URL` and `JENKINS_JOB_PATH` values configure the
test harness only; they are not accepted as report configuration. Stop with
`docker compose down`; use `docker compose down -v` only to intentionally
remove fixture history. This documentation does not claim live Jenkins or
browser execution.

## Artifact verification

Before a release decision, inspect only the intended report root:

```text
reports/
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

The application runner's artifacts are normalized data, a contract-validated
manifest, generated report HTML when it has a build identity, and requested
vendor screenshots. `test-results/` contains Playwright test-runner output;
its traces are test traces, not runner/vendor report traces. An optional
`trace.zip` is retained only if a run manifest supplies that exact allowlisted
reference. Do not assume `index.html` or a trace exists for a pre-build
failure.

Failure artifact persistence is best-effort. The runner attempts to preserve
bounded failure data, diagnostics, a manifest, and available artifacts, but a
write, render, or publication failure can leave an incomplete or missing run
directory. Review the aggregate and warnings rather than treating directory
presence alone as proof of a complete run.

The report root and staging root must be canonical non-overlapping
directories. Publication is staged and bounded; cleanup preserves unsafe,
active, malformed, oversized, symlinked, and ambiguous entries. The private
report-root lease coordinates same-host work using token/PID/hostname owner
data. It has no UID field, is not a same-UID authorization boundary, and is
not a distributed lock.

## Security checks

- Never inline credentials in JSON, shell history, fixtures, logs, or examples.
  Use environment-variable references and a trusted CI secret store.
- `docker compose config` prints the fully interpolated model and can expose
  the Jenkins password. Prefer `docker compose config --quiet`; never paste
  normal `config` output into logs or review systems.
- The runner validates origins, rejects credential-like URL data and traversal,
  redacts diagnostics, keeps authentication state ephemeral, and does not copy
  raw vendor HTML into generated reports.
- The report server has no authentication. Keep it on loopback unless a
  trusted-LAN decision, firewall, and `--allow-lan`/`REPORT_ALLOW_LAN=1` are in
  place.
- Do not use a live Jenkins collector with production jobs, untrusted forks,
  or unreviewed endpoints. This documentation pass does not claim that live
  Jenkins or browser execution was verified.

## Test-count and evidence policy

Previous handoff notes reported different unit-test snapshots (121, 143, 152,
157, and 160) as the code changed. Those counts describe historical commits,
not a single current baseline. This document reports no current count without
running the relevant command; the command output is the release evidence.

The available scout checks for this update verified `npm run typecheck` and
`docker compose config --quiet` for both Compose files. They did not run live
Jenkins or browser execution. Treat fixture startup, E2E, and browser-gate
results as unverified until freshly run in the target environment.
