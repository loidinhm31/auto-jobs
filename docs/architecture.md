# Jenkins Playwright vulnerability-report runner architecture

## Approved onboarding scope (2026-08-20)

The approved reviewer decision for this handoff covers Phase 1 and Phase 2.
Phase 1 covers the TypeScript/Playwright bootstrap, shared configuration and
result contracts, redaction helpers, and unit coverage. Phase 2 covers the
deterministic local Jenkins fixture, its pinned controller/plugin setup, the
JCasC-seeded job, and fixture report artifacts.

Phases 1–2 remain the approved onboarding baseline. The original single-project
Phases 3–5 design is superseded by the replanned target below; later implemented
boundaries are called out by phase. Phase 7 deterministic fixture/report and
local Compose gates have final evidence below; broader live-vendor,
remote-contract, direct-host WebKit, and artifact-lifecycle gates are not
claimed complete here.

## Replanned target scope (2026-08-24)

One validated JSON configuration lists one or more projects. Each enabled
project identifies its Jenkins base URL and job path, optional existing build,
non-secret credential-variable names, and explicit allowed SonarQube/Snyk
origins. The runner processes projects sequentially by default. Every project
gets a fresh browser context, absolute workflow deadline, run-scoped trigger
state, artifact directory, normalized evidence model, and static HTML report.

The saved pages under `templates/jenkins-template`, `templates/snyk-template`,
and `templates/sonarqube-template` are fixture and design evidence. They are
not copied wholesale into production output. The generated Jenkins/project
report shell provides links to Jenkins, Snyk, SonarQube home, SonarQube
overall, and SonarQube issues when validated evidence exists.

Snyk capture includes the visible `Snyk test report` section, a screenshot,
severity totals, and at most 500 evidence-derived detailed findings with
explicit truncation metadata.
SonarQube capture starts at a validated home page, follows a user-visible
Overview/Overall action, captures the overall page, follows Issues, and
extracts only Type and Severity facet data. Overall metrics are not normalized
in V1; the Overall page is screenshot evidence only. Project identity and
origin are revalidated across each transition, and generated CSS/structure
fallbacks are diagnostic only, never the primary navigation contract.

## Implemented baseline and revised boundary

Phase 1 finalization covers the TypeScript/Playwright bootstrap, shared
configuration contract, result types, redaction helpers, and configuration
unit coverage. The Jenkins fixture, page modules, runner, and browser E2E
specs are later-phase consumers of this contract, not Phase 1 deliverables.

For each configured project, the revised target logs in with a fresh
Playwright browser context, resolves one exact Pipeline job, selects one
existing build or submits at most one correlated build, waits for a terminal
state, then captures Jenkins/Snyk/SonarQube evidence and renders one offline
report. A lightweight aggregate index links all per-project results.

The local fixture models publisher output with deterministic HTML/JSON
artifacts. It does not run real SonarQube or Snyk scanners. Live external pages
are navigated only when their canonical origins are explicitly configured.
API-token triggering, scanner execution, vendor APIs, and parallel project
execution remain out of scope.

## Per-project state machine

```mermaid
stateDiagram-v2
  [*] --> ConfigValidated
  ConfigValidated --> Authenticated
  Authenticated --> JobResolved
  JobResolved --> ExistingBuildSelected : configured build
  JobResolved --> TriggerCapabilityChecked : trigger flow
  TriggerCapabilityChecked --> ParameterizedDeferred : build with parameters
  TriggerCapabilityChecked --> BaselineCaptured : build now
  BaselineCaptured --> TriggerSubmitted : build now
  ParameterizedDeferred --> Failed : unsupported in V1
  TriggerSubmitted --> QueueCorrelated : new queue item
  TriggerSubmitted --> BuildCorrelated : direct executable
  QueueCorrelated --> BuildCorrelated : executable assigned
  ExistingBuildSelected --> BuildRunning
  BuildCorrelated --> BuildRunning
  BuildRunning --> Terminal
  Terminal --> EvidenceCaptured
  EvidenceCaptured --> ReportRendered
  ReportRendered --> [*]
  Failed --> [*]
```

