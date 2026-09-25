# Project roadmap

Last updated: 2026-09-25  
Plan: [Control Page React Refactor with Atomic Design](../plans/260904-1640-control-page-react-refactor/plan.md)
Completed initiative: [Persistent project report management](../plans/260924-2019-persistent-project-report-management/plan.md)

## Individual report run deletion

Plan: [Individual report run deletion](../plans/260925-0701-individual-report-run-deletion/plan.md)

**Overall status:** **DONE** · **100%** (8/8 planned hours; all 3 phases DONE; completed 2026-09-25).

| Phase | Status | Progress | Effort | Completed | Evidence/detail |
|---|---|---:|---:|---:|---|
| 01. Guarded run deletion API and service | **DONE** | **100%** | 3h | 2026-09-25 | Added the guarded per-run DELETE API, locked single-run removal, empty-project pruning, and aggregate refresh. Focused API tests 8/8; unit suite 490/490; typecheck 0 errors ([phase](../plans/260925-0701-individual-report-run-deletion/phase-01-guarded-run-deletion-api.md), [test report](../plans/reports/phase01-tester-260925-0724-guarded-run-deletion-api-and-service.md)). |
| 02. Per-run deletion UI and confirmation | **DONE** | **100%** | 3h | 2026-09-25 | Added accessible per-run deletion controls and confirmation with inventory refresh. Validation: 11 focused unit and 20 report-management E2E tests passed; typecheck/build passed; review 9.5/10, no critical findings ([phase](../plans/260925-0701-individual-report-run-deletion/phase-02-per-run-deletion-ui.md), [validation](../plans/reports/run-tests-260925-1442-phase-02-per-run-deletion-validation.md), [review](../plans/reports/code-review-260925-1444-phase-02-per-run-deletion-ui.md)). |
| 03. Verification and release gates | **DONE** | **100%** | 2h | 2026-09-25 | Confirmed Chromium/WebKit deletion flows, sibling preservation, final-run pruning and aggregate refresh; Axe: 0 violations. Gates: typecheck/build, unit 454/454, control 40/40, report 5/5 (499/499 total); review 9.5/10, no blockers ([phase](../plans/260925-0701-individual-report-run-deletion/phase-03-verification-and-release-gates.md), [test report](../plans/reports/phase03-tester-260925-1517-phase-03-verification-and-release-gates.md), [review](../plans/reports/code-reviewer-260925-1521-phase-03-verification-and-release-gates.md)). |

All three phases are complete: guarded API, per-run UI/confirmation, and verification/release gates. Main owns the once-only post-integration `npm run test:release` gate.

**Completion evidence:** [Phase 03 verification checklist](../plans/260925-0701-individual-report-run-deletion/phase-03-verification-and-release-gates.md), [test report](../plans/reports/phase03-tester-260925-1517-phase-03-verification-and-release-gates.md), and [code review](../plans/reports/code-reviewer-260925-1521-phase-03-verification-and-release-gates.md).


## Persistent project report management

Plan: [Persistent project report management](../plans/260924-2019-persistent-project-report-management/plan.md)

**Overall status:** Complete · **100%** (16 of 16 planned hours; 4 of 4 phases DONE; completed 2026-09-25).

