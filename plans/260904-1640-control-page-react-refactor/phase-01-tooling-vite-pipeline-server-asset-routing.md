# Phase 01: Tooling, Vite Pipeline & Server Asset Routing

## Context Links
- Parent Plan: [plan.md](plan.md)
- Target Config: [package.json](../../package.json)
- Server Route Handlers: [report-server-control.ts](../../src/reporting/report-server-control.ts), [report-server-control-page.ts](../../src/reporting/report-server-control-page.ts)
- Asset Copy Script: [copy-report-assets.mjs](../../scripts/copy-report-assets.mjs)
- TypeScript Configs: [tsconfig.json](../../tsconfig.json), [tsconfig.build.json](../../tsconfig.build.json)

## Parallelization Info
- Concurrency: Runs first (Sequential base)
- Depends on: None
- Blocks: Phase 02, 03, 04, 05, 06

## Overview
- Date: 2026-09-04
- Description: Set up Vite build tooling for React, configure Tailwind CSS and PostCSS, ensure output assets cleanly target `.runner-build/reporting/control-page`, align server routing and Content Security Policy (`CONTROL_CSP`), and configure TypeScript for JSX.
- Priority: P1
- Implementation Status: Complete
- Review Status: Approved
- Completed At: 2026-09-04

## Key Insights
1. `report-server-control.ts` directly serves `/assets/control-page.css` and `/assets/control-page.js` with `writeControlSecurityHeaders`.
2. `report-server-control-page.ts` uses `loadControlAssets()` to lazily read source files and cache them in-memory. It injects CSRF via `html.replace('__CSRF_TOKEN_PLACEHOLDER__', escapeHtml(csrfToken))`.
3. Content Security Policy (`default-src 'none'; script-src 'self'; style-src 'self'; ...`) strictly disallows inline styles and eval. Tailwind preflight and utilities must be fully compiled into static CSS.
4. `copy-report-assets.mjs` currently copies `['control-page.html', 'control-page.css', 'control-page.js']` from `src/reporting/control-page/` to `.runner-build/reporting/control-page/`. This must be updated to stop copying legacy control-page files since Vite will now produce the built output.
5. `tsconfig.json` currently has `"lib": ["ES2023", "DOM"]` but does NOT have `jsx` configured — React requires `"jsx": "react-jsx"`.

## Requirements

### Dependencies
- Add to `package.json` dependencies:
  - `react`, `react-dom`, `@types/react`, `@types/react-dom`
  - `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`
- Add to `package.json` devDependencies:
  - `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`
- **NOT needed** (removed from original plan): `@uiw/react-codemirror`, `@codemirror/lang-json` — using plain `<textarea>` for JSON editing to preserve E2E test compatibility with `#raw-json-textarea`.

### TypeScript Configuration
- Update `tsconfig.json`:
  - Add `"jsx": "react-jsx"` to `compilerOptions`
  - Add `"src/reporting/control-page/**/*.tsx"` to `include` (or adjust existing `"src/**/*.ts"` to `"src/**/*.{ts,tsx}"`)
- Update `tsconfig.build.json`:
  - Add `.tsx` file support to `include`: `["src/**/*.ts", "src/**/*.tsx"]`
  - Add `"src/reporting/control-page/index.html"` to `exclude` (Vite handles HTML)

### Vite Configuration (`vite.control.config.ts`)
- Input: `src/reporting/control-page/index.html`
- Output dir: `.runner-build/reporting/control-page`
- `emptyOutDir: false` to avoid wiping `.runner-build/reporting/`
- `cssCodeSplit: false` — all CSS must go into a single file to comply with CSP
- Predictable rollup output filenames:
  ```ts
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/control-page.js',
        assetFileNames: 'assets/control-page.[ext]',
      }
    },
    cssCodeSplit: false,
  }
  ```
- Disable Vite's default inline CSS injection (would violate `style-src 'self'` CSP)

### Tailwind Configuration
- `tailwind.config.ts` content paths: `['./src/reporting/control-page/**/*.{ts,tsx,html}']`
- Map legacy CSS custom properties to Tailwind theme `extend.colors`:
  ```
  --primary (#0369a1) → theme.colors.primary.DEFAULT
  --danger (#dc2626) → theme.colors.danger.DEFAULT
  --status-success (#16a34a) → theme.colors.status.success
  --status-error (#dc2626) → theme.colors.status.error
  --focus-ring (#0284c7) → theme.ringColor.DEFAULT
  etc.
  ```
- `postcss.config.js`: standard `tailwindcss` + `autoprefixer` plugins.

### Build Script Update
- Update `package.json` build script:
  ```
  "build": "tsc -p tsconfig.build.json && vite build --config vite.control.config.ts && node scripts/copy-report-assets.mjs"
  ```

### Update `scripts/copy-report-assets.mjs`
- **Remove** the control-page asset copy loop (`['control-page.html', 'control-page.css', 'control-page.js']`). Vite now produces these files directly into `.runner-build/reporting/control-page/`.
- **Keep** the `report.css` copy (`src/reporting/report.css` → `.runner-build/reporting/report.css`).

