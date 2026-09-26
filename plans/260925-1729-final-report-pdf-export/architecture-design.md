# Proposed architecture: final-report PDF export

Status: design only; revised after user validation on 2026-09-25. No implementation.

## Confirmed contract
- Final individual evidence report in `npm run serve:control`; direct React/browser download.
- Text remains real selectable/searchable text. Screenshots remain embedded images; no screenshot-of-the-entire-page PDF and no OCR requirement for text already inside screenshots.
- Include every displayed report section, table row/column, screenshot, provenance item, warning, diagnostic, artifact label, navigation label, and footer, including off-screen content.
- A4 portrait preferred. Wrap cells and reduce table font size first; widen table pages only when necessary to avoid clipping or illegible output.
- Links to real Snyk/SonarQube evidence pages remain clickable. Use existing validated URLs, never invented screenshot URLs.
- No server Chromium, PDF API, print dialog, remote service, evidence recapture, or attached raw artifact archive.

## Existing boundaries
- `project-report-renderer.ts` generates scriptless HTML from a normalized view model and escaped section renderers.
- Only the aggregate `/reports/index.html` currently serves React; nested report URLs use the bounded static file server.
- Static report CSP forbids scripts/embedding. Control CSP permits local JS/CSS and same-origin fetch.
- Global report CSS and Tailwind base styles require isolation for a React report viewer.
- Vite emits fixed single JS/CSS assets; do not introduce unsupported lazy chunks or font fetch routes.

## Proposed data flow
1. Preserve existing `/reports/<projectId>/<runId>/index.html` links. In control mode only, return the React shell after exact path/ID validation and existing canonical-root/bounded file preflight.
2. Fetch sibling `data.json` and `manifest.json` via existing static GET routes. Reuse schema validators; check route/project/run/state and shared metadata agree.
3. Reuse the view model and extract the complete escaped report body into a shared renderer used by both static output and React. Never mount fetched saved/vendor HTML in the privileged control origin.
4. React owns the report surface and Export PDF action. Preserve title, section anchors, links, screenshot paths, and visible content.
5. A narrow report-DOM adapter walks the already-rendered safe report in document order: headings, paragraphs/inline links, badges, lists, definition lists, tables, figures/captions, footer. Read complete DOM content rather than viewport/scroll-clipped pixels. Do not implement a generic HTML/CSS renderer or duplicate domain rules.
6. `jsPDF` emits text, images, and link annotations; `jspdf-autotable` emits real-text tables with wrapped cells and pagination. Never invoke `doc.html`, html2canvas, or full-page rasterization.
7. Produce one PDF Blob and direct local download named `<projectId>-<runId>-report.pdf`; no server/file publication changes.

## Content and layout invariants
- Handle each semantic subtree once: consuming a table/figure/list must not also re-emit all descendant text. Recurse through structural wrappers; do not drop unrecognized visible text.
- Preserve line breaks, list items, metadata labels/values, status text, table captions/headers, screenshot captions, and external anchor targets. DOM is the display-content source of truth; no unrequested hidden JSON fields.
- Body text starts at 10 pt; tables try 9 pt then 8 pt with wrapping and column allocation. 8 pt is the proposed readability floor, not a user-specified exact size.
- Default page is A4 portrait with 10 mm margins. If a table cannot fit at the readability floor, use A4 landscape for that table and resume portrait afterward. No ellipsis, hidden columns, clipped long words, or unbounded font shrinking.
- Repeat table headers; avoid splitting normal rows; continue rows taller than a page without omission. Use current page dimensions for margins, links, and following content after wide tables.
- Embed original local screenshot bytes with preserved aspect ratio. Place captions as text and source links as annotations. Exceptionally tall images may continue across pages if scaling would destroy readability; never crop evidence away.
- Visible report content is preserved, but PDF uses document layout rather than pixel-identical webpage CSS.

## Fonts and links
- Bundle licensed static TrueType fonts covering report characters; baseline Noto Sans regular/bold with Latin/Vietnamese coverage. Verify required glyphs in representative retained reports; missing glyphs must not silently corrupt text. Extend font coverage for observed scripts before release.
- Import fonts explicitly inline through Vite and register via jsPDF VFS/addFont. PDF font data remains in the existing local bundle; no CDN, new font route, or runtime font-src relaxation.
- Use `link` annotations over each rendered/wrapped source-link span. Preserve safe URL query/fragment exactly through existing URL policy. AutoTable hooks/custom linked-cell drawing must preserve multiple reference targets rather than annotate the whole cell with the first URL.
- Map internal report anchors to PDF destinations where supported by the adapter. Local artifact labels remain text; no fabricated portable file links or embedded trace/data attachments.
- External destinations may require user login and network access when clicked; generation itself never visits them.

## State and lifecycle
- Viewer: loading → ready | missing | invalid | load-error.
- Export: idle → preparing → composing → downloading → idle; errors show explicit feedback and permit manual reattempt.
- One active export; disable until data/fonts/images are ready. Snapshot identity; navigation/unmount invalidates work and prevents stale download.
- Release image buffers and PDF references; revoke object URLs after safe handoff. Do not claim that an anchor click proves the user's OS saved the file.
- Finite browser memory still limits extreme reports; fail visibly instead of producing an incomplete PDF.

## Security and architecture gate
- Persisted HTML/report-only serving stays scriptless; no arbitrary HTML sink, iframe export clone, CSP relaxation, eval, external uploads, Node browser imports, or server PDF endpoint.
- Retain Host, GET/HEAD/method, root identity, symlink, byte-bound, schema, identity, and safe artifact/URL checks.
- Exclude export UI, CSRF tokens, dashboard forms, credentials, and unrelated app content from PDF input.
- Prove real-text extraction, font glyphs, image fidelity, table continuation, annotations, browser download, and actual CSP in implementation. Source documentation is not runtime proof.

## Unresolved questions
- No unresolved product questions. Exact font coverage and 8 pt/wide-table thresholds are implementation verification points; report any required change rather than silently substitute raster text.