| Phase | Status | Progress | Effort | Completed | Evidence/detail |
|---|---|---:|---:|---|---|
| 01. Persistent aggregate index builder | **DONE** | **100%** | 4h | 2026-09-24 | Merged validated retained history with active outcomes; incomplete discovery and oversized publication fail closed. Review 10/10; targeted tests 13/13, unit suite 415/415, typecheck 0 errors ([phase](../plans/260924-2019-persistent-project-report-management/phase-01-persistent-aggregate-index-builder.md), [review](../plans/reports/code-review-260924-2121-phase-01-persistent-aggregate-index-builder.md)). |
| 02. Guarded control reports DELETE API | **DONE** | **100%** | 5h | 2026-09-24 | Added locked, fail-closed whole-project report deletion and aggregate-pair refresh. Review 10/10; 14 focused API tests, 429 unit tests, typecheck 0 errors ([phase](../plans/260924-2019-persistent-project-report-management/phase-02-control-reports-delete-api.md), [test report](../plans/reports/tester-260924-2222-phase-02-control-reports-delete-api.md), [review](../plans/reports/code-review-260924-2226-phase-02-control-reports-delete-api.md)). |
| 03. Report management page navigation and deletion | **DONE** | **100%** | 3h | 2026-09-24 | Added control-only Reports navigation, retained-project inventory, independent 20-run pagination and accessible confirmed deletion. Control E2E 28/28; typecheck/build passed; unit suite had 429 passes and one retry-recovered flaky test (0 final failures). Review approved 9.5/10, with a medium follow-up on malformed JSON being categorized as a general load error rather than corrupt data ([phase](../plans/260924-2019-persistent-project-report-management/phase-03-control-ui-navigation-and-deletion.md), [test report](../plans/reports/phase03Tester-260924-2304-phase-03-test-validation.md), [review](../plans/reports/code-review-260924-2308-phase-03-control-ui-navigation-and-deletion.md)). |
| 04. Verification and caller migration | **DONE** | **100%** | 4h | 2026-09-25 | Test report: 443/443 unit, 34/34 Control, 5/5 report passed; review 9.8/10 and typecheck 0 errors. Main owns the once-only post-integration `npm run test:release` gate. |

## Control Page Parallel Auto-Build

Plan: [Control Page Parallel Auto-Build](../plans/260924-1158-control-page-parallel-auto-build/plan.md)

**Overall status:** Complete · **100%** (11 of 11 planned hours; 4 of 4 phases DONE; completed 2026-09-24).

| Phase | Status | Progress | Effort | Completed | Evidence/detail |
|---|---|---:|---:|---:|---|
| 01. Config and run selection | **DONE** | **100%** | 2h | 2026-09-24 | Added/exported ordered, immutable `selectAutoBuildProjects` while preserving targeted selection. Focused spec 18/18; full unit suite 389/389; review 10/10, no critical findings ([test report](../plans/reports/tester-260924-1245-phase-01-config-and-run-selection.md), [review](../plans/reports/code-review-260924-1247-phase-01-config-run-selection.md)). |
| 02. Parallel executor and API | **DONE** | **100%** | 4h | 2026-09-24 | Optional-ID API, saved-count bounded build pool, ordered redacted outcomes, exit-code aggregate and single-project compatibility. QA: 398/398 unit and 18/18 control tests; review: 30/30 focused tests, typecheck 0 errors, 9.5/10 ([test report](../plans/reports/tester-260924-1347-phase-02-parallel-auto-build-executor-and-api.md), [review](../plans/reports/code-review-260924-1355-phase-02-parallel-auto-build.md)). |
| 03. Control Page UI | **DONE** | **100%** | 3h | 2026-09-24 | Immediate all-enabled actions, shared Workers selector, and multi-project result display. Review: 9.2/10, 399/399 unit tests; typecheck/build passed. Active-run guard confirmed in current DashboardPage ([review](../plans/reports/code-review-260924-1459-phase-03-control-page-ui-refactor.md)). |
| 04. Testing and verification | **DONE** | **100%** | 2h | 2026-09-24 | E2E and secret-executor coverage finalized. Release gate: 439/439 passed (unit 399, template E2E 13, control E2E 20, report 5, WebKit 2); typecheck/build passed. Review 9.3/10, no critical issues ([test report](../plans/reports/phase04-tester-260924-1548-phase04-testing-and-verification.md), [review](../plans/reports/code-review-260924-1552-phase-04-testing-and-verification.md)). |


## Jenkins Stage View Build Monitoring & Status Tracking

Plan: [Jenkins Stage View Build Monitoring & Status Tracking](../plans/260924-0218-stage-view-build-monitoring/plan.md)

**Overall status:** Complete · **100%** (5 of 5 phases DONE; completed 2026-09-24T03:00:00+07:00).

