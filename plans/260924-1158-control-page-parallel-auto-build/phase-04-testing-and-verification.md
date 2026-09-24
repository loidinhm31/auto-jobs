# Phase 04 — Testing and verification

## Context links
- [Master contract and side-effect review](./plan.md) · [Selection](./phase-01-config-and-run-selection.md) · [Executor/API](./phase-02-parallel-auto-build-executor-and-api.md) · [UI](./phase-03-control-page-ui-refactor.md).
- Existing suites: `tests/unit/run-type-config.spec.ts:94-152`; `tests/unit/control-run-api.spec.ts:9-48,107-228,230-298`; `tests/unit/control-run-executor-secrets.spec.ts:187-304`; `tests/unit/bounded-report-workers.spec.ts:76-165`; `tests/unit/control-atomic-components.spec.ts:413-519`; `tests/unit/control-hooks-and-types.spec.ts` (poller/editor behavior); `tests/e2e/control-page.spec.ts:1-166,198-229,697-895`; `tests/e2e/template-auto-build.spec.ts`; `package.json:11-27`.

## Overview
**Date:** 2026-09-24 · **Priority:** P2 · **Status:** pending · **Effort:** 2h · **Depends on:** phases 01–03. Prove saved config → guarded API → bounded, irreversible side effects → polled per-project UI outcomes; remove obsolete dialog assertions and validate actual browser surface. Main owns one integrated release gate after all code is merged.

## Key Insights
- API unit fixture currently has only one enabled build (`control-run-api.spec.ts:9-16`), so an omitted-ID 202 alone cannot prove all-enabled selection or parallelism. Add a second/third enabled build and a controlled injected executor, while keeping a disabled build and report project.
- `bounded-report-workers.spec.ts:76-165` demonstrates deterministic deferred-promise barriers, active/max counters and reversed completion order. Reuse this test **shape** for build scheduler, not report browser/artifact implementation. Do not rely on wall-clock timing or live Jenkins.
- `control-run-api.spec.ts:207-228` explicitly expects `MISSING_PROJECT_ID` for omitted auto-build ID; this is obsolete and must change. Keep its workerCount-before-ID precedence assertion. Existing `control-page.spec.ts:209-228,808-895` asserts modal and per-card submission; replace with immediate action and omitted-ID payload, not stale locator aliases.
- Current `RunResultBox`/ExecutionSection tests at `control-atomic-components.spec.ts:413-519` assert old scalar output and `Report workers` label; preserve meaningful scalar/report behavior tests, replace label expectations and add a multi-outcome user-visible case. Delete any existing test that only pins removed dialog IDs/text.

## Requirements
1. Test selection boundaries (mixed modes, enabled/disabled, order, no eligible, targeted invalid ID), saved `reportWorkers` default/1/2/4 and reject invalid values through existing schema. Count is never accepted in POST, even on omitted-ID build request.
2. Prove concurrency and failure isolation with deterministic barriers: two active slots before release at count 2, no third until one settles, max 2, completion order != result order; count 1 sequential; count 4 bound; all eligible IDs invoked exactly once. Inject rejection and unknown submission among successes, assert all siblings finish, `failed` aggregate, no retry, correct per-project state/error. One-project scalar fallback unchanged; no report executor/artifact path touched.
3. Exercise API with CSRF/Origin/Host/content-type guards, ETag match/stale failure, active-run 409, valid targeted and omitted-ID 202, present malformed projectId 422, empty eligible set with zero build invocations, request `workerCount` override 422 precedence, per-project wait defaults/targeted overrides, no secret leakage in logs/result/stages/URLs. Distinguish acceptance from asynchronous terminal outcome on GET.
4. Browser surface: click single immediate build button, no dialog/card trigger, observe POST lacking `projectId`/`workerCount`, polled batch status and one row per selected project (including partial failure); both buttons disabled on unsaved document, restore after successful Save/ETag. Shared Workers selector is 1–4, accessible, keyboard operable and persists per config; report action/link remains intact. Check desktop and mobile Axe/overflow.
5. Keep tests worth maintaining: only observable contracts that fail on plausible bugs, deterministic/offline isolated fixtures; no source-text asserts, same-path parameter padding or mocks that merely echo input. Scoped proof before Main's once-only project-wide `npm run test:release`.

## Architecture
Layer proofs from pure selector → injected pool/executor → loopback API with mocked Jenkins executor → real Chromium/WebKit dashboard against local server fixture. The actual side effect boundary is `runAutoBuildProject`/Jenkins POST; template fixture tests ensure one POST and origin/form validation, while injected pool tests prove scheduling without external network. Maintain `createReportServer` isolation using temp config/report roots from existing suites (`control-run-api.spec.ts:57-84`, `control-page.spec.ts:68-165`). Pass actual polled result into React rendering; avoid calling production Jenkins.