Any state may fail with a redacted diagnostic and failure-focused artifacts.
The absolute deadline applies to the entire project workflow, not separately
to each operation. Existing-build selection records zero trigger actions.
Trigger flow records the pre-submit build/queue baseline and accepts only a
new same-origin queue item or executable build correlated to this run. A
`Build with Parameters` control is detected before interaction and returns an
explicit unsupported result; it is never clicked or submitted in V1.

## Component and data flow

```mermaid
flowchart LR
  ConfigFile[Validated project JSON] --> Orchestrator[Sequential orchestrator]
  Secrets[Runtime secret variables] --> Orchestrator
  Orchestrator --> ProjectContext[Fresh project browser context]
  ProjectContext --> Jenkins[Jenkins auth, job, queue, build]
  Jenkins --> Links[Validated report links]
  Links --> Snyk[Snyk capture and normalize]
  Links --> Sonar[Sonar home, overall, issues capture]
  Jenkins --> Model[Versioned project evidence]
  Snyk --> Model
  Sonar --> Model
  Model --> ProjectReport[Static project report]
  ProjectReport --> Aggregate[Aggregate index]
```

The configuration boundary loads project JSON, normalizes Jenkins job paths,
validates unique safe project IDs, bounds durations, and compiles per-project
locator/origin policy. Normalized project config retains only credential
environment-variable names. Secret values are resolved separately from the
runtime environment for enabled projects and are never added to normalized
project config. Page modules consume immutable project config and do not parse
configuration files or environment variables directly.

`src/types.ts` owns versioned config/result contracts, project/run identity,
report states, build correlation, capture metadata, and the narrow
`BuildTrigger` boundary. Jenkins, Snyk, SonarQube, and renderer modules remain
separate so fixture selectors cannot leak into orchestration or output HTML.

## Multi-project configuration contract

`PROJECTS_CONFIG_PATH` selects file mode and points to a regular JSON file under
1 MiB. The root schema is exactly version 1: `schemaVersion: 1`, one to 50
`projects` with at least one enabled entry, and optional `defaults`. Every
project requires a unique lowercase safe `id`, display `name`, one Jenkins
`baseUrl`/`jenkinsUrl`, and relative `jobPath`. Optional fields cover an
existing build number, login path, credential-variable names, source-specific
allowed origins, and selector overrides. Standard `JENKINS_USERNAME` and
`JENKINS_PASSWORD` references remain the fallback. The file contains variable
names only; embedded secret values and credential-bearing URLs are rejected.

File mode and legacy mode are mutually exclusive: if `PROJECTS_CONFIG_PATH` is
set, any legacy project/configuration input is rejected rather than merged or
silently preferred. When it is unset, the deprecated legacy environment inputs
are adapted into one schema-v1 project and emit a deprecation diagnostic. New
orchestration operates only on the normalized list. Sequential execution is
the only initial scheduling mode; later bounded parallelism requires a separate
design because it changes Jenkins queue correlation and resource guarantees.

Each project writes immutable evidence under a sanitized stable ID, exact build
identity, and safe run ID: `reports/<project-id>/<build-number>/<run-id>/`.
Every run folder contains `index.html`, normalized `data.json`, `manifest.json`,
and requested Snyk/SonarQube screenshots. Repeated runs never overwrite prior
evidence. The aggregate `reports/index.html` is rebuilt atomically from run
manifests, links exact run folders, and reports partial-project failures without
hiding successful projects.

The accepted V1 scheduling invariant is sequential, single-process execution:
enabled projects run in configuration order through one runner/browser process,
with a fresh context per project. Aggregate publication stages and renames its
files atomically within that invocation, but it is not cross-process locked.
Deployments that point concurrent runner invocations at the same report root
must serialize those invocations; parallel aggregate writers are unsupported.

A failure before Jenkins returns a build identity is published under an
explicit `pre-build` run location with a sanitized diagnostic and no fabricated
Jenkins identity. Complete-run publication stages and replaces the whole run
directory; cross-process locking and crash-time staging-root enumeration remain
accepted V1 residuals.

## Phase 3 orchestration and artifact guarantees

