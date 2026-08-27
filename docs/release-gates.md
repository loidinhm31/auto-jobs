# Release gates

The required deterministic, CI-compatible gates do not need Jenkins or Docker:

```sh
npm ci
npm run typecheck
npm run build
npm run test:unit
npm run test:report
```

`test:report` starts a loopback static server for generated reports and runs
headless Chromium checks for rendering, restrictive CSP, escaped/inert HTML,
local-link integrity, safe external-link attributes, keyboard traversal, axe
WCAG A/AA, responsive widths, and fixed desktop/mobile snapshots.

`npm run test:release` is the combined deterministic release gate and includes
the generated-report gate. An earlier post-hardening baseline recorded 143
unit tests and 5 Chromium report tests; the latest result is recorded in the
current continuation section below. `npm run test:report` is the standalone
generated-report gate when that check is needed separately.

The saved Jenkins/Snyk/SonarQube template snapshots have a separate hard-fail
navigation gate. It starts at the Jenkins template, serves only the checked-in
fixtures, disables JavaScript, and follows every vendor destination:

```sh
npm run test:e2e:templates
```

This static-fixture check is intentionally separate from `test:release`; it
checks template navigation. The generated offline-report check is a separate
report command and is included in the focused unit gate below; the full
`npm test` E2E glob still includes this navigation test.

## Offline template report (default)

`npm run report` now reads the checked-in Jenkins, Snyk, and SonarQube
templates. It installs bounded Playwright context routes for the synthetic
template origin, runs the normal capture/normalization/rendering path, and
writes the aggregate and per-run report under `ARTIFACT_DIR` (default
`reports`). It does not require Jenkins credentials and does not contact a
Jenkins or vendor endpoint:

```sh
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' \
ARTIFACT_DIR=reports npm run report
```

Open `reports/index.html`; the run directory contains `index.html`,
`data.json`, `manifest.json`, and `snyk-test-report.png`,
`sonarqube-overall.png`, and `sonarqube-issues.png`. The checked-in Snyk
template now reports critical/high `2/4` in both its summary JSON and six
visible detail cards. Its page metadata also reports six known vulnerabilities
and six vulnerable dependency paths, so the template-backed run can be
`success` when the other captures complete. The runner still preserves
mismatched external evidence and marks it `partial` with a warning. Use
`REPORT_SOURCE=jenkins npm run report` (or
`npm run report:jenkins`) only when a live authorized non-production endpoint
and trusted secret-store access are available.

By default, the generated report stays in the project-local, Git-ignored
`reports/` directory; an explicit `ARTIFACT_DIR` remains caller-controlled.
The `report` npm script also routes Node/Playwright scratch writes
to a unique project-local, Git-ignored `.report-runtime-*` directory, removes
it after completion when it remains safe and within the bounded cleanup
budget, and boundedly prunes only stale safe directories. The package-managed
Node and Playwright processes therefore do not intentionally use the host
`/tmp` quota. Node 24/npm 11 can initialize npm's own compile cache before a
package script starts; if that parent process is also quota-constrained, run
`NODE_DISABLE_COMPILE_CACHE=1 npm run report:jenkins` (or the corresponding
command) so the launcher itself does not touch `/tmp`. Unsafe or over-budget
runtime trees are preserved with a warning for manual review. `tmp/` paths
shown in older continuation evidence were explicitly chosen as disposable
validation roots; they are not the default output and remain preserved as
historical evidence.
`test-results/` is reserved for the Playwright test runner. From the repository
root, serve the generated report locally with:

```sh
npm run serve:report
```

It listens at `http://127.0.0.1:4173/`. For a trusted LAN-only preview, make
the exposure explicit:

```sh
npm run serve:report -- --host 0.0.0.0 --allow-lan --port 4173
```

