# Phase 04: Organisms, Modals & Dashboard Assembly

## Context Links
- Parent Plan: [plan.md](plan.md)
- Prior Phases: [phase-01-tooling-vite-pipeline-server-asset-routing.md](phase-01-tooling-vite-pipeline-server-asset-routing.md), [phase-02-types-and-custom-hooks.md](phase-02-types-and-custom-hooks.md), [phase-03-atoms-and-molecules.md](phase-03-atoms-and-molecules.md)
- Reference Template: [control-page.html](../../src/reporting/control-page/control-page.html)
- Reference Script: [control-page.js](../../src/reporting/control-page/control-page.js)
- E2E Test Contract: [control-page.spec.ts](../../tests/e2e/control-page.spec.ts)

## Parallelization Info
- Concurrency: Sequential after Phase 02 and Phase 03.
- Depends on: Phase 02, Phase 03
- Blocks: Phase 05

## Overview
- Date: 2026-09-04
- Description: Build complex organism widgets, modal dialogs using Radix UI primitives, template layouts, error boundary, and assemble the full dashboard page mounting into `index.html` via Vite entry.
- Priority: P1
- Implementation Status: Pending
- Review Status: Pending

## Key Insights
1. **Radix Dialog vs native `<dialog>`**: Legacy uses HTML `<dialog>` with `.showModal()` / `.close()` and `method="dialog"` forms. Radix Dialog provides equivalent accessibility (ESC key, focus trap, backdrop) but uses a different DOM structure. The Radix dialog **does not** use `<form method="dialog">` — form submission behavior must be handled via React `onClick` handlers on save/cancel buttons.
2. **Test visibility assertions on dialogs**: Tests check `toBeVisible()` / `not.toBeVisible()` on dialog element IDs (`#credentials-dialog`, `#browser-dialog`, `#build-confirm-dialog`). Radix Dialog renders content in a portal — the ID must be on the Radix `Dialog.Content` wrapper or a child that Playwright can locate.
3. **Project cards use checkboxes and class selectors**: Tests query `.project-card input[type="checkbox"]` and `.btn-auto-build`. These must be standard HTML elements (not Radix primitives that change the DOM structure).

## DOM Contract: Required IDs for Phase 04 Components

### Organism & Dialog IDs

| ID | Element | Component | Test Usage |
|---|---|---|---|
| `projects-list` | `<div>` | `ProjectsGrid` | Container for `.project-card` elements |
| `run-status-card` | `<div>` | `RunStatusCard` | Container for run status display |
| `run-id-display` | `<span>` | `RunStatusCard` | Displays active run ID |
| `json-editor-details` | `<details>` | `RawJsonSection` | Accordion wrapper for JSON editor |
| `section-editor-title` | `<summary>` | `RawJsonSection` | Accordion heading text |
| `btn-apply-json` | `<button>` | `RawJsonSection` | Apply JSON changes button |
| `btn-run-reports` | `<button>` | `ExecutionSection` | Trigger report execution |
| `main-content` | `<main>` | `DashboardLayout` | Skip link target |
| `section-projects-title` | `<h2>` | Section heading | `aria-labelledby` |
| `section-actions-title` | `<h2>` | Section heading | `aria-labelledby` |
| `section-run-title` | `<h2>` | Section heading | `aria-labelledby` |

### Build Confirmation Dialog IDs

| ID | Element | Component | Test Usage |
|---|---|---|---|
| `build-confirm-dialog` | Dialog content | `BuildConfirmDialog` | `toBeVisible()` / `not.toBeVisible()` |
| `dialog-title` | `<h2>` | `BuildConfirmDialog` | `aria-labelledby` |
| `confirm-project-id` | `<dd>` | `BuildConfirmDialog` | `toHaveText('demo-build-service')` |
| `confirm-project-name` | `<dd>` | `BuildConfirmDialog` | Display |
| `confirm-job-url` | `<dd>` | `BuildConfirmDialog` | Display |
| `btn-cancel-build` | `<button>` | `BuildConfirmDialog` | Cancel action |
| `btn-confirm-build` | `<button>` | `BuildConfirmDialog` | `click()` to confirm |

### Credentials Dialog IDs

