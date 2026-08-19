# Jenkins Playwright vulnerability-report runner architecture

## Phase 1 / V1 boundary

Phase 1 finalization covers the TypeScript/Playwright bootstrap, shared
configuration contract, result types, redaction helpers, and configuration
unit coverage. The Jenkins fixture, page modules, runner, and browser E2E
specs are later-phase consumers of this contract, not Phase 1 deliverables.

V1 validates one Jenkins UI workflow. It logs in with a fresh Playwright
browser context, resolves one configured Pipeline job, triggers zero or one
build, resolves that build, waits for a terminal state, reloads the exact
build page, and extracts only Jenkins-rendered SonarQube/Snyk links and
selected text.

The local fixture models publisher output with deterministic HTML/JSON
artifacts. It does not run real SonarQube or Snyk scanners. Real scanners,
external services, API-token triggering, and cross-tool aggregation are V2
work and must remain behind explicit opt-in boundaries.

## State machine

```text
config_validated
      -> authenticated
      -> job_resolved
      -> trigger_submitted (or existing_build_selected)
      -> queue_resolved
      -> build_running
      -> terminal
      -> reloaded
      -> extracted
      -> completed

Any state can transition to failed with a redacted diagnostic.
```

`JENKINS_BUILD_NUMBER` selects an existing build and skips triggering. Without
it, the run keeps its trigger/queue/build references in memory and never
re-clicks the trigger after navigation or reload.

## Component and data flow

```text
validated environment
        |
src/config.ts ------------------------------+
        |                                    |
src/types.ts -> Jenkins page modules -> runner
        |                                    |
        +-> normalized result JSON <---------+
```

`src/config.ts` is the only environment parser. It normalizes the Jenkins
base URL and encoded job path, validates bounded durations and enums, parses a
small typed locator object, and exposes redaction helpers. Page modules consume
the resulting contract; they do not read environment variables directly.

`src/types.ts` owns the versioned result, report states, build identity, and
the narrow `BuildTrigger` boundary. `src/jenkins/locators.ts` will own the
Playwright locator mapping in Phase 3.

## Bootstrap and configuration contract

`src/config.ts` is the single environment boundary. Required inputs are
`JENKINS_BASE_URL`, `JENKINS_USERNAME`, `JENKINS_PASSWORD`, and
`JENKINS_JOB_PATH`. `JENKINS_LOGIN_PATH` defaults to `/login`;
`JENKINS_TRIGGER_MODE` defaults to `ui` and only `ui` is accepted;
`JENKINS_TIMEOUT_MS` defaults to `300000`; `JENKINS_POLL_INTERVAL_MS` defaults
to `1000`; `PLAYWRIGHT_BROWSER` defaults to `chromium`; and `ARTIFACT_DIR`
defaults to an absolute `test-results` path. `JENKINS_BUILD_NUMBER` is
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

Parsing collects invalid or missing-input issues and throws before a browser is
launched. Diagnostics are redacted and bounded; raw credentials and
secret-bearing URL data are not part of the config error contract.

## Configuration invariants

- Configuration is parsed before a browser is launched.
- `JENKINS_BASE_URL` is an HTTP(S) URL without credentials, query, or fragment.
- Credentials are required for UI V1 but are never included in diagnostics,
  traces, screenshots, storage state, or committed files.
- Job paths are relative and encoded per segment; login paths are relative.
- Only `ui` trigger mode is accepted in V1.
- Timeouts, poll intervals, and existing build numbers are positive integers.
- Locator configuration is typed JSON with one of `role`, `label`, `testId`,
  `text`, or `css` kinds. Selector overrides retain default requiredness unless
  explicitly set; report selectors may set `required: false`.

## Result invariants

- Every successful result has `schemaVersion: 1` and one exact build number/URL.
- Report states are `found`, `not_found`, or `incomplete`.
- Report URLs/text are normalized, deduplicated, trimmed, and capped by the
  extraction layer.
- V1 only reports DOM content observed on Jenkins pages; it does not fetch
  SonarQube or Snyk hosts.
- A terminal build is explicitly reloaded before report extraction.
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
failure-oriented browser artifacts: traces and video are retained on failure,
screenshots are captured only on failure, and CI allows one retry. The
configured `ARTIFACT_DIR` controls the main runner output directory; unit
artifacts remain under `test-results/unit`.

Vulnerability reports are separate from Playwright test reports. V1 records
only Jenkins-rendered SonarQube/Snyk links and selected text, normalizing,
deduplicating, trimming, and capping extracted values. It does not download or
publish data from SonarQube or Snyk hosts.

Sensitive output directories (`playwright/.auth`, `playwright-report`,
`test-results`, `blob-report`, `artifacts`, `reports`, traces, and logs) are
ignored by Git. Authentication state is ephemeral; no `storageState` is
persisted. The local Jenkins volume is reset only when a developer explicitly
runs `docker compose down -v`.