Open `http://<this-machine-LAN-IP>:4173/`. `0.0.0.0` binds all IPv4
interfaces, so configure a firewall and never use it on an untrusted or public
network. A selected `--host <LAN-IP>` is narrower but still requires
`--allow-lan`. This server is read-only and unauthenticated. It rejects
non-canonical roots, dot-prefixed internal paths, traversal, symlinked files,
and non-GET/HEAD methods. Use `REPORT_ROOT=<directory>` or `--root <directory>`
only with a deliberate canonical report directory.

Report viewer verification on 2026-08-26 used the generated project-local
artifact at `reports/index.html` and its current run at
`reports/local-build-now/1/20260826t094751850z-4d8d7bd3f5c5c790/`:

```sh
npx playwright test tests/unit/report-server.spec.ts --config=playwright.unit.config.ts --workers=1
# 5 passed

npm run serve:report -- --host 127.0.0.1 --port 4173
# Report server: http://127.0.0.1:4173/ (root .../reports)
curl -sS -o /dev/null -w 'aggregate status=%{http_code} type=%{content_type}\n' http://127.0.0.1:4173/
# aggregate status=200 type=text/html; charset=utf-8
curl -sS -o /dev/null -w 'stylesheet status=%{http_code} type=%{content_type}\n' http://127.0.0.1:4173/assets/report.css
# stylesheet status=200 type=text/css; charset=utf-8

npm run serve:report -- --host 0.0.0.0 --allow-lan --port 4173
# LISTEN ... 0.0.0.0:4173 ...; LAN URLs were printed; aggregate status=200
```

The server was stopped after each smoke check. Traversal and the internal
`.report-root-lock/owner.json` path returned HTTP 400, and no server process
was left running. The report files are ignored under `reports/`; only the
source, test, package script, and documentation changes are release inputs.

Historical template-backed report verification before fixture cleanup
on 2026-08-26:

```sh
mkdir -p tmp/template-report-final-20260826-current
ARTIFACT_DIR=/mnt/data/ws/sharing/playwright-report-vulnerabilities/tmp/template-report-final-20260826-current \
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' \
npm run report
# exit 0
# report source: checked-in templates (no Jenkins job was run)
# local-build-now: partial
# local-build-now: summary Snyk critical=3, high=17, medium=0, low=0; detailed=6/6; SonarQube types Bug=1, Vulnerability=0, Code Smell=526; severities Blocker=23, Critical=8, Major=165, Minor=323, Info=8; snapshots=3
# Snyk summary/detail mismatch: critical summary=3 observed=2, high summary=17 observed=4
```

The aggregate is
`tmp/template-report-final-20260826-current/index.html`; the per-run report is
`tmp/template-report-final-20260826-current/local-build-now/1/20260826t083045454z-1c8f964242db6248/data.json`
and its sibling `index.html`. That run retained six Snyk findings and the
summary counts `3/17/0/0` (critical/high/medium/low), plus SonarQube Type and
Severity facets (`Bug: 1`, `Code Smell: 526`, `Blocker: 23`, `Critical: 8`,
`Major: 165`, `Minor: 323`, `Info: 8`) and all three requested screenshots.
The focused regression passed 3/3 with
`npx playwright test tests/unit/template-report.spec.ts --config=playwright.unit.config.ts`.
The `partial` state is intentional because the checked-in summary totals do
not equal the six visible detail cards; no Jenkins or private credential was
used or persisted.

## Clean template consistency refresh (2026-08-27)

The checked-in Snyk template was corrected after confirming that its six
visible cards contain two critical and four high findings. The summary JSON,
page description, and visible page totals now all report six findings and six
vulnerable dependency paths. The separate Docker Jenkins Snyk fixture remains
consistent at four findings with counts `0/1/2/1`.