## Related code files
| Action | Path and current range | Verification objective |
| --- | --- | --- |
| Modify | `tests/unit/run-type-config.spec.ts:94-152` | Add all-enabled selector ordered/empty/mode behavior; retain targeted cases. |
| Modify | `tests/unit/control-run-api.spec.ts:9-48,107-228,230-298` | Multi-build fixture, omitted-ID/targeted/malformed requests, workerCount precedence, one-active-run and polled results. |
| Modify | `tests/unit/control-run-executor-secrets.spec.ts:187-304` | Saved count now applies to auto-build too; replace obsolete isolation assertion, redaction/ETag/no-report proof. |
| Add narrowly scoped file if warranted | `tests/unit/auto-build-worker-pool.spec.ts` | Deterministic deferred barriers, order, bound, all-settle and unknown-side-effect no-retry contracts. |
| Modify | `tests/unit/control-atomic-components.spec.ts:413-519` | Shared Workers label, both actions' disable semantics, batch results/scalar/report fallback. |
| Modify | `tests/e2e/control-page.spec.ts:198-229,697-895` | Immediate action, no dialog/per-card button, saved worker count, request payload, polled multi-project rendering, accessibility. |
| Verify unchanged unless breakage | `tests/e2e/template-auto-build.spec.ts`, `tests/unit/control-hooks-and-types.spec.ts` | Underlying Jenkins single-submit and hook optional-ID behavior. |
| Post-implementation docs | `docs/architecture.md:439-468,541-603,692-712`, `docs/code-standards.md:99-114`, `docs/codebase-summary.md`, `docs/multi-project-configuration.md`, `README.md` | Update only affected current-behavior claims **after implementation**, not as part of planning. |

## Implementation Steps
1. First create deterministic 2–4 eligible/disabled/report fixture. Assert pure selector results; fix the obsolete omitted-projectId API expectation while retaining workerCount precedence and explicit blank/null/non-string validation. Keep targeted ID path assertions.
2. Test scheduler with controllable promises and active counters. At workerCount 2, wait for first two starts, assert third not started; release second first and assert third starts, then release first/third in reverse. Verify max 2, config-order outcomes, exactly one invocation each. Add rejected/unknown path and verify siblings progress, failure aggregate, no repeat submission. Use finite test timeouts and `finally` barriers to avoid hangs.
3. Test actual loopback API GET result of an omitted-ID run with mixed success/submitted/failure outcomes, saved count from ETag-matched config and per-project redacted fields (including stage text). Confirm stale ETag or zero eligible prevents executor invocation; active run rejects another request with 409; report target never appears in build calls; targeted result still has scalar compatibility. Recheck mutation gate with missing/invalid CSRF or origin and supplied workerCount.
4. Replace UI modal tests: navigate local dashboard, verify both buttons and Workers select in Execute Actions, no `.btn-auto-build`/`#build-confirm-dialog`; change mode/enabled/count, Save and inspect `If-Match`/new ETag, click build once, inspect one POST with omitted projectId and workerCount, poll until terminal and inspect every per-project row/status/link/stage/error. Verify report path, raw JSON Apply/invalid, config switching/reload, Axe keyboard and responsive overflow.
5. Run focused commands after each slice (below), then one actual browser smoke against local control server. Main runs `npm run test:release` **once**, after integration, not during sibling work. After smoke proves behavior, update stale architecture/operator docs; remove obsolete dialog asset/test references. Record actual pass/fail evidence without claiming fixture tests proved live Jenkins.

## Actionable verification commands
```text
node scripts/run-playwright.mjs playwright test tests/unit/run-type-config.spec.ts tests/unit/auto-build-worker-pool.spec.ts --config=playwright.unit.config.ts
node scripts/run-playwright.mjs playwright test tests/unit/control-run-api.spec.ts tests/unit/control-run-executor-secrets.spec.ts tests/unit/control-atomic-components.spec.ts --config=playwright.unit.config.ts
node scripts/run-playwright.mjs playwright test tests/e2e/control-page.spec.ts --config=playwright.control.config.ts
npm run test:release   # Main only, once all phases land
```
If the worker-pool case is placed in an existing file, omit the non-created filename from the first command. Browser smoke means actual local server launch/open/interact/inspect result and screenshots using the available browser runtime, not just SSR HTML.

## Todo list
- [ ] Pure selection, API and ETag/security/zero-target regression cases.
- [ ] Deterministic bounded concurrency, config-order, partial failure and unknown-submission no-retry proof.
- [ ] Update old modal/worker label assertions; exercise immediate browser action and multi-result UI.
- [ ] Perform once-only integrated gate, then documentation and obsolete reference cleanup.

## Success Criteria
- Focused tests show observable 1–4 bound, no extra builds, accurate result order/status and no secret leakage; targeted API and report flow remain usable. Empty selection/stale config/invalid mutation/active conflict cause no unintended external side effect.
- Actual dashboard displays the three controls (two buttons plus one select), sends one build batch request immediately, renders every outcome, and passes accessibility/responsive checks. Report output remains clickable; single build fallback still renders.
- Main records once-only release-gate result; test fixtures leave no real Jenkins submissions or persistent user config changes. All affected caller/test/docs references migrated or intentionally unchanged.

## Risk Assessment
- Fake executor tests could pass without observing real UI: pair API boundary and browser journey. Browser fixture checks submitted/failed states without contacting production Jenkins.
- Race-prone sleeps can give false concurrency proof: use deferred barriers/events and explicit maximum active count, isolated temp roots, guaranteed cleanup.
- Some old tests enforce obsolete dialog and auto-build worker isolation; replace only when true behavior changed, never re-pin wording or suppress errors.

## Security Considerations
- Verify no submitted run from invalid Host/Origin/Fetch Metadata/CSRF/content-type, stale ETag or no eligible build; no secret values in GET logs/results/stage/link text even with mixed outcomes. Preserve exact allowed-origin/form-action and single-POST protections in existing Jenkins fixture tests; never add automatic retry, live-service test credentials or unguarded external URLs.

## Next steps
- Main integrates phase changes, runs the release gate once and reports real evidence. Update relevant docs based on implemented behavior, not planned claims; keep this planning assignment restricted to the five requested plan files.