| ID | Element | Component | Test Usage |
|---|---|---|---|
| `credentials-dialog` | Dialog content | `CredentialsDialog` | `toBeVisible()` / `not.toBeVisible()` |
| `credentials-dialog-title` | `<h2>` | `CredentialsDialog` | `aria-labelledby` |
| `credentials-form` | `<div>` or form wrapper | `CredentialsDialog` | Structural |
| `credentials-message` | `<div>` | `CredentialsDialog` | `toHaveText(/No changes entered/i)`, `toHaveText(/Credentials saved/i)`, `toHaveText(/JENKINS_PASSWORD cleared/i)` |
| `credentials-loading` | `<div>` | `CredentialsDialog` | Loading indicator |
| `credentials-form-rows` | `<div>` | `CredentialsDialog` | Container for `CredentialRow` components |
| `btn-cancel-credentials` | `<button>` | `CredentialsDialog` | `click()` to close |
| `btn-save-credentials` | `<button>` | `CredentialsDialog` | `click()` to save |

### Browser Settings Dialog IDs

| ID | Element | Component | Test Usage |
|---|---|---|---|
| `browser-dialog` | Dialog content | `BrowserSettingsDialog` | `toBeVisible()` / `not.toBeVisible()` |
| `browser-dialog-title` | `<h2>` | `BrowserSettingsDialog` | `aria-labelledby` |
| `browser-message` | `<div>` | `BrowserSettingsDialog` | `toHaveText(/Browser settings saved/i)`, `toHaveText(/PLAYWRIGHT_HEADLESS cleared/i)`, `toHaveText(/PLAYWRIGHT_EXECUTABLE_PATH cleared/i)` |
| `browser-loading` | `<div>` | `BrowserSettingsDialog` | Loading indicator |
| `browser-headless-select` | `<select>` | `BrowserSettingsDialog` | `selectOption('false')` |
| `browser-executable-path-input` | `<input>` | `BrowserSettingsDialog` | `fill('C:\\browsers\\chrome-custom.exe')` |
| `badge-browser-headless` | `<span>` | `BrowserSettingsDialog` | `toHaveText('Not Set')` / `toHaveText('Configured')` |
| `badge-browser-executable-path` | `<span>` | `BrowserSettingsDialog` | `toHaveText('Not Set')` / `toHaveText('Configured')` |
| `btn-clear-browser-headless` | `<button>` | `BrowserSettingsDialog` | `toBeVisible()` / `not.toBeVisible()`, `click()` |
| `btn-clear-browser-executable-path` | `<button>` | `BrowserSettingsDialog` | `toBeVisible()` / `not.toBeVisible()`, `click()` |
| `btn-cancel-browser` | `<button>` | `BrowserSettingsDialog` | `click()` to close |
| `btn-save-browser` | `<button>` | `BrowserSettingsDialog` | `click()` to save |

## Requirements

### Organisms (`src/reporting/control-page/components/organisms/`)

#### `HeaderBar.tsx`
- Renders `<header class="app-header">` with `<h1>Jenkins Control Dashboard</h1>` and `ConfigSelectorBar`.

#### `ProjectCard.tsx`
- Props: `project: ProjectCardData`, `isDirty: boolean`, `onToggleEnabled`, `onChangeRunType`, `onTriggerBuild`
- **Must render** with `className="project-card"`.
- Contains `<input type="checkbox">` for enabled toggle.
- Contains runType `<select>` dropdown.
- Contains `<a>` for job URL display.
- When `project.runType === 'auto-build'`: renders `<button className="btn btn-sm btn-auto-build">` that is `disabled` when `isDirty || !project.enabled`.

#### `ProjectsGrid.tsx`
- Props: `projects`, `isDirty`, handlers
- **Must render**: `<div id="projects-list" className="projects-grid">`
- Renders `ProjectCard` for each project.

#### `RawJsonSection.tsx`
- **Must render** as `<details id="json-editor-details">` wrapping `<summary id="section-editor-title">`.
- Contains `<textarea id="raw-json-textarea" aria-label="Raw JSON configuration editor" spellcheck="false">`.
- Contains `<button id="btn-apply-json">` and `<span id="json-validation-msg" aria-live="polite">`.

#### `ExecutionSection.tsx`
- Contains `<button id="btn-run-reports">` — disabled when `isDirty`.

#### `RunStatusCard.tsx`
- **Must render**: `<div id="run-status-card" className="run-card">`
- Contains `Badge` with `id="run-status-badge"`.
- Contains `<span id="run-id-display">`.
- Contains `LogViewer` with `id="run-logs"`.
- Contains `RunResultBox` with `id="run-result-box"`.

#### `BuildConfirmDialog.tsx`
- Uses Radix `Dialog` primitive styled with Tailwind.
- `Dialog.Content` must have or contain element with `id="build-confirm-dialog"`.
- Interior: `<h2 id="dialog-title">`, `<dd id="confirm-project-id">`, `<dd id="confirm-project-name">`, `<dd id="confirm-job-url">`, `<button id="btn-cancel-build">`, `<button id="btn-confirm-build">`.
- Confirm triggers `onConfirm(projectId)` → calls `triggerRun('auto-build', projectId)`.

