# Project roadmap

Last updated: 2026-09-05  
Plan: [Control Page React Refactor with Atomic Design](../plans/260904-1640-control-page-react-refactor/plan.md)

## Overall status

- Status: **Complete**
- Progress: **100%** (22.0 of 22.0 weighted planned hours; 6 of 6 phases complete)
- Current milestone: **Phase 06 — Legacy Cleanup & Documentation DONE**
- Phase 01 completed: **2026-09-04**
- Phase 02 completed: **2026-09-04**
- Phase 03 completed: **2026-09-04**
- Phase 04 completed: **2026-09-04**
- Phase 05 completed: **2026-09-04**
- Phase 06 completed: **2026-09-05**

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
