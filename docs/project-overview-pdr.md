# Project overview and PDR

**Product:** `auto-jobs`  
**Document scope:** schema-v1 report capture, Phase 2 Jenkins auto-build,
Phase 3 offline build-page fixtures, and dynamic-credential Phases 01–03  
**Current milestone:** Phase 03 Run Executor Environment Injection —
**DONE** (2026-09-03T17:18:32+07:00)  
**Prior completed milestone:** Phase 02 Control Secrets API — **DONE**

## Product summary

`auto-jobs` is a private Node.js/TypeScript Playwright runner for collecting
bounded Snyk and SonarQube vulnerability evidence from exact Jenkins job pages.
It writes immutable static reports for the report path. The explicit auto-build
path submits one Jenkins **Build with Parameters** form for the configured
target job and returns a sanitized in-memory outcome; it does not collect
evidence or write report artifacts. Phase 3 adds a minimal checked-in build
detail page and exact offline routes so both paths can be proven without live
Jenkins or vendor services.

Phase 01 adds a local `SecretStore` persistence seam for the control plane.
It stores validated environment-style key/value pairs in the git-ignored
`config/secrets.local.json` using deterministic, atomic, write-locked updates.
Phase 02 exposes that store through a loopback `/api/secrets` presence API:
responses contain booleans, while PUT/DELETE mutations require Host, Origin,
Fetch Metadata, CSRF, and bounded JSON gates. Control mode constructs the
store and exposes it to the router.

Phase 03 completes the run-executor boundary. Each control run reads one
SecretStore snapshot, overlays it on a fresh copy of the caller environment,
and passes the merged `runtimeEnvironment` to report or auto-build execution.
Stored values override same-named base values without mutating `process.env`;
control logs, warnings, errors, and auto-build result URLs are redacted.

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
   configuration, process-global environment state, and plaintext API output.

## Non-goals

- Searching Jenkins jobs or deriving a branch from a selector, URL fragment, or
  separate `targetBranch` field.
- Editing Jenkins parameters, using **Build Now**, polling queues/builds,
  discovering build numbers, cancellation, or automatic retry.
- Running auto-build from `npm run report` or from an environment-wide switch.
- Capturing Snyk/SonarQube evidence during an auto-build run.
- Claiming that checked-in fixtures or deterministic tests prove a live build.
- Returning dynamic credential values over HTTP or exposing them in diagnostics,
  responses, or logs. Phase 02 exposes presence booleans only.
- Mutating `process.env` or a caller-owned environment when injecting stored
  values. Control-run injection is per-run and does not alter direct
  file-mode/library environment behavior.
- Replacing the Phase 04 control UI credential modal/state or Phase 05
  end-to-end verification.

## Users and use cases

| User | Need | Supported boundary |
| --- | --- | --- |
| Report operator | Collect evidence for configured jobs | `npm run report -- --config <path>` |
| Build integration | Submit one selected target-branch build | `selectAutoBuildProject` → `runAutoBuildProject` |
| Maintainer | Prove behavior without external services | Unit tests and exact offline fixtures |
| Reviewer | Inspect safe outputs and release gates | Static report root, manifests, and documented commands |
| Control maintainer | Inspect presence and manage local credential values without changing project JSON | `GET`/`PUT`/`DELETE /api/secrets` in loopback control mode |

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
- File-mode and direct library execution resolve credential references from the
  caller-supplied environment. Control runs read one current SecretStore
  snapshot at execution start and construct `{ ...env, ...storedSecrets }`;
  stored values take precedence, and neither `process.env` nor the caller
  environment is mutated.
- Normalize the project document against that merged environment and pass it
  as `runtimeEnvironment` to the report or auto-build executor.
- Redact every non-empty stored value from control `addLog` messages, report
  warnings, caught errors/stacks, and auto-build `jobUrl`/`buildPageUrl` result
  fields. Clear mutable resolved credential copies during auto-build cleanup.
- Do not persist auto-build artifacts, cookies, headers, bodies, crumbs, queue
  IDs, build numbers, or response bodies.