| Phase | Status | Progress | Completed | Evidence/detail |
|---|---|---:|---|---|
| 1. Config & API Contracts | **DONE** | **100%** | 2026-09-24 | Added `waitForCompletion` config/API contract and default-on behavior. |
| 2. Stage View Observation Engine | **DONE** | **100%** | 2026-09-24 | Parses run/stage state, streams transitions, and observes terminal results within the workflow deadline. |
| 3. Auto-Build Runner & Log Streaming | **DONE** | **100%** | 2026-09-24 | Carries build result metadata and streams stage progress into Control Dashboard logs. |
| 4. Control Page UI Enhancements | **DONE** | **100%** | 2026-09-24 | Initially delivered the build-confirmation wait toggle and rich result display; Phase 03 Parallel Auto-Build later removed per-run confirmation/overrides for immediate all-enabled builds. Persisted wait settings remain in project configuration; the optional `ConfigProjectEditor` toggle is deferred. |
| 5. Testing, Fixture & E2E Verification | **DONE** | **100%** | 2026-09-24 | See [code review and verification](../plans/reports/code-review-260924-0254-jenkins-stage-view.md): typecheck/build passed, unit 379/379, control 18/18, template auto-build 1/1, template integration 11/11. |

Code review passed at 9.2/10 with no critical issues; it noted two warnings and three suggestions, including a possible pre-build run-identification race and repeated queue-wait logs. See the [review](../plans/reports/code-review-260924-0254-jenkins-stage-view.md).

## Bounded parallel report workers

Plan: [Bounded Parallel Report Workers](../plans/260923-1402-parallel-report-workers/plan.md)

**Overall status:** Complete · **100%** (8.0 of 8.0 planned hours; 3 of 3 phases complete; 2026-09-23).

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. Bounded report execution and saved config | **DONE** | **100%** | 3h | Completed 2026-09-23; schema-v1 document-scoped `reportWorkers`, single-read CLI loader, bounded execution, ordered outcomes and failure isolation. Review: 40/40 focused tests, 353/353 unit tests, typecheck clean; see [phase](../plans/260923-1402-parallel-report-workers/phase-01-bounded-report-execution.md) and [review](../plans/reports/code-review-260923-1924-phase-01-bounded-report-execution.md). |
| 2. Control run contract | **DONE** | **100%** | 2h | Completed 2026-09-23; at this milestone, reject request-level worker overrides with 422 `INVALID_WORKER_COUNT` before admission and derive `reportWorkers ?? 1` from the ETag-checked saved document for report execution only. Auto-build remained targeted and separate then; a later initiative added its own bounded all-enabled pool using the shared saved count ([Phase 02](../plans/260924-1158-control-page-parallel-auto-build/phase-02-parallel-auto-build-executor-and-api.md)). Preserved single-active-run behavior, security gates and SecretStore redaction. Evidence: 16/16 focused unit tests, 360/360 full unit tests, `tsc` 0 errors; see [phase](../plans/260923-1402-parallel-report-workers/phase-02-control-run-contract.md) and [review](../plans/reports/code-review-260923-2117-phase-02-control-run-contract.md). |
| 3. Dashboard and integration verification | **DONE** | **100%** | 3h | Completed 2026-09-23; saved-document 1–4 selector, raw JSON/dirty-state sync, Save/ETag gating, request override rejection, auto-build isolation and CLI saved-count/default parity. Phase evidence: 137/137 targeted Playwright tests, typecheck clean, code review 10/10; Main reports full test suite (365 unit + 14 E2E) and build passed. Direct CLI entrypoint smoke and `npm run test:release` are deferred to Main's final release audit; see [phase](../plans/260923-1402-parallel-report-workers/phase-03-dashboard-and-verification.md), [test report](../plans/reports/tester-260923-2218-phase-03-dashboard-and-verification.md) and [review](../plans/reports/code-review-260923-2223-phase-03-dashboard-and-verification.md). |

Review note: code review flagged `new-project` in the example config; Main confirmed this is pre-existing user-modified state, and the file was preserved unchanged.

## Control Page React Refactor status

- Status: **Complete**
- Progress: **100%** (22.0 of 22.0 weighted planned hours; 6 of 6 phases complete)
- Current milestone: **Phase 06 — Legacy Cleanup & Documentation DONE**
- Phase 01 completed: **2026-09-04**
- Phase 02 completed: **2026-09-04**
- Phase 03 completed: **2026-09-04**
- Phase 04 completed: **2026-09-04**
- Phase 05 completed: **2026-09-04**
- Phase 06 completed: **2026-09-05**