Phase 3 implements the replanned sequential runner. The browser is launched
once, while each enabled project is executed in order with a new Playwright
context and a fresh run identity. A project failure is converted to a bounded
failure outcome so later projects still execute; browser cleanup and aggregate
writing happen after the project loop. The aggregate includes both outcomes
from the current invocation and validated historical manifests discovered under
the report root, while manifests for projects outside the current configuration
are reported as ignored.

The sequential/single-process runner invariant remains accepted for V1. Atomic
aggregate staging and rollback do not provide a cross-process lock, so a
deployment must serialize concurrent invocations that share one report root.

Run directories are allocated beneath a canonical, owner-private report root.
Project IDs, build numbers, and run IDs are validated before they become path
segments. Manifest and result writes use temporary files followed by atomic
renames. Discovery rejects symlinked directories and follows only safe artifact
names; it opens manifests and referenced files without following symlinks,
checks file-size/count budgets, and verifies that `manifest.json`, `data.json`,
the project/run identity, build number, build URL, state, screenshots, and
trace references agree. Persisted warnings, status, diagnostics, and URLs are
bounded, redacted, and policy-validated before they are exposed to the
aggregate report.

The Phase 3 release gate is type-checking, production compilation, the complete
unit suite, and the Compose-backed Playwright E2E suite. The E2E gate covers
sequential project isolation, continuation after a project failure, repeat-run
history, exact build identity, and the existing Jenkins fixture. Later phases
may add broader vendor-page and report-rendering coverage; this section does
not claim those later capabilities are complete.

## Phase 04 Snyk evidence pipeline (implemented 2026-08-24)

Phase 04 extends terminal-build capture with a bounded, evidence-only Snyk
adapter. Capture starts only after the exact terminal Jenkins build has been
validated. It uses no Snyk API or scanner and returns normalized evidence plus
a local screenshot reference; HTML rendering remains a later-phase concern.

### Validated artifact classification and canonicalization

- Candidate links are collected only from the exact terminal Jenkins page and
  are bounded to 256 entries. A configured Snyk report destination is preferred;
  otherwise only one unambiguous Snyk-shaped report and one summary are eligible.
- `source-link-classifier.ts` uses accessible text/ARIA/title and URL host/path
  signals. It accepts `snyk-results.html` and
  `snyk-sca-results-summary.json`, ignores unrelated artifacts, rejects
  ambiguous candidates, and rejects links outside the configured Jenkins or
  explicit Snyk origins.
- Jenkins artifact variants ending in `/*fingerprint*/` or `/*view*/` are
  canonicalized to the artifact URL before it is retained. Configured and
  observed URLs, redirects, the final report URL, and the summary URL are
  revalidated by the project origin policy. External evidence also requires a
  configured project identity.

### Script-safe capture and bounded visible extraction

The capture page disables JavaScript through CDP before navigation, falling
back to a new JavaScript-disabled context when CDP is unavailable. Every page
request is checked against the origin policy; fonts, images, media, scripts,
workers, and WebSockets are aborted. Summary JSON is fetched as bounded page
evidence with at most five redirects and a 1 MiB body limit.

Readiness uses the accessible `Snyk test report` heading first, exact visible
text second, and the configured selector last; the selected strategy is
recorded. Extraction reads only visible cards and summary labels. Semantic
`data-snyk-test` evidence is preferred, with `.card--vuln` as a diagnostic
fallback. Card extraction is capped at 2,000 visible cards, fields are clipped,
and paths/references are bounded before normalization. No raw vendor HTML is
persisted.

### Summary/detail normalization and local provenance

The summary parser accepts only a complete `severity_counts` object with
bounded non-negative integer totals. Summary-only evidence preserves totals and
an empty detail list; it never invents findings. HTML findings are normalized to
bounded text, paths, and safe HTTP(S) references, deduplicated (merging
complementary fields), deterministically ordered, and capped at the fixed 500
unique-finding limit. The result records `totalObserved`, `retainedCount`,
`truncated`, and `omittedCount`. Summary/detail severity mismatches remain
visible as warnings and make the source `incomplete`.

