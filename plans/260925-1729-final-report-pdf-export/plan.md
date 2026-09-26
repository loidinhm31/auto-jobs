---
title: "Client-side PDF export for final evidence reports"
description: "React PDF download with real text, embedded screenshots, portrait-first tables, and clickable evidence links."
status: in-progress
priority: P2
effort: not-estimated
branch: main
tags: [feature, frontend, reporting, pdf]
created: 2026-09-25
---

# Final-report PDF export

## Confirmed scope
Final individual Snyk/Sonar evidence report in `npm run serve:control`; direct React/browser download containing everything displayed, not just the viewport. Phase 01's shared control viewer completed 2026-09-26; browser PDF export and its verification remain in Phases 02–03.

## Decision
- Preserve final report URLs. Control mode serves a React viewer using validated saved JSON and the existing escaped report body renderer shared with static output.
- **jsPDF + jspdf-autotable** generate the PDF locally: headings, prose, metadata, lists, table cells, captions, warnings and footer stay selectable/searchable text; screenshots stay embedded images.
- A narrow adapter reads the safe displayed report DOM in order, including off-screen rows/columns. No generic HTML renderer, duplicate evidence rules, full-page capture, html2canvas, or jsPDF `html()`.
- A4 portrait, 10 mm margins. Wrap columns and reduce table font first (proposed 9 → 8 pt); use landscape only for tables that still cannot fit readably, then resume portrait.
- Keep real Snyk/Sonar evidence URLs clickable with PDF link annotations, including wrapped links. Preserve exact validated targets; generation does not visit remote sites.
- Include all displayed report evidence and navigation/artifact text. Exclude only added export UI; no raw artifact attachments or OCR of screenshot text.
- Bundle licensed Unicode TTF fonts locally. Download `<projectId>-<runId>-report.pdf` with no server Chromium/PDF API, print dialog, remote service, or report regeneration.
- Persisted HTML and report-only/offline serving remain scriptless. No CSP weakening or report-file mutation.

## Phases
| Phase | Status | Progress | Detail |
|---|---|---|---|
| 01 — Shared control report viewer | **DONE** | 100% | [Viewer integration](./phase-01-control-report-viewer.md); completed 2026-09-26. |
| 02 — Real-text browser PDF | Pending | 0% | [Composition, tables, fonts, links](./phase-02-browser-pdf-export.md) |
| 03 — Verification and documentation | Pending | 0% | [PDF text/image/link/browser proof](./phase-03-verification-and-documentation.md) |

Dependency: Phase 01 → Phase 02 → Phase 03. No implementation work is authorized by this document alone.

## Acceptance
1. Existing final report link displays all evidence; Export PDF directly downloads one complete readable file.
2. Report text can be selected/copied/searched; screenshots remain images. No raster replacement of report text or missing Unicode glyphs.
3. Prefer A4 portrait and font fitting; all table columns/rows, screenshots, captions, warnings, provenance and footer survive pagination.
4. PDF Snyk/Sonar annotations open exact retained real evidence URLs. No remote visit/upload during generation.
5. Real Chromium/WebKit downloads, PDF text extraction, URI inspection and page visuals prove behavior, including errors/duplicates/navigation.
6. No secrets/control UI leakage, CSP weakening, file mutation, or dashboard/history/offline regression.

## Validation Summary
Validated 2026-09-25; three design questions asked.
- **Text/images:** user rejected turning report text into images; text stays text, images stay images.
- **Page layout:** A4 portrait preferred; reduce table font before expanding width.
- **Links:** real Snyk/Sonar evidence links must be clickable.
- Revisions applied: removed raster pipeline; selected semantic jsPDF/AutoTable composition, font embedding, portrait-first layout, annotation verification. Phase documents updated to avoid a contradictory handoff.
- Action items: plan revision complete; Phase 01 implementation completed 2026-09-26. Browser PDF implementation and full export verification remain pending in Phases 02–03.

## Evidence and design
- [Architecture design](./architecture-design.md), linked as proposed from [current architecture](../../docs/architecture.md).
- [Enhanced `/cmd-plan__hard` request](./reports/planning-request.md), [revised primary-source research](./research/client-pdf-rendering.md), [viewer integration research](./research/report-viewer-integration.md).
- Planning/PDF/frontend skills read directly; hard-planning and validation workflow instructions loaded. Native slash-command dispatch is unavailable; workflows followed through available tools.

## Verification and activation
During planning (2026-09-25), plan structure/local links were checked; no application build, test, package install, or PDF runtime smoke was run. Phase 01 verification was later reported 2026-09-26: typecheck/build passed, 35 focused unit tests and existing Control/report-management E2E suites (20 each) passed ([code review](../reports/code-review-260926-0624-phase-01-control-report-viewer.md)). PDF runtime proof remains pending in Phases 02–03. The active-plan helper was invoked from the installed global path, but `EVCRATE_SESSION_ID` is absent, so active-plan state was not persisted. Use this explicit plan path for continuation.

## Unresolved questions
No product questions. Implementation must prove exact font coverage, portrait table readability, wrapped/table hyperlink geometry, and browser download behavior; these are not yet runtime-verified.