## Active configuration persistence & form builder

Plan: [Control Active Config Persistence & Form Builder](../plans/260923-0837-control-active-config-form-builder/plan.md)

**Overall status:** Complete · **100%** (9.0 of 9.0 planned hours; all 4 phases complete; completed 2026-09-23T13:24:08+07:00).

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. Active Configuration Persistence | **COMPLETE** | **100%** | 1.5h | Completed 2026-09-23T09:28:48+07:00; URL/localStorage selection restoration |
| 2. Config Form Builder Component | **COMPLETE** | **100%** | 3.0h | Completed 2026-09-23; controlled project/default editing with inheritance and preserved schema-supported fields. Focused tests 35/35; typecheck/build passed; browser smoke covered controlled mutations, defaults, valid/invalid raw Apply, dirty JSON, and removal invariants. Code review found no actionable findings. User approved Phase 02; canonical adviser checkpoint was explicitly waived by the user and was not run. |
| 3. Side-by-side Integration | **COMPLETE / DONE** | **100%** | 2.0h | Completed 2026-09-23T12:30:04+07:00; responsive workspace and synchronized editors. `npm run test:control` passed 8/8 after exact `.project-card` heading assertions; typecheck/build passed; desktop/mobile smoke confirmed layout, selectors, synchronization, invalid JSON preservation. |
| 4. Verification and Release Audit | **COMPLETE** | **100%** | 2.5h | Completed 2026-09-23T13:24:08+07:00; `npm run test:release` passed 371/371, typecheck/build passed, desktop/mobile Axe scans had 0 violations, code review approved 10/10. |

Phase 01 validation: 27/27 focused unit tests passed and TypeScript typecheck reported 0 errors ([review report](../plans/reports/code-review-260923-0918-phase-01-active-config-persistence.md)). Non-blocking review follow-up: browser-context tests do not invoke the exported browser helpers directly.

## Phase progress

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. Tooling, Vite Pipeline & Server Asset Routing | **DONE** | **100%** | 3.0h | [Phase 01](../plans/260904-1640-control-page-react-refactor/phase-01-tooling-vite-pipeline-server-asset-routing.md); Vite pipeline, Tailwind CSS, asset routing |
| 2. Core Types, Hooks & Interface Contracts | **DONE** | **100%** | 3.5h | [Phase 02](../plans/260904-1640-control-page-react-refactor/phase-02-types-and-custom-hooks.md); UI data types, headless React hooks, credential discovery |
| 3. Atomic Design Components (Atoms & Molecules) | **DONE** | **100%** | 4.0h | [Phase 03](../plans/260904-1640-control-page-react-refactor/phase-03-atoms-and-molecules.md); Radix UI & Tailwind atoms, molecules, DOM/CSS contract preservation |
| 4. Organisms, Modals & Dashboard Assembly | **DONE** | **100%** | 5.0h | [Phase 04](../plans/260904-1640-control-page-react-refactor/phase-04-organisms-and-page-assembly.md); Organisms, dialogs, error boundaries, page assembly |
| 5. Verification, Playwright E2E & Accessibility Audit | **DONE** | **100%** | 4.5h | [Phase 05](../plans/260904-1640-control-page-react-refactor/phase-05-verification-and-release-audit.md); 8/8 E2E passes (Chromium + WebKit), 0 Axe violations, full suite green |
| 6. Legacy Cleanup & Documentation | **DONE** | **100%** | 2.0h | [Phase 06](../plans/260904-1640-control-page-react-refactor/phase-06-legacy-cleanup.md); deleted legacy files, verified clean build & release gates, docs updated |

## Phase 01 milestone

Delivered the Vite build pipeline, Tailwind CSS configuration, and server asset routing:

- Integrated Vite with React plugin, PostCSS, and Tailwind CSS targeting `.runner-build/reporting/control-page/`.
- Configured predictable single-bundle outputs (`index.html`, `assets/control-page.css`, `assets/control-page.js`).
- Updated `report-server-control-page.ts` to read Vite-compiled assets and inject CSRF tokens dynamically.
- Preserved strict Content Security Policy (`CONTROL_CSP`) without requiring `unsafe-eval`.
- Updated `scripts/copy-report-assets.mjs` to eliminate legacy asset copying.

