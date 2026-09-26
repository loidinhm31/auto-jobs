# Phase 02 — Real-text browser PDF composition and download

## Context links
- [Parent plan](./plan.md), [architecture](./architecture-design.md), [revised research](./research/client-pdf-rendering.md).
- [Phase 01](./phase-01-control-report-viewer.md) provides the validated complete report surface and identity.

## Overview
- Date: 2026-09-26. Priority: P2. Status: **DONE**. Progress: **100%**. Completed: 2026-09-26. Implementation complete. Review: Cycle 2 scored 9.5/10; all Cycle 1 findings verified and resolved. Ready for Phase 03 release gates.
- React direct download using `jspdf` + `jspdf-autotable`; text stays text, screenshots stay images.

## Key Insights
- Full-page raster export was rejected during validation. Do not use html2canvas/html2pdf.js or jsPDF `html()`.
- PDF document layout can differ from webpage CSS, but every displayed content item must survive.
- jsPDF standard fonts are insufficient for general report Unicode; local TTF embedding is required.
- Existing single-bundle Vite delivery remains; inline font assets explicitly and verify no unsupported chunks are fetched.

## Requirements
- Export PDF action on the final report, not history. Real selectable/searchable text and embedded screenshots.
- A4 portrait; table font reduction/wrapping first, wider table pages only when necessary for legibility.
- Real Snyk/Sonar source URLs clickable in the PDF; preserve safe source/reference targets and their association with evidence.
- Everything displayed, including below-fold/scrollable content, warnings, provenance, artifact labels, and footer. Exclude new toolbar/status only.
- Filename `<projectId>-<runId>-report.pdf`; no server rendering, API, print dialog, upload, or report mutation.

## Architecture
- React hook: state/reentrancy/download lifecycle.
- Narrow report-DOM adapter: safe displayed markup → ordered headings, rich text/link spans, lists/metadata, tables, figures/captions, anchor destinations. No general browser screenshot or duplicate domain renderer.
- PDF composer: jsPDF text/images/annotations + AutoTable tables; explicit page cursor, portrait-first policy, Unicode fonts.

## Related code files
All paths relative to `G:/ws/sharing/auto-jobs`.

Modify:
- `package.json`, `package-lock.json`: `jspdf`, `jspdf-autotable` browser runtime dependencies; no screenshot library.
- `src/reporting/control-page/pages/final-project-report-page.tsx`: action/status, report-only ref, immutable identity.
- `src/reporting/control-page/styles/globals.css`: toolbar/status only; no export clone styling.

Create:
- `src/reporting/control-page/hooks/use-report-pdf-export.ts`: preparation/composition/download/errors/unmount guard.
- `src/reporting/control-page/utils/report-pdf-content.ts`: semantic report-DOM adapter and content contracts.
- `src/reporting/control-page/utils/report-pdf-layout.ts`: text/paragraph pagination, portrait/table sizing, link span geometry.
- `src/reporting/control-page/utils/export-report-pdf.ts`: fonts, image bytes, composition, Blob/download orchestration.
- `src/reporting/control-page/assets/fonts/noto-sans-regular.ttf`, `noto-sans-bold.ttf`, `OFL.txt`: proposed licensed static embedded fonts; confirm actual upstream filenames/license before acquisition.

Reuse/leave unchanged unless a concrete incompatibility appears:
- Shared view model/renderers, URL policy, safe artifact serving, fixed control asset router, Vite code-splitting policy, report CSP, browser launcher, evidence/publication APIs.
- Split a module only if responsibility/200-line limit requires; no generic document-rendering framework.

