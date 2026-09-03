# Release gates

This project has deterministic local gates for native browsers, offline report
fixtures, the Phase 3 build-page fixture, the Phase 01 SecretStore backend,
the Phase 02 control secrets API/security boundary, the Phase 03 control
run-environment boundary, the Phase 04 control UI credential dialog, and the
Phase 05 dynamic-credential verification suite. The commands below are the
current release contract; test counts are intentionally not hard-coded except
where a dated verification snapshot is recorded for traceability.

## Gate order

Install dependencies and provision required native browsers before gates:

```sh
npm ci
npm run install:browsers
npm run typecheck
npm run build
npm run test:unit
npm run test:e2e:templates
npm run test:control
npm run test:report
npm run test:release:webkit
```

`npm ci` does not download browsers. `npm run install:browsers` provisions
both Chromium and WebKit before the native gates. The `test:release` script is the deterministic shorthand for typecheck, build, unit, Chromium template, control UI, generated-report, and WebKit template gates; it does not install dependencies or browsers:

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

## Phase 3 build-page fixture gate

Run the focused fixture checks directly:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/template-build-fixture.spec.ts \
  --config=playwright.unit.config.ts
node scripts/run-playwright.mjs playwright test \
  tests/e2e/template-auto-build.spec.ts \
  --config=playwright.config.ts
```

The unit suite loads the ninth checked-in template file and rejects drift in
the saved build link, canonical URL, `POST` form/action, `#bottom-sticker`,
button classes/text, or file-size budget. The E2E test runs the production
auto-build workflow against the offline route map and proves
`GET login -> POST login -> GET job -> GET build -> POST build -> GET job`,
exactly one build `POST`, no Snyk/SonarQube requests, and no unmatched route.
These commands do not contact Jenkins or vendor services and do not prove that
a live build was created.

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

## Phase 2 auto-build gate

The Phase 2 auto-build runner is an explicit library boundary, not a report
CLI mode. `npm run report` always excludes projects whose normalized
`runType` is `auto-build`; this prevents a mixed configuration from causing a
build. No production command currently exposes an auto-build trigger.

Run the focused deterministic tests when reviewing the build workflow:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/jenkins-build-trigger.spec.ts \
  tests/unit/auto-build-runner.spec.ts \
  tests/unit/sequential-runner.spec.ts \
  --config=playwright.unit.config.ts
```

The focused tests cover:

- exact `#side-panel` and `#bottom-sticker` scoping and visible-control
  cardinality;
- exact configured job `/build` URL identity, form `POST`, and required
  Jenkins button class tokens;
- one matching POST, response classification (`submitted` or `rejected`),
  and `submission-unknown` after a request with no determinate response;
- no retry after a possible side effect;
- disabled/wrong-mode rejection, secret redaction, and context/browser
  cleanup; and
- report selection excluding auto-build projects.

These tests use an in-process HTTP server or injected browser/workflow
dependencies. They do not contact a live Jenkins controller and do not prove
that a build was created. Before any authorized live run, apply the exact
side-effect rules in [architecture](./architecture.md) and treat
`submission-unknown` as an indeterminate external side effect.

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

## Control server gate

`npm run serve:control` first builds the server and starts the interactive Control Dashboard on loopback.

Flags and defaults:
- Mode: control (`--control`)
- Host: `127.0.0.1` (refuses LAN / non-loopback bindings)
- Port: `4173`
- Config root: `config/` (or `--config-root <dir>`)
- Report root: `reports/` (or `--root <dir>`)

Deterministic testing of the Control API and UI is executed via:
```sh
npm run test:control
```
which exercises config reading/atomic saving, validation errors, report execution, auto-build confirmation dialogs, and WCAG A/AA accessibility scanning in Chromium and WebKit.

### Phase 04 credential dialog gate

`npm run test:control` also exercises the browser-facing credential workflow
against an isolated loopback server and temporary config/report roots. The
Control UI contract includes:

- an accessible native Credentials dialog and loading/error states;
- discovery of configured credential-variable names with default fallbacks;
- filtered, presence-only `GET /api/secrets?keys=...` rendering;
- password-masked inputs and **Configured**/**Missing** badges;
- CSRF-bearing JSON save and per-key bodyless clear requests;
- persistence/status transitions followed by immediate input wiping; and
- close/reopen cleanup, with no submitted test value in page HTML.

This browser gate proves the UI/API boundary and zero-leakage DOM behavior. It
does not contact Jenkins or vendor services; per-run SecretStore injection and
diagnostic redaction remain covered by the Phase 03 gate below.

## Phase 03 run-executor environment gate

Run the focused control-run contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-run-executor-secrets.spec.ts \
  --config=playwright.unit.config.ts
```

The suite uses isolated `ConfigStore`/`SecretStore` roots and injected
executors. It proves that both report and auto-build control runs receive
stored values through `runtimeEnvironment`, stored values override same-named
base values, and the base environment remains unchanged. It also proves
redaction of stored values from `addLog` messages, report warnings, thrown
errors, and auto-build result URLs, including the asynchronous
`createRunManager` path. The fixture builders are shared from
`tests/unit/control-run-executor-fixture.ts`.

This gate performs local filesystem I/O and injected executor calls only. It
does not contact Jenkins or vendor services and does not replace the report,
auto-build, or control UI gates.

## Phase 01 SecretStore gate

Run the focused backend contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/report-server-secret-store.spec.ts \
  --config=playwright.unit.config.ts
```

The test uses isolated temporary config/report roots and verifies:

- environment-style key validation and rejection of traversal/dashed/dotted or
  numeric-leading names;
- missing/empty, malformed, array/null, non-string, and non-existent-root
  handling;
- sorted JSON persistence, frozen read/list snapshots, bulk updates and
  deletions, and the 1 MiB boundary;
- concurrent read-modify-write preservation under the in-memory lock;
- secret values absent from validation errors; and
- `createReportServer(..., { mode: 'control' })` wiring the store to the
  server handle and fixed `secrets.local.json` path.

This gate performs local filesystem I/O only. It does not itself execute a
report or auto-build run and does not contact Jenkins or prove Windows ACL
enforcement. The Phase 03 gate below covers per-run environment injection. On
Windows, review the config-directory ACL separately because POSIX `0o600` mode
bits are advisory.

## Phase 05 dynamic-credentials verification gate

Run the focused Phase 05 additions directly:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-secret-store.spec.ts \
  tests/unit/control-secrets-api.spec.ts \
  --config=playwright.unit.config.ts
```

The `control-secret-store.spec.ts` suite uses an isolated temporary config
directory and verifies missing/empty reads, atomic `secrets.local.json` writes
with no temporary-file residue, POSIX `0o600` handling with a Windows-safe
fallback, invalid/traversal/reserved key rejection, non-string value errors
without value leakage, concurrent write preservation, and single/bulk
deletion. The API operation suite verifies empty/full/filtered boolean
presence maps, CSRF/origin-guarded single and batch updates, null/action
deletion, query/body deletion, disk persistence, and plaintext-free responses.

Run the complete unit and control-page gates as the release evidence:

```sh
npm run typecheck
npm run test:unit
npm run test:control
```

`npm run test:control` runs `tests/e2e/control-page.spec.ts` in both Chromium
and WebKit. The browser contract verifies an accessible credential dialog,
dynamic credential-name discovery, Missing/Configured presence transitions,
CSRF-protected save and clear flows, persistence after close/reopen and page
reload, and a run that fails without credentials then succeeds after
SecretStore-injected credentials. It also asserts that submitted values are
absent from cleared inputs, page HTML, and run logs. The E2E server uses
temporary roots and injected executors; it does not contact Jenkins or vendor
services.

The 2026-09-03 Phase 05 verification snapshot recorded:

| Command/scope | Result |
| --- | --- |
| `npm run typecheck` | 0 TypeScript errors |
| `tests/unit/control-secret-store.spec.ts` | 7/7 passed |
| `tests/unit/control-secrets-api.spec.ts` | 10/10 passed |
| `npm run test:unit` | 248/248 passed |
| `npm run test:control` (Chromium + WebKit) | 6/6 passed |
| Combined unit and control E2E checks | 254/254 passed |
| Secret leakage checks | Zero observed |

These checks prove local persistence, API/UI contracts, and no-leakage
invariants; they do not prove a live Jenkins build or vendor-service run.

## Phase 02 control secrets API gate

Run the focused HTTP contract:

```sh
node scripts/run-playwright.mjs playwright test \
  tests/unit/control-secrets-api.spec.ts \
  tests/unit/control-secrets-security.spec.ts \
  --config=playwright.unit.config.ts
```

These tests create isolated loopback control servers and verify:

- `GET /api/secrets` returns an empty or sorted boolean presence map;
- `GET /api/secrets?keys=...` validates requested names and reports missing
  names as `false`;
- `PUT /api/secrets` accepts single and batch patches, persists string values,
  supports null/`action: "delete"` removal, and never echoes plaintext;
- `DELETE /api/secrets` supports query and JSON name lists and returns the
  resulting presence map;
- Host validation runs before dispatch, while mutations require same-origin
  Origin, accepted Fetch Metadata, the generated CSRF token, and JSON content
  type;
- invalid keys/values/bodies return `400`, invalid mutation gates return `403`,
  non-JSON mutation bodies return `415`, unsupported methods return `405` with
  `Allow`, and a missing store returns `503`; and
- all API responses use `Cache-Control: no-store` and contain no secret value.

The gate writes only isolated temporary SecretStore files and does not contact
Jenkins or vendor services. It proves request-level API behavior, not Windows
ACL enforcement or run-executor behavior; per-run environment merging and
redaction are covered by the Phase 03 gate above.

## Browser-fixture boundary

The report workflow does not depend on a Jenkins controller. Current
acceptance uses native Playwright tests and the checked-in nine-file offline
corpus, including `templates/jenkins-template/template-build.html`. The
build-detail route is synthetic, exact, default-deny, and test-only;
controller/container experiments are outside the report and fixture contracts.

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
  Use environment-variable references, the local SecretStore in control mode,
  or a trusted CI secret store.
- Native browser gates do not contact Jenkins or vendor services. Keep any
  authorized runtime credentials in environment variables or a trusted CI
  secret store; control runs read a per-run SecretStore snapshot instead of
  mutating `process.env`.
- The runner validates origins, rejects credential-like URL data and traversal,
  redacts diagnostics, keeps authentication state ephemeral, and does not copy
  raw vendor HTML into generated reports. The control executor additionally
  redacts every non-empty stored value from logs, warnings, errors/stacks, and
  auto-build result URL fields.
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