Each capture records the sanitized source URL, title, timestamp, readiness/card
selector strategy, and fixed 1,440×900 viewport. A successful report-section
capture writes `snyk-test-report.png` under the run directory and records its
safe local path and SHA-256 hash in capture metadata; the safe filename is also
recorded in the run manifest.

### Partial-state behavior and review boundary

An absent eligible report with no classification warning is `not_found`.
Ambiguous or unallowlisted links, navigation/identity/parse problems, summary
mismatches, or screenshot failures produce `incomplete`; valid evidence and
warnings are retained whenever possible. These typed source outcomes let the
project continue to other publishers and persist a partial result instead of
fabricating success. A workflow or persistence failure remains a project
failure.

Cycle-3 P1/P2 review findings are explicitly deferred, not fixed by this
section. Their open follow-ups remain tracked in the
[Phase 04 plan](../plans/260824-0023-jenkins-multi-project-vulnerability-reporting/phase-04-snyk-evidence-capture-and-normalization.md).

## Phase 05 SonarQube navigation and bounded facets (implemented 2026-08-25)

Phase 05 is a focused SonarQube adapter. `sonarqube-capture.ts` owns the
home → overall → issues state flow, source finalization, and retention of
earlier evidence when a later step is incomplete. The boundary is split so
browser actions, identity checks, facet extraction, and pure normalization do
not collapse into one capture module:

- `sonarqube-capture-steps.ts` handles rendered home identity, the visible
  Overview/Overall transition, and Overall screenshot/provenance capture.
- `sonarqube-issues-capture-step.ts` handles project-scoped Issues navigation,
  rendered identity, Type/Severity extraction, and the facet-only screenshot.
- `sonarqube-capture-step-types.ts` contains shared step input/result shapes;
  `sonarqube-capture-support.ts` contains route policy, metadata, screenshots,
  and bounded failure helpers.
- `sonarqube-locators.ts` and `sonarqube-facet-locators.ts` provide
  deadline-aware semantic locator ladders. `sonarqube-project-identity-locators.ts`
  keeps identity matching scoped and exact. `sonarqube-url-identity.ts`
  centralizes exact query-value and credential-free-authority checks.
- `sonarqube-source-link-classifier.ts` selects a configured or observed
  SonarQube home, while `sonarqube-issue-facets.ts` performs the pure
  Type/Severity-only normalization.

### SonarQube identity, origin, and navigation guarantees

Home discovery uses links from the exact terminal Jenkins page or a configured
home destination. The validated Home/Overview identity must remain on the
project dashboard path (`/dashboard`) with the expected project ID; the visible
Overview/Overall action then validates the Overall state. Issues is a separate
visible project-navigation step with its own `/issues` path and project-identity
validation. URLs are never synthesized as the entry path. The candidate and
every final page/request are checked against the Jenkins base context or the
project's explicit SonarQube origins. External redirects, blocked requests,
home HTTP error responses, login bounces, and wrong-project pages fail closed.

The Home/Overview page must be a project dashboard with one non-empty `id`
query value. If a project ID is configured, it must equal that URL identity.
Rendered project identity is matched exactly in the scoped project
header/navigation, or by a same-origin credential-free dashboard link with the
expected `id`. Overall requires the same exact project ID and
`codeScope=overall`; Issues independently requires the same exact project ID on
an `/issues` target. Missing, empty, or duplicate query values are rejected by
the shared exact-value check, so duplicate `id` parameters cannot be accepted
by taking the first value.

Navigation and capture live URLs are policy-validated HTTP(S) references with
no username or password authority. Browser credentials remain ephemeral and
are not included in navigation targets or persisted capture metadata,
diagnostics, or report data.

### Facet-only and partial evidence behavior

Overall contributes screenshot/provenance metadata only; its measures are not
normalized. Issues extraction reads only Type and Severity facet controls
inside their identified groups. Issue rows, descriptions, rules, paths,
assignees, tags, and source details are outside the SonarQube evidence model.
Semantic facet/data-property locators are preferred; generated structure is a
scoped diagnostic fallback.

