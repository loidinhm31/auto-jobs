# Code standards

This guide describes the conventions enforced by the current TypeScript
source tree and the Phase 05 verification boundary. It complements
[architecture](./architecture.md) and the [system architecture](./system-architecture.md);
it is not a replacement for schema or security validation.

## Core principles

- Prefer the smallest implementation that preserves the documented contract.
- Keep one responsibility per module. Reuse existing validators, URL policy,
  diagnostics, deadlines, and cleanup helpers instead of creating parallel
  abstractions.
- Treat external navigation and Jenkins submission as untrusted operations.
  Validate before acting, fail closed on ambiguity, and never retry an action
  after a possible side effect.
- Keep production TypeScript files below 200 lines when adding or materially
  changing code. Extract by responsibility rather than compressing statements.
- Keep Markdown files below the repository documentation limit of 800 lines.
- Do not add a compatibility alias or deprecated path when a clean cutover is
  possible.

## Repository layout

| Area | Standard boundary |
| --- | --- |
| `src/config/` | Parse, validate, normalize, and select project configuration. No browser side effects. |
| `src/browser-launcher.ts` | Shared browser selection and environment-derived launch options. |
| `src/jenkins/` | Jenkins authentication, exact URL identity, scoped locators, and guarded build submission. |
| `src/project/` | Report and auto-build workflow orchestration, run state, outcomes, and capture. |
| `src/workflow/` | Shared absolute deadlines, hard cleanup timeouts, and diagnostic helpers. |
| `src/artifacts/` | Immutable report identity, staging/publication, manifest discovery, and bounded cleanup. |
| `src/reports/` | Snyk/SonarQube discovery, capture, parsing, normalization, and source-specific policy. |
| `src/security/` | URL origin/base-path, relative-link, credential-like URL, traversal, and containment policy. |
| `src/reporting/` | Static report rendering, links, read-only report serving, and control-plane routing. |
| `src/reporting/report-server-secret-store.ts` | Local credential persistence only: canonical fixed filename, validation, atomic locked writes, and read/list/update/delete operations. |
| `src/reporting/report-server-control-secrets-api.ts` | Presence-only `/api/secrets` handler; parse and validate endpoint inputs, invoke SecretStore, and never return values. |
| `src/reporting/report-server-control-security.ts` | Shared control response headers and Host/Origin/Fetch Metadata/CSRF/content-type gates. |
| `src/reporting/report-server-control-api.ts` | Config/run handlers plus the re-export facade for the modular secrets handler. |
| `src/reporting/report-server-control.ts` | Loopback control routing, Host preflight, and `ControlRouterContext` dependencies. |
| `src/reporting/report-server-run-manager.ts` | Single-active control-run lifecycle and optional `SecretStore` dependency carried into execution. |
| `src/reporting/report-server-run-executor.ts` | Per-run SecretStore snapshot, environment merge, mode dispatch, and control-output redaction. |
| `tests/unit/` | Deterministic contracts with injected dependencies or in-process servers. |
| `tests/e2e/` | Browser-facing workflows against checked-in fixtures or explicit test routes. |

A module may depend inward on shared contracts and policy helpers, but a
validator must not launch a browser or submit a request. Report artifact code
must not become a dependency of the auto-build side-effect path.

## Template fixture boundaries

Keep the fixture implementation as a one-way DAG:

```text
types -> file-io/html -> sonarqube/build-validation -> loader/routes -> facade
```

