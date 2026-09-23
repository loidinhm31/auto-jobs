# Project roadmap

Last updated: 2026-09-23  
Plan: [Control Page React Refactor with Atomic Design](../plans/260904-1640-control-page-react-refactor/plan.md)
Completed initiative: [Bounded Parallel Report Workers](../plans/260923-1402-parallel-report-workers/plan.md)

## Bounded parallel report workers

Plan: [Bounded Parallel Report Workers](../plans/260923-1402-parallel-report-workers/plan.md)

**Overall status:** Complete · **100%** (8.0 of 8.0 planned hours; 3 of 3 phases complete; 2026-09-23).

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. Bounded report execution and saved config | **DONE** | **100%** | 3h | Completed 2026-09-23; schema-v1 document-scoped `reportWorkers`, single-read CLI loader, bounded execution, ordered outcomes and failure isolation. Review: 40/40 focused tests, 353/353 unit tests, typecheck clean; see [phase](../plans/260923-1402-parallel-report-workers/phase-01-bounded-report-execution.md) and [review](../plans/reports/code-review-260923-1924-phase-01-bounded-report-execution.md). |
| 2. Control run contract | **DONE** | **100%** | 2h | Completed 2026-09-23; reject request-level worker overrides with 422 `INVALID_WORKER_COUNT` before admission; derive `reportWorkers ?? 1` from the ETag-checked saved document for the report executor only. Preserved single-active-run behavior, auto-build isolation, security gates and SecretStore redaction. Evidence: 16/16 focused unit tests, 360/360 full unit tests, `tsc` 0 errors; see [phase](../plans/260923-1402-parallel-report-workers/phase-02-control-run-contract.md) and [review](../plans/reports/code-review-260923-2117-phase-02-control-run-contract.md).
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
- Implemented accessible dialogs: `BuildConfirmDialog`, `CredentialsDialog`, `BrowserSettingsDialog`.
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