Each facet is capped at 64 entries. Labels are trimmed to 128 characters and
counts must be bounded non-negative integers (at most 10,000,000); duplicate
labels are ignored with a warning. Type and Severity are captured
independently: if one facet is unavailable, the other valid facet remains in
the partial result, warnings are retained, and the Issues/source state is
`incomplete`. The Issues screenshot is attempted only when both facet regions
are available; a screenshot failure still preserves the validated Issues URL
and extracted facets while marking the step incomplete. A complete SonarQube
source requires all three navigation targets and no warnings.

## Historical single-project configuration baseline (pre-replanned loader)

`src/config.ts` is the single environment boundary. Required inputs are
`JENKINS_BASE_URL`, `JENKINS_USERNAME`, `JENKINS_PASSWORD`, and
`JENKINS_JOB_PATH`. `JENKINS_LOGIN_PATH` defaults to `/login`;
`JENKINS_TRIGGER_MODE` defaults to `ui` and only `ui` is accepted;
`JENKINS_TIMEOUT_MS` defaults to `300000`; `JENKINS_POLL_INTERVAL_MS` defaults
to `1000`; `PLAYWRIGHT_BROWSER` defaults to `chromium`; and `ARTIFACT_DIR`
defaults to an absolute `test-results` path. The Phase 7 handoff separately
verifies the active safe-page path in Chromium and Firefox; this historical
baseline is not the current release-gate status.
`JENKINS_BUILD_NUMBER` is
optional: when present it must be a positive integer and selects an existing
build instead of triggering one.

The seven selector inputs are optional overrides:
`JENKINS_TRIGGER_SELECTOR`, `JENKINS_AUTH_LANDMARK`,
`JENKINS_QUEUE_URL_SELECTOR`, `JENKINS_BUILD_STATUS_SELECTOR`,
`JENKINS_BUILD_URL_SELECTOR`, `SONAR_REPORT_SELECTOR`, and
`SNYK_REPORT_SELECTOR`. Each value is JSON for a typed selector with `kind`,
non-empty `value`, optional `name`, and boolean `required`; supported kinds are
`role`, `label`, `testId`, `text`, and `css`. Missing values use defaults.
Report selectors may set `required: false`, making absent publisher output a
normal report state rather than a configuration error.

The authentication and build-page selector overrides
(`JENKINS_AUTH_LANDMARK`, `JENKINS_BUILD_STATUS_SELECTOR`, and
`JENKINS_BUILD_URL_SELECTOR`) are intentionally reserved for Phases 3–4.
Phase 1/2 onboarding should leave these optional overrides unset; the typed
contract remains available for later Jenkins page-markup differences.

Parsing collects invalid or missing-input issues and throws before a browser is
launched. Diagnostics are redacted and bounded; raw credentials and
secret-bearing URL data are not part of the config error contract.

Historical migration note: the replanned configuration loader replaces this as
the orchestration entry point. During migration, these inputs may be normalized
into one project; they must not remain a second execution path.

## Configuration invariants

- Configuration is parsed before a browser is launched.
- Project configuration has `schemaVersion: 1`, at least one enabled project,
  unique safe project IDs, and no embedded credential values.
- Every Jenkins base URL is HTTP(S), canonical, and has no credentials, query,
  or fragment. Job/login paths cannot escape its configured context path.
- Snyk/SonarQube navigation is limited to the Jenkins origin or explicit
  canonical allowed origins for that project; redirects are revalidated.
- SonarQube Home/Overview identity checks require the project dashboard path and
  one exact non-empty project `id`; Overall additionally requires
  `codeScope=overall`, while Issues is independently validated on an `/issues`
  path with the same exact project ID. A configured SonarQube project ID must
  match it, and duplicate `id` query parameters fail closed.
- SonarQube navigation targets and live links are credential-free; URL userinfo
  and credential-like query values are rejected before persistence.
- Allowed origins must be bare HTTP(S) origins. Absolute source URLs may carry
  ordinary application query parameters, but credential-like query keys or
  nested assignments are rejected without echoing their values. Malformed or
  repeatedly encoded traversal/query payloads fail closed.