## Implementation Steps
1. Pin compatible jsPDF/AutoTable packages after reviewing current API/license. Use documented native text/image/annotation APIs. Confirm build includes the browser entry without Node imports or runtime optional HTML-renderer chunks.
2. Bundle licensed static TTFs via Vite `?inline`, strip data-URL prefix for VFS as required, register regular/bold, and use those fonts in prose and tables. Verify Latin/Vietnamese, punctuation, and observed report scripts; add needed glyph coverage rather than substitute images or silently emit missing glyphs. Keep license with font assets.
3. Add accessible Export PDF outside captured report content, using existing Button/StatusBanner patterns. States: idle → preparing → composing → downloading → idle; failure → error. Disable before valid load/while active and guard duplicate calls synchronously.
4. Walk a snapshot of the report root in DOM order. Preserve headings/badges, paragraph and inline links, line breaks, definition lists, nested list items, table captions/headers/cells, image/caption pairs, footer and anchor IDs. Consume semantic subtrees once; recurse through structural wrappers without duplicate or dropped text. Read all table cells regardless of scroll position; skip only actual hidden/non-report UI, never off-screen evidence.
5. Use `safeExternalHref` on URI annotations and strict report-local artifact membership for image sources. Keep source URLs distinct from local screenshot URLs. Use original image bytes and wait for decoding; missing expected image fails export visibly, while existing no-evidence text remains valid report content.
6. Write real text with measured wrapping and page-aware cursors. Preserve Unicode, line breaks and semantic order; avoid orphan headings. Record anchor page/coordinates for internal navigation. Body starts at 10 pt, portrait A4 with 10 mm margins.
7. Build AutoTable data preserving all cells and their link spans. Use all seven finding columns; `overflow: linebreak`, repeated headers, no ellipsize/hide. Try 9 pt then 8 pt with proportional widths and wrapped URLs. Use 8 pt as proposed readability floor. If fitting remains illegible, start A4 landscape table pages, then return to portrait; all subsequent cursor/link calculations use actual page dimensions. Prefer staying portrait rather than switching based solely on screen width.
8. Allow multi-page tables and split rows exceeding one page while preserving every value. Emit captions/notes before/after actual table end. Embed screenshot images at preserved aspect ratio with real-text captions. If an exceptionally tall image requires continuation for readability, retain all image content without full-report rasterization.
9. Use `doc.link` over each rendered source-link span (including wrapped lines), preserving exact validated URLs. AutoTable hook/custom cell drawing must lay out multiple linked references independently; do not annotate an entire mixed-link cell with a single destination. If needed, extract a small linked-text helper rather than duplicating geometry. Resolve internal anchor destinations after pagination. Local raw artifact labels are text, not invented portable download links.
10. Produce one Blob/direct download. Name from validated IDs. Use a tested library save path or temporary anchor/object URL; verify handoff/revocation on Chromium and WebKit. Do not visit external links while generating; only a user clicking the PDF opens the external page.
11. Release temporary image buffers/PDF references and revoke object URLs after handoff. Navigation/unmount invalidates output; suppress stale downloads. On font/image/composition/memory errors, preserve report UI, give explicit feedback, and allow manual reattempt—never a partial file or automatic retry.

## Todo list
- [x] Browser packages and licensed searchable Unicode fonts.
- [x] Semantic report adapter and complete real-text/image composition.
- [x] Portrait-first table fitting and full pagination.
- [x] Exact clickable evidence/reference links, including wrapped/table spans.
- [x] Accessible download lifecycle, duplicate suppression, cleanup/errors.

## Success Criteria
- One click downloads a PDF with selectable/searchable report headings, prose, metadata, table cells, and captions; screenshots remain images.
- All displayed content is included in order. A4 portrait is preferred; any wide table pages are justified by readable fitting, not default landscape.
- PDF URI annotations open the exact retained Snyk/Sonar evidence URLs. No fetch of those sites during export.
- Real PDF parsing and visual inspection prove full content, pagination, Unicode, image fidelity, link rectangles, and browser downloads.
- No weakened CSP, external font service, full-page raster text, secret/control UI leakage, persisted report mutation, or stale/duplicate download.

## Risk Assessment
- Semantic extraction can duplicate/drop nested content: verify first/last rows, captions, badges, warnings, footer, and normalized text inventory.
- Font glyph coverage/shaping and PDF extraction need proof; selected font name alone does not establish full Unicode support.
- AutoTable doesn't automatically preserve inline hyperlink semantics; wrapped/multiple-link cell layout is a dedicated verification point.
- Extremely large PDFs still consume browser memory; fail visibly rather than truncate or rasterize text.

## Security Considerations
- Maintain current CSP. No iframe cloning, inline executable/style injection, eval, remote conversion, HTML execution, or CDN.
- Only validated same-origin images; external URI annotations pass existing credential/scheme URL checks.
- Generation never visits Snyk/Sonar. Clicking may require the recipient's network access/login.

## Next steps
- Phase 02 implementation and Cycle 2 code review completed 2026-09-26; all previous findings verified and resolved.
- Phase 03 owns the end-to-end PDF/browser release gates.

- No unresolved Phase 02 implementation questions. End-to-end PDF parsing/visual review, font coverage, portrait readability, wrapped/table link geometry, and real browser download behavior remain Phase 03 verification gates.
