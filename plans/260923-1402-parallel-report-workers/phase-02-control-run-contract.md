# Phase 02 — control run contract (DONE — 2026-09-23)

## Context links
- [Master contract](./plan.md) · [Hard brief](./cmd-plan.md) · [Phase 01 schema/runner](./phase-01-bounded-report-execution.md) · [Control/UI research](./research/researcher-02-control-ui-and-contract.md) (browser-local/request recommendation rejected) · [Runner/artifact research](./research/researcher-01-runner-and-artifacts.md).
- Current code: `src/reporting/report-server-control-api.ts:69-140`, `src/reporting/report-server-run-manager.ts:20-63,108-167`, `src/reporting/report-server-run-executor.ts:18-75`, `src/reporting/report-server-config-store.ts:98-130`, `src/reporting/report-server-control-security.ts`; conventions: [PDR](../../docs/project-overview-pdr.md), [code standards](../../docs/code-standards.md).

## Overview
**DONE — 2026-09-23; P2; 2h; depends on phase 01.** Keep `POST /api/run` request and run-manager record unchanged. Reject any request-level worker override, and after ETag verification derive the report worker bound from the saved schema-v1 document. Keep loopback mutation security, single-active-run manager, report selection and auto-build behavior.

## Key insights
- Current API validates mutation/JSON/mode/project ID, calls `startRun`, then returns 202. An override must be rejected **before** admission; an asynchronous executor failure after 202 is the wrong boundary.
- `startRun` stores config name and ETag, then asynchronously invokes `executeControlRun`; manager already enforces one active run/409. No worker field is needed in `StartRunParams`, `ControlRunRecord` or GET history: the executor reads one ETag-matched `ConfigStore` entry, whose document has the saved setting.
- Executor currently reads config, checks `configEntry.etag === record.configEtag`, merges SecretStore environment, normalizes projects, checks report-root containment and dispatches only reports; auto-build has a separate single-project branch. Derive count from **that same** document after ETag check, not a second config read or project normalization (which does not carry document metadata).

## Requirements
- The request shape remains `configName`, `configEtag`, `runType`, optional `projectId` for auto-build. Reject an **own-property** `workerCount` on both report and auto-build with `422 INVALID_WORKER_COUNT`, whatever its JSON value (1, 4, 0, 5, fraction, string, `null`, boolean, array or object). No request count is accepted even when equal to the saved value. Missing field is accepted as before. Malformed JSON/body still follows existing `INVALID_BODY` behavior.
- At execution, use ETag-verified `configEntry.document.reportWorkers ?? 1` for only the report executor's `RunnerDependencies.workerCount`, alongside unchanged `runtimeEnvironment`; phase-01 document validation and runner policy enforce integer range. For a document containing only auto-build projects or a chosen auto-build project, field may be present but must have **no effect** on build execution.
- Preserve Host preflight, Origin/Fetch Metadata/CSRF/content-type/body size checks, request run-type/project-ID errors, stale-ETag failure before project execution, one-active-run 409, GET history, SecretStore redaction and report-root containment. Do not change manager params/record, response shape, active-run retention, auto-build options or `config/projects.example.json`.

## Architecture
```text
POST /api/run guarded body -> reject own workerCount (422) -> existing startRun
  -> single active record {configName, configEtag, runType, projectId?}
  -> executeControlRun -> ConfigStore.readConfig -> verify matching ETag
  -> validated document.reportWorkers ?? 1 -> select enabled reports
  -> reportExecutor(projects, {runtimeEnvironment, workerCount})
  -> fixed worker loops (phase 01)
Auto-build -> same saved document validated -> existing one-project selection
  -> autoBuildExecutor({runtimeEnvironment}) (count unused)
```
- The API should check `Object.hasOwn(data, 'workerCount')` after bounded JSON and valid run-type checks, **before** auto-build project-ID validation and `startRun`; send one bounded, value-free `INVALID_WORKER_COUNT` error. Thus even auto-build with both a supplied count and missing project ID gets the count error; omission preserves existing `MISSING_PROJECT_ID`. No parser of request count or fallback to body field. Keep existing security/error mappings.
- Document is the immutable-by-value source for this execution: `ConfigStore.readConfig` returns a parsed validated entry; the ETag is compared with the admitted ETag before use. Later on-disk edits do not mutate the parsed entry already in use. A change before the check causes the existing stale-ETag failure. No manager snapshot of worker count.

