# Code Review: Phase 02 Real-Text Browser PDF Composition and Download

**Plan**: `plans/260925-1729-final-report-pdf-export/phase-02-browser-pdf-export.md`  
**Date**: 2026-09-26  
**Score**: 8.5/10  

---

## Scope
- Files reviewed:
  - `package.json`
  - `package-lock.json`
  - `tsconfig.json`
  - `src/reporting/control-page/vite-env.d.ts`
  - `src/reporting/control-page/components/molecules/index.ts`
  - `src/reporting/control-page/components/molecules/ReportExportButton.tsx`
  - `src/reporting/control-page/hooks/use-report-pdf-export.ts`
  - `src/reporting/control-page/types/report-pdf-types.ts`
  - `src/reporting/control-page/utils/export-report-pdf.ts`
  - `src/reporting/control-page/utils/report-pdf-block-extractors.ts`
  - `src/reporting/control-page/utils/report-pdf-constants.ts`
  - `src/reporting/control-page/utils/report-pdf-content.ts`
  - `src/reporting/control-page/utils/report-pdf-fonts.ts`
  - `src/reporting/control-page/utils/report-pdf-image-loader.ts`
  - `src/reporting/control-page/utils/report-pdf-layout.ts`
  - `src/reporting/control-page/utils/report-pdf-span-extractor.ts`
  - `src/reporting/control-page/utils/report-pdf-span-renderer.ts`
  - `src/reporting/control-page/utils/report-pdf-table-renderer.ts`
  - `src/reporting/control-page/pages/final-project-report-page.tsx`
  - `src/reporting/control-page/assets/fonts/OFL.txt`
  - `src/reporting/control-page/assets/fonts/noto-sans-regular-base64.ts`
  - `src/reporting/control-page/assets/fonts/noto-sans-bold-base64.ts`
  - `tests/unit/control-final-report-pdf-export.spec.ts`
  - `tests/unit/control-final-report-route.spec.ts`
  - `tests/unit/helpers/mock-dom-element.ts`
  - `tests/unit/report-pdf-content.spec.ts`
  - `tests/unit/report-pdf-fonts.spec.ts`
  - `tests/unit/report-pdf-layout.spec.ts`
  - `tests/unit/use-report-pdf-export.spec.ts`
- Lines of code analyzed: ~1,850 LOC (source + tests)
- Review focus: Security (CSP, same-origin images, URL policy, injection), performance, architecture, YAGNI/KISS/DRY, exactOptionalPropertyTypes, LOC constraints (<200 LOC).
- Updated plans: `phase-02-browser-pdf-export.md`

---

## Overall Assessment
Well-structured, modular implementation of client-side PDF export adhering to strict separation of concerns. Pure vector/text composition using native jsPDF + AutoTable APIs, avoiding brittle full-page rasterization. All production source files strictly adhere to <200 LOC limit (max is 181 lines). Strict TypeScript typecheck with `exactOptionalPropertyTypes` passes cleanly with 0 errors. Full test suite executes in ~3.9s.

Two key concerns require attention before final release:
1. Definition lists (`<dl>`) dropped during DOM extraction, omitting Jenkins job URL and observation timestamp from the PDF.
2. Image URL validation contains regex gap allowing protocol-relative URLs (`//attacker.com/evil.png`) to bypass same-origin checks.

---

## Critical Issues (MUST FIX)
None causing system crash or exploit on benign inputs, but one critical completeness defect:

1. **Definition List (`<dl>`) Metadata Dropped from PDF**:
   - Location: `src/reporting/control-page/utils/report-pdf-content.ts` in `walkElement`
   - Issue: `walkElement` matches `table`, `ul`, `ol`, `figure`, `section-heading`, `p`, `footer`, headings, but ignores `<dl>`, `<dt>`, `<dd>`.
   - Impact: In `src/reporting/sections/jenkins-section.ts`, job info is rendered as `<dl class="metadata-grid"><div><dt>Job URL</dt><dd>...</dd></div><div><dt>Observed</dt><dd>...</dd></div></dl>`. Since `<dt>` and `<dd>` have no element children, their text nodes are completely bypassed. The Jenkins Job URL (with validated source link) and observed timestamp are silently missing from the exported PDF, violating Requirement 21 ("Everything displayed, including below-fold/scrollable content...") and Step 4 ("Preserve ... definition lists").
   - Fix: Add handler in `walkElement` or block extractor for `tagName === 'dl'` to convert `<dt>`/`<dd>` pairs into paragraph or list blocks.

---

## Warnings (SHOULD FIX)

