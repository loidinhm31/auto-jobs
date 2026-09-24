# Phase 04 — Testing and verification

## Context links
- [Master contract and side-effect review](./plan.md) · [Selection](./phase-01-config-and-run-selection.md) · [Executor/API](./phase-02-parallel-auto-build-executor-and-api.md) · [UI](./phase-03-control-page-ui-refactor.md).
- Verification suites: `tests/unit/run-type-config.spec.ts:94-152`; `tests/unit/control-run-api.spec.ts:9-48,107-228,230-298`; `tests/unit/control-run-executor-secrets.spec.ts:187-304`; `tests/unit/bounded-report-workers.spec.ts:76-165`; `tests/unit/control-atomic-components.spec.ts:413-519`; `tests/unit/control-hooks-and-types.spec.ts`; `tests/e2e/control-page.spec.ts:1-166,198-229,693-984`; `tests/e2e/template-auto-build.spec.ts`; `package.json:11-27`.

## Overview
**Date:** 2026-09-24 · **Priority:** P2 · **Status:** **DONE** · **Completed:** 2026-09-24 · **Effort:** 2h · **Depends on:** phases 01–03. Proved saved config → guarded API → bounded, irreversible side effects → polled per-project UI outcomes; replaced obsolete dialog/per-card interaction expectations and verified the current browser surface.

## Key Insights
- Deterministic worker-pool tests use deferred barriers to prove concurrency bounds, configuration-order outcomes, sibling failure isolation, and aggregate failure without live Jenkins.
- Executor tests cover all-enabled outcome ordering, report/build separation, and scalar compatibility; worker-pool tests separately prove concurrency bounds, failure isolation, and aggregate failure.
- The E2E suite now drives the immediate all-enabled action, checks obsolete confirmation/per-card controls are absent, verifies dirty/save gating, and inspects a batch POST without `projectId` or `workerCount`.
- Failure/redaction unit contracts and shared action/result component contracts remain covered independently of the successful browser batch fixture.

## Requirements
1. Test selection boundaries (mixed modes, enabled/disabled, order, no eligible, targeted invalid ID), saved `reportWorkers` default/1/2/4 and reject invalid values through existing schema. Count is never accepted in POST, even on omitted-ID build request.
2. Prove concurrency and failure isolation with deterministic barriers: two active slots before release at count 2, no third until one settles, max 2, completion order != result order; count 1 sequential; count 4 bound; all eligible IDs invoked exactly once. Inject rejection and unknown submission among successes, assert all siblings finish, `failed` aggregate, no retry, correct per-project state/error. One-project scalar fallback unchanged; no report executor/artifact path touched.
3. Exercise API with CSRF/Origin/Host/content-type guards, ETag match/stale failure, active-run 409, valid targeted and omitted-ID 202, present malformed projectId 422, empty eligible set with zero build invocations, request `workerCount` override 422 precedence, per-project wait defaults/targeted overrides, no secret leakage in logs/result/stages/URLs. Distinguish acceptance from asynchronous terminal outcome on GET.
4. Browser surface: click the immediate build button, observe POST without `projectId`/`workerCount`, and render one outcome row per eligible project; the E2E batch fixture exercises success, while worker/API tests cover failure aggregation. Both actions disable on unsaved config and restore after Save/ETag. Shared Workers selector remains accessible, keyboard-operable, and persistent per config; report action/link remains intact. Check desktop/mobile Axe and overflow.
5. Keep tests worth maintaining: only observable contracts that fail on plausible bugs, deterministic/offline isolated fixtures; no source-text asserts, same-path parameter padding or mocks that merely echo input. Scoped proof before Main's once-only project-wide `npm run test:release`.

## Architecture
Layer proofs from pure selector → injected pool/executor → loopback API with mocked Jenkins executor → real Chromium/WebKit dashboard against local server fixture. The actual side effect boundary is `runAutoBuildProject`/Jenkins POST; template fixture tests ensure one POST and origin/form validation, while injected pool tests prove scheduling without external network. Maintain `createReportServer` isolation using temp config/report roots from existing suites (`control-run-api.spec.ts:57-84`, `control-page.spec.ts:68-165`). Pass actual polled result into React rendering; avoid calling production Jenkins.

## Related code files
| Action | Path and current range | Verification objective |
| --- | --- | --- |
| Modify | `tests/unit/run-type-config.spec.ts:94-152` | Add all-enabled selector ordered/empty/mode behavior; retain targeted cases. |
| Modify | `tests/unit/control-run-api.spec.ts:9-48,107-228,230-298` | Multi-build fixture, omitted-ID/targeted/malformed requests, workerCount precedence, one-active-run and polled results. |
| Updated | `tests/unit/control-run-executor-secrets.spec.ts:187-304` | Verifies ordered multi-project auto-build outcomes without invoking report execution or allocating report result fields. |
| Reuse/updated | `tests/unit/bounded-auto-build-workers.spec.ts` | Deferred concurrency barrier, configuration-order outcomes, worker failure isolation, and aggregate failure. |
| Modify | `tests/unit/control-atomic-components.spec.ts:413-519` | Shared Workers label, both actions' disable semantics, batch results/scalar/report fallback. |
| Updated | `tests/e2e/control-page.spec.ts:198-229,693-984` | Immediate action, absence of obsolete controls, saved worker count, request payload, successful batch rendering, accessibility. |
| Verify unchanged unless breakage | `tests/e2e/template-auto-build.spec.ts`, `tests/unit/control-hooks-and-types.spec.ts` | Underlying Jenkins single-submit and hook optional-ID behavior. |
| Post-implementation docs | `docs/architecture.md:439-468,541-603,692-712`, `docs/code-standards.md:99-114`, `docs/codebase-summary.md`, `docs/multi-project-configuration.md`, `README.md` | Update only affected current-behavior claims **after implementation**, not as part of planning. |

