# Phase 03: Atomic Design Components (Atoms & Molecules)

## Context Links
- Parent Plan: [plan.md](plan.md)
- Prior Phases: [phase-01-tooling-vite-pipeline-server-asset-routing.md](phase-01-tooling-vite-pipeline-server-asset-routing.md), [phase-02-types-and-custom-hooks.md](phase-02-types-and-custom-hooks.md)
- Styling & Legacy DOM: [control-page.html](../../src/reporting/control-page/control-page.html), [control-page.css](../../src/reporting/control-page/control-page.css)
- E2E Test Contract: [control-page.spec.ts](../../tests/e2e/control-page.spec.ts)
- Shared Prop Interfaces: `src/reporting/control-page/types/component-contracts.ts` (from Phase 02)

## Parallelization Info
- Concurrency: **Can run in parallel with Phase 02** once Phase 01 dependencies are installed. Use `types/component-contracts.ts` as the shared interface.
- Depends on: Phase 01
- Blocks: Phase 04

## Overview
- Date: 2026-09-04
- Description: Construct accessible UI primitives and compound components complying with Atomic Design principles, Tailwind CSS classes, and exact DOM ID / CSS class / data-attribute / ARIA requirements expected by Playwright E2E tests.
- Priority: P1
- Implementation Status: Complete
- Review Status: Approved
- Completed At: 2026-09-04

## Key Insights
1. **Plain `<textarea>` for JSON editing** — NOT CodeMirror/Monaco. The E2E test interacts with `#raw-json-textarea` as a standard `<textarea>` element via Playwright's `.fill()` and `.textContent`. CodeMirror replaces the textarea with a complex DOM structure that breaks these interactions. Using a plain textarea preserves 100% test compatibility with zero test modifications.
2. **CSS classes and data attributes are test-critical** — Tests use class selectors (`.project-card`, `.btn-auto-build`, `.badge`, `.credential-row`, `.btn-clear-credential`) and attribute selectors (`[data-key="..."]`). These must be rendered exactly.

## DOM Contract: Required IDs, Classes & Attributes

> **This is the authoritative contract table.** Every entry is asserted by `control-page.spec.ts` and must be present in the React output.

### Required Element IDs (Atoms & Molecules)

| ID | Element Type | Component | ARIA / Attributes | Test Usage |
|---|---|---|---|---|
| `status-banner` | `<div>` | `StatusBanner` | `role="status"`, `aria-live="polite"` | Text assertions: `/Configuration saved/i`, `/Credentials saved/i` |
| `run-status-badge` | `<span>` | `Badge` | Must have classes `badge badge-{status}` | Text: `'running'`, `'succeeded'`, `'failed'` |
| `run-logs` | `<pre>` | `LogViewer` | `role="log"`, `aria-live="polite"` | `toContainText(...)` assertions |
| `run-result-box` | `<div>` | `RunResultBox` | — | Contains `<a>` with `href` containing `/reports/` |
| `config-select` | `<select>` | `Select` (in ConfigSelectorBar) | `aria-label="Select Configuration"` | Option selection |
| `raw-json-textarea` | `<textarea>` | Raw textarea atom | `aria-label="Raw JSON configuration editor"`, `spellcheck="false"` | `.fill()` and value reading |
| `json-validation-msg` | `<span>` | Validation message | `aria-live="polite"` | Text assertions |

### Required CSS Classes (Atoms & Molecules)