## Phase 02 milestone

Delivered core TypeScript interfaces, headless React hooks, and contract isolation:

- Defined data and component prop contracts matching existing backend JSON schemas.
- Implemented headless hooks: `useControlApi`, `useConfigManager`, `useCredentialsManager`, `useBrowserSettings`, `useRunPoller`.
- Implemented `discoverRequiredCredentialKeys()` utility preserving exact required key discovery rules.
- Added comprehensive unit tests covering hook behaviors, state transitions, and API interactions.

## Phase 03 milestone

Delivered Atomic Design atoms and molecules with exact DOM/CSS fidelity:

- Implemented atoms: `Badge`, `Button`, `Input`, `Select`, `StatusBanner`, `LoadingIndicator` using Radix UI and Tailwind CSS.
- Implemented molecules: `CredentialRow`, `BrowserSettingRow`, `ConfigSelectorBar`, `LogViewer`, `RunResultBox`.
- Preserved 100% compatibility with Playwright locators, DOM IDs, CSS classes, ARIA roles, and data attributes.

## Phase 04 milestone

Delivered organisms, dialogs, layout templates, error boundary, and root dashboard assembly:

- Implemented organisms: `HeaderBar`, `ProjectCard`, `ProjectsGrid`, `RawJsonSection`, `ExecutionSection`, `RunStatusCard`.
- Implemented accessible credentials and browser-settings dialogs; the then-existing build-confirmation dialog was removed during Control Page Parallel Auto-Build Phase 03.
- Created robust `ErrorBoundary` for graceful UI failure isolation.
- Assembled top-level `DashboardPage` and `App.tsx` mounted via `main.tsx`.

## Phase 05 milestone

Completed full verification, Playwright E2E testing, and accessibility audit:

- Ran Playwright E2E suite (`tests/e2e/control-page.spec.ts`): 8/8 tests passed across Chromium and WebKit.
- Automated `@axe-core/playwright` accessibility audit: 0 violations across all views and dialogs.
- Verified TypeScript compilation (`tsc --noEmit`), Vite production build, 292 unit tests, and template tests.

## Phase 06 milestone

Completed legacy cleanup, dependency verification, and architecture documentation:

- Removed legacy imperative source files: `src/reporting/control-page/control-page.js`, `control-page.html`, `control-page.css`.
- Verified clean build (`npm run build`) and full release gates (`npm run test:release`).
- Verified zero dangling references in codebase; updated `docs/codebase-summary.md` and `docs/project-overview-pdr.md`.

## Changelog

### 0.1.0 (development) — 2026-09-25

- Completed Phase 04 (Verification and caller migration) and Persistent project report management at 100% (16/16 planned hours; all four phases DONE) on 2026-09-25. Phase evidence: 443/443 unit, 34/34 Control, and 5/5 report tests passed; typecheck passed with 0 errors; review approved at 9.8/10 ([test report](../plans/reports/phase04-tester-260925-0048-verification-and-caller-migration.md), [review](../plans/reports/code-review-260925-0053-phase-04-verification-and-caller-migration.md)).
- Completed Phase 01 of Individual report run deletion on 2026-09-25; added the guarded per-run DELETE API, locked single-run removal, empty-project pruning, and aggregate refresh. Verification recorded 8/8 focused API tests, 490/490 unit tests, and typecheck with 0 errors ([phase](../plans/260925-0701-individual-report-run-deletion/phase-01-guarded-run-deletion-api.md), [test report](../plans/reports/phase01-tester-260925-0724-guarded-run-deletion-api-and-service.md)).
- Completed Phase 02 (Per-run deletion UI and confirmation) on 2026-09-25; added accessible per-run deletion controls and confirmation with refreshed report inventory. Validation: typecheck/build passed, 11 focused unit and 20 report-management E2E tests passed; review scored 9.5/10 with no critical findings ([phase](../plans/260925-0701-individual-report-run-deletion/phase-02-per-run-deletion-ui.md), [validation](../plans/reports/run-tests-260925-1442-phase-02-per-run-deletion-validation.md), [review](../plans/reports/code-review-260925-1444-phase-02-per-run-deletion-ui.md)).
- Completed Phase 03 (Verification and release gates) and Individual report run deletion at 100% (8/8 planned hours; all 3 phases DONE) on 2026-09-25. Cross-browser E2E, accessibility (0 violations), typecheck/build, and all tests passed: unit 454/454, Control 40/40, report 5/5 (499/499 total). Review: 9.5/10, no blockers ([phase](../plans/260925-0701-individual-report-run-deletion/phase-03-verification-and-release-gates.md), [test report](../plans/reports/phase03-tester-260925-1517-phase-03-verification-and-release-gates.md), [review](../plans/reports/code-reviewer-260925-1521-phase-03-verification-and-release-gates.md)).
- Main owns the once-only post-integration `npm run test:release` gate after all workstreams land.

