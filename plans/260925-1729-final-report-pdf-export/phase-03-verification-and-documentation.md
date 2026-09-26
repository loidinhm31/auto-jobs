# Phase 03 — Verification and shipped documentation

## Context links
- [Parent plan](./plan.md), [Phase 01](./phase-01-control-report-viewer.md), [Phase 02](./phase-02-browser-pdf-export.md).
- [Release gates](../../docs/release-gates.md), [report pipeline](../../docs/report-pipeline.md).

## Overview
- Date: 2026-09-25. Priority: P2. Implementation: pending. Review: user requirements validated; technical proof pending.
- Prove real text, embedded screenshots, portrait-first layout, clickable evidence links, and real browser downloads.

## Key Insights
- A download event or PDF signature does not prove selectable text, complete evidence, correct link targets, or readable tables.
- Existing report fixtures include actual Snyk/Sonar screenshot images. Reuse their data construction, but exercise production control headers/server rather than the reduced-CSP fixture server.
- Existing control configuration covers Chromium and WebKit; no runtime proof has been performed during planning.

## Requirements
- Inspect actual PDF text, page dimensions, images, and URI annotations with a PDF parser plus visual viewer/rasterized pages.
- Verify all displayed evidence survives; no whole-report rasterization, hidden columns, ellipsis, or missing Unicode glyphs.
- Update affected behavioral contracts; do not add source-text/wiring tests or blindly re-pin screenshots.

## Architecture
- Use isolated temporary report/config roots and real control server for automated smoke; also launch `npm run serve:control` and use the final report link.
- Exercise real UI actions and save the actual PDF. Parse structure/text/annotations and inspect page visuals; tests alone are not sufficient.
- No permanent generic PDF testing framework. Use throwaway inspection tooling; preserve regression tests only for uncertain consumer-visible boundaries where warranted.

## Related code files
All paths relative to `G:/ws/sharing/auto-jobs`.

Update affected existing contracts:
- `tests/unit/control-assets-routing.spec.ts`: safe final control shell, GET/HEAD/missing/mode behavior.
- `tests/unit/reporting-renderer.spec.ts`: shared escaping/content behavior. Remove incidental implementation/wording tests encountered; do not re-pin them.
- `tests/e2e/control-report-management.spec.ts`: existing final navigation assumptions if intentional control cutover breaks them.
- `tests/e2e/generated-report.spec.ts`: keep unchanged unless shared renderer breaks actual offline behavior; never blindly refresh baselines.
- Reuse data/image setup from `tests/e2e/generated-report-fixtures.ts` and `generated-report-image.ts`, not their reduced-CSP HTTP handler.

After smoke passes, update:
- `README.md`: Export PDF workflow; text/images, portrait-first tables, live clickable links, no OCR of screenshots.
- `docs/report-pipeline.md`: static artifacts versus control viewer; no stored PDF or new API.
- `docs/architecture.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`: actual verified semantic PDF flow, fonts/dependencies; replace proposed status and preserve 800-line ceilings.
- `docs/project-overview-pdr.md`: user-visible export contract.
- `docs/release-gates.md`: only exercised commands and browser/PDF evidence.