- Job and login paths reject absolute/network-path forms, queries, fragments,
  control characters, malformed encoding, and raw or encoded traversal.
  Relative report paths must remain within the configured Jenkins base context.
- Credentials are required for UI V1 but are never included in diagnostics,
  traces, screenshots, storage state, or committed files.
- Job paths are relative and encoded per segment; login paths are relative.
- Only `ui` trigger mode is accepted in V1.
- Timeouts, poll intervals, and existing build numbers are positive integers.
- One absolute deadline and the configured poll interval govern each project;
  nested operations consume remaining time instead of resetting the timeout.
- Locator configuration is typed JSON with one of `role`, `label`, `testId`,
  `text`, or `css` kinds. Selector overrides retain default requiredness unless
  explicitly set; report selectors may set `required: false`.
- Authentication requires a positive configured landmark or exact canonical
  job identity. Merely leaving known login paths is insufficient.
- `Build Now` is the only submitted trigger in V1. Parameterized jobs are
  detected before interaction and fail closed with zero click/submit attempts.

## Result invariants

- Replanned project evidence has `schemaVersion: 2`, a stable project ID, and
  one exact validated build number/URL. The aggregate links project results;
  it does not merge their mutable run state.
- Its `navigation` member is an object with exactly five keyed targets:
  `jenkins-build`, `snyk-report`, `sonarqube-home`, `sonarqube-overall`, and
  `sonarqube-issues`. Each target repeats its key, provides a non-empty local
  anchor and a `found`, `not_found`, or `incomplete` state, and may include a
  policy-validated live URL. Missing, extra, or array-shaped targets violate
  the schema-v2 contract.
- Report states are `found`, `not_found`, or `incomplete`.
- Report URLs/text/issue data are normalized, deduplicated, trimmed, capped,
  escaped at render time, and tied to capture source/timestamp metadata.
- The Jenkins template is a fixture/reference. Generated project HTML is a
  compact offline shell with no executable script or third-party resources.
- A terminal exact build is validated before report-link extraction. Snyk and
  SonarQube pages are captured only through the project's origin policy.
- Snyk detail is evidence-derived and capped at 500; summary-only input never
  creates invented findings. SonarQube Overall is screenshot-only, and Issues
  extraction contains only bounded Type and Severity facet data. Missing one
  facet preserves the other as partial evidence and keeps the source
  `incomplete`; it is never promoted to a fabricated complete result.
- Authentication state is ephemeral and no `storageState` is persisted.

## Test, report, and artifact policy

Pure configuration and normalization logic is unit-tested. The isolated
`playwright.unit.config.ts` matches only `tests/unit/**/*.spec.ts`, uses
`test-results/unit`, and never parses Jenkins configuration or requires
Jenkins credentials. The main `playwright.config.ts` matches the repository's
Playwright specs; it parses the complete Jenkins contract when
`tests/e2e/**/*.spec.ts` exists, so a mixed unit/E2E invocation cannot avoid
E2E startup validation. The Compose-backed Playwright flow is the local release
gate added in later phases. CI can run deterministic type/unit checks without
Docker.

Local runs use the HTML reporter; CI uses the blob reporter. Both configs use
the validated core artifact policy: requested report screenshots, normalized
data, and manifests are retained; a trace is retained only on failure or first
retry. Raw vendor HTML and video are not retained. CI allows one retry. The
configured `ARTIFACT_DIR` controls the main runner output directory; unit
artifacts remain under `test-results/unit`.

Vulnerability reports are separate from Playwright test reports. V1 records
Jenkins build identity plus normalized Snyk/SonarQube evidence, screenshots,
and source links. Static output HTML escapes all values, validates link schemes,
uses `noopener noreferrer` for external navigation, and applies a restrictive
Content Security Policy. When a report is served over HTTP, the serving layer
must also send a CSP response header containing `frame-ancestors 'none'`; an
HTML meta policy cannot enforce that directive. Missing optional publisher output
produces a partial report with warnings, not a fabricated successful section.