| Module | Standard responsibility |
| --- | --- |
| `template-fixture-types.ts` | Define fixture, response, recorder, identity, budget, artifact-link, and Sonar route contracts; do not perform I/O. |
| `template-fixture-file-io.ts` | Resolve canonical roots and read regular files with no-follow, identity, symlink, and 4 MiB per-file/16 MiB total limits. |
| `template-fixture-html.ts` | Parse and rewrite saved HTML only through credential-free URL checks and exact cardinality helpers. |
| `template-fixture-sonarqube.ts` | Validate the saved SonarQube project identity and rewrite only approved dashboard/issues links. |
| `template-fixture-build-validation.ts` | Derive the build URL from the unique saved `#side-panel` link and validate canonical, form/action, sticker, and button structure. |
| `template-fixture-loader.ts` | Read nine fixture files, validate identities before route installation, and assemble synthetic URLs/HTML. |
| `template-fixture-routes.ts` | Fulfill exact `GET`/`HEAD` fixture URLs, exact Jenkins login actions, the same-origin SonarQube `/sessions/new` authentication path, and the exact build `POST`; default-deny everything else. |
| `template-report-fixture.ts` | Be the only supported import surface for fixture loading/routes/types and build `templateProjectDocument` with explicit run type. |

The checked-in `templates/jenkins-template/template-build.html` must remain
minimal and inert: one saved-origin canonical URL, one `POST` form with the
same-job `/build` action, one `#bottom-sticker`, and one classed `Build`
submit button. Never inspect, reflect, or log its hidden/default parameter
values. Route misses may retain only bounded method/origin/path metadata.

Keep the report fixture's default `runType` as `report`; tests requesting
auto-build must pass that mode explicitly. Preserve the facade import path
when extracting helpers, and keep each production module below 200 lines.

## TypeScript and module conventions

Compiler settings in `tsconfig.json` are the source of truth:

- Use strict TypeScript, `noUncheckedIndexedAccess`, exact optional property
  types, no implicit returns, and no fall-through switches.
- Use ESM imports with explicit `.js` specifiers for local modules. Use
  `import type` for type-only dependencies.
- Prefer exported interfaces and string unions for stable contracts. Keep
  externally returned objects readonly where mutation is not part of the API.
- Check possibly absent array/object values explicitly; do not silence strict
  errors with broad casts. A narrow cast is acceptable at a tested adapter
  boundary where the runtime shape is known.
- Keep pure parsing/validation functions deterministic and side-effect free.
  Put I/O, browser operations, and resource cleanup in orchestration functions.
- Name files in kebab-case and name functions/types after observable behavior,
  for example `selectAutoBuildProject` and `JenkinsBuildTriggerResult`.

## Configuration and mode rules

- The only project run types are `'report'` and `'auto-build'`.
- Normalize omitted `runType` to `'report'`. Never infer mode from URL shape,
  selector presence, environment variables, or a CLI name.
- Keep `runType` project-only. It is not a defaults field or a structural
  environment setting.
- Treat `enabled: false` as an unconditional execution gate.
- Select after normalization: `selectReportProjects` returns enabled report
  projects; `selectAutoBuildProject` returns one exact enabled auto-build
  project or throws a configuration error.
- Keep selection helpers pure. `runFromConfig` must pass only report projects
  to the report runner; an auto-build caller must invoke
  `runAutoBuildProject` explicitly.
- Preserve one configured `jobUrl` as the sole Jenkins job/branch identity.
  Do not add a second branch field or derive a target from UI text.

## Jenkins and browser safety

- Resolve credentials by environment-variable name. File-mode and direct
  runners use their supplied environment; control runs overlay a per-run
  SecretStore snapshot. Never place secret values in JSON, source, diagnostics,
  logs, screenshots, traces, or result DTOs.
- Validate every configured, discovered, redirected, and final URL as
  credential-free HTTP(S) inside the allowed canonical origin/base context.
- Use `locatorFor` for configured selector kinds and scope controls to the
  structural Jenkins containers required by the workflow. Require exact
  cardinality and visibility before clicking.
- Before auto-build submission, validate the link as the exact configured job
  `/build` action, then validate the form method and exact action again. Never
  inspect hidden parameter, crumb, body, header, cookie, or response values.
- Install request/response observers before the click and click once. Classify
  HTTP `< 400` as `submitted`, HTTP `>= 400` as `rejected`, and an observed
  request without a determinate response as `submission-unknown`. Never retry
  after a matching POST.
