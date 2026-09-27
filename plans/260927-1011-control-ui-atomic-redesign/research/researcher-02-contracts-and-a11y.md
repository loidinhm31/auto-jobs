# Researcher Report: Behavioral Contracts, Accessibility & Modern Design Tokens

## Executive Summary
All existing Playwright E2E suites (`control-page.spec.ts` 1,135 LOC, `control-report-management.spec.ts` 710 LOC) enforce strict DOM contracts, including Axe WCAG AA audits (`violations === []`), responsive layout tests at 1280px and 375px without horizontal scroll, keyboard trap inside Radix dialogs, and exact button/input IDs. Modern Refined Light styling must preserve every selector and accessibility invariant.

## Critical DOM ID & Selector Invariants
The following selectors are verified directly by E2E tests and MUST NOT be renamed, removed, or hidden:

### 1. Dashboard Page & Header
- Header: `header.app-header`, `#header-reports-link` (link text "Reports", href `/reports/index.html`).
- Config Selection: `#config-select`, `#btn-reload`, `#btn-save`.
- Dialog Triggers: `#btn-credentials`, `#btn-browser-settings`.
- Status Banner: `#status-banner` (with variants `info`, `success`, `error`).
- Groups Board: `#projects-list` (`role="region"`, `aria-label="Project groups board"`), `#group-column-ungrouped`, `#group-column-*`, `#btn-new-group`, `#project-group-dialog`.
- Project Cards: `.project-card`, headings with project name (`h4`), `.mono` ID chip, `#checkbox-enabled-{id}`, `#select-runtype-{id}`, job URL link with exact title/aria-label.
- Config Form Builder: `#config-form-title`, `#project-selection`, `button: "Add New Project"`, `button: "Remove Project"`, `#btn-clone-project`, `#btn-save-project`, `#btn-cancel-project`, `#config-project-id`, `#config-project-name`, `#config-project-login-url`, `#config-project-job-url`, `#config-project-run-type`, `#config-project-login-url-error`.
- Defaults: summary with text `Edit configuration defaults`, `#config-default-timeout`, `#config-default-browser`.
- Raw JSON: `#raw-json-textarea`, `#btn-apply-json`, `#json-validation-msg` (classes `.valid`, `.invalid`).
- Execution Actions: `#btn-run-reports`, `#btn-run-auto-build`, `#select-workers` (disabled during dirty/running states).
- Run Status: `#run-status-badge`, `#run-logs` (`.log-pre`), `#run-result-box` (and outcome links).

### 2. Dialog Contracts
- Credentials Dialog: `#credentials-dialog`, `#credentials-message`, `#btn-save-credentials`, `#btn-cancel-credentials`, `.credential-row`, `#secret-input-{KEY}`, `.btn-clear-credential`.
- Browser Settings Dialog: `#browser-dialog`, `#browser-message`, `#btn-save-browser`, `#btn-cancel-browser`, `#badge-browser-headless`, `#badge-browser-executable-path`, `#browser-headless-select`, `#browser-executable-path-input`, `#btn-clear-browser-headless`, `#btn-clear-browser-executable-path`.
- Project Group Dialogs: `#project-group-dialog`, `#group-name-input`, `#btn-save-group`, `#btn-cancel-group`.
- Delete Confirmation: `#delete-dialog`, `#btn-confirm-delete`, `#btn-cancel-delete`, `#delete-run-dialog`, `#btn-confirm-delete-run`, `#btn-cancel-delete-run`.

### 3. Report Management Page
- Heading: `h1` with "Vulnerability report index".
- Navigation: `#back-to-dashboard-link` (link text "← Back to Dashboard").
- Cards: `.project-card` or report summary items with run counts, pagination buttons, and delete triggers.

## Axe WCAG AA Accessibility Invariants
1. **Zero Violations Gate**: `const results = await new AxeBuilder({ page }).analyze(); expect(results.violations).toEqual([]);` runs on desktop, mobile, open dialogs, and individual controls (`#select-workers`).
2. **Color Contrast Ratio**: Minimum 4.5:1 for normal text, 3:1 for large text and UI components/borders.
   - Text Slate-900 (`#0f172a`) on White/Slate-50: 16.5:1 (passes AAA).
   - Text Slate-700 (`#334155`) on Slate-50: 10.2:1 (passes AAA).
   - Muted text Slate-600 (`#475569`) on White: 7.0:1 (passes AA/AAA).
   - Sky-700 (`#0369a1`) on White: 5.5:1 (passes AA).
   - Danger Red-700 (`#b91c1c`) on White: 6.2:1 (passes AA).
   - Badges: `emerald-700` (`#047857`) on `emerald-50` (`#ecfdf5`): 5.1:1; `amber-800` (`#92400e`) on `amber-50` (`#fffbeb`): 5.4:1; `rose-700` (`#be123c`) on `rose-50` (`#fff1f2`): 5.3:1.
3. **Focus Visibility**: All interactive elements must have distinct, high-contrast focus rings (`focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2`).
4. **Skip Links**: `.skip-link` with `href="#main-content"` must become visible on focus at the top of the viewport.
5. **Screen Reader Labels**: `aria-label` or `aria-labelledby` on all icon buttons, selects, and regions (`#projects-list`).
6. **Motion**: `@media (prefers-reduced-motion: reduce)` must disable transitions and animations.

## Modern Refined Light Design Tokens

| Token Category | Tailwind Utility | Hex / Value | Usage |
|---|---|---|---|
| Background Canvas | `bg-slate-50` | `#f8fafc` | Page canvas background |
| Surface Card | `bg-white` | `#ffffff` | Card and dialog containers |
| Subtle Surface | `bg-slate-100` | `#f1f5f9` | Inputs, table headers, chip backgrounds |
| Border Default | `border-slate-200` | `#e2e8f0` | Dividers, card borders, subtle grid |
| Border Strong | `border-slate-300` | `#cbd5e1` | Input borders, active component outlines |
| Text Primary | `text-slate-900` | `#0f172a` | Page titles, card headings, strong text |
| Text Secondary | `text-slate-700` | `#334155` | Body text, labels, table content |
| Text Muted | `text-slate-500` | `#64748b` | Subtitles, helper text, timestamps |
| Primary Action | `bg-sky-600` / `hover:bg-sky-700` | `#0284c7` / `#0369a1` | Primary CTA buttons, active selection |
| Success State | `bg-emerald-50 text-emerald-800 border-emerald-200` | `#047857` text | Succeeded badge, valid notification |
| Warning / Partial | `bg-amber-50 text-amber-800 border-amber-200` | `#92400e` text | Queued, partial outcome badge |
| Danger / Failed | `bg-rose-50 text-rose-800 border-rose-200` | `#be123c` text | Failed badge, danger buttons, errors |
| Elevation XS | `shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Compact cards, buttons |
| Elevation MD | `shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.07)` | Section panels, dialog containers |
| Corner Radius | `rounded-lg` (8px), `rounded-md` (6px) | 8px container, 6px control | Modern balanced curvature |