| Class | Element | Component | Test Usage |
|---|---|---|---|
| `.badge` | Badge elements | `Badge` | `credDialog.locator('.badge')` |
| `.badge-idle` | Badge variant | `Badge` | Status display |
| `.badge-queued` | Badge variant | `Badge` | Status display (missing from original plan) |
| `.badge-running` | Badge variant | `Badge` | Status display |
| `.badge-succeeded` | Badge variant | `Badge` | Status display |
| `.badge-failed` | Badge variant | `Badge` | Status display |
| `.badge-unknown` | Badge variant | `Badge` | For `submission-unknown` state |
| `.badge-configured` | Badge variant | `Badge` | Credential/browser configured |
| `.badge-missing` | Badge variant | `Badge` | Credential not configured |
| `.project-card` | Card wrapper | `ProjectCard` (Phase 04) | `.project-card` count and checkbox queries |
| `.btn-auto-build` | Build trigger button | `ProjectCard` (Phase 04) | `.btn-auto-build` click |
| `.credential-row` | Row wrapper | `CredentialRow` | `hasText` filtered locator |
| `.credential-input` | Password input | `CredentialRow` | `querySelectorAll` for clear-on-close |
| `.btn-clear-credential` | Clear button | `CredentialRow` | `.btn-clear-credential[data-key="..."]` |
| `.skip-link` | Skip to content | `DashboardLayout` (Phase 04) | Accessibility |

### Required Data Attributes

| Attribute | Element | Component | Test Usage |
|---|---|---|---|
| `data-key="{secretKey}"` | `.btn-clear-credential` button | `CredentialRow` | `'.btn-clear-credential[data-key="JENKINS_PASSWORD"]'` |

### Dynamic IDs (Generated from data)

| Pattern | Element | Component | Test Usage |
|---|---|---|---|
| `secret-input-${key}` | `<input type="password">` | `CredentialRow` | `#secret-input-JENKINS_PASSWORD`, `#secret-input-JENKINS_USERNAME` |

## Requirements

### Globals (`src/reporting/control-page/styles/globals.css`)
- Tailwind directives: `@tailwind base; @tailwind components; @tailwind utilities;`
- CSS variables for theme colors mapped from legacy `control-page.css`:
  ```css
  :root {
    --bg-color: #f8fafc;
    --card-bg: #ffffff;
    --text-main: #0f172a;
    --text-muted: #475569;
    --border-color: #cbd5e1;
    --primary: #0369a1;
    --primary-hover: #075985;
    --danger: #dc2626;
    --status-success: #16a34a;
    --status-error: #dc2626;
    --focus-ring: #0284c7;
    --mono-font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  ```
- Focus ring styles: `:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }`
- `.visually-hidden` utility class for accessible labels.
- `.hidden { display: none !important; }` utility.
- `@media (prefers-reduced-motion: reduce)` — set durations to `0.01ms`.

### Atoms (`src/reporting/control-page/components/atoms/`)

#### `Badge.tsx`
- Props: `variant: BadgeVariant`, `id?: string`, `className?: string`, `children: ReactNode`
- **Must render**: `<span id={id} className={cn('badge', 'badge-{variant}', className)}>{children}</span>`
- Supports `forwardRef`.
- Text content for variants:
  - Run states: `'Idle'`, `'Queued'`, `'Running'`, `'Succeeded'`, `'Failed'`
  - `'submission-unknown'` → class `badge-unknown`
  - Credential states: `'Configured'` (class `badge-configured`), `'Missing'` (class `badge-missing`)
  - Browser states: `'Configured'` (class `badge-configured`), `'Not Set'` (class `badge-missing`) — **text is `'Not Set'` not `'Missing'`**

#### `Button.tsx`
- Props: `variant: ButtonVariant`, `size?: 'sm' | 'default'`, `disabled?: boolean`, `loading?: boolean`, `id?: string`, `className?: string`, `type?: 'button' | 'submit'`
- Variants: `primary`, `secondary`, `danger`, `outline`.
- Renders `<button>` with `className={cn('btn', 'btn-{variant}', size === 'sm' && 'btn-sm', className)}`.
- `disabled` state: `opacity: 0.5; cursor: not-allowed`.
- Supports `forwardRef`.

#### `Input.tsx`
- Props: `id: string`, `type?: 'text' | 'password'`, `label?: string`, `error?: string`, `spellCheck?: boolean`, `className?: string`
- Accessible label association via `htmlFor`.
- Password visibility toggle (optional).
- Supports `forwardRef`.

