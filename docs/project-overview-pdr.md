# Project overview and PDR

**Product:** `auto-jobs`  
**Document scope:** schema-v1 report capture and Phase 2 Jenkins auto-build  
**Current milestone:** Phase 2 — **DONE** (2026-09-02T14:30:11+07:00)

## Product summary

`auto-jobs` is a private Node.js/TypeScript Playwright runner for collecting
bounded Snyk and SonarQube vulnerability evidence from exact Jenkins job pages.
It writes immutable static reports for the report path. Phase 2 adds a separate,
explicit one-project workflow for submitting a Jenkins **Build with Parameters**
form for the configured target job. The build path returns a sanitized
in-memory outcome; it does not collect evidence or write report artifacts.

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

## Non-goals

- Searching Jenkins jobs or deriving a branch from a selector, URL fragment, or
  separate `targetBranch` field.
- Editing Jenkins parameters, using **Build Now**, polling queues/builds,
  discovering build numbers, cancellation, or automatic retry.
- Running auto-build from `npm run report` or from an environment-wide switch.
- Capturing Snyk/SonarQube evidence during an auto-build run.
- Claiming that checked-in fixtures or deterministic tests prove a live build.
- Providing a writable control dashboard in Phase 2. A future control-plane
  caller must preserve the explicit selection and confirmation boundary.

## Users and use cases

| User | Need | Supported boundary |
| --- | --- | --- |
| Report operator | Collect evidence for configured jobs | `npm run report -- --config <path>` |
| Build integration | Submit one selected target-branch build | `selectAutoBuildProject` → `runAutoBuildProject` |
| Maintainer | Prove behavior without external services | Unit tests and exact offline fixtures |
| Reviewer | Inspect safe outputs and release gates | Static report root, manifests, and documented commands |

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
- Resolve credentials from environment-variable references only.
- Redact secret values from diagnostics and clear mutable secret copies.
- Do not persist auto-build artifacts, cookies, headers, bodies, crumbs, queue
  IDs, build numbers, or response bodies.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Safety | Fail closed on invalid origins, actions, selectors, cardinality, forms, modes, or identities. |
| Idempotency | No automatic retry after a matching build POST; preserve unknown state. |
| Security | Credential-free URLs, environment-only secrets, bounded diagnostics, no hidden-form inspection. |
| Availability | Report projects continue after a project failure; cleanup is bounded. |
| Determinism | Unit and fixture tests use injected dependencies or exact default-deny routes. |
| Maintainability | Keep one responsibility per module, strict TypeScript, and production files below 200 lines when changed. |
| Documentation | Keep each Markdown file below 800 lines and link only verified paths. |

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

## Traceability

| Requirement area | Primary implementation | Documentation |
| --- | --- | --- |
| Schema and mode selection | `src/config/`, `src/config.ts` | [multi-project configuration](./multi-project-configuration.md) |
| Report runner | `src/runner.ts`, `src/project/project-runner.ts` | [architecture](./architecture.md) |
| Jenkins identity and trigger | `src/jenkins/url-identity.ts`, `src/jenkins/build-trigger*.ts` | [system architecture](./system-architecture.md) |
| Auto-build lifecycle | `src/project/project-workflow.ts`, `src/project/auto-build-runner.ts` | [codebase summary](./codebase-summary.md) |
| Release evidence | `tests/unit/jenkins-build-trigger.spec.ts`, `tests/unit/auto-build-runner.spec.ts`, `tests/unit/sequential-runner.spec.ts` | [release gates](./release-gates.md) |
| Side-effect preflight | `plans/260902-0251-jenkins-control-page-and-auto-build/preflight-contract-and-side-effects.md` | Plan safety contract |

## Open scope

Phase 2 does not expose a user-facing auto-build command or control API. Any
future control-plane implementation must revalidate configuration on the
server, select one exact project, require explicit user confirmation, preserve
single-run/concurrency rules, and map only the safe outcome fields described
above.
