# Project overview and PDR

**Product:** `auto-jobs`  
**Document scope:** schema-v1 report capture, Phase 2 Jenkins auto-build,
Phase 3 offline build-page fixtures, and Phase 01 local SecretStore backend  
**Current milestone:** Phase 3 — **DONE** (2026-09-02T16:57:40+07:00)  
**Credential milestone:** Phase 01 SecretStore backend — **DONE** (2026-09-03)

## Product summary

`auto-jobs` is a private Node.js/TypeScript Playwright runner for collecting
bounded Snyk and SonarQube vulnerability evidence from exact Jenkins job pages.
It writes immutable static reports for the report path. The explicit auto-build
path submits one Jenkins **Build with Parameters** form for the configured
target job and returns a sanitized in-memory outcome; it does not collect
evidence or write report artifacts. Phase 3 adds a minimal checked-in build
detail page and exact offline routes so both paths can be proven without live
Jenkins or vendor services.

Phase 01 adds a local `SecretStore` persistence seam for the future control
plane. It stores validated environment-style key/value pairs in the
git-ignored `config/secrets.local.json` using deterministic, atomic,
write-locked updates. Control mode constructs the store and exposes it to
trusted in-process callers; the current HTTP router and executors do not yet
read or inject these values.

The product treats Jenkins navigation and build submission as high-risk external
operations. Configuration, target identity, selectors, credentials, deadlines,
and failure semantics are validated before side effects.

## Goals

1. Make report capture deterministic, bounded, and safe for multiple configured
   projects.
2. Permit an intentional Jenkins parameterized build only for one exact,
   enabled, explicitly selected `auto-build` project.
3. Keep report capture and build submission mutually exclusive.
4. Preserve target identity: `jobUrl` is the only branch/job identity.
5. Make ambiguous post-submit outcomes visible without risking duplicate builds.
6. Keep credentials and request/form data out of persisted results and logs.
7. Provide deterministic fixture and unit tests without live Jenkins/vendor
   dependencies.
8. Keep future dynamic credential updates isolated from versioned project
   configuration and process-global environment state.

## Non-goals

- Searching Jenkins jobs or deriving a branch from a selector, URL fragment, or
  separate `targetBranch` field.
- Editing Jenkins parameters, using **Build Now**, polling queues/builds,
  discovering build numbers, cancellation, or automatic retry.
- Running auto-build from `npm run report` or from an environment-wide switch.
- Capturing Snyk/SonarQube evidence during an auto-build run.
- Claiming that checked-in fixtures or deterministic tests prove a live build.
- Exposing dynamic credentials over HTTP or merging SecretStore values into
  execution environments in Phase 01. Later control-plane phases must preserve
  explicit selection and confirmation boundaries.

## Users and use cases

| User | Need | Supported boundary |
| --- | --- | --- |
| Report operator | Collect evidence for configured jobs | `npm run report -- --config <path>` |
| Build integration | Submit one selected target-branch build | `selectAutoBuildProject` → `runAutoBuildProject` |
| Maintainer | Prove behavior without external services | Unit tests and exact offline fixtures |
| Reviewer | Inspect safe outputs and release gates | Static report root, manifests, and documented commands |
| Control maintainer | Persist local credential values without changing project JSON | `SecretStore` in control mode (in-process only in Phase 01) |

## Functional requirements

### FR-1: Configuration

- Accept one schema-v1 JSON document with one to 50 projects.
- Require exact credential-free HTTP(S) `loginUrl` and `jobUrl` values on one
  Jenkins origin/base context.
- Normalize an omitted project `runType` to `report`.
- Accept only `runType: 'report' | 'auto-build'`; keep it project-only.
- Treat `enabled: false` as an unconditional execution gate.
- Validate selectors, source origins, paths, identities, timeouts, and
  credential-variable references before browser launch.

### FR-2: Mode selection

- `selectReportProjects(projects)` returns only enabled normalized report
  projects and fails if none remain.
- `selectAutoBuildProject(projects, projectId)` requires one exact non-empty ID,
  an enabled project, and normalized `runType: 'auto-build'`.
- Selection helpers are pure and cannot submit a request.
- `runFromConfig` passes only report projects to the sequential report runner.

### FR-3: Report execution

- Use one configured browser and a fresh context per selected project.
- Execute in configuration order and continue after an individual failure.
- Authenticate through exact Jenkins login, open exact `jobUrl`, discover
  allowed publisher links once, and capture bounded Snyk/SonarQube evidence.
- Stage, validate, and publish immutable per-run artifacts and an aggregate.

### FR-4: Auto-build execution

- Reuse validated login and exact `jobUrl` navigation.
- Require one visible `#side-panel` and one visible configured **Build with
  Parameters** link within it.