### Update `src/reporting/report-server-control-page.ts`
- Modify `loadControlAssets()` to read from `.runner-build/reporting/control-page/` instead of `src/reporting/control-page/`:
  - HTML: Read Vite-generated `index.html` (which will contain `<meta name="csrf-token" content="__CSRF_TOKEN_PLACEHOLDER__">`)
  - CSS: Read from `assets/control-page.css` (Vite output)
  - JS: Read from `assets/control-page.js` (Vite output)
- The CSRF token injection (`replace('__CSRF_TOKEN_PLACEHOLDER__', escapeHtml(csrfToken))`) continues to work unchanged since the Vite HTML template preserves this placeholder.
- Asset serving routes (`/assets/control-page.js`, `/assets/control-page.css`) remain unchanged in `report-server-control.ts`.

### Vite HTML Template (`src/reporting/control-page/index.html`)
Must match the structure expected by the server's CSRF injection:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="__CSRF_TOKEN_PLACEHOLDER__">
  <title>Jenkins Control Dashboard</title>
  <link rel="stylesheet" href="/assets/control-page.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```
> **Note**: The `<link>` tag references `/assets/control-page.css` because the server serves the CSS from that route. Vite will bundle CSS separately; the server reads and serves it. The `<script>` uses Vite's module entry in dev mode, while production build replaces it with `assets/control-page.js`.

## Related Code Files
- `package.json`
- `vite.control.config.ts` (new)
- `tailwind.config.ts` (new)
- `postcss.config.js` (new)
- `tsconfig.json` (modified)
- `tsconfig.build.json` (modified)
- `scripts/copy-report-assets.mjs` (modified)
- `src/reporting/report-server-control-page.ts` (modified)

## File Ownership
- Exclusively owns all listed build, tooling, and server asset routing files.

## Implementation Steps
1. Install and verify frontend and build dependencies in `package.json`.
2. Add `"jsx": "react-jsx"` to `tsconfig.json` and update `include`/`exclude` in both tsconfigs for `.tsx` support.
3. Configure `tailwind.config.ts` with legacy CSS custom property values mapped to Tailwind theme and content paths targeting `src/reporting/control-page/**/*.{ts,tsx,html}`.
4. Create `postcss.config.js` with `tailwindcss` and `autoprefixer`.
5. Construct `vite.control.config.ts` with React plugin, `cssCodeSplit: false`, and rollup output options targeting `.runner-build/reporting/control-page/assets`.
6. Update `scripts/copy-report-assets.mjs` — remove control-page file copies (Vite handles them), keep `report.css` copy.
7. Update `report-server-control-page.ts` to read built assets from `.runner-build/reporting/control-page/` and its `assets/` subdirectory.
8. Create the Vite HTML template (`src/reporting/control-page/index.html`) with CSRF placeholder meta tag.
9. Update `package.json` build scripts.

## Todo List
- [x] Add React, Radix, Tailwind, and Vite packages to `package.json`
- [x] Add `"jsx": "react-jsx"` to `tsconfig.json` compilerOptions
- [x] Update `tsconfig.build.json` include for `.tsx`
- [x] Create `tailwind.config.ts` with legacy color mapping
- [x] Create `postcss.config.js`
- [x] Create `vite.control.config.ts` with `cssCodeSplit: false` and predictable filenames
- [x] Update `scripts/copy-report-assets.mjs` to remove control-page file copies
- [x] Update `src/reporting/report-server-control-page.ts` to read from build output
- [x] Create `src/reporting/control-page/index.html` Vite template with CSRF placeholder
- [x] Verify `npm run build` runs and emits asset bundles into `.runner-build/reporting/control-page`

## Success Criteria
- Running `npm run build` succeeds without TypeScript or Vite bundling errors.
- Built directory contains valid `.runner-build/reporting/control-page/index.html`, `assets/control-page.js`, and `assets/control-page.css`.
- Server serves the Vite-built HTML with CSRF token injected.
- No inline styles or eval in bundled output (CSP compliance).

## Conflict Prevention
- This phase handles only build tooling and asset serving configuration; does not implement UI components or modify Playwright tests.

## Risk Assessment
- **Risk**: Content Security Policy violation with dynamic imports or inline Vite styles.
- **Mitigation**: Vite configured with `cssCodeSplit: false`, rollup output format without dynamic code eval, ensuring all styles output to `control-page.css`.
- **Risk**: `copy-report-assets.mjs` overwriting Vite output with legacy files.
- **Mitigation**: Explicitly remove control-page files from the copy array.
- **Risk**: Vite HTML template structure incompatible with server's CSRF injection.
- **Mitigation**: HTML template must contain exact `__CSRF_TOKEN_PLACEHOLDER__` string in meta tag, matching current server regex.

## Security Considerations
- Preserve strict CSP headers (`script-src 'self'`, `style-src 'self'`).
- Retain CSRF token injection placeholder in `index.html`.
- Vite must not inject inline `<style>` tags or `new Function()`/`eval()` patterns.

## Next Steps
- Proceed to [Phase 02: Core Types, Hooks & Interface Contracts](phase-02-types-and-custom-hooks.md).