Unit and fixture gates cover sequential project isolation, existing-build
zero-trigger proof,
new queue/build correlation, parameterized detection with zero interaction,
stale/concurrent queue entries, external/cross-origin redirects, exact job identity, Snyk title
and detail capture, SonarQube home-to-overall navigation, and Type/Severity
issues capture despite generated-class changes. The deterministic generated-report
gate covers local links, response-header CSP, escaping/inert HTML, keyboard
traversal, axe WCAG A/AA, responsive widths, and fixed Chromium snapshots. These
fixture/offline checks include Chromium and Firefox fixture coverage. WebKit
coverage uses the digest-pinned Playwright Ubuntu runner documented in
`docs/release-gates.md`; direct host execution remains unsupported on Linux
hosts missing the browser's required libraries.

Failure evidence is never globally disabled. Keep normalized data, manifest,
last safe URL/status, and trace on failure/first retry. Requested report
screenshots are retained when capture succeeded; raw HTML, extra failure
screenshots, and video are not retained. Redact credentials, cookies, query
secrets, and sensitive headers before persistence.

Sensitive output directories (`playwright/.auth`, `playwright-report`,
`test-results`, `blob-report`, `artifacts`, `reports`, traces, and logs) are
ignored by Git. Authentication state is ephemeral; no `storageState` is
persisted. The local Jenkins volume is reset only when a developer explicitly
runs `docker compose down -v`.

## Local Jenkins fixture (historical Phase 2 baseline; extended in Phase 7)

The deterministic local fixture uses the official
`jenkins/jenkins:2.568.1-lts-jdk21`
image pinned by digest in `docker/jenkins/Dockerfile`. The custom layer adds
only `curl` for the healthcheck and the pinned Configuration as Code, Job DSL,
and Pipeline plugin set required to create one job from source-controlled
configuration. It does not install SonarQube/Snyk scanner plugins or contact
external scanner services.

Compose uses `docker/jenkins` as its build context, so local env files,
credentials, and test output outside that fixture directory cannot enter the
image build context. The Dockerfile copies only source-controlled Jenkins
fixture files, and `docker/jenkins/.dockerignore` filters accidental local
secrets or output placed inside the fixture context.

`plugins.txt` pins the direct plugins and resolved dependency closure, and the
Dockerfile disables latest-version resolution. Docker artifact resolution is
pinned but network-dependent: an image build must reach the image registry,
Debian package repository, and Jenkins plugin repository to fetch those exact
artifacts. The fixture is deterministic once built, but it is intentionally not
an offline image build and does not require external scanner services at
runtime.

Compose injects `JENKINS_USERNAME` and `JENKINS_PASSWORD`; its loopback-bound,
disposable development defaults are `local-admin` and
`local-fixture-password`. CI and non-local runs override both through the
environment. JCasC creates the local admin,
disables the setup wizard for this disposable controller, and seeds
`playwright-vulnerability-report`. The controller healthcheck probes the
unauthenticated `/login` endpoint so a password is not exposed in a process
argument. The fixture-readiness E2E then performs a bounded readiness poll,
browser login, and seeded-job assertion.

Start and inspect the fixture with:

```sh
export JENKINS_USERNAME=local-admin
export JENKINS_PASSWORD='replace-with-a-local-secret'
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 jenkins
```

The named `jenkins_home` volume is intentionally preserved by `docker compose
down`, allowing restart/repeated-build checks. Use `docker compose down -v`
only when an explicit clean reset is required; it removes Jenkins history and
forces JCasC to recreate the controller and job from the checked-in fixture.

The seeded parameterized Pipeline is the fail-closed control. It accepts
`FIXTURE_VARIANT` values `pass`, `failed`, `empty`, and `malformed`; its
`Build with Parameters` control is detected before interaction. A separate
`playwright-vulnerability-report-build-now` Pipeline has no parameters and
exercises the supported Build Now correlation path. Both jobs use the same
compact report fixture corpus: `reports/manifest.json`, semantic Snyk
HTML/JSON, and SonarQube home/Overall/Issues HTML plus JSON. The parameterized
job always archives `reports/manifest.json` and, when the
variant provides them, deterministic SonarQube/Snyk HTML and JSON artifacts.
The `failed` variant archives reports before returning a failed build, which
lets later phases test report extraction independently from build success.