#### `Select.tsx`
- Props: `id: string`, `options: {value: string; label: string}[]`, `label?: string`, `ariaLabel?: string`, `className?: string`
- Renders native `<select>` with `<option>` elements (not Radix Select — native select is simpler and matches legacy behavior).
- Supports `forwardRef`.

#### `StatusBanner.tsx`
- Props: `message: string`, `variant: BannerVariant`, `visible: boolean`, `id?: string`
- **Must render**: `<div id={id || 'status-banner'} className={cn('status-banner', variant, !visible && 'hidden')} role="status" aria-live="polite">{message}</div>`

#### `LoadingIndicator.tsx`
- Props: `visible: boolean`, `id?: string`, `message?: string`
- **Must render**: `<div id={id} className={cn('credentials-loading', !visible && 'hidden')} aria-live="polite">{message || 'Loading...'}</div>`
- Used for `#credentials-loading` and `#browser-loading` indicators.

### Molecules (`src/reporting/control-page/components/molecules/`)

#### `CredentialRow.tsx`
- Props: `secretKey: string`, `isConfigured: boolean`, `onClear?: (key: string) => void`, `inputRef?: Ref<HTMLInputElement>`
- **Must render structure**:
  ```html
  <div class="credential-row">
    <div class="credential-field">
      <label for="secret-input-{key}">{key}</label>
      <span class="badge badge-configured|badge-missing">Configured|Missing</span>
    </div>
    <div class="credential-input-group">
      <input id="secret-input-{key}" type="password" class="credential-input" autocomplete="off" />
      {isConfigured && <button class="btn btn-sm btn-clear-credential" data-key="{key}">Clear</button>}
    </div>
  </div>
  ```
- **Critical**: `data-key` attribute on clear button, dynamic `id="secret-input-${key}"`, class `credential-input` on the `<input>`.

#### `BrowserSettingRow.tsx`
- Props: `settingKey: BrowserSettingKey`, `isConfigured: boolean`, `onClear?: (key: string) => void`, `children: ReactNode` (the input/select control)
- Renders setting label, badge (`'Configured'` or `'Not Set'`), control, and clear button.
- Badge IDs: `badge-browser-headless` or `badge-browser-executable-path` (mapped from key).
- Clear button IDs: `btn-clear-browser-headless` or `btn-clear-browser-executable-path`.

#### `ConfigSelectorBar.tsx`
- Contains: `Select` (`#config-select`), `Button` (`#btn-reload`), `Button` (`#btn-save`), `Button` (`#btn-credentials`), `Button` (`#btn-browser-settings`).
- `#btn-save` is `disabled` when `!isDirty`.

#### `LogViewer.tsx`
- Props: `logs: string`, `id?: string`
- **Must render**: `<pre id={id || 'run-logs'} className="log-pre" role="log" aria-live="polite">{logs}</pre>`
- Auto-scroll to bottom when new logs arrive.

#### `RunResultBox.tsx`
- Props: `result: RunResult | null`, `visible: boolean`, `id?: string`
- **Must render**: `<div id={id || 'run-result-box'} className={cn('run-result-box', !visible && 'hidden')}>`
- Contains `<a href={result.reportUrl}>` when `reportUrl` is present. Test asserts `href` contains `/reports/`.

## Related Code Files
- `src/reporting/control-page/styles/globals.css`
- `src/reporting/control-page/components/atoms/Badge.tsx`
- `src/reporting/control-page/components/atoms/Button.tsx`
- `src/reporting/control-page/components/atoms/Input.tsx`
- `src/reporting/control-page/components/atoms/Select.tsx`
- `src/reporting/control-page/components/atoms/StatusBanner.tsx`
- `src/reporting/control-page/components/atoms/LoadingIndicator.tsx`
- `src/reporting/control-page/components/molecules/CredentialRow.tsx`
- `src/reporting/control-page/components/molecules/BrowserSettingRow.tsx`
- `src/reporting/control-page/components/molecules/ConfigSelectorBar.tsx`
- `src/reporting/control-page/components/molecules/LogViewer.tsx`
- `src/reporting/control-page/components/molecules/RunResultBox.tsx`