## Implementation Steps
1. First create deterministic 2–4 eligible/disabled/report fixture. Assert pure selector results; fix the obsolete omitted-projectId API expectation while retaining workerCount precedence and explicit blank/null/non-string validation. Keep targeted ID path assertions.
2. Test scheduler with controllable promises and active counters. At workerCount 2, wait for first two starts, assert third not started; release second first and assert third starts, then release first/third in reverse. Verify max 2, config-order outcomes, exactly one invocation each. Add rejected/unknown path and verify siblings progress, failure aggregate, no repeat submission. Use finite test timeouts and `finally` barriers to avoid hangs.
3. Test actual loopback API GET result of an omitted-ID run with mixed success/submitted/failure outcomes, saved count from ETag-matched config and per-project redacted fields (including stage text). Confirm stale ETag or zero eligible prevents executor invocation; active run rejects another request with 409; report target never appears in build calls; targeted result still has scalar compatibility. Recheck mutation gate with missing/invalid CSRF or origin and supplied workerCount.
4. Updated the local-dashboard browser journey for both actions and the shared Workers selector; verified no obsolete confirmation/per-card control, the saved-count/dirty/ETag path, one immediate batch POST omitting `projectId` and `workerCount`, and per-project results. Retained report, raw JSON, config switching, Axe, keyboard, and responsive checks.
5. Main ran the once-only integrated `npm run test:release` after integration; relevant architecture/operator documentation was updated after verification. Results are recorded below. No fixture test is presented as live Jenkins proof.

## Actionable verification commands
```text
node scripts/run-playwright.mjs playwright test tests/unit/run-type-config.spec.ts tests/unit/bounded-auto-build-workers.spec.ts --config=playwright.unit.config.ts
node scripts/run-playwright.mjs playwright test tests/unit/control-run-api.spec.ts tests/unit/control-run-executor-secrets.spec.ts tests/unit/control-atomic-components.spec.ts --config=playwright.unit.config.ts
node scripts/run-playwright.mjs playwright test tests/e2e/control-page.spec.ts --config=playwright.control.config.ts
npm run test:release   # completed once after integration: 439/439 passed
```
Browser smoke means actual local server launch/open/interact/inspect result and screenshots using the available browser runtime, not just SSR HTML.

## Todo list
- [x] Pure selection, API and ETag/security/zero-target regression cases.
- [x] Deterministic bounded concurrency, config-order, partial failure and unknown-submission no-retry proof.
- [x] Update old modal/worker label assertions; exercise immediate browser action and multi-result UI.
- [x] Perform once-only integrated gate, then documentation and obsolete reference cleanup.

## Completion record
- `npm run test:release`: **439/439 passed** (unit 399, template E2E 13, control E2E 20, report 5, WebKit 2); typecheck and production build passed.
- E2E now verifies the shared `#select-workers` selector, dirty/save action gating, immediate `#btn-run-auto-build` execution, and per-project successful outcomes. Unit/API coverage verifies bounded concurrency, failure isolation and aggregate failure; the browser batch fixture itself is successful.
- Code review approved at **9.3/10**. Its two non-blocking test-title/coverage observations are recorded in the [review](../reports/code-review-260924-1552-phase-04-testing-and-verification.md); verification details are in the [test report](../reports/phase04-tester-260924-1548-phase04-testing-and-verification.md).

## Success Criteria
- Focused tests show observable 1–4 bound, no extra builds, accurate result order/status and no secret leakage; targeted API and report flow remain usable. Empty selection/stale config/invalid mutation/active conflict cause no unintended external side effect.
- Actual dashboard displays the three controls (two buttons plus one select), sends one build batch request immediately, renders every outcome, and passes accessibility/responsive checks. Report output remains clickable; single build fallback still renders.
- Main recorded the once-only release-gate result above; fixtures leave no real Jenkins submissions or persistent user config changes. All affected caller/test/docs references migrated or intentionally unchanged.

## Risk Assessment
- Pair deterministic worker/API failure proofs with the successful browser batch journey; injected executors and local fixtures do not contact production Jenkins.
- Race-prone sleeps can give false concurrency proof: use deferred barriers/events and explicit maximum active count, isolated temp roots, guaranteed cleanup.
- Replaced obsolete modal/per-card interaction expectations with current immediate-action and absent-control assertions; retain no-retry/error behavior at the worker boundary.

## Security Considerations
- Verify no submitted run from invalid Host/Origin/Fetch Metadata/CSRF/content-type, stale ETag or no eligible build; no secret values in GET logs/results/stage/link text even with mixed outcomes. Preserve exact allowed-origin/form-action and single-POST protections in existing Jenkins fixture tests; never add automatic retry, live-service test credentials or unguarded external URLs.

## Completion
- Phase 04 and the overall initiative are complete; the once-only release gate and documentation updates are recorded above. No live Jenkins or vendor-service execution is claimed.
