# Release gates

This project has deterministic local gates for native browsers and an
offline-template gate. The commands below are the current release contract;
test counts are intentionally not hard-coded because they change with the
test suite.

## Gate order

Install dependencies and provision required native browsers before gates:

```sh
npm ci
npm run install:browsers
npm run typecheck
npm run build
npm run test:unit
npm run test:e2e:templates
npm run test:report
npm run test:release:webkit
```

`npm ci` does not download browsers. `npm run install:browsers` provisions
both Chromium and WebKit before the native gates. The `test:release` script is the deterministic shorthand for typecheck, build, unit, Chromium template, generated-report, and WebKit template gates; it does not install dependencies or browsers:

```sh
npm run test:release
```

`test:report` runs generated-report browser checks with a loopback static
server. It covers rendering, CSP headers, escaping/inert HTML, local links,
safe external-link attributes, keyboard traversal, axe checks, responsive
widths, and snapshots. It is separate from the template-navigation gate.

The checked-in template workflow can be gated independently:

```sh
npm run test:e2e:templates
```

This runs the production direct workflow against the saved Jenkins, Snyk, and
SonarQube snapshots (including authentication flow) through the exact
default-deny route map. It is not a live-vendor or live-Jenkins check.

The native WebKit template gate uses the browser installed on the host:

```sh
npm run test:release:webkit
```

It runs the same production workflow and exact route map without a controller,
vendor service, or published port.

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

## Browser-fixture boundary

The report workflow does not depend on a Jenkins controller fixture. Current
acceptance uses native Playwright tests and the checked-in offline template
corpus; controller/container experiments are outside the report contract.

## Artifact verification

Before a release decision, inspect only the intended report root:

```text
reports/
├── index.html
├── aggregate-data.json
├── assets/report.css
└── <project-id>/<run-id>/
    ├── index.html
    ├── data.json
    ├── manifest.json
    └── requested screenshots
```

The application runner's artifacts are normalized data, a contract-validated
manifest, generated report HTML, and requested vendor screenshots.
`test-results/` contains Playwright test-runner output; its traces are test
traces, not runner/vendor report traces. An optional `trace.zip` is retained
only if a run manifest supplies that exact allowlisted reference.

Failure artifact persistence retains the allocated project/run identity. The
runner uses the workflow deadline first and a bounded fallback for failure
persistence, then records a warning if both attempts fail. Review the
aggregate and warnings rather than treating directory presence alone as proof
of complete evidence.

The report root and staging root must be canonical non-overlapping
directories. Publication is staged and bounded; cleanup preserves unsafe,
active, malformed, oversized, symlinked, and ambiguous entries. The private
report-root lease coordinates same-host work using token/PID/hostname owner
data. It has no UID field, is not a same-UID authorization boundary, and is
not a distributed lock.

## Security checks

- Never inline credentials in JSON, shell history, fixtures, logs, or examples.
  Use environment-variable references and a trusted CI secret store.
- Native browser gates do not contact Jenkins or vendor services. Keep any
  authorized runtime credentials in environment variables or a trusted CI
  secret store.
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

Native browser, fixture startup, and live Jenkins results are environment
evidence only when their commands are freshly run in the target environment.