- Keep browser launch options centralized in `src/browser-launcher.ts`.
  Environment precedence is explicit in `launchOptions`; do not duplicate
  parsing in another runner.

## Local secret persistence

- Keep credential values out of project JSON. The `SecretStore` target is the
  fixed `secrets.local.json` filename below the canonical, existing config
  directory; never accept a path or filename from a caller.
- Validate every key against
  `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/`, reject `__proto__`, `prototype`, and
  `constructor`, and require string values. Reject malformed JSON, arrays/null,
  non-regular or symlinked files, and files or serialized payloads over
  `MAX_SECRET_FILE_BYTES` (1 MiB). A missing/empty file is an empty map.
- Return frozen snapshots from reads/listing. Validate complete bulk input
  before mutation. Serialize lexicographically sorted keys.
- Serialize each read-modify-write under an in-memory mutex. Write to an
  exclusive sibling temporary file with `0o600`, sync and close it, then rename
  it over the target. Remove the temporary file after a failed rename; never
  truncate the target in place.
- Do not include values in errors, logs, HTTP responses, test output, or
  diagnostics. POSIX mode bits are advisory on Windows; rely on config-directory
  ACLs for access control.

### Control API security

- Keep the secrets implementation in
  `report-server-control-secrets-api.ts`; keep
  `report-server-control-api.ts` as the config/run facade and re-export.
- Route exact `/api/secrets` paths only. `handleControlRequest` must validate
  Host before dispatch; do not bypass this preflight in a handler.
- Use `validateMutationRequest` for every PUT/DELETE. It checks exact Host and
  Origin, accepted `Sec-Fetch-Site`/`Sec-Fetch-Mode`, timing-safe
  `x-csrf-token`, and JSON content type (bodyless DELETE is the only exception).
- Parse mutations through `readBoundedJsonBody`; preserve the 1 MiB body limit
  and reject malformed/non-object JSON before touching SecretStore.
- Build responses from names/presence booleans only. Never echo values, request
  bodies, or raw errors. Set `Cache-Control: no-store` through the shared
  control response helper.

### Control UI credential state

- Render the server-provided CSRF token in the page meta tag and let the
  shared `apiFetch` helper attach it to mutations; do not hand-copy tokens in
  individual handlers.
- Derive a deduplicated, sorted key list from the active configuration and
  use `GET /api/secrets?keys=...` for presence only. Never request or render
  stored values.
- Use password inputs with blank values for configured keys. Save only
  non-empty trimmed values; clear submitted values after a successful PUT.
- Use the per-key bodyless DELETE contract for clear actions. On success,
  update the presence badge and remove the clear action.
- Register a dialog `close` cleanup that wipes every credential input and
  transient message. Render only names, booleans, and bounded status text;
  never place plaintext in labels, attributes, URLs, HTML, or responses.

### Control-run environment injection

- `RunManagerOptions.secretStore` is optional. `createReportServer` supplies
  the control-mode store to `createRunManager`; direct callers may omit it.
- `executeControlRun` reads one current snapshot at execution start and builds
  a fresh environment with `{ ...env, ...storedSecrets }`. Stored values win
  on key collisions. Never assign stored values into `process.env` or mutate a
  caller-owned environment object.
- Normalize the configuration against the merged environment, then pass that
  same object as `runtimeEnvironment` to the selected report or auto-build
  executor. Keep this boundary in the control executor rather than duplicating
  SecretStore reads in mode-specific runners.
- Collect all non-empty snapshot values for redaction. Redact `addLog`
  messages, report warnings, caught error messages/stacks, and auto-build
  `jobUrl`/`buildPageUrl` result fields before the control record is persisted.
- The `/api/run` request carries names/ETags and mode selection, never secret
  values. Secret API responses remain presence-only.

## Deadlines, cleanup, and errors

- Create one `WorkflowDeadline` per project execution and pass it through
  login, navigation, capture/submission, and persistence operations.
- Bound cleanup separately from the workflow deadline. Close contexts and
  browsers in `finally` blocks and use the existing settlement helpers.