1. **Protocol-Relative URL Bypass in Same-Origin Image Check**:
   - Location: `src/reporting/control-page/utils/report-pdf-image-loader.ts` lines 8–22
   - Issue:
     ```ts
     function isSafeLocalImageUrl(src: string): boolean {
       if (src.startsWith('data:image/')) return true;
       if (/^https?:\/\//i.test(src)) {
         if (typeof window !== 'undefined') {
           try {
             const parsed = new URL(src, window.location.href);
             return parsed.origin === window.location.origin;
           } catch { return false; }
         }
         return false;
       }
       return !/^[a-z]+:/i.test(src);
     }
     ```
     For protocol-relative URLs like `//evil.com/pic.png`, `/^https?:\/\//i.test(src)` is false, and `/^[a-z]+:/i.test(src)` is false, returning `true`. While CSP `img-src 'self' data:` blocks external connections in browser runtime, defense-in-depth requires strict same-origin parsing.
   - Fix:
     ```ts
     function isSafeLocalImageUrl(src: string): boolean {
       if (src.startsWith('data:image/')) return true;
       if (typeof window !== 'undefined') {
         try {
           const parsed = new URL(src, window.location.href);
           return parsed.origin === window.location.origin && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
         } catch {
           return false;
         }
       }
       return false;
     }
     ```

2. **Image Load Error Swallowed Instead of Failing Visibly**:
   - Location: `src/reporting/control-page/utils/report-pdf-layout.ts` lines 126–133
   - Issue: In `renderFigure`, if `imageLoader(block.src)` rejects, catch block draws `[Screenshot: ${block.alt || block.src}]` text and continues layout.
   - Requirement 5: "missing expected image fails export visibly, while existing no-evidence text remains valid report content."
   - Fix: Re-throw error so `useReportPdfExport` catches it, sets `status: 'error'`, displays error banner with retry option, preventing silent generation of corrupted/incomplete PDF.

---

## Suggestions (NICE TO HAVE)

1. **Idiomatic TSX in `ReportExportButton.tsx`**:
   - Component uses nested `React.createElement(...)` calls instead of JSX/TSX tags (`<button>`, `<div>`, `<svg>`). Refactoring to TSX matches rest of codebase and improves readability.

2. **Bundle Size & Chunking Consideration**:
   - Embedded TTF base64 files (`noto-sans-regular-base64.ts` ~741 KB, `noto-sans-bold-base64.ts` ~750 KB) combined with `jspdf` and `jspdf-autotable` increase `control-page.js` to 2.66 MB (1.07 MB gzip).
   - Currently compliant with single-bundle Vite config (`codeSplitting: false`), but future optimization can lazy-load `exportReportPdf` via dynamic `import()` to keep dashboard initial load lightweight.

3. **Multi-Word Badge Layout in `drawTextSpans`**:
   - `report-pdf-span-renderer.ts` lines 72–86 split words by whitespace `(\s+)` and draw roundedRect background per word. Badges with spaces ("in progress") render disjointed background pills. Draw badge container rectangle based on full span width before rendering words.

---

## Code Quality & Standards Verification

### Security Audit
- **CSP Compliance**: Passed. Uses native jsPDF/AutoTable vector primitives. Zero `eval`, zero inline scripts. CSP `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'` satisfied.
- **URL Policy**: Passed. External links validated through `safeExternalHref` (enforces `assertSafeReferenceUrl`, eliminates credentials, paths with traversal, unapproved schemes). Local anchor links validated with `localAnchorHref`. Raw artifact files rendered as plain text, not executable links.
- **Script Injection**: Passed. Uses DOM text extraction (`textContent`), renders as vector text operators. No raw HTML interpolation in PDF canvas.

### Type Safety & exactOptionalPropertyTypes
- `tsconfig.json` compiler options enforced: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- All optional properties in `report-pdf-types.ts` declare explicit `| undefined` union.
- `npm run typecheck` passes with 0 errors.

### LOC Constraints (<200 LOC per file)
All 14 newly added production files satisfy the <200 LOC limit:
- `ReportExportButton.tsx`: 127 lines
- `use-report-pdf-export.ts`: 95 lines
- `report-pdf-types.ts`: 95 lines
- `export-report-pdf.ts`: 69 lines
- `report-pdf-block-extractors.ts`: 104 lines
- `report-pdf-constants.ts`: 42 lines
- `report-pdf-content.ts`: 144 lines
- `report-pdf-fonts.ts`: 16 lines
- `report-pdf-image-loader.ts`: 79 lines
- `report-pdf-layout.ts`: 181 lines
- `report-pdf-span-extractor.ts`: 122 lines
- `report-pdf-span-renderer.ts`: 118 lines
- `report-pdf-table-renderer.ts`: 122 lines
- `final-project-report-page.tsx`: 145 lines

### Architecture & YAGNI / KISS / DRY
- Responsibilities separated cleanly into distinct focused modules: types, DOM adapter, span extractors, block extractors, fonts, image loading, table rendering, layout, orchestration, and UI hook.
- Avoids bloated abstractions or full-page HTML rasterizers.
- Reuses existing URL and link helpers from `src/reporting/report-links.ts`.

---

## Validation Commands & Results
- `npm run typecheck`: Passed (0 errors, 2.7s)
- `npm run build`: Passed (TypeScript compile + Vite single bundle + asset copy, 2.4s)
- `npx playwright test tests/unit/report-pdf-content.spec.ts tests/unit/report-pdf-fonts.spec.ts tests/unit/report-pdf-layout.spec.ts tests/unit/use-report-pdf-export.spec.ts tests/unit/control-final-report-pdf-export.spec.ts`: Passed (13 tests, 3.9s)
- `npx playwright test tests/unit/control-final-report-route.spec.ts`: Passed (8 tests, 1.0s)

---

## Unresolved Questions
None.