#### `CredentialsDialog.tsx`
- Uses Radix `Dialog` with `id="credentials-dialog"` on content wrapper.
- Interior structure:
  - `<h2 id="credentials-dialog-title">`
  - `<div id="credentials-message" class="status-banner" role="status" aria-live="polite">` — message banner
  - `<div id="credentials-loading" class="credentials-loading" aria-live="polite">` — loading indicator
  - `<div id="credentials-form-rows" class="credentials-form-rows">` — contains `CredentialRow` components
  - `<button id="btn-cancel-credentials">`, `<button id="btn-save-credentials">`
- **On open**: calls `useCredentialsManager.discoverKeys()` and `loadStatus()`.
- **On save with no changes**: show `'No changes entered'` in `#credentials-message`.
- **On save with values**: show `'Credentials saved successfully'` in `#credentials-message` and `#status-banner`.
- **On clear**: show `'{KEY} cleared'` in `#credentials-message`.
- **On close**: clear all password input values.

#### `BrowserSettingsDialog.tsx`
- Uses Radix `Dialog` with `id="browser-dialog"` on content wrapper.
- Interior structure:
  - `<h2 id="browser-dialog-title">`
  - `<div id="browser-message" class="status-banner" role="status" aria-live="polite">`
  - `<div id="browser-loading" class="credentials-loading" aria-live="polite">`
  - `<select id="browser-headless-select">` with options: `""` (Inherit/Unset), `"true"` (Headless), `"false"` (Headed)
  - `<input id="browser-executable-path-input" type="text" spellcheck="false">`
  - Badges: `<span id="badge-browser-headless">` and `<span id="badge-browser-executable-path">` with text `'Not Set'` or `'Configured'`
  - Clear buttons: `<button id="btn-clear-browser-headless">` and `<button id="btn-clear-browser-executable-path">`
  - `<button id="btn-cancel-browser">`, `<button id="btn-save-browser">`
- **On save success**: show `'Browser settings saved successfully'` in `#browser-message`, update badges to `'Configured'`.
- **On clear headless**: show `'PLAYWRIGHT_HEADLESS cleared'` in `#browser-message`, badge → `'Not Set'`, hide clear button.
- **On clear exec path**: show `'PLAYWRIGHT_EXECUTABLE_PATH cleared'` in `#browser-message`, badge → `'Not Set'`, hide clear button.
- **On close**: clear `#browser-executable-path-input` value.

### Templates & Pages

#### `DashboardLayout.tsx`
- Renders semantic HTML structure:
  ```html
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <HeaderBar />
  <main id="main-content" class="main-container">
    <StatusBanner id="status-banner" />
    <section aria-labelledby="section-projects-title">...</section>
    <section aria-labelledby="section-editor-title">...</section>
    <section aria-labelledby="section-actions-title">...</section>
    <section aria-labelledby="section-run-title">...</section>
  </main>
  <!-- Dialog mount points rendered by Radix portals -->
  ```

#### `DashboardPage.tsx`
- Coordinates hooks: `useConfigManager`, `useCredentialsManager`, `useBrowserSettings`, `useRunPoller`.
- Handles user interactions, manages dirty confirmation alerts, updates banner messages.
- Wires hook state to component props.
- **Dirty state effects**: When `isDirty=true`, `#btn-run-reports` and all `.btn-auto-build` buttons are disabled.
- **Run trigger flow**: On `#btn-run-reports` click → `triggerRun('report')`. On `#btn-confirm-build` click → `triggerRun('auto-build', projectId)`.

#### `ErrorBoundary.tsx`
- React error boundary component wrapping the dashboard.
- Catches rendering errors and displays a fallback UI instead of a blank screen.
- Logs errors for debugging.

### Application Entry

#### `src/reporting/control-page/main.tsx`
- React 19 root initialization:
  ```tsx
  import { StrictMode } from 'react';
  import { createRoot } from 'react-dom/client';
  import App from './App';
  import './styles/globals.css';

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  ```
- **Note**: `StrictMode` causes double-render in development (harmless) but helps catch lifecycle issues.

#### `src/reporting/control-page/App.tsx`
- Top-level app wrapper:
  ```tsx
  import { ErrorBoundary } from './components/ErrorBoundary';
  import { DashboardPage } from './pages/DashboardPage';

  export default function App() {
    return (
      <ErrorBoundary>
        <DashboardPage />
      </ErrorBoundary>
    );
  }
  ```

