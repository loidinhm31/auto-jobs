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
the generated-report gate. The current continuation run recorded 130 unit
tests and 5 Chromium report tests. `npm run test:report` is the standalone
generated-report gate when that check is needed separately.

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

## Phase 7 residual continuation (2026-08-25)

The local/same-host V1 lifecycle and report-root locking residuals are closed
within the documented sequential, same-UID boundary. Distributed filesystems
and foreign-host writers remain outside V1. Remote/live Snyk/SonarQube capture
and the optional remote Jenkins contract remain opt-in and blocked without an
authorized endpoint and trusted CI secret-store access; this checkout has
neither.

Current continuation gate evidence (2026-08-25; every recorded run had zero
retries):

- `npm run test:release` — type-check, build, 130 unit tests, and 5 Chromium
  report tests.
- `JENKINS_PORT=18080 npm test` — 130 unit tests, 13 Jenkins E2E tests, and 1
  expected skip.
- `JENKINS_PORT=18080 npm run test:e2e:build-now` — Build Now 1/1.
- `env XDG_RUNTIME_DIR=/run/user/$(id -u) npm run test:release:webkit` — 130
  unit tests and 5 WebKit report tests in the unchanged pinned Ubuntu image
  `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
- `env XDG_RUNTIME_DIR=/run/user/$(id -u) docker info` and
  `docker run --rm hello-world` — passed under rootless Podman compatibility.
- `git diff --check` — passed.

The checked-in configs permit one retry in CI, but the recorded continuation
commands were local/non-CI and had zero retries. Generated/ignored evidence
paths are `playwright-report/index.html`, `test-results/`, and `.runner-build/`;
they are not release inputs.

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

- `ArtifactPaths.initialize()` creates owner-private canonical report and
  staging roots, rejects root overlap, and refuses symlink components.
- Staging runs receive a bounded `.leases/<project>/<run>.lease`; startup and
  post-run cleanup inspect only the exact configured roots, enforce age,
  lease, entry, byte, and removal budgets, and never follow symlinks.
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
npx playwright test tests/unit/artifact-lifecycle.spec.ts tests/unit/jenkins-phase-02.spec.ts \
  --config=playwright.unit.config.ts --workers=1
```

Result: 22/22 passed. The test creates and removes stale staging/publication
directories, preserves active/oversized/symlink candidates and an outside
sentinel, kills a staging child with `SIGKILL`, recovers an interrupted
aggregate publication, rejects unsafe direct lease/limit inputs, proves a
second process waits for the report lock, and reclaims expired same-host
dead-PID and incomplete-initial locks. Playwright outputs are under the
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
