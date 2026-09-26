# Client-side PDF generation — revised after validation

## Decision
User requires text as text, images as images, A4 portrait with table-font reduction before width expansion, and clickable real Snyk/Sonar links. Use **jsPDF + jspdf-autotable**; reject html2canvas/html2pdf.js page capture because it rasterizes report text.

## Verified documentation capabilities
- [jsPDF README](https://github.com/parallax/jsPDF/blob/master/README.md): browser text output, A4 portrait defaults, custom sizes/orientation, save/download, custom TTF registration through VFS/addFont. Its standard PDF fonts do not cover arbitrary Unicode; embedded font glyph coverage matters.
- [jsPDF annotations](https://parallax.github.io/jsPDF/docs/module-annotations.html): `link(x,y,w,h,{url})` for URI annotations, page destinations for internal navigation, and `textWithLink`. The latter is single-line; wrapped text needs explicit per-line annotations.
- [AutoTable README](https://github.com/simonbengtsson/jsPDF-AutoTable/blob/main/README.md): accepts HTML table elements or explicit cell data; linebreak wrapping, font sizes/column widths, repeated headers, row/page splitting, and hooks with drawn cell geometry. It also supports horizontal continuation but that is not the preferred portrait-first design.
- [Vite static assets](https://vite.dev/guide/assets.html): explicit `?inline` bundles asset bytes as data URLs, regardless of normal size threshold. Use for local TTF imports rather than adding font-serving infrastructure or relying on fixed assetFileNames for multiple fonts.

## Integration recommendation
- Reuse safe displayed report DOM as the content source. Extract a bounded, report-specific semantic block model; no general HTML renderer and no second copy of evidence filtering rules.
- Write headings/prose/list/metadata/captions/footer with jsPDF text. Write tables with AutoTable explicit content and preserve link span metadata for annotations. Embed local screenshot bytes with jsPDF images.
- Use native text/image APIs, not `doc.html`: jsPDF documents html2canvas/DOMPurify as optional dependencies of its HTML method. Avoid that path, hidden frames, and whole-page canvases.
- Pin compatible package versions at implementation and verify bundled production entry. No packages installed during planning.

## Portrait-first policy
A4 portrait, 10 mm margins; body 10 pt. Try table text 9 pt, then 8 pt, with wrapping and deliberate widths for all seven Snyk finding columns. Do not truncate/ellipsis. If it cannot fit legibly, use A4 landscape only for that table and return to portrait. These numerical defaults are design choices requiring visual verification, not user-specified point sizes.

## Link and font details
- Annotate exact safe external Snyk/Sonar source targets already retained/rendered by report-link policy. Do not fetch destinations during export.
- Preserve multiple links and wrapped link spans independently, including references inside table cells. AutoTable does not establish this application behavior automatically.
- Bundle static licensed TTF regular/bold fonts with appropriate character coverage. Noto Sans Latin/Vietnamese is the baseline proposal; inspect actual report character repertoire. Unicode shaping/glyph coverage and searchable text extraction remain runtime verification points.
- Screenshots remain images: text already within a screenshot is not made searchable. No OCR scope.

## Rejected approach
Earlier html2canvas + jsPDF recommendation was superseded by validation. Raster DOM captures cannot satisfy selectable/searchable report text. Their CSS/clone/CSP/canvas-height concerns are no longer the selected implementation path.

## Verification limits
External primary docs and repository source only. No browser/PDF runtime proof, package install, or tests performed. Semantic export avoids the chosen raster clone path but still requires proof under production CSP, both supported browsers, fonts, long tables, and actual PDF URI annotations.

## Unresolved questions
No product questions. Implementer must verify exact resolved APIs/font coverage and complete rendering/download behavior.