### 0.1.0 (development) — 2026-09-24

- Completed Jenkins Stage View Build Monitoring & Status Tracking at 100% across five DONE phases on 2026-09-24T03:00:00+07:00 ([plan](../plans/260924-0218-stage-view-build-monitoring/plan.md)).
- Added configurable build-completion waiting, live Stage View transitions in Control Dashboard logs, and terminal build/stage results. The optional `ConfigProjectEditor` toggle remained deferred; persisted wait settings were available through project JSON. The later [Phase 03 Control Page UI](../plans/260924-1158-control-page-parallel-auto-build/phase-03-control-page-ui-refactor.md) removed the per-run confirmation modal/override in favor of immediate all-enabled builds.
- Verification recorded in the [code review](../plans/reports/code-review-260924-0254-jenkins-stage-view.md): typecheck/build passed, unit 379/379, control 18/18, template auto-build 1/1, and template integration 11/11. Review passed with no critical issues; two warnings and three suggestions remain documented.
- Completed Phase 02 (Parallel executor and API) of Control Page Parallel Auto-Build on 2026-09-24 ([phase plan](../plans/260924-1158-control-page-parallel-auto-build/phase-02-parallel-auto-build-executor-and-api.md)); added optional-ID all-enabled execution, a saved-count bounded worker pool, ordered sanitized outcomes, aggregate status and single-project scalar compatibility.
- Phase 02 evidence: QA recorded 398/398 unit and 18/18 control tests passing; code review recorded 30/30 focused tests and a clean typecheck, scored 9.5/10 with no critical issues or warnings ([test report](../plans/reports/tester-260924-1347-phase-02-parallel-auto-build-executor-and-api.md); [review](../plans/reports/code-review-260924-1355-phase-02-parallel-auto-build.md)). QA's initial typecheck report had five TS2550 diagnostics; the final review records the ES2023-compatible helper and a subsequent clean typecheck.
- Completed Phase 03 (Control Page UI) on 2026-09-24 ([phase plan](../plans/260924-1158-control-page-parallel-auto-build/phase-03-control-page-ui-refactor.md)); delivered immediate all-enabled actions, the shared Workers selector and ordered multi-project results.
- Completed Phase 04 (Testing and verification) and Control Page Parallel Auto-Build at 100% on 2026-09-24 ([phase plan](../plans/260924-1158-control-page-parallel-auto-build/phase-04-testing-and-verification.md), [overall plan](../plans/260924-1158-control-page-parallel-auto-build/plan.md)). Release gate passed 439/439; typecheck/build passed; review approved at 9.3/10 with no critical issues ([test report](../plans/reports/phase04-tester-260924-1548-phase04-testing-and-verification.md), [review](../plans/reports/code-review-260924-1552-phase-04-testing-and-verification.md)).
- Completed Phase 01 (Persistent aggregate index builder) on 2026-09-24; retained validated report history across configuration changes and added fail-closed discovery/publication bounds. Review approved 10/10; targeted specs passed 13/13, unit suite 415/415, typecheck 0 errors ([phase](../plans/260924-2019-persistent-project-report-management/phase-01-persistent-aggregate-index-builder.md), [review](../plans/reports/code-review-260924-2121-phase-01-persistent-aggregate-index-builder.md)).
- Completed Phase 02 (Guarded Control reports DELETE API) on 2026-09-24; added locked, fail-closed deletion of one retained project's reports and aggregate index refresh. Review approved 10/10; 14 focused tests, all 429 unit tests, and typecheck passed ([phase](../plans/260924-2019-persistent-project-report-management/phase-02-control-reports-delete-api.md), [test report](../plans/reports/tester-260924-2222-phase-02-control-reports-delete-api.md), [review](../plans/reports/code-review-260924-2226-phase-02-control-reports-delete-api.md)).
- Completed Phase 03 (Report management page navigation and deletion) on 2026-09-24; added control-only Reports navigation, retained-project inventory, independent 20-run pagination, accessible confirmation and guarded per-project deletion ([phase plan](../plans/260924-2019-persistent-project-report-management/phase-03-control-ui-navigation-and-deletion.md), [overall plan](../plans/260924-2019-persistent-project-report-management/plan.md)).
- Phase 03 verification: control E2E 28/28 passed, covering navigation, pagination, accessibility, cancel/delete behavior and lock-conflict feedback; typecheck and build passed. Unit tests ended with 429 passed and one retry-recovered flaky test (0 final failures). Review approved 9.5/10 with no critical/high findings; one medium follow-up notes malformed JSON syntax reaches the general error state instead of the corrupt-data state ([test report](../plans/reports/phase03Tester-260924-2304-phase-03-test-validation.md), [review](../plans/reports/code-review-260924-2308-phase-03-control-ui-navigation-and-deletion.md)).