- Preserve the primary outcome when cleanup fails; record a bounded warning
  where the owning result contract supports one.
- Format diagnostics through `formatDiagnostic` or the Jenkins failure helper,
  passing resolved secret values for redaction. For control runs,
  `report-server-run-executor.ts` must redact stored values from logs, warnings,
  errors/stacks, and auto-build URL result fields before persistence. Do not
  return raw errors from a user-facing result.
- Report runs retain an allocated project/run identity for failure artifacts.
  Auto-build runs return an in-memory `failed-before-submit` outcome when a
  failure occurs before a matching POST; they do not allocate report output.

## Testing standards

Tests must defend observable behavior and fail on plausible regressions:

- Put schema, selector, URL-policy, runner, lifecycle, and redaction contracts
  in `tests/unit/`.
- Use injected browser/workflow dependencies or an in-process HTTP server for
  Jenkins action tests. Do not contact a live controller from deterministic
  gates.
- For `SecretStore`, use isolated temporary directories and assert empty/missing
  reads, strict key/value validation, size and malformed-content rejection,
  sorted/frozen snapshots, atomic mutation/deletion, concurrent update
  preservation, redaction, and control-server wiring. The dedicated
  `tests/unit/control-secret-store.spec.ts` suite additionally proves
  temporary-file cleanup and platform-specific permission handling.
- For the secrets API, cover unfiltered and filtered boolean presence maps,
  single/batch patch and deletion forms, persistence, and the invariant that
  plaintext never appears in responses. The operation contract is exercised by
  `tests/unit/control-secrets-api.spec.ts`; security-gate cases remain in
  `tests/unit/control-secrets-security.spec.ts`.
- For the security boundary, cover invalid Host/Origin/Fetch Metadata/CSRF,
  non-JSON content types, invalid keys/values/bodies, unsupported methods, and
  the unavailable-store response. Use the real loopback server plus a direct
  handler test only for the missing dependency boundary.
- For the dynamic-credential browser flow, `tests/e2e/control-page.spec.ts`
  must run against isolated temporary roots in Chromium and WebKit. Cover
  accessible modal state, key discovery, Missing/Configured transitions,
  guarded save/clear requests, persistence after reopen/reload, injected
  execution, input wiping, and absence of submitted values from page HTML and
  run logs.
- For control-run execution, `tests/unit/control-run-executor-secrets.spec.ts`
  must cover report and auto-build `runtimeEnvironment` injection,
  stored-over-base precedence, non-mutation of the base environment, and
  redaction of logs, warnings, errors, and result URLs. Reuse
  `tests/unit/control-run-executor-fixture.ts` for isolated config/record/result
  setup.
- For auto-build, assert structural scoping, exact action identity, form
  method/classes, one POST, response classification, unknown-after-POST, no
  retry, mode/enabled gates, secret redaction, and resource cleanup.
- For report execution, assert project order, fresh contexts, failure
  continuation, artifact identity, aggregate publication, and that auto-build
  projects are excluded.
- Keep fixture routes exact and default-deny. Do not treat a checked-in HTML
  snapshot as evidence of a live vendor or Jenkins run.
- Avoid tests that only inspect implementation text or incidental defaults;
  assert state, boundaries, transitions, outputs, and security invariants.

## Change checklist

Before opening a change, verify:

1. The owning module and existing helper were identified; no duplicate policy
   was introduced.
2. Public types, normalization, all callers, and tests agree on the contract.
3. URLs, selectors, form actions, origins, and paths are validated before use.
4. Control runs snapshot SecretStore values once, merge into a fresh
   `runtimeEnvironment` without mutating `process.env`, and redact all stored
   values from control output. Direct runners remain caller-environment driven.
5. One absolute deadline and bounded cleanup cover every browser resource.
6. A possible external side effect is never retried automatically.
7. Documentation links point to files under `docs/` or verified repository
   paths, and each changed Markdown file remains below 800 lines.
8. Run the narrowest behavioral proof first, then the repository release gates
   once all concurrent work is integrated.
