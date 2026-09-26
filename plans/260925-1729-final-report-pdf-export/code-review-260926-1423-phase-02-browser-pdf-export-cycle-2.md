# Code Review: Phase 02 Real-Text Browser PDF Composition and Download (Cycle 2)

**Plan**: `plans/260925-1729-final-report-pdf-export/phase-02-browser-pdf-export.md`  
**Date**: 2026-09-26  
**Cycle**: 2 (Follow-up)  
**Score**: 9.5/10  

---

## Executive Summary
Cycle 2 review confirms that all Cycle 1 findings—including the critical omission of definition lists (`<dl>`) and warnings regarding protocol-relative URL bypass and silent image error swallowing—are completely resolved. The implementation adheres strictly to TypeScript `exactOptionalPropertyTypes`, LOC limits (<200 LOC per file), and CSP security boundaries. All 14 unit and integration tests pass cleanly in 1.6s. Phase 02 is ready for Phase 03 release gates.

---

## Scope
- Files reviewed:
  - `src/reporting/control-page/utils/report-pdf-block-extractors.ts` (147 LOC)
  - `src/reporting/control-page/utils/report-pdf-content.ts` (149 LOC)
  - `src/reporting/control-page/utils/report-pdf-layout.ts` (198 LOC)
  - `src/reporting/control-page/utils/report-pdf-image-loader.ts` (79 LOC)
  - `src/reporting/control-page/types/report-pdf-types.ts` (106 LOC)
  - `src/reporting/control-page/hooks/use-report-pdf-export.ts` (94 LOC)
  - `src/reporting/control-page/components/molecules/ReportExportButton.tsx` (126 LOC)
  - `src/reporting/control-page/utils/export-report-pdf.ts` (68 LOC)
  - `src/reporting/control-page/utils/report-pdf-constants.ts` (41 LOC)
  - `src/reporting/control-page/utils/report-pdf-fonts.ts` (15 LOC)
  - `src/reporting/control-page/utils/report-pdf-span-extractor.ts` (121 LOC)
  - `src/reporting/control-page/utils/report-pdf-span-renderer.ts` (117 LOC)
  - `src/reporting/control-page/utils/report-pdf-table-renderer.ts` (121 LOC)
  - `src/reporting/control-page/pages/final-project-report-page.tsx` (144 LOC)
  - `tests/unit/report-pdf-content.spec.ts` (196 LOC)
  - `tests/unit/report-pdf-layout.spec.ts` (193 LOC)
  - `tests/unit/use-report-pdf-export.spec.ts` (78 LOC)
  - `tests/unit/control-final-report-pdf-export.spec.ts` (129 LOC)
- Lines of code analyzed: ~1,980 LOC
- Review focus: Verification of Cycle 1 fixes, security, performance, architecture, YAGNI/KISS/DRY, and LOC constraints (<200 LOC).
- Updated plans: `plans/260925-1729-final-report-pdf-export/phase-02-browser-pdf-export.md`

---

## Verification of Addressed Cycle 1 Issues

### 1. Definition List (`<dl>`) Metadata Extraction
- **Previous defect**: `<dl>`, `<dt>`, `<dd>` elements dropped during DOM tree walk, silently omitting Jenkins Job URL and observation timestamp from PDF.
- **Cycle 2 check**:
  - `report-pdf-types.ts`: Added `ReportPdfDefinitionItem` and `ReportPdfDefinitionListBlock`, integrated into `ReportPdfBlock` union. Full compatibility with `exactOptionalPropertyTypes`.
  - `report-pdf-block-extractors.ts`: Added `extractDefinitionListBlock` handling both wrapped `<dl><div><dt>...</dt><dd>...</dd></div></dl>` (used in Jenkins section) and direct `<dl><dt>...</dt><dd>...</dd></dl>`. Retains rich text and link spans in descriptions.
  - `report-pdf-content.ts`: `walkElement` detects `tagName === 'dl'` and invokes `extractDefinitionListBlock`.
  - `report-pdf-layout.ts`: `renderDefinitionList` styles term with muted color/small font (35mm column) and description with body font, accumulating external and internal link rectangles.
  - Verified by dedicated unit test in `report-pdf-content.spec.ts` and layout test in `report-pdf-layout.spec.ts`.
- **Verdict**: Completely resolved.

### 2. Protocol-Relative URL Bypass in Same-Origin Image Check
- **Previous defect**: `isSafeLocalImageUrl` allowed `//attacker.com/evil.png` to bypass scheme check.
- **Cycle 2 check**:
  - `report-pdf-image-loader.ts`: Added strict guard `if (src.startsWith('//') || src.includes('\\')) return false;` and blocked non-http schemes.
  - Browser runtime validates `new URL(src, window.location.href).origin === window.location.origin`. Protocol-relative or whitespace-padded external URLs resolve to external origin and return `false`.
  - Non-browser runtime rejects `http(s)://` and any scheme prefixes.