## Related Code Files
- `src/reporting/control-page/index.html` (created in Phase 01)
- `src/reporting/control-page/main.tsx`
- `src/reporting/control-page/App.tsx`
- `src/reporting/control-page/components/ErrorBoundary.tsx`
- `src/reporting/control-page/pages/DashboardPage.tsx`
- `src/reporting/control-page/components/templates/DashboardLayout.tsx`
- `src/reporting/control-page/components/organisms/*`

## File Ownership
- Exclusively owns all organism components, template layouts, page components, error boundary, and application entry points (`main.tsx`, `App.tsx`).

## Implementation Steps
1. Implement `ErrorBoundary.tsx` with fallback UI.
2. Implement Radix UI-backed dialog organisms: `BuildConfirmDialog`, `CredentialsDialog`, `BrowserSettingsDialog` — ensuring all IDs from the contract tables above are present.
3. Implement `ProjectCard` (with `.project-card` class, checkbox, `.btn-auto-build` button) and `ProjectsGrid` (with `#projects-list` ID).
4. Implement `HeaderBar` with `<h1>` title and `ConfigSelectorBar`.
5. Implement `RawJsonSection` as `<details>` with `<textarea>` (NOT CodeMirror), `ExecutionSection`, and `RunStatusCard`.
6. Create `DashboardLayout` with semantic markup (`<main id="main-content">`, `<header>`, skip-to-content link, sectioned layout with `aria-labelledby`).
7. Create `DashboardPage` wiring hooks from Phase 02 to organism components.
8. Implement `main.tsx` (with `StrictMode`) and `App.tsx` (with `ErrorBoundary`).
9. Run `npm run build` and verify complete compilation and asset emission.

## Todo List
- [ ] Implement `ErrorBoundary.tsx`
- [ ] Implement `BuildConfirmDialog.tsx` with all dialog IDs
- [ ] Implement `CredentialsDialog.tsx` with form rows, message banner, loading indicator, dynamic credential rows
- [ ] Implement `BrowserSettingsDialog.tsx` with `'Not Set'` badges, clear buttons, headless select, exec path input
- [ ] Implement `HeaderBar.tsx`
- [ ] Implement `ProjectCard.tsx` with `.project-card`, checkbox, `.btn-auto-build`
- [ ] Implement `ProjectsGrid.tsx` with `#projects-list`
- [ ] Implement `RawJsonSection.tsx` with `<details>` and `<textarea>`
- [ ] Implement `ExecutionSection.tsx` and `RunStatusCard.tsx`
- [ ] Implement `DashboardLayout.tsx` with semantic sections and skip link
- [ ] Implement `DashboardPage.tsx` wiring all hooks
- [ ] Implement `main.tsx` with StrictMode and `App.tsx` with ErrorBoundary
- [ ] Run `npm run build` and verify asset emission

## Success Criteria
- Vite bundle builds cleanly into `.runner-build/reporting/control-page`.
- Serving the control page loads all organisms and state correctly.
- Dialogs open and close with proper focus trapping and keyboard navigation (ESC key, Tab cycling).
- All dialog IDs, interior element IDs, and message text match the contract tables.
- Browser settings badges show `'Not Set'` (not `'Missing'`) for unconfigured state.
- Dirty state correctly disables `#btn-run-reports` and all `.btn-auto-build` buttons.

## Conflict Prevention
- This phase focuses entirely on assembling the React organism components, pages, and Vite entry. It does not touch server logic or test runner files.

## Risk Assessment
- **Risk**: Radix Dialog portal rendering breaks Playwright visibility assertions.
- **Mitigation**: Ensure dialog content element has the expected `id` attribute. Test with `toBeVisible()` — Radix portals append to `<body>`, which Playwright can locate.
- **Risk**: Modals failing accessibility focus expectations.
- **Mitigation**: Radix UI Dialog primitive provides WAI-ARIA compliant dialog behavior (focus trap, ESC dismiss, backdrop) out-of-the-box.
- **Risk**: Form submission behavior differs between native `<dialog>` `method="dialog"` and Radix Dialog.
- **Mitigation**: Use `onClick` handlers on save/cancel buttons instead of relying on form submission events.

## Security Considerations
- Ensure raw JSON editor validation prevents corrupt or malicious payloads from being applied to configuration without validation.
- Credential inputs must be `type="password"` and cleared on dialog close.
- Never render secret values in the DOM.

## Next Steps
- Proceed to Phase 05: Verification, Playwright E2E & Accessibility Audit.