For Docker-compatible development, `npm run test:e2e` supplies loopback
defaults for the disposable fixture: `JENKINS_BASE_URL` is derived from
`JENKINS_PORT` (default `8080`) when an explicit URL is absent,
`JENKINS_USERNAME=local-admin`, `JENKINS_PASSWORD=local-fixture-password`,
and `JENKINS_JOB_PATH=playwright-vulnerability-report`. The dedicated
`npm run test:e2e:build-now` script selects the separate Build Now job. These
defaults are development-only and are overridden by the process environment in
CI or when targeting a non-local controller. The continuation used
`JENKINS_PORT=18080` because an unrelated local service occupied port 8080.
The Compose service injects the same development-only credentials into the
fixture; production and CI credential values remain environment-provided.

`npm run install` provisions Chromium. For a supported Firefox host, install
Firefox explicitly with `npx playwright install firefox`. The WebKit release
gate uses `npm run test:release:webkit`; downloading WebKit with
`npx playwright install webkit` does not make the Fedora host ABI-compatible.
`JENKINS_BASE_URL` may include a context path; the readiness flow resolves
login and job URLs beneath that path, including Jenkins folder-style job paths
such as `folder/job-name`.

## Phase 2 implementation guarantees and review boundary

The Phase 2 workflow uses one immutable `WorkflowDeadline` per project. Page
navigation, trigger submission, queue/build correlation, terminal-state
polling, and report capture consume the same remaining budget and configured
poll interval; nested operations must not reset the timeout. It validates the
configured origin/context path, exact job heading, numeric queue/build paths,
and captures a pre-submit queue/latest-build baseline. Trigger results include
typed state and bounded, redacted diagnostics.

Phase 2 was approved with noted issues after review cycle 3. It is not a
production-security sign-off: correlation can still be ambiguous after an
unrelated navigation, login/job navigation does not yet reject every HTTP error
response, some locator reads are not independently deadline-bounded, and
path-based secret redaction/canonical URL rules need follow-up coverage.
Phase 7 must either resolve or explicitly accept those gaps before release;
they must not be described as closed fail-closed guarantees merely because the
deterministic gates pass.

## Phase 7 final evidence and accepted residuals (2026-08-25)

The final deterministic and local-Compose evidence is recorded here; the
[Phase 07 plan](../plans/260824-0023-jenkins-multi-project-vulnerability-reporting/phase-07-fixture-matrix-browser-gates-and-release.md)
remains the historical implementation record.

Handoff status: the scoped local release gate is complete at 85% on commit
`c148cbc`; Phase 7 remains In Progress under conditional signoff. The pinned
WebKit image is
`mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.

Recorded passing evidence:

- `npm run test:release`: type-check, build, 121 unit tests, and 5 Chromium report tests.
- Focused artifact/runner suite: 36/36 passed; prior warning-focused suite: 38/38. Chromium and Firefox vendor fixtures: 3/3 each, including the default safe-page path.
- `JENKINS_PORT=18080 npm test`: Jenkins E2E 13 passed + 1 expected skip.
- `JENKINS_PORT=18080 npm run test:e2e:build-now`: Build Now 1/1 against the
  live Compose fixture.
- `npm run test:release:webkit`: type-check, build, 121 unit tests, and 5
  WebKit report tests passed in the pinned Ubuntu runner.
- All recorded final runs completed with zero retries; `git diff --check`
  passed.

Direct WebKit launch is unavailable on this Fedora host because `libicu74` and
`libjpeg-turbo8` are unavailable; the supported WebKit gate is the pinned
Ubuntu runner exposed by `npm run test:release:webkit`.

The following are deferred/accepted residuals, not closed release gates:

- remote/live vendor capture and the optional remote Jenkins contract;
- crash-time/full staging-root enumeration and cleanup;
- cross-process report-root locking (the V1 runner remains sequential).

The sequential single-process invariant and absence of a cross-process
aggregate lock remain accepted V1 deployment constraints.

The historical Phase 2/4 review findings above are not closed by this local
release evidence. Broader production-security closure requires a later session
to resolve them or record explicit acceptance alongside the three Phase 7
residuals.