### FR-7: Local SecretStore backend

- Persist dynamic credential values only in the fixed
  `<configRoot>/secrets.local.json` target, outside schema-v1 project JSON.
- Require an existing canonical real config directory and reject symlinked or
  non-directory roots; never accept a caller-selected path or filename.
- Treat a missing/empty file as `{}`. Require a JSON object no larger than
  `MAX_SECRET_FILE_BYTES` (1 MiB), keys matching
  `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/` except `__proto__`, `prototype`, and
  `constructor`, and string values.
- Provide `readSecrets`, `listSecretNames`, `putSecret`, `putSecrets`,
  `deleteSecret`, and `deleteSecrets`. Return frozen snapshots and sorted names.
- Serialize read-modify-write updates under an in-memory lock and replace the
  target atomically through an exclusive sibling temporary file (`0o600`,
  sync, close, rename). Remove temporary files after failed writes.
- Keep secret values out of errors and diagnostics. The `config/*.local.json`
  ignore rule prevents the local file from entering version control.
- In control mode, expose the store through `ReportServerHandle` and
  `ControlRouterContext`; Phase 02 exposes guarded presence-only API operations
  described in FR-8, and Phase 03 passes the store through `RunManagerOptions`
  into the run executor for per-run environment injection.

### FR-8: Control secrets API

- Route exact `GET`, `PUT`, and `DELETE /api/secrets` paths from loopback
  control mode through a dedicated modular handler.
- Enforce Host validation for every request. For PUT/DELETE, require exact
  same-origin HTTP(S) Origin, accepted Fetch Metadata, timing-safe CSRF, and
  `application/json` (except bodyless DELETE).
- Support full and filtered GET presence maps with boolean values only.
- Accept single or batch PUT patches with valid environment-style names and
  string values; support null/`action: "delete"` removal. Support query or
  JSON body deletion forms.
- Bound JSON bodies at 1 MiB and return `Cache-Control: no-store`; never
  return plaintext values in success or error responses.
- Return clear status boundaries: 400 for malformed input, 403 for rejected
  security gates, 415 for mutation content type, 503 for missing store, and
  405 with `Allow` for unsupported methods.

### FR-9: Offline build-page fixture

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
| Security | Credential-free URLs, environment references or local SecretStore values (never project JSON), boolean-only secret API responses, strict mutation gates, bounded diagnostics, and no hidden-form inspection. |
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
  and router context; Phase 02 adds the guarded presence-only HTTP API, and
  Phase 03 wires the store into each control run without mutating
  `process.env`.

## Dynamic-credentials Phase 02 acceptance criteria

- [x] Exact `/api/secrets` GET/PUT/DELETE routes are dispatched through the
  modular secrets handler in control mode.
- [x] GET returns only boolean presence maps, supports validated `keys` filters,
  and never returns stored values.
- [x] PUT accepts single and batch patches, persists string values, supports
  null/`action: "delete"` removal, and returns only post-update presence.
- [x] DELETE accepts a query name or JSON name/names body and returns only
  post-delete presence.
- [x] Host is checked before dispatch; mutations require exact Origin,
  accepted Fetch Metadata, timing-safe CSRF, JSON content type, and bounded
  request bodies.
- [x] Invalid keys/values/bodies, wrong content type, unsupported methods, and
  missing store produce bounded status/error contracts; all responses use
  `Cache-Control: no-store` and omit plaintext.

## Dynamic-credentials Phase 03 acceptance criteria

- [x] `RunManagerOptions.secretStore` is optional, and control-mode
  `createReportServer` passes its `SecretStore` to `createRunManager`.
- [x] `executeControlRun` reads one current SecretStore snapshot, builds
  `{ ...env, ...storedSecrets }`, and uses the merged environment for config
  normalization and both report/auto-build executor dependencies.
- [x] Stored values override same-named base values without mutating the base
  environment or `process.env`; direct file-mode/library callers remain
  environment-driven.
- [x] Non-empty stored values are redacted from control logs, report warnings,
  caught errors/stacks, and auto-build result URL fields before run-record
  persistence.