### 0.1.0 (development) — 2026-09-23

- Completed Phase 01 of Bounded Parallel Report Workers on 2026-09-23 ([phase plan](../plans/260923-1402-parallel-report-workers/phase-01-bounded-report-execution.md)); added the schema-v1 document worker bound, single-read CLI loading and bounded report execution.
- Phase 01 evidence: focused unit specs passed 40/40, full unit suite passed 353/353, and typecheck reported 0 errors; code review scored 9/10 with no critical issues.
- Review follow-up resolved: code review flagged `new-project` in the example config; Main confirmed it is pre-existing user-modified state and it was left untouched.
- Completed Phase 02 (Control run contract) on 2026-09-23 ([phase plan](../plans/260923-1402-parallel-report-workers/phase-02-control-run-contract.md)); `POST /api/run` rejects request-level worker overrides before admission, while the report executor uses the ETag-checked saved document count (`reportWorkers ?? 1`).
- Phase 02 preserved single-active-run behavior, auto-build isolation, security gates and SecretStore redaction; focused tests passed 16/16, full unit tests passed 360/360, and TypeScript `tsc` reported 0 errors ([code review](../plans/reports/code-review-260923-2117-phase-02-control-run-contract.md)).
- Completed Phase 03 (Dashboard and integration verification) of Bounded Parallel Report Workers on 2026-09-23 ([phase plan](../plans/260923-1402-parallel-report-workers/phase-03-dashboard-and-verification.md)); added the saved-document selector and completed the dashboard, raw JSON, Save/ETag, request-override and auto-build integration. Synced the implementation documentation ([summary](../plans/reports/documentation-260923-2311-bounded-report-workers-phase-03.md)).
- Phase 03 verification: 137/137 targeted Playwright tests passed, typecheck passed, and code review approved at 10/10. Main reports the full `npm run test` suite passed (365 unit + 14 E2E) and `npm run build` passed. Direct CLI entrypoint smoke and the once-only `npm run test:release` remain deferred to Main's final release audit ([test report](../plans/reports/tester-260923-2218-phase-03-dashboard-and-verification.md); [review](../plans/reports/code-review-260923-2223-phase-03-dashboard-and-verification.md)).
- Completed Phase 01 (Active Configuration Persistence) of the Control Active Config Persistence & Form Builder plan ([phase plan](../plans/260923-0837-control-active-config-form-builder/phase-01-active-config-persistence.md)).
- Restores selection by valid URL query, then valid localStorage name, then first available config; stores only the selected filename and retains unrelated URL state.
- Focused Phase 01 unit spec passed 27/27 tests; TypeScript typecheck reported 0 errors.
- Completed Phase 02 (Config Form Builder Component) of the Control Active Config Persistence & Form Builder plan ([phase plan](../plans/260923-0837-control-active-config-form-builder/phase-02-config-form-builder-component.md)); Phases 03 and 04 are also complete.
- Focused Phase 02 tests passed 35/35; typecheck and build passed. Browser smoke exercised controlled mutations, inheritance, defaults, valid/invalid raw Apply, dirty JSON, and project-removal invariants; code review found no actionable findings.
- Phase 02 was user-approved; the canonical adviser checkpoint was explicitly waived by the user and was not run.
- Completed Phase 03 (Side-by-side Integration) at `2026-09-23T12:30:04+07:00` ([phase plan](../plans/260923-0837-control-active-config-form-builder/phase-03-side-by-side-integration.md)); the builder and raw JSON editor share a responsive workspace and synchronized document state.
- Phase 03 validation: `npm run test:control` passed 8/8 after exact `.project-card` heading assertions; typecheck/build passed; manual desktop/mobile browser smoke confirmed layout, selectors, synchronization, and invalid JSON preservation.
- Completed Phase 04 (Verification and Release Audit) at `2026-09-23T13:24:08+07:00` ([phase plan](../plans/260923-0837-control-active-config-form-builder/phase-04-verification-and-release-audit.md)); `npm run test:release` passed 371/371 (100%), with typecheck/build successful, zero desktop/mobile Axe violations, and code review approval at 10/10.