```sh
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' npm run report
# exit 0; report source: checked-in templates (no Jenkins job was run)
# local-build-now: success
# local-build-now: summary Snyk critical=2, high=4, medium=0, low=0; detailed=6/6; SonarQube types Bug=1, Vulnerability=0, Code Smell=526; severities Blocker=23, Critical=8, Major=165, Minor=323, Info=8; snapshots=3
# aggregate report: reports/index.html

npx playwright test tests/unit/snyk-phase-04.spec.ts tests/unit/snyk-screenshot-retry.spec.ts \
  tests/unit/template-report.spec.ts \
  --config=playwright.unit.config.ts --workers=1
# 14 passed

npm run test:e2e:templates
# 1 passed
```

The complete validation matrix was rerun after the correction. The disposable
Compose controller was started with `XDG_RUNTIME_DIR=/run/user/$(id -u)
JENKINS_PORT=18080 docker compose up -d --build` and reported healthy; the
Docker-compatible `docker info` and `docker run --rm hello-world` smoke checks
also passed. The exact release and browser results were:

- `npm run test:release` — PASS: type-check, build, 160 unit tests, and 5
  Chromium report tests.
- `TMPDIR=/mnt/data/ws/sharing/.pw-runtime.tx7Xac JENKINS_PORT=18080 npm test`
  — PASS: 160 unit tests, 15 E2E tests, and 1 expected skip. The temporary
  directory was used only because the host `/tmp` filesystem was nearly full;
  existing files there were preserved.
- `JENKINS_PORT=18080 npm run test:e2e:build-now` — PASS, 1/1.
- `env XDG_RUNTIME_DIR=/run/user/$(id -u) npm run test:release:webkit` — PASS:
  160 WebKit unit tests and 5 WebKit report tests in the unchanged pinned
  Ubuntu runner; the container audit reported 0 vulnerabilities.
- `git diff --check` — PASS; Git emitted only existing CRLF normalization
  warnings for checked-in template files.

The fresh aggregate is `reports/index.html`; the exact project run is
`reports/local-build-now/1/20260826t184223704z-c1a5984b06a78db3/` and contains
the normalized `data.json`, generated report, manifest, stylesheet-backed
HTML, and three requested screenshots. The generated run has no Snyk
summary/detail mismatch warning. The old partial artifact was quarantined
outside the served root before regeneration; no source or private credential
was removed.

The WebKit release gate must run in the pinned Playwright Ubuntu image because
the Linux WebKit bundle requires browser-specific system-library ABIs that are
not available on Fedora hosts. The wrapper keeps the host's Docker-compatible
runtime out of the Node dependency and browser path:

```sh
# Fedora rootless Podman
env XDG_RUNTIME_DIR=/run/user/$(id -u) npm run test:release:webkit
```