- [x] `control-run-executor-secrets.spec.ts` covers report and auto-build
  injection, precedence, non-mutation, redaction, and asynchronous
  `createRunManager` integration using shared fixture helpers.

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

For Phases 01–03, local values may be persisted only in
`config/secrets.local.json`, which is ignored by `config/*.local.json`; keep
that file and its directory protected by the operator/CI account's ACLs.
The Phase 02 API remains loopback-only and exposes presence booleans. Phase 03
control runs consume a per-run snapshot from that store; direct report CLI and
library runs still require the environment variables named by project
configuration.

## Traceability

| Requirement area | Primary implementation | Documentation |
| --- | --- | --- |
| Schema and mode selection | `src/config/`, `src/config.ts` | [multi-project configuration](./multi-project-configuration.md) |
| Report runner | `src/runner.ts`, `src/project/project-runner.ts` | [architecture](./architecture.md) |
| Jenkins identity and trigger | `src/jenkins/url-identity.ts`, `src/jenkins/build-trigger*.ts` | [system architecture](./system-architecture.md) |
| Auto-build lifecycle | `src/project/project-workflow.ts`, `src/project/auto-build-runner.ts` | [codebase summary](./codebase-summary.md) |
| Local secret persistence | `src/reporting/report-server-secret-store.ts`, `src/reporting/report-server-constants.ts` | [architecture](./architecture.md), [multi-project configuration](./multi-project-configuration.md), [code standards](./code-standards.md) |
| Control secrets API and security gates | `src/reporting/report-server-control-secrets-api.ts`, `src/reporting/report-server-control-api.ts`, `src/reporting/report-server-control-security.ts`, `src/reporting/report-server-control.ts` | [system architecture](./system-architecture.md), [architecture](./architecture.md), [code standards](./code-standards.md) |
| Secrets API verification | `tests/unit/control-secrets-api.spec.ts`, `tests/unit/control-secrets-security.spec.ts` | [release gates](./release-gates.md) |
| Control-mode wiring | `src/reporting/report-server-control.ts`, `src/reporting/report-server.ts` | [system architecture](./system-architecture.md) |
| SecretStore verification | `tests/unit/report-server-secret-store.spec.ts` | [release gates](./release-gates.md) |
| Run-executor environment injection | `src/reporting/report-server-run-manager.ts`, `src/reporting/report-server-run-executor.ts`, `src/reporting/report-server.ts` | [architecture](./architecture.md), [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Template fixture loading and routes | `src/templates/template-fixture-*.ts`, `src/templates/template-report-fixture.ts` | [system architecture](./system-architecture.md), [release gates](./release-gates.md) |
| Build fixture contract | `templates/jenkins-template/template-build.html`, `tests/unit/template-build-fixture.spec.ts`, `tests/e2e/template-auto-build.spec.ts` | [architecture](./architecture.md) |
| Release evidence | `tests/unit/jenkins-build-trigger.spec.ts`, `tests/unit/auto-build-runner.spec.ts`, `tests/unit/sequential-runner.spec.ts`, `tests/unit/control-run-executor-secrets.spec.ts`, and Phase 3 fixture tests | [release gates](./release-gates.md) |
| Side-effect policy | `src/jenkins/build-trigger.ts`, `src/project/auto-build-runner.ts` | [architecture](./architecture.md), [release gates](./release-gates.md) |

## Open scope

Dynamic-credentials Phase 03 completes per-run SecretStore environment
injection and redaction for loopback control execution. Phase 04 still owns
the control UI credential modal and state, and Phase 05 owns end-to-end
verification. All future work must preserve server-side configuration
validation, loopback and CSRF protections, single-run/concurrency rules,
explicit auto-build confirmation, no-process-global mutation, and safe outcome
mapping. The current report CLI still has no production auto-build command.

## Changelog

### 0.1.0 (development) — 2026-09-03

- Completed Phase 03 run-executor environment injection and redaction for
  control-mode report and auto-build runs.
