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
the generated-report gate. The final run recorded 116 unit tests and 5 report
tests. `npm run test:report` is the standalone generated-report gate when that
check is needed separately.

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

- `npm run test:release`: 116 unit + 5 report tests; type-check and build
  passed.
- Focused suite: 38/38 passed. Chromium fixture 3/3 and Firefox fixture 3/3.
- `JENKINS_PORT=18080 npm test`: Jenkins E2E 12 passed + 1 expected skip.
- `JENKINS_PORT=18080 npm run test:e2e:build-now`: Build Now 1/1 against live
  Compose.
- All recorded final runs completed with zero retries; `git diff --check`
  passed.

WebKit is unavailable on this host because `libicu74` and `libjpeg-turbo8`
are unavailable. The release gate does not install OS packages.

Deferred/accepted residuals (not closed by the passing gates):

- remote/live vendor capture and the optional remote Jenkins contract;
- pre-build failure aggregation;
- whole-directory rollback;
- default Firefox fallback coverage (the configured default remains Chromium);
- staging/temp-root enumeration and cleanup, including full
  staging/unreferenced-artifact enumeration.

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
passed; it is not the deferred full unreferenced-extra and allowlist enumeration,
and it does not prove fixture temporary-root cleanup.

Generated HTML carries a restrictive meta CSP for document resources, but
`frame-ancestors` must be supplied by the serving layer as a
`Content-Security-Policy` response header (the generated-report fixture sends
`frame-ancestors 'none'`). A meta policy cannot enforce that directive.
