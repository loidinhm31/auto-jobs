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
- Implementation Status: Complete
- Review Status: Approved
- Completed At: 2026-09-04

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

## Implemented Components & Architecture Documentation

### 1. ErrorBoundary (`src/reporting/control-page/components/ErrorBoundary.tsx`)
- **Type**: React Class Component (`Component<ErrorBoundaryProps, ErrorBoundaryState>`).
- **Role**: Top-level exception barrier that captures unhandled runtime rendering errors in any child component tree.
- **Key Mechanics**:
  - `getDerivedStateFromError(error)` updates state `{ hasError: true, error }`.
  - `componentDidCatch(error, errorInfo)` logs diagnostic error details to `console.error`.
  - Fallback UI: Renders an accessible alert card (`role="alert"`) with error message in `<pre>` block and a "Reload Page" button (`btn btn-primary`) invoking `window.location.reload()`.
  - Custom fallback support via optional `fallback?: ReactNode` prop.

### 2. BuildConfirmDialog (`src/reporting/control-page/components/organisms/BuildConfirmDialog.tsx`)
- **Type**: Radix UI Dialog Organism.
- **Role**: Accessible confirmation modal for triggering Jenkins auto-builds on specific projects.
- **Key Mechanics**:
  - Built on `@radix-ui/react-dialog` primitives (`Dialog.Root`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Description`).
  - DOM IDs: Content `#build-confirm-dialog`, title `#dialog-title`.
  - Data details list (`<dl className="dialog-details">`):
    - Project ID: `<dd id="confirm-project-id">`
    - Project Name: `<dd id="confirm-project-name">`
    - Target Job URL: `<dd id="confirm-job-url">`
  - Actions:
    - Cancel button: `<Button id="btn-cancel-build" variant="secondary">` invoking `onCancel()`.
    - Confirm button: `<Button id="btn-confirm-build" variant="danger">` invoking `onConfirm(projectId)`.
  - Full WAI-ARIA compliance: Focus trap, ESC key dismiss, overlay click dismiss, focus restore.

### 3. CredentialsDialog (`src/reporting/control-page/components/organisms/CredentialsDialog.tsx`)
- **Type**: Radix UI Dialog Organism.
- **Role**: Secure modal for local credential management stored in `config/secrets.local.json` (git-ignored).
- **Key Mechanics**:
  - Built on `@radix-ui/react-dialog` primitives with content ID `#credentials-dialog`.
  - Container `#credentials-form` with title `#credentials-dialog-title`.
  - Live feedback banner: `<div id="credentials-message" role="status" aria-live="polite">` displaying status messages (e.g. "No changes entered", "Credentials saved successfully", "{KEY} cleared").
  - Loading indicator: `<div id="credentials-loading" aria-live="polite">` toggled when fetching secret status.
  - Rows container: `<div id="credentials-form-rows" className="credentials-form-rows">` rendering dynamic `CredentialRow` molecules mapped from `credentialRows`.
  - Empty state fallback: Displays guidance if no credential variables are required by the active config.
  - Actions: `#btn-cancel-credentials` and `#btn-save-credentials` (with loading spinner during save).
  - Security & State: Maintains local `inputValues` dictionary; completely wiped on dialog open/close and following successful saves or clears to ensure plaintext credentials never persist in DOM or state.

### 4. BrowserSettingsDialog (`src/reporting/control-page/components/organisms/BrowserSettingsDialog.tsx`)
- **Type**: Radix UI Dialog Organism.
- **Role**: Modal for managing local Playwright browser execution settings (`PLAYWRIGHT_HEADLESS` and `PLAYWRIGHT_EXECUTABLE_PATH`).
- **Key Mechanics**:
  - Built on `@radix-ui/react-dialog` with content ID `#browser-dialog`, form `#browser-form`, title `#browser-dialog-title`.
  - Feedback elements: Banner `#browser-message` and loading indicator `#browser-loading`.
  - Form rows: Renders `BrowserSettingRow` components for:
    - `PLAYWRIGHT_HEADLESS`: `<select id="browser-headless-select">` with options `""` (Inherit/Unset), `"true"` (Headless), `"false"` (Headed).
    - `PLAYWRIGHT_EXECUTABLE_PATH`: `<input id="browser-executable-path-input" type="text" spellcheck="false">`.
  - Status badges: `#badge-browser-headless` and `#badge-browser-executable-path` displaying text `'Configured'` or `'Not Set'`.
  - Clear buttons: `#btn-clear-browser-headless` and `#btn-clear-browser-executable-path`, conditionally displayed when the setting is configured.
  - Actions: `#btn-cancel-browser` and `#btn-save-browser`.
  - State lifecycle: Form inputs are cleared on close; clear actions immediately update badges and hide clear buttons.

### 5. HeaderBar (`src/reporting/control-page/components/organisms/HeaderBar.tsx`)
- **Type**: Composite Header Organism.
- **Role**: Semantic top application bar for the dashboard.
- **Key Mechanics**:
  - Renders `<header className="app-header">` with heading `<h1>Jenkins Control Dashboard</h1>`.
  - Integrates the `ConfigSelectorBar` molecule:
    - `<select id="config-select">` for switching configuration files.
    - `<button id="btn-reload">` to reload configuration from disk.
    - `<button id="btn-save">` to persist configuration changes (disabled when clean).
    - `<button id="btn-credentials">` to open `CredentialsDialog`.
    - `<button id="btn-browser-settings">` to open `BrowserSettingsDialog`.

### 6. ProjectCard (`src/reporting/control-page/components/organisms/ProjectCard.tsx`)
- **Type**: Card Organism.
- **Role**: Individual project configuration card displaying settings and controls.
- **Key Mechanics**:
  - Container has exact class `className="project-card"`.
  - Enabled toggle: `<input type="checkbox" id="checkbox-enabled-{projectId}">` bound to `onToggleEnabled`.
  - Run Type selector: `<Select id="select-runtype-{projectId}">` toggling between `'report'` and `'auto-build'`.
  - Job URL: `<a href={project.jobUrl} target="_blank">` displaying Jenkins job link.
  - Auto-build button: When `runType === 'auto-build'`, renders `<Button className="btn-auto-build" variant="danger" size="sm">` ("Trigger Auto-Build").
  - Disabling rules: Button is strictly disabled if `!isEnabled || isDirty`.

### 7. ProjectsGrid (`src/reporting/control-page/components/organisms/ProjectsGrid.tsx`)
- **Type**: Grid Organism.
- **Role**: Responsive container displaying the collection of project cards.
- **Key Mechanics**:
  - Renders `<div id="projects-list" className="projects-grid">`.
  - Responsive multi-column layout (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`).
  - Maps `projects` data into `ProjectCard` components, passing down event handlers.
  - Empty state fallback message when no projects are present in configuration.

### 8. RawJsonSection (`src/reporting/control-page/components/organisms/RawJsonSection.tsx`)
- **Type**: Accordion Organism.
- **Role**: Advanced raw JSON configuration editor.
- **Key Mechanics**:
  - Renders `<details id="json-editor-details">` wrapping `<summary id="section-editor-title">`.
  - JSON Textarea: Standard `<textarea id="raw-json-textarea" aria-label="Raw JSON configuration editor" spellcheck="false">`.
  - **Preserves Test Contract**: Plain `<textarea>` element is used intentionally instead of CodeMirror/Monaco to ensure 100% compatibility with Playwright `.fill()` and `.textContent` operations.
  - Ref synchronization: Synchronizes `textareaRef.current.value` without losing cursor position during user typing.
  - Actions & Feedback:
    - `<Button id="btn-apply-json" variant="secondary">`: Parses and validates JSON, updating visual cards.
    - `<span id="json-validation-msg" aria-live="polite">`: Displays JSON validation error or success status.

### 9. ExecutionSection (`src/reporting/control-page/components/organisms/ExecutionSection.tsx`)
- **Type**: Action Bar Organism.
- **Role**: Global report generation trigger controls.
- **Key Mechanics**:
  - Container `.actions-bar`.
  - Primary button: `<Button id="btn-run-reports" variant="primary">` ("Generate Reports (All Enabled)").
  - Disabling rules: Disabled when configuration `isDirty` or execution `isLoading`.

### 10. RunStatusCard (`src/reporting/control-page/components/organisms/RunStatusCard.tsx`)
- **Type**: Execution Monitoring Organism.
- **Role**: Displays execution lifecycle status, output logs, and generated report links.
- **Key Mechanics**:
  - Container `<div id="run-status-card" className="run-card">`.
  - Header displays:
    - Status badge: `<Badge id="run-status-badge" variant={status}>` (`idle`, `queued`, `running`, `succeeded`, `failed`, `submission-unknown`).
    - Run ID: `<span id="run-id-display">`.
  - Embeds `RunResultBox` (`#run-result-box`) rendering clickable link to generated HTML report.
  - Embeds `LogViewer` (`#run-logs`) rendering streaming execution logs inside an auto-scrolling `<pre>` block.

### 11. DashboardLayout (`src/reporting/control-page/components/templates/DashboardLayout.tsx`)
- **Type**: Page Template.
- **Role**: Master structural template for the control dashboard.
- **Key Mechanics**:
  - Skip navigation link: `<a href="#main-content" className="skip-link">Skip to main content</a>`.
  - Header slot mounting `HeaderBar`.
  - Main container `<main id="main-content" className="main-container">` containing:
    - Status banner slot (`#status-banner`).
    - `<section aria-labelledby="section-projects-title">` containing Projects section.
    - `<section aria-labelledby="section-editor-title">` containing Raw JSON editor section.
    - `<section aria-labelledby="section-actions-title">` containing Actions section.
    - `<section aria-labelledby="section-run-title">` containing Run status section.
  - Dialogs slot for Radix Dialog portals.

### 12. DashboardPage (`src/reporting/control-page/pages/DashboardPage.tsx`)
- **Type**: Top-level Page Component.
- **Role**: Orchestrates all hooks, state management, and user interaction flows.
- **Key Mechanics**:
  - Connects custom hooks:
    - `useConfigManager`: Handles config lists, active config loading, reload, save, dirty checking, raw JSON syncing, and project card updates.
    - `useCredentialsManager`: Discovers required secrets, polls presence status, handles saving and clearing credentials.
    - `useBrowserSettings`: Manages Playwright headless and executable path settings.
    - `useRunPoller`: Handles run triggering (`POST /api/run`), HTTP 202 status handling, and 1s interval polling.
  - Wires modal dialogs (`BuildConfirmDialog`, `CredentialsDialog`, `BrowserSettingsDialog`) to state.
  - Controls confirmation workflow when user clicks `.btn-auto-build` on any `ProjectCard`.
  - Synchronizes status banners across config saves, credentials updates, and browser setting changes.

### 13. App (`src/reporting/control-page/App.tsx`)
- **Type**: Application Root Component.
- **Role**: Wraps the entire dashboard page in the `ErrorBoundary`.
- **Key Mechanics**:
  ```tsx
  export default function App() {
    return (
      <ErrorBoundary>
        <DashboardPage />
      </ErrorBoundary>
    );
  }
  ```

### 14. Main Entry (`src/reporting/control-page/main.tsx`)
- **Type**: Vite Application Entry Point.
- **Role**: Mounts React 19 application to DOM.
- **Key Mechanics**:
  - Imports `React`, `StrictMode`, `ReactDOM.createRoot`.
  - Imports `App` component and `styles/globals.css`.
  - Targets `#root` element in `index.html`.
  - Mounts application within `StrictMode` to identify potential lifecycle issues.

---

## Changed Files Summary

### Newly Created Files

| File Path | Component / Role | Description |
|---|---|---|
| `src/reporting/control-page/components/ErrorBoundary.tsx` | `ErrorBoundary` | React class component error boundary with alert fallback and reload action |
| `src/reporting/control-page/components/organisms/BuildConfirmDialog.tsx` | `BuildConfirmDialog` | Radix Dialog modal for confirming auto-build trigger with project metadata |
| `src/reporting/control-page/components/organisms/CredentialsDialog.tsx` | `CredentialsDialog` | Radix Dialog modal for managing dynamic local credentials in `secrets.local.json` |
| `src/reporting/control-page/components/organisms/BrowserSettingsDialog.tsx` | `BrowserSettingsDialog` | Radix Dialog modal for configuring `PLAYWRIGHT_HEADLESS` and executable path |
| `src/reporting/control-page/components/organisms/HeaderBar.tsx` | `HeaderBar` | Header bar organism integrating title and `ConfigSelectorBar` |
| `src/reporting/control-page/components/organisms/ProjectCard.tsx` | `ProjectCard` | Card organism with `.project-card`, checkbox, run type select, `.btn-auto-build` |
| `src/reporting/control-page/components/organisms/ProjectsGrid.tsx` | `ProjectsGrid` | Grid organism with `#projects-list` rendering responsive list of cards |
| `src/reporting/control-page/components/organisms/RawJsonSection.tsx` | `RawJsonSection` | Accordion organism with `<details>` and plain `<textarea>` for JSON editing |
| `src/reporting/control-page/components/organisms/ExecutionSection.tsx` | `ExecutionSection` | Execution bar organism containing `#btn-run-reports` trigger button |
| `src/reporting/control-page/components/organisms/RunStatusCard.tsx` | `RunStatusCard` | Card organism with `#run-status-card`, badge, log viewer, and result link |
| `src/reporting/control-page/components/organisms/index.ts` | Barrel Export | Export barrel for all organism components |
| `src/reporting/control-page/components/templates/DashboardLayout.tsx` | `DashboardLayout` | Master template with skip-link, semantic `<main>`, sections, and dialog mount |
| `src/reporting/control-page/pages/DashboardPage.tsx` | `DashboardPage` | Full dashboard page controller integrating all hooks and dialog states |
| `src/reporting/control-page/App.tsx` | `App` | Root component wrapping `DashboardPage` in `ErrorBoundary` |

### Modified Files

| File Path | Description of Changes |
|---|---|
| `src/reporting/control-page/main.tsx` | Mounted `App` component into `#root` with `StrictMode` and loaded `globals.css` |
| `src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx` | Adjusted button disable logic (`btn-save` disabled on `!isDirty \|\| isSaving`) |
| `src/reporting/control-page/styles/globals.css` | Added styling for dialogs (`.confirm-dialog`, `.credentials-dialog`, `.browser-dialog`, `.dialog-details`, `.dialog-actions`, `.credentials-form-rows`), and `<details>` display fix |
| `plans/260904-1640-control-page-react-refactor/plan.md` | Updated Phase 04 status to **DONE** (2026-09-04) |
| `plans/260904-1640-control-page-react-refactor/phase-04-organisms-and-page-assembly.md` | Documented all 14 components, marked all tasks complete, and recorded changed files list |

---

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
- [x] Implement `ErrorBoundary.tsx`
- [x] Implement `BuildConfirmDialog.tsx` with all dialog IDs
- [x] Implement `CredentialsDialog.tsx` with form rows, message banner, loading indicator, dynamic credential rows
- [x] Implement `BrowserSettingsDialog.tsx` with `'Not Set'` badges, clear buttons, headless select, exec path input
- [x] Implement `HeaderBar.tsx`
- [x] Implement `ProjectCard.tsx` with `.project-card`, checkbox, `.btn-auto-build`
- [x] Implement `ProjectsGrid.tsx` with `#projects-list`
- [x] Implement `RawJsonSection.tsx` with `<details>` and `<textarea>`
- [x] Implement `ExecutionSection.tsx` and `RunStatusCard.tsx`
- [x] Implement `DashboardLayout.tsx` with semantic sections and skip link
- [x] Implement `DashboardPage.tsx` wiring all hooks
- [x] Implement `main.tsx` with StrictMode and `App.tsx` with ErrorBoundary
- [x] Run `npm run build` and verify asset emission

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
- **Risk**: Radix Dialog portal rendering breaks Playwright locators.
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
- Proceed to [Phase 05: Verification, Playwright E2E & Accessibility Audit](phase-05-verification-and-release-audit.md).