## Implementation Steps
1. Prepare isolated success/partial/failed report fixtures. Include all screenshot types, badges, metadata, lists, warnings, diagnostics, artifact labels, footer, Unicode/Vietnamese text, long URLs, all seven findings columns, multiple links in a cell, and a row taller than a page.
2. Update affected route/renderer/navigation tests. Preserve invalid Host, traversal, encoded separator, symlink, missing file, and schema/identity mismatch denial. No raw saved HTML inserted into control DOM.
3. After integration, run typecheck/build once, focused affected unit tests, existing control and generated-report suites. Do not contact production Jenkins just to prove PDF generation.
4. Launch actual control command with an available local port; follow existing history/result link to the final report. Trigger Export PDF with real browser actions in Chromium and WebKit and save downloaded file to a temporary path.
5. Use a PDF parser to extract text. Assert real report headings, metadata, finding cells, captions, warnings and footer exist in normalized reading order; Unicode survives. Compare report's semantic text inventory to PDF contents accounting for intentional repeated table headers. Confirm screenshots are images, not report-wide page bitmaps; manually select/copy text in a PDF viewer. Screenshot-internal text remains image content; no OCR expected.
6. Inspect all representative PDF pages visually. Confirm portrait A4 dimensions, 10 mm margins, complete screenshots/captions, readable wrapped columns, first/last finding rows, and footer. A fitting table stays portrait; a deliberately unfit table widens only after font fitting reaches the readable floor and following prose returns to portrait. Check oversized row/image continuation for gaps, duplication, clipping, or blank pages.
7. Parse PDF URI annotations and compare exact Snyk/Sonar source URLs, including safe query/fragment values, against retained report links. Click at least one Snyk and one Sonar link in a real PDF viewer; observe the navigation target without requiring production authentication. Verify wrapped link rectangles and multiple links in table cells point to their own destinations, not the first link's URL.
8. Repeat from a mobile viewport and a long report: output must include all DOM content independent of current scroll/table position. Verify paragraphs, nested badges/lists, table captions and warnings are neither duplicated nor omitted by the semantic adapter.
9. Delayed expected image/font: export waits. Failed required image/font: explicit error, no partial PDF. Genuine no-screenshot message: export text normally. Double-click: one download. Navigate during composition: no stale download. Repeat export: no orphan object URLs or changed report appearance/scroll.
10. Inspect network/console/CSP events: only local bundle/images; no external font, Snyk/Sonar visit during generation, upload, PDF API, or server browser. Existing dashboard/history styles/actions still work. Open same artifact through report-only mode and from disk: scriptless report, image/link behavior, and immutable bytes remain intact.
11. After smoke proof, document observed behavior/limitations, remove temporary scripts/artifacts, and mark implementation phases complete only when acceptance passes.

## Todo list
- [ ] Affected contracts updated; typecheck/build/focused suites pass.
- [ ] Real browser downloads and selectable/searchable Unicode text proven.
- [ ] Complete images/content and portrait-first table pagination inspected.
- [ ] Actual PDF Snyk/Sonar URI annotations and click targets verified.
- [ ] Failure/duplicate/navigation/browser/security/offline scenarios proven.
- [ ] Shipped documentation updated; temporary scaffolds removed.

## Success Criteria
- Final control report directly downloads a complete PDF: text remains text, screenshots remain images, preferred A4 portrait, real evidence links clickable.
- No lost columns/rows, rasterized report text, illegible font shrinking, broken Unicode, false download completion, or stale/duplicate file.
- No remote conversion, server Chromium, CSP weakening, credential leakage, report mutation, or dashboard/history/offline regression.
- Evidence includes PDF text extraction, page visuals, link annotations and actual browser outcomes, not just source documentation or byte signatures.

## Risk Assessment
- Font/shaping and extraction can fail despite visible glyphs; verify both copied/extracted text and rendering.
- PDF link annotation geometry can drift across wrapped text/table pages; inspect actual click regions and targets.
- Wide-table fallback must not make subsequent prose landscape or use obsolete portrait coordinates.
- Browser memory/download timing differs across Chromium/WebKit; success in only one is insufficient.

## Security Considerations
- Isolated fixtures/local PDF inspection; never upload vulnerability reports to a remote conversion/viewing service.
- Link tests observe destinations without performing privileged Jenkins/vendor actions.
- Export reads only report evidence; static artifacts and secret stores remain untouched.

## Next steps
- Plan is ready for implementation review, not automatic implementation. No code changes in this planning session.

## Unresolved questions
- None requiring product input. Font repertoire, table readability and exact browser/PDF behavior remain verification tasks.

## Planned commands (not executed during planning)
```sh
npm run typecheck
npm run build
node scripts/run-playwright.mjs playwright test tests/unit/control-assets-routing.spec.ts tests/unit/reporting-renderer.spec.ts --config=playwright.unit.config.ts
npm run test:control
npm run test:report
npm run serve:control -- --port 4175
```
Use an unused port and isolated root as appropriate; stop the owned server. Commands do not replace actual PDF inspection.