- Validate the link as the exact configured job `/build` action before clicking.
- Require one visible `#bottom-sticker`, one configured **Build** button, all
  required Jenkins class tokens, one ancestor `POST` form, and the exact same
  `/build` action.
- Arm request/response observers before clicking and click exactly once.
- Reuse existing page defaults; do not inspect or modify hidden parameter values.

### FR-5: Outcomes and side effects

- Return only bounded safe fields: project identity, configured job URL,
  validated build-page URL, timestamp, optional numeric status, safe diagnostic,
  state, and exit code.
- Classify a matching response below HTTP 400 as `submitted`.
- Classify a matching response at or above HTTP 400 as `rejected`.
- Classify an observed matching POST without a determinate response as
  `submission-unknown`.
- Map pre-POST failures to `failed-before-submit` in the auto-build runner.
- Never retry after a matching POST or possible external side effect.

### FR-6: Resource and secret handling

- Use one absolute `WorkflowDeadline` for each project build workflow.
- Create a fresh Playwright context/page and close resources with bounded
  best-effort cleanup.
- Current report and auto-build execution resolves credentials from
  environment-variable references only; future run-environment integration may
  consume a SecretStore snapshot without mutating `process.env`.
- Redact secret values from diagnostics and clear mutable secret copies.
- Do not persist auto-build artifacts, cookies, headers, bodies, crumbs, queue
  IDs, build numbers, or response bodies.

### FR-7: Local SecretStore backend

- Persist dynamic credential values only in the fixed
  `<configRoot>/secrets.local.json` target, outside schema-v1 project JSON.
- Require an existing canonical real config directory and reject symlinked or
  non-directory roots; never accept a caller-selected path or filename.
- Treat a missing/empty file as `{}`. Require a JSON object no larger than
  `MAX_SECRET_FILE_BYTES` (1 MiB), keys matching
  `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/`, and string values.
- Provide `readSecrets`, `listSecretNames`, `putSecret`, `putSecrets`,
  `deleteSecret`, and `deleteSecrets`. Return frozen snapshots and sorted names.
- Serialize read-modify-write updates under an in-memory lock and replace the
  target atomically through an exclusive sibling temporary file (`0o600`,
  sync, close, rename). Remove temporary files after failed writes.
- Keep secret values out of errors and diagnostics. The `config/*.local.json`
  ignore rule prevents the local file from entering version control.
- In control mode, expose the store to trusted in-process callers through
  `ReportServerHandle`/`ControlRouterContext`; defer HTTP API exposure and
  run-environment injection to later phases.

### FR-8: Offline build-page fixture

- Keep `templates/jenkins-template/template-build.html` minimal, inert, and
  free of credentials, scripts, external assets, production hosts, and report links.
- Load nine fixture files through canonical, no-follow, identity-checked reads
  under the existing 4 MiB per-file and 16 MiB cumulative limits.
- Derive the build detail URL from the unique saved `#side-panel`
  **Build with Parameters** anchor; validate its origin, exact same-job
  `/build` path, and allowed `delay=0sec` query.
- Validate one matching build canonical URL, one `POST` form/action, one
  `#bottom-sticker`, and one classed `Build` submit button before route setup.
- Fulfill only exact synthetic fixture URLs. The exact build `POST` returns a
  `303` redirect to the exact fixture job URL; all other methods/URLs abort and
  record bounded sanitized misses.
- Keep fixture helpers modular and preserve `template-report-fixture.ts` as the
  public facade. Report mode does not follow the build route.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Safety | Fail closed on invalid origins, actions, selectors, cardinality, forms, modes, or identities. |
| Idempotency | No automatic retry after a matching build POST; preserve unknown state. |
| Security | Credential-free URLs, environment references or local SecretStore values (never project JSON), bounded diagnostics, and no hidden-form inspection. |
| Persistence | Secret updates are bounded, sorted, serialized under an in-process lock, atomically renamed, and close their file handle on write/sync failure; rename failures clean up temporary files. |
| Availability | Report projects continue after a project failure; cleanup is bounded. |
| Determinism | Unit and fixture tests use injected dependencies or exact default-deny routes. |
| Maintainability | Keep one responsibility per module, strict TypeScript, and production files below 200 lines when changed. |
| Documentation | Keep each Markdown file below 800 lines and link only verified paths. |

## Phase 01 acceptance criteria

- [x] `createSecretStore(configRoot)` fixes the target to
  `secrets.local.json` below an existing canonical real directory.
- [x] Missing/empty files read as an empty map; malformed JSON, arrays/null,
  invalid names, non-string values, non-regular/symlinked files, and oversized
  payloads fail closed.
- [x] `readSecrets` and `listSecretNames` return frozen snapshots; mutations
  support single/bulk put and single/bulk deletion with deterministic sorted
  keys.
- [x] Concurrent read-modify-write updates are serialized in memory, writes
  use an exclusive `0o600` temporary sibling plus sync/close/rename, and
  rename failures remove temporary files while write/sync failures close the
  file handle.