`docker-compose.webkit.yml` uses
`mcr.microsoft.com/playwright:v1.62.1-noble` pinned by digest, mounts the
repository for reports, isolates `node_modules` in a named volume, and runs
`npm ci --ignore-scripts` before the same release gate. The image version must
stay aligned with `@playwright/test`; refresh the image digest whenever that
dependency changes. See the [Playwright Docker guidance](https://playwright.dev/docs/docker)
for the supported image and security caveats.

The full suite is:

```sh
npm test
```

The local Jenkins release gate is optional for ordinary unit work but required
before a Compose-backed release decision:

```sh
export JENKINS_USERNAME=local-admin
export JENKINS_PASSWORD='use-a-local-only-secret'
export JENKINS_PORT=18080
docker compose config
docker compose up -d --build
docker info
docker run --rm hello-world
JENKINS_JOB_PATH=playwright-vulnerability-report npm run test:e2e
npm run test:e2e:build-now
docker compose down
```

Both E2E scripts derive `JENKINS_BASE_URL` from `JENKINS_PORT` when an explicit
URL is not supplied, and Compose uses the same port variable. The continuation
used `JENKINS_PORT=18080` because an unrelated service occupied the default
8080; set `JENKINS_BASE_URL` explicitly when it should take precedence.

The named `jenkins_home` volume is intentionally retained for repeat-build
and immutable-run checks. Use `docker compose down -v` only for an explicitly
requested clean reset. On Fedora, Podman with `podman-docker` is sufficient;
export `XDG_RUNTIME_DIR=/run/user/$(id -u)` before the `docker info`, smoke,
and Compose commands and start `podman.socket` if needed.

The continuation record reports the Docker/Compose config, build, start, login,
job, artifact, and smoke-image checks passing. In the current environment the
Docker CLI is backed by rootless Podman, so this is also Podman-compatible
evidence; it does not imply a separate remote Jenkins contract.

## Phase 7 final evidence and accepted residuals (historical 85% handoff)

The final evidence record (2026-08-25) is below. The
[Phase 07 plan](../plans/260824-0023-jenkins-multi-project-vulnerability-reporting/phase-07-fixture-matrix-browser-gates-and-release.md)
is the historical implementation record; this section records the final docs
evidence and accepted boundary.

Handoff status: the scoped local release gate is complete at 85%, but Phase 7
remains In Progress under conditional signoff. The baseline is commit
`c148cbc` (2026-08-25). The WebKit gate is reproducible with
`mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.

- `npm run test:release`: 121 unit + 5 Chromium report tests; type-check and build
  passed.
- Focused artifact/runner suite: 36/36 passed; prior warning-focused suite:
  38/38. Chromium and Firefox vendor fixtures: 3/3 each, including the default
  safe-page path.
- `JENKINS_PORT=18080 npm test`: Jenkins E2E 13 passed + 1 expected skip.
- `JENKINS_PORT=18080 npm run test:e2e:build-now`: Build Now 1/1 against live
  Compose.
- `npm run test:release:webkit`: type-check, build, 121 unit tests, and 5
  WebKit report tests passed in the pinned Ubuntu runner.
- All recorded final runs completed with zero retries; `git diff --check`
  passed.

Direct WebKit launch is unsupported on this Fedora host because `libicu74` and
`libjpeg-turbo8` are unavailable. Run `npm run test:release:webkit` for the
supported Ubuntu-based gate; do not substitute host-library symlinks or rely on
`npx playwright install webkit` alone, because browser download does not install
the required ABI-compatible system libraries on Fedora.

This residual list is historical handoff context only; the current continuation
below supersedes its lifecycle and same-host locking status.

Deferred/accepted residuals (not closed by the historical handoff gates):

- remote/live vendor capture and the optional remote Jenkins contract;
- crash-time/full staging-root enumeration and cleanup;
- cross-process report-root locking (the V1 runner remains sequential).

The passing local/CI-compatible and Podman-compatible checks do not close
those residuals. Remote Jenkins validation remains off by default. If enabled,
use an isolated disposable job, explicit allowed origins, serialization, and CI
secret-store credentials; never run it against production jobs or untrusted
fork input.

Historical Phase 2/4 review findings referenced by the architecture were a
separate production-security follow-up at this handoff. The continuation
audit and V1 acceptance are recorded in the current section below.

## Phase 7 residual continuation (2026-08-26)

The local/same-host V1 lifecycle and report-root locking residuals are closed
within the documented sequential, same-UID boundary. Distributed filesystems
and foreign-host writers remain outside V1. Remote/live Snyk/SonarQube capture
and the optional remote Jenkins contract remain opt-in and blocked without an
authorized endpoint and trusted CI secret-store access; this checkout has
neither.

Current continuation gate evidence (2026-08-26; successful test runs had zero
retries; the WebKit compose retry was only for the registry-install failure):

- `npm run test:release` — type-check, build, 157 unit tests, and 5 Chromium
  report tests.
- `npm run test:e2e:templates` — 1/1 template-navigation test passed from the
  Jenkins snapshot through Snyk and all SonarQube snapshots.
- `JENKINS_PORT=18080 npm test` — 157 unit tests, 15 E2E tests, and 1 expected
  skip (14 Jenkins-backed tests plus the template-navigation test).
- `JENKINS_PORT=18080 npm run test:e2e:build-now` — Build Now 1/1.
- `env XDG_RUNTIME_DIR=/run/user/$(id -u) npm run test:release:webkit` — 157
  WebKit unit tests and 5 WebKit report tests passed in the unchanged pinned
  Ubuntu image; the container `npm ci --ignore-scripts` step audited 10
  packages with 0 vulnerabilities.
- `env XDG_RUNTIME_DIR=/run/user/$(id -u) docker info` and
  `docker run --rm hello-world` — passed under rootless Podman compatibility.
- `git diff --check` — passed.

The checked-in configs permit one retry in CI, but the recorded continuation
commands were local/non-CI and had zero retries. Generated application evidence
is under `reports/index.html`; Playwright test evidence is under
`playwright-report/index.html`, `test-results/`, and `.runner-build/`; none are
release inputs.

Read-only capability audit:

```text
git remote -v
rg --files -g '.github/**' -g '.gitlab-ci.yml' -g 'Jenkinsfile*' \
  -g 'docker-compose*.yml' -g 'package.json' | sort
gh auth status
env | rg '^(SNYK|SONAR|JENKINS|PROJECTS_CONFIG|.*TOKEN|.*PASSWORD|.*SECRET|CODEX_)'
ss -ltnp
curl -sS -o /dev/null -w 'http_code=%{http_code}\n' \
  http://127.0.0.1:18080/login

# Results: no Git remotes; only local Compose/Jenkins files and package.json;
# gh unavailable; only CODEX_SESSION_ID, CODEX_THREAD_ID, CODEX_CI among
# relevant variables; loopback listeners on 127.0.0.1:8080 and :18080;
# http_code=200 for the disposable :18080 fixture.
```

No Snyk, SonarQube, or remote Jenkins URL was discovered, and no remote job,
production job, untrusted fork, or secret-bearing command was executed. The
loopback `:18080` controller is the disposable local fixture only. A remote
gate may be enabled only by an explicit deployment decision that supplies a
trusted CI secret store, an isolated non-production job, an origin allowlist,
serialization, and disposable retention; it must remain disabled when any of
those inputs is absent. Credentials must be injected at runtime and never
hard-coded or sourced from untrusted fork jobs.

Lifecycle and lock implementation:

- `ArtifactPaths.initialize()` creates canonical report and staging roots,
  rejects root overlap, and refuses symlink components. The caller controls
  permissions for global roots and descendants; path containment, no-follow
  symlink checks, and artifact identity validation remain enforced.
- Staging runs receive a bounded `.leases/<project>/<run>.lease`; startup and
  post-run cleanup inspect only the exact configured roots, enforce age,
  lease, entry, byte, and removal budgets, and never follow symlinks. An
  expired recognized lease whose staging run was renamed before lease cleanup
  is also reaped; active or malformed orphan leases are preserved.
- Cleanup accepts only the known project/run/build layout and preserves
  malformed or ambiguous entries, including random `.run-backup-*` rollback
  directories, rather than risking deletion of evidence. Recovery lock
  quarantine stays inside the exact report root.
- `reportRoot/.report-root-lock` serializes same-host, same-UID runner work
  through browser close, discovery, and aggregate publication. It uses an
  owner token, PID/hostname, heartbeat, bounded wait, and stale recovery only
  when the same-host owner PID is demonstrably dead. Foreign-host, malformed,
  live-owner, and symlinked locks fail closed; distributed locking is not
  claimed.

Bounded-preservation policy: only recognized, safe, stale, in-budget entries
inside the exact configured roots are deletion candidates. Active leases,
malformed, oversized, symlinked, foreign, out-of-root, and ambiguous entries
are preserved with bounded warnings; cleanup never performs unrestricted
recursive deletion or exhaustive root enumeration.

Focused regression evidence:

```sh
npx playwright test tests/unit/artifact-lifecycle.spec.ts tests/unit/artifact-paths.spec.ts tests/unit/jenkins-phase-02.spec.ts tests/unit/sequential-runner.spec.ts \
  --config=playwright.unit.config.ts --workers=1
```

Result: 49/49 passed. The test creates and removes stale staging/publication
directories, preserves active/oversized/symlink candidates and an outside
sentinel, kills a staging child with `SIGKILL`, recovers an interrupted
aggregate publication, rejects unsafe direct lease/limit inputs, proves a
second process waits for the report lock, and reclaims expired same-host
dead-PID and incomplete-initial locks, including an expired lease whose
staging directory was already renamed. Playwright outputs are under the
ignored `playwright-report/index.html` and `test-results/` paths;
`.runner-build/` contains generated build output. No generated output is
release input.

Artifact review must show only normalized `data.json`, the contract-validated
`manifest.json`, requested Snyk/Sonar screenshots, and an allowed failure trace.
It must not contain vendor HTML, video, storage state, auth captures,
unrequested screenshots, Jenkins home, cookies, headers, or secret-bearing
URLs. Inspect `git diff` and the generated artifact inventory before release;
do not commit generated test output. The recorded inventory is scoped and
passed. Bounded cleanup intentionally preserves unrecognized, malformed,
oversized, symlinked, and ambiguous entries; it does not claim unrestricted
recursive deletion or exhaustive root enumeration.

Historical Phase 2/4 findings are resolved where the audit lists them as
resolved, and the remaining V1 boundaries are explicitly accepted by the
runner maintainers on 2026-08-25. That acceptance has a review/expiry date of
2026-09-25 and must be revisited before remote/live Snyk, SonarQube, optional
Jenkins, or untrusted-input enablement. See the matching acceptance detail in
the architecture record.

Generated HTML carries a restrictive meta CSP for document resources, but
`frame-ancestors` must be supplied by the serving layer as a
`Content-Security-Policy` response header (the generated-report fixture sends
`frame-ancestors 'none'`). A meta policy cannot enforce that directive.

## Continuation verification (2026-08-26)

The remaining local compatibility failure was reproduced with the existing
root-owned `0777` `tmp/reports` and `tmp/artifacts` directories. The runner now
accepts caller-managed permissions while retaining real-directory, no-follow
symlink, containment, safe-identity, lease, and report-root-lock checks. The
internal `.report-root-lock` directory is ignored by manifest discovery rather
than reported as a project artifact.

Focused regression command and result:

```sh
npx playwright test tests/unit/artifact-lifecycle.spec.ts tests/unit/artifact-paths.spec.ts tests/unit/jenkins-phase-02.spec.ts tests/unit/sequential-runner.spec.ts \
  --config=playwright.unit.config.ts --workers=1
# 49 passed
```

The Jenkins adapter now recovers a disappeared queue item only through an
exact same-origin queue API executable tied to the exact configured job; it
never scans the job page for a sole newer build. Queue/build API requests
disable redirects and verify the final response URL, and queue payloads must
be non-cancelled with matching task/build identities. Standard Jenkins
status/build markup is supported when the optional custom `data-testid` hooks
are absent. The 64 KiB response check rejects known oversized responses before
body acceptance and rejects oversized buffered responses; because Playwright
buffers `APIResponse`, this is an accepted input/retention bound rather than a
hard peak-memory bound.

The local command was verified with credentials supplied only through the
shell environment (not recorded here):

```sh
ARTIFACT_DIR=/mnt/data/ws/sharing/playwright-report-vulnerabilities/tmp/reports \
JENKINS_BASE_URL=http://127.0.0.1:18080 \
JENKINS_JOB_PATH=playwright-vulnerability-report-build-now \
JENKINS_USERNAME="$JENKINS_USERNAME" JENKINS_PASSWORD="$JENKINS_PASSWORD" \
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' \
REPORT_SOURCE=jenkins npm run report
```

Result: exit 0, `partial` (legacy mode does not declare Snyk/Sonar artifact
identity), build 42, and report artifact
`tmp/reports/local-build-now/42/20260825t210326691z-3041b4a9fee125a2/`.
The remaining partial-evidence risk is intentional: use schema-v1
`PROJECTS_CONFIG_PATH` with explicit source paths/identities for complete
vendor evidence. Remote/live vendor capture and the optional Jenkins contract
remain opt-in without authorized non-production endpoints and trusted secret
store access. Relaxed root permissions also require a trusted isolated root;
they do not protect against another same-host writer with access to it. This
legacy partial result and trusted-root race are accepted V1 policy boundaries,
not production or remote/live approvals.

## Report-output and archived-fixture compatibility (2026-08-26)

The report-output residual is closed for the disposable local fixture. The
legacy default is now `reports`, while `test-results/` remains Playwright's
ignored test artifact directory. Archived Jenkins links are discovered from
the exact terminal build, the terminal page is refreshed for a bounded period
when Jenkins has not indexed artifacts yet, and optional legacy vendor IDs are
validated independently from the runner `PROJECT_ID`.

After refreshing the disposable container with the current fixture
(`JENKINS_PORT=18080 docker compose up --build -d jenkins`), this command was
run from the repository using only loopback fixture credentials:

```sh
ARTIFACT_DIR=/mnt/data/ws/sharing/playwright-report-vulnerabilities/tmp/reports \
JENKINS_BASE_URL=http://127.0.0.1:18080 \
JENKINS_JOB_PATH=playwright-vulnerability-report-build-now \
JENKINS_USERNAME=local-admin JENKINS_PASSWORD=local-fixture-password \
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' \
SNYK_PROJECT_ID=service-a SONARQUBE_PROJECT_ID=service-a \
REPORT_SOURCE=jenkins npm run report
```

Result: exit 0, `local-build-now: success`, Jenkins build 54. The current
artifact is
`tmp/reports/local-build-now/54/20260826t012010422z-4ee12d17e9d03bdf/`;
`data.json` records Snyk `found` with counts `0/1/2/1` and four findings, and
SonarQube `found` with Type `Bug: 1` and Severity `Major: 2`. The aggregate is
`tmp/reports/index.html` and the local stylesheet is
`tmp/reports/assets/report.css`.

Browser smoke against an HTTP server rooted at `tmp/reports` returned HTTP
200 for the aggregate and current report, loaded the local stylesheet and all
three screenshots, found the Snyk and Sonar headings, and found no scripts or
inline event handlers. No vendor HTML/CSS/scripts are copied into the report.
This earlier live-run record predates the offline template-source mode; the
saved `templates/` files are now also consumed by the default report command.

Without `SNYK_PROJECT_ID` and `SONARQUBE_PROJECT_ID`, legacy mode may still
produce a valid but partial report when a publisher's archived identity cannot
be proven. That is an explicit fail-closed configuration outcome; use the
identities above or schema-v1 file mode for complete evidence. Remote/live
Snyk/SonarQube and optional Jenkins contract infrastructure remains unavailable
and opt-in.

## Post-review edge hardening (2026-08-26)

The follow-up review residuals are now covered. The default Jenkins build-link
selector accepts a sole newer queue-page link only when the same queue item's
bounded same-origin API executable proves the exact job and build; malformed or
duplicate Sonar `id` parameters fail closed. Terminal settlement waits for all
configured publishers, caps reload attempts at 32 inside a five-second budget,
and semantic Snyk table/list extraction ignores hidden nodes.

Focused regression evidence:

```sh
npx playwright test tests/unit/jenkins-phase-02.spec.ts tests/unit/snyk-review-regressions.spec.ts tests/unit/sonarqube-phase-05.spec.ts \
  --config=playwright.unit.config.ts --workers=1
# 60 passed

JENKINS_BASE_URL=http://127.0.0.1:18080 JENKINS_USERNAME=local-admin \
JENKINS_PASSWORD=local-fixture-password JENKINS_JOB_PATH=service-a \
npx playwright test tests/e2e/vendor-template-capture.spec.ts \
  -g 'refreshes an exact terminal build' --config=playwright.config.ts --workers=1
# 1 passed
```

The required gates were rerun after those fixes:

```sh
JENKINS_PORT=18080 npm test                                  # 152 unit; 15 E2E passed, 1 skipped
JENKINS_PORT=18080 npm run test:e2e:build-now                # 1 passed
npm run test:release                                          # 152 unit; 5 Chromium report passed
env XDG_RUNTIME_DIR=/run/user/$(id -u) npm run test:release:webkit # compose npm ci blocked by registry EIDLETIMEOUT
```

The same pinned Ubuntu image, invoked with the already-installed checkout
dependencies, passed the WebKit release suite: 152 unit tests and 5 report
tests. The compose definition and image digest were not changed.

The exact loopback report command exited 0 with `local-build-now: success`,
Jenkins build 56, and artifact
`tmp/reports/local-build-now/56/20260826t020350772z-241ee9943873267c/`.
`data.json` records Snyk `found` with counts `0/1/2/1` and four findings, and
SonarQube `found` with Type `Bug: 1` and Severity `Major: 2`. The aggregate and
stylesheet are `tmp/reports/index.html` and `tmp/reports/assets/report.css`.
Remote/live Snyk/SonarQube and optional Jenkins infrastructure remains
unavailable and opt-in; no production job, untrusted fork, or private secret
store was used.

## Node 24 quota-safe report and Playwright launchers (2026-08-27)

The reported `Unknown system error -122: Unknown system error -122, write`
was Linux `EDQUOT`: Node 24/npm 11 was initializing its default
`/tmp/node-compile-cache` on a host tmpfs at its quota. The report command also
had an unnecessary nested npm hop. The package now launches the report
wrapper directly, disables Node's optional compile cache for managed children,
and uses `scripts/run-playwright.mjs` to route Playwright `TMPDIR`, `TMP`, and
`TEMP` to a unique project-local `.report-runtime-*` directory. The bounded
cleanup and stale-recovery rules remain unchanged. The outer npm process starts
before package scripts can change its environment; if it is itself blocked by
the host quota, use the explicit prefix shown below.

Exact live-fixture verification from the repository root:

```sh
JENKINS_BASE_URL=http://127.0.0.1:18080 \
JENKINS_JOB_PATH=playwright-vulnerability-report-build-now \
JENKINS_USERNAME=local-admin JENKINS_PASSWORD=local-fixture-password \
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' \
SNYK_PROJECT_ID=service-a SONARQUBE_PROJECT_ID=service-a \
npm run report:jenkins
# exit 0; local-build-now: success
# summary Snyk critical=0, high=1, medium=2, low=1; detailed=4/4
# SonarQube types Bug=1; severities Major=2; snapshots=3
# report: reports/local-build-now/84/20260827t023441946z-442477419d9cc4ba/index.html
# aggregate: reports/index.html

npm run test:release
# PASS: type-check, build, 160 Chromium unit tests, 5 Chromium report tests

JENKINS_PORT=18080 npm test
# PASS: 160 unit tests, 15 E2E tests, 1 expected skip

JENKINS_PORT=18080 npm run test:e2e:build-now
# PASS: 1/1

env XDG_RUNTIME_DIR=/run/user/$(id -u) npm run test:release:webkit
# PASS: 160 WebKit unit tests and 5 WebKit report tests in the unchanged
# digest-pinned Ubuntu runner; container npm audit reported 0 vulnerabilities

git diff --check
# PASS; only existing CRLF normalization warnings were emitted
```

After each run, no `.report-runtime-*` directory remained in the project.
The generated report is under ignored `reports/`; `test-results/` remains
reserved for Playwright test output. No `tmp/`, production job, untrusted fork,
or private secret-store data was removed or used.