## Related code files
| Action | Exact path | Work |
| --- | --- | --- |
| Reuse | `src/config/report-worker-count.ts`, `src/config/project-config-schema.ts` | Phase-01 pure policy/document validator; no request parser. |
| Modify | `src/reporting/report-server-control-api.ts` | Reject supplied `workerCount` with 422 before manager admission. |
| Modify | `src/reporting/report-server-run-executor.ts` | Derive from already-read/matched document and pass to report runner only. |
| Modify | `tests/unit/control-run-api.spec.ts`, `tests/unit/control-run-executor-secrets.spec.ts` | Real-server rejection/guards, saved-config count/ETag and build isolation. Update fixture only if genuinely needed. |
| Leave unchanged | `src/reporting/report-server-run-manager.ts`, `src/reporting/report-server-control-security.ts`, `src/reporting/report-server-json.ts`, `src/project/auto-build-runner.ts`, `config/projects.example.json` | One-active-run record, security, build path and user-modified example. |

## Implementation steps
1. In `handleRunApi`, retain guarded parse and required-field/run-type checks; then detect any own `workerCount` key for either mode and send `422 INVALID_WORKER_COUNT` before checking auto-build `projectId` or calling `startRun` (including explicit `null`). Without that key, preserve `400 MALFORMED_REQUEST`, `422 INVALID_RUN_TYPE`, `422 MISSING_PROJECT_ID`, 409 and security errors. Do not extend accepted DTO or manager types.
2. In `executeControlRun`, keep SecretStore snapshot/merge/redaction and the config ETag comparison intact. After the ETag check, for the report branch derive `configEntry.document.reportWorkers ?? 1` from that same validated read and pass `{runtimeEnvironment: runEnv, workerCount}` to report executor; auto-build branch passes its existing dependencies only. Do not read config again or attach count to the run record/history.
3. In real in-process API tests, submit valid report and auto-build bodies with omitted field and with present values spanning numeric 1/4 plus invalid 0/5/fraction/string/null/boolean/array/object. For **every present value**, assert 422 code, no accepted record and no executor call; include supplied count with missing auto-build project ID to establish precedence. For omission, assert normal 202 with otherwise valid request, and unchanged `MISSING_PROJECT_ID` when build project ID is absent; preserve guards and original run DTO.
4. With temporary ConfigStore JSON, prove old document -> runner count 1, saved 1/4 -> count 1/4, report with an auto-build project -> only report selected, auto-build with `reportWorkers: 4` -> exactly one build call/no report count. Modify file between acceptance and executor read to prove stale ETag stops execution; modify after matched read to prove in-flight report uses that entry, not a later file value. Use deferred executor for active-run 409 and check SecretStore values remain redacted.

## Todo list
- [x] Reject all request worker overrides before manager admission.
- [x] Resolve count from ETag-checked saved document in report executor only.
- [x] Focused API/executor evidence for defaults/bounds/ETag/409/security/build isolation.

## Completion evidence
- Any request-level `workerCount` is rejected with `422 INVALID_WORKER_COUNT` before run-manager admission. The report executor derives `configEntry.document.reportWorkers ?? 1` from the same ETag-checked saved document; auto-build does not receive or use the setting.
- Preserved single-active-run admission, auto-build isolation, Host/Origin/Fetch Metadata/CSRF/content-type/body-size security gates, report-root containment and SecretStore redaction.
- Focused API/executor unit tests: **16/16 passed**; full unit suite: **360/360 passed**; TypeScript `tsc`: **0 errors**. See [Phase 02 code review](../reports/code-review-260923-2117-phase-02-control-run-contract.md).

## Success criteria
- Report and auto-build POST with a supplied `workerCount` always yield 422 `INVALID_WORKER_COUNT` before acceptance; an absent field retains the original 202 flow. Neither response nor run record gains count.
- ETag-matched saved 1, 4 or absent document field reaches report executor as 1, 4 or 1. Auto-build in a document with the field remains one project/one submission; it never receives worker count or produces report artifacts.
- Stale ETag prevents execution; one-active-run 409, Host/Origin/CSRF/content-type/body checks, report-root containment and SecretStore redaction remain observable.

## Risk assessment
- Truthiness or value validation of request `workerCount` would accidentally accept a numeric override; reject **presence**. Reading a second time after ETag check risks count/project mismatch; use the one validated `configEntry.document`. Do not move ETag check after executor dispatch.
- A document may contain auto-build projects and `reportWorkers` simultaneously; normalize/validate document, but count affects report branch only. Provider/browser quotas remain capped by phase-01 policy.

## Security considerations
- Preserve loopback Host, mutation Origin/Fetch Metadata/CSRF/JSON gates and safe no-store JSON errors. Do not echo a rejected raw value or use it in logs/paths. Keep secret environment snapshot/redaction, URL/project validation and artifact-root containment; persisted count cannot supply credentials or authorize a project.

## Next steps
- [Phase 03](./phase-03-dashboard-and-verification.md) edits the shared saved document, leaving report POST and poller signature unchanged. Final release gate waits until UI and docs integrate.

## Unresolved questions
- None. Cap is fixed at 4 for this feature, not runtime-configurable.