- [x] Errors do not include secret values; Windows mode-bit limitations are
  documented as an ACL concern.
- [x] Control mode creates the store and exposes it through the server handle
  and router context without adding an HTTP secret endpoint or run injection.

## Phase 2 acceptance criteria

- [x] Exact job-action URL validation rejects sibling jobs, foreign origins,
  prefixes, encoded path tricks, fragments, and unexpected queries.
- [x] Build link and submit button are scoped to the required structural
  containers with exact visible cardinality.
- [x] Build form method and action are validated before any click.
- [x] Matching POST is observed once; response state is retained as submitted,
  rejected, or unknown; no automatic retry occurs.
- [x] Auto-build runner rejects disabled/wrong-mode projects, redacts errors,
  and closes context/browser resources.
- [x] Report execution excludes auto-build projects and retains existing report
  capture/artifact behavior.
- [x] Focused unit tests cover the trigger, auto-build runner, and report
  selection boundary without live Jenkins calls.

## Phase 3 acceptance criteria

- [x] The loader fails before browser startup when the saved build link,
  canonical URL, form/action, sticker, or button contract drifts.
- [x] Build identity is derived from saved links/canonicals rather than a
  hard-coded branch or project field.
- [x] The exact build `GET`/`POST` route and `303` redirect are fulfilled
  offline; unknown requests remain default-deny and misses are sanitized.

- [x] Auto-build E2E proves one build `POST`, exact request order, and no
  Snyk/SonarQube capture requests; report flow remains unchanged.
- [x] Fixture implementation is split into focused sub-200-line modules behind
  the supported public facade.


## Operational constraints

Before an authorized build, an operator or integration must verify the exact
controller, project ID, configured `jobUrl`, decoded nested job/branch segments,
enabled flag, explicit `auto-build` mode, and credential-variable availability.
Jenkins parameter defaults are accepted as rendered; automation does not alter
them. A `submission-unknown` outcome requires manual/controller-side
reconciliation before any future attempt.

The checked-in `config/projects.example.json` remains non-runnable with
`.invalid` placeholders and a disabled auto-build example. Keep live project
configuration and secret values outside the repository.

For Phase 01, local values may be persisted only in
`config/secrets.local.json`, which is ignored by `config/*.local.json`; keep
that file and its directory protected by the operator/CI account's ACLs.
Because execution injection is not part of this phase, current report and
auto-build runs still require the environment variables named by project
configuration.

## Traceability

| Requirement area | Primary implementation | Documentation |
| --- | --- | --- |
| Schema and mode selection | `src/config/`, `src/config.ts` | [multi-project configuration](./multi-project-configuration.md) |
| Report runner | `src/runner.ts`, `src/project/project-runner.ts` | [architecture](./architecture.md) |
| Jenkins identity and trigger | `src/jenkins/url-identity.ts`, `src/jenkins/build-trigger*.ts` | [system architecture](./system-architecture.md) |
| Auto-build lifecycle | `src/project/project-workflow.ts`, `src/project/auto-build-runner.ts` | [codebase summary](./codebase-summary.md) |
| Local secret persistence | `src/reporting/report-server-secret-store.ts`, `src/reporting/report-server-constants.ts` | [architecture](./architecture.md), [multi-project configuration](./multi-project-configuration.md), [code standards](./code-standards.md) |
| Control-mode wiring | `src/reporting/report-server-control.ts`, `src/reporting/report-server.ts` | [system architecture](./system-architecture.md) |
| SecretStore verification | `tests/unit/report-server-secret-store.spec.ts` | [release gates](./release-gates.md) |
| Template fixture loading and routes | `src/templates/template-fixture-*.ts`, `src/templates/template-report-fixture.ts` | [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Build fixture contract | `templates/jenkins-template/template-build.html`, `tests/unit/template-build-fixture.spec.ts`, `tests/e2e/template-auto-build.spec.ts` | [architecture](./architecture.md) |
| Release evidence | `tests/unit/jenkins-build-trigger.spec.ts`, `tests/unit/auto-build-runner.spec.ts`, `tests/unit/sequential-runner.spec.ts`, and Phase 3 fixture tests | [release gates](./release-gates.md) |
| Side-effect policy | `src/jenkins/build-trigger.ts`, `src/project/auto-build-runner.ts` | [architecture](./architecture.md), [release gates](./release-gates.md) |

## Open scope

Phase 01 provides the persistence backend and control-mode wiring only. It does
not expose a secret-management API or merge stored values into execution
environments. The remaining dynamic-credentials phases must add those
boundaries without weakening server-side configuration validation, loopback
and CSRF protections, single-run/concurrency rules, explicit auto-build
confirmation, or safe outcome mapping. The current report CLI still has no
production auto-build command.