## File Ownership
- Exclusively owns all files in `src/reporting/control-page/styles/*`, `components/atoms/*`, and `components/molecules/*`.

## Implementation Steps
1. Create `globals.css` with Tailwind directives, legacy CSS variable mapping, and utility classes (`.hidden`, `.visually-hidden`, focus ring styles, reduced motion).
2. Implement `Badge` with strict class output: `badge badge-{variant}`.
3. Implement `Button` with variant classes: `btn btn-{variant}`.
4. Implement `Input` with accessible label, `forwardRef`, password type support.
5. Implement `Select` as native `<select>` wrapper with `forwardRef`.
6. Implement `StatusBanner` with `role="status"`, `aria-live="polite"`, and `.hidden` toggle.
7. Implement `LoadingIndicator` with `aria-live="polite"` and `.hidden` toggle.
8. Implement `CredentialRow` with dynamic `id="secret-input-${key}"`, `class="credential-input"`, `data-key` attribute on clear button, and `class="credential-row"` wrapper.
9. Implement `BrowserSettingRow` with setting-specific IDs for badges and clear buttons.
10. Implement `ConfigSelectorBar`, `LogViewer`, `RunResultBox` with correct IDs and ARIA attributes.
11. **Verify**: Cross-check every DOM ID and CSS class against the contract table above.

## Todo List
- [x] Create `globals.css` with Tailwind + legacy CSS variable mapping
- [x] Implement `Badge.tsx` with all variant classes (`badge-idle`, `badge-queued`, `badge-running`, `badge-succeeded`, `badge-failed`, `badge-unknown`, `badge-configured`, `badge-missing`)
- [x] Implement `Button.tsx` with variant classes
- [x] Implement `Input.tsx` with accessible labels and forwardRef
- [x] Implement `Select.tsx` as native select wrapper
- [x] Implement `StatusBanner.tsx` with `role="status"`, `aria-live="polite"`
- [x] Implement `LoadingIndicator.tsx` with `aria-live="polite"`
- [x] Implement `CredentialRow.tsx` with `data-key`, dynamic `#secret-input-*` IDs, `.credential-row` class
- [x] Implement `BrowserSettingRow.tsx` with setting-specific badge and button IDs
- [x] Implement `ConfigSelectorBar.tsx`, `LogViewer.tsx`, `RunResultBox.tsx`
- [x] Cross-check ALL selectors against DOM contract table

## Success Criteria
- Components compile cleanly with TypeScript.
- All DOM IDs and classes from the contract table are faithfully rendered.
- Accessible ARIA roles, labels, and live regions are intact.
- `CredentialRow` renders `data-key` attribute and dynamic IDs.
- `Badge` for browser settings renders `'Not Set'` text (not `'Missing'`).

## Conflict Prevention
- Strictly limits file creation to atoms, molecules, and globals.css. Does not assemble pages or dialogs.
- Uses `types/component-contracts.ts` from Phase 02 as the shared interface — if Phase 02 is not yet complete, use the contract types defined in this document as a temporary reference.

## Risk Assessment
- **Risk**: Missing DOM IDs or classes breaking Playwright locators.
- **Mitigation**: DOM contract table above is the authoritative reference. Every component must be verified against it.
- **Risk**: Tailwind class conflicts with legacy class names (`.badge`, `.btn`, etc.).
- **Mitigation**: Keep legacy class names as explicit `className` strings alongside Tailwind utilities.

## Security Considerations
- Sanitize rendered text content to prevent XSS.
- Disable `autocomplete="off"` on credential input fields.
- `<input type="password">` for all secret fields.

## Next Steps
- Proceed to [Phase 04: Organisms, Modals & Dashboard Assembly](phase-04-organisms-and-page-assembly.md).