### 0.1.0 (development) — 2026-09-06

- Completed Phase 05 (Validation & Testing) of the Host Template Mock Server plan ([`plans/260905-0418-host-template-mock-server/phase-05-validation.md`](file:///G:/ws/sharing/auto-jobs/plans/260905-0418-host-template-mock-server/phase-05-validation.md)); entire plan marked **completed** (5 of 5 phases DONE).
- Validated real HTTP mock server on port 4174 with comprehensive E2E automation in [`tests/e2e/template-server-integration.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/e2e/template-server-integration.spec.ts): Developer Hub link navigation, Jenkins form POST 302 redirects, SonarQube auth session guarding, double-encoded slash (`%252F`) round-trip handling, and port coexistence with Control Server.
- Verified end-to-end report generation with Snyk & SonarQube artifact capture and auto-build submission flows against live HTTP mock server.
- Verified zero regressions across entire test suite: 13/13 template E2E tests, 8/8 control page E2E tests, and strict TypeScript check.
- Completed Phase 04 (Developer Hub index page) of the Host Template Mock Server plan ([`plans/260905-0418-host-template-mock-server/phase-04-dev-hub.md`](file:///G:/ws/sharing/auto-jobs/plans/260905-0418-host-template-mock-server/phase-04-dev-hub.md)).
- Implemented Developer Hub endpoint on `GET /` and `GET /index.html` (with `HEAD` support) on the standalone template server (`http://127.0.0.1:4174/`), indexing all 9 mock fixture endpoints categorized across Jenkins, Snyk, and SonarQube with category badges and monospace URL previews.
- Enforced strict security headers (`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store, must-revalidate`) and safe URL scheme validation against XSS.
- Added comprehensive unit tests in [`tests/unit/template-server.spec.ts`](file:///G:/ws/sharing/auto-jobs/tests/unit/template-server.spec.ts) covering Developer Hub rendering, link verification, HEAD requests, security headers, and scheme safety.

### 0.1.0 (development) — 2026-09-05

- Completed Control Page React Refactor with Atomic Design at 100% (Phases 01–06).
- Replaced imperative DOM scripting (~780 lines JS) with React 18, Radix UI primitives, and Tailwind CSS.
- Preserved 100% contract compatibility with backend APIs, loopback server, and Playwright E2E suite.
- Cleanly deleted legacy files (`control-page.js`, `control-page.html`, `control-page.css`).
- Passed full test suite: 292 unit tests, 8 control E2E tests across Chromium and WebKit with 0 accessibility violations, 2 template E2E tests, and release test gates.

### 0.1.0 (development) — 2026-09-03

- Completed Dynamic Credential Management and Persistence for Serve Control (Phases 01–05).
- Delivered local SecretStore, control secrets API, run executor credential injection, and credentials UI modal.

## Unresolved questions

None.