- **Verdict**: Completely resolved.

### 3. Image Error Swallowing in `renderFigure`
- **Previous defect**: `renderFigure` swallowed image load errors, drawing placeholder text and failing Requirement 5 ("missing expected image fails export visibly").
- **Cycle 2 check**:
  - `report-pdf-layout.ts`: Removed try/catch block swallowing image loader rejection in `renderFigure`.
  - `report-pdf-image-loader.ts`: Throws explicit error on HTTP non-200, unsafe URLs, and decoding errors.
  - Errors propagate through `layoutReportPdfDocument` and `exportReportPdf` to `useReportPdfExport`, which transitions state to `error` and captures `errorMessage`.
  - `ReportExportButton.tsx` renders accessible error alert banner with error message, Dismiss action, and "Retry Export PDF" button.
- **Verdict**: Completely resolved.

---

## Critical Issues (MUST FIX)
None.

---

## Warnings (SHOULD FIX)
None.

---

## Suggestions (NICE TO HAVE)
1. **URL Whitespace Defense-in-Depth**:
   - `isSafeLocalImageUrl`: Add `const trimmed = src.trim()` before checking `trimmed.startsWith('//')`. Currently protected by `parsed.origin === window.location.origin`, but trimming adds defense-in-depth for Node fallback branches.
2. **Dynamic Import for Font Assets / jsPDF**:
   - Embedding static TTF base64 files yields ~2.66 MB single bundle. Acceptable under current zero-chunking Vite config, but dynamic `import('../utils/export-report-pdf.js')` can optimize initial control page load in future releases.
3. **`ReportExportButton.tsx` JSX Migration**:
   - Component uses `React.createElement`. Refactoring to TSX tags improves team readability.

---

## Code Quality & Standards Verification

### Security Audit
- **CSP Compliance**: Passed. Vector PDF composition using jsPDF text/rect/line/image primitives. Zero dynamic scripts, zero `eval`.
- **Image URL Sanitization**: Passed. Restricts image loading strictly to same-origin URLs and `data:image/` payloads. Rejects protocol-relative, backslash, external, and non-http schemes.
- **Reference & Evidence Links**: Passed. External URLs sanitized via `safeExternalHref`. Local anchors sanitized via `localAnchorHref`. Raw artifacts rendered as plain text.

### Type Safety & `exactOptionalPropertyTypes`
- `tsconfig.json` enforces `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- All optional properties explicitly type `| undefined`.
- `npm run typecheck` passes with 0 errors in 1.28s.

### LOC Constraints (<200 LOC per file)
All 17 related production and test files comply with the <200 LOC constraint:
- `report-pdf-layout.ts`: 198 LOC
- `report-pdf-content.spec.ts`: 196 LOC
- `report-pdf-layout.spec.ts`: 193 LOC
- `report-pdf-content.ts`: 149 LOC
- `report-pdf-block-extractors.ts`: 147 LOC
- `final-project-report-page.tsx`: 144 LOC
- `control-final-report-pdf-export.spec.ts`: 129 LOC
- `ReportExportButton.tsx`: 126 LOC
- `report-pdf-span-extractor.ts`: 121 LOC
- `report-pdf-table-renderer.ts`: 121 LOC
- `report-pdf-span-renderer.ts`: 117 LOC
- `report-pdf-types.ts`: 106 LOC
- `use-report-pdf-export.ts`: 94 LOC
- `report-pdf-image-loader.ts`: 79 LOC
- `use-report-pdf-export.spec.ts`: 78 LOC
- `export-report-pdf.ts`: 68 LOC
- `report-pdf-constants.ts`: 41 LOC
- `report-pdf-fonts.ts`: 15 LOC

### Architecture & YAGNI / KISS / DRY
- Clear separation of concerns: DOM extraction -> layout computation -> vector rendering -> export lifecycle hook.
- Zero unnecessary dependencies or full-page HTML rasterizers.
- Reuses core report URI sanitization contracts.

---

## Validation Commands & Results
- `npm run typecheck`: Passed (0 errors, 1.28s)
- `npm run build`: Passed (TypeScript compile + Vite single bundle + asset copy, 2.11s)
- `npx playwright test tests/unit/report-pdf-content.spec.ts tests/unit/report-pdf-fonts.spec.ts tests/unit/report-pdf-layout.spec.ts tests/unit/use-report-pdf-export.spec.ts tests/unit/control-final-report-pdf-export.spec.ts`: Passed (14 tests, 1.6s)
- `npx playwright test tests/unit/control-final-report-route.spec.ts`: Passed (8 tests, 0.9s)

---

## Unresolved Questions
None.
