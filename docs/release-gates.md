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
the generated-report gate. The continuation run recorded 121 unit tests and 5
Chromium report tests. `npm run test:report` is the standalone generated-report
gate when that check is needed separately.

The WebKit release gate must run in the pinned Playwright Ubuntu image because
the Linux WebKit bundle requires browser-specific system-library ABIs that are
not available on Fedora hosts. The wrapper keeps the host's Docker-compatible
runtime out of the Node dependency and browser path:

```sh
export XDG_RUNTIME_DIR=/run/user/$(id -u)  # Fedora rootless Podman
npm run test:release:webkit
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

## Phase 7 final evidence and accepted residuals

The final evidence record (2026-08-25) is below. The
[Phase 07 plan](../plans/260824-0023-jenkins-multi-project-vulnerability-reporting/phase-07-fixture-matrix-browser-gates-and-release.md)
is the historical implementation record; this section records the final docs
evidence and accepted boundary.

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

Deferred/accepted residuals (not closed by the passing gates):

- remote/live vendor capture and the optional remote Jenkins contract;
- crash-time/full staging-root enumeration and cleanup;
- cross-process report-root locking (the V1 runner remains sequential).

The passing local/CI-compatible and Podman-compatible checks do not close
those residuals. Remote Jenkins validation remains off by default. If enabled,
use an isolated disposable job, explicit allowed origins, serialization, and CI
secret-store credentials; never run it against production jobs or untrusted
fork input.

Artifact review must show only normalized `data.json`, the contract-validated
`manifest.json`, requested Snyk/Sonar screenshots, and an allowed failure trace.
It must not contain vendor HTML, video, storage state, auth captures,
unrequested screenshots, Jenkins home, cookies, headers, or secret-bearing
URLs. Inspect `git diff` and the generated artifact inventory before release;
do not commit generated test output. The recorded inventory is scoped and
passed; writer-owned publication/staging temporary cleanup is covered, but
crash-time/full unreferenced-extra and root allowlist enumeration remain
deferred.

Generated HTML carries a restrictive meta CSP for document resources, but
`frame-ancestors` must be supplied by the serving layer as a
`Content-Security-Policy` response header (the generated-report fixture sends
`frame-ancestors 'none'`). A meta policy cannot enforce that directive.
