# Report pipeline and aggregate index

This document describes offline report fixtures, final-report artifact serving,
the Control-only React report viewer and client-side PDF export, retained-run
discovery and deletion, and persistent aggregate-index construction. For broader
execution details, see [architecture](./architecture.md) and [system architecture](./system-architecture.md).

## Offline report fixtures

`src/templates/template-report-fixture.ts` is the supported facade for the
checked-in nine-file corpus. The loader validates saved identities before
browser startup and enforces a 4 MiB per-file and 16 MiB total input limit.
The build-page URL is derived from the unique **Build with Parameters** link in
`#side-panel`; its canonical URL, `POST` action, `#bottom-sticker`, and `Build`
button are validated before routes are installed.

Fixture routes fulfill exact URLs, including the supported login actions and
build `POST`. The build route redirects to the exact job URL without reading or
reflecting form data. Unknown methods and URLs are aborted and recorded as
bounded sanitized misses. These routes are test-only and do not contact Jenkins
or vendor services.

## Run artifacts and discovery

Each report attempt receives an immutable project/run identity under the report
root:

```text
reports/
├── index.html
├── aggregate-data.json
├── assets/report.css
└── <project-id>/<run-id>/
    ├── index.html
    ├── data.json
    ├── manifest.json
    └── requested screenshots
```

## Control-only final-report viewer

The existing `/reports/<projectId>/<runId>/index.html` URL opens a React
viewer only in Control mode. `project-report-route.ts` is browser-safe and
shared by the router and `App.tsx`. It accepts the exact report prefix, two
safe ID segments, and either explicit `index.html` or a directory form
(with or without a trailing slash); query and fragment text do not affect the
match. It rejects traversal/dot IDs, reserved names, encoded separators,
backslashes, null bytes, and double encoding. Sibling artifacts such as
`data.json`, `manifest.json`, and screenshots do not match the viewer route
and continue through static file serving.

After Host validation and report-root resolution, the control router preflights
the canonical existing run `index.html` before returning its React shell.
Directory-form requests redirect to the explicit index URL. The shell is
available only for GET/HEAD; HEAD has the same content length as GET and no
body, and other methods return 405. Other report paths retain static serving.
The standalone report server continues to serve immutable scriptless HTML
under `REPORT_CSP`.

`App.tsx` selects `FinalProjectReportPage` separately from the report-history
page at `/reports/index.html`. `useProjectReport` fetches `data.json` and
`manifest.json` concurrently with `cache: 'no-store'`, aborts on unmount, and
reuses the schema validators. It requires route, data, and manifest project/run
IDs to agree, plus matching project name, timestamp, state, and Jenkins job
URL, before exposing a ready view model. Loading, missing, invalid, and
load-error states remain outside the report body.

`project-report-body-renderer.ts` owns the escaped report header, sections,
anchors, and footer shared by the React page and `project-report-renderer.ts`.
The latter wraps that same body in the persisted static document and its report
CSP. The React page's HTML sink receives only locally generated escaped body
markup; it never inserts saved report HTML or vendor markup. `.project-report-surface`
styles and Tailwind-preflight overrides isolate the view without changing the
standalone stylesheet behavior. Phase 01 added the viewer; Phase 02 adds local
browser PDF export described below.

## Client-side PDF export

The **Export PDF** action is part of the final-report viewer toolbar, not the
history page. `ReportExportButton` is enabled only when the validated report is
ready. It passes `#project-report-surface` to `useReportPdfExport`, which
prevents concurrent exports, exposes preparing/composing/downloading/error
states, and lets the operator dismiss an error or retry. The export is a local
download; it does not call a PDF server API or modify persisted report files.

| Module | Responsibility |
| --- | --- |
| `pages/final-project-report-page.tsx`, `components/molecules/ReportExportButton.tsx` | Keep the accessible export action in the viewer chrome and pass the ready report surface, project ID, and run ID. |
| `hooks/use-report-pdf-export.ts` | Guard re-entry and missing report identity/content; expose export lifecycle and error state. |
| `utils/report-pdf-content.ts`, `report-pdf-span-extractor.ts`, `report-pdf-block-extractors.ts`, `types/report-pdf-types.ts` | Convert the displayed report DOM into ordered, typed heading, text, list, metadata, table, figure, and footer blocks with link spans. |
| `utils/report-pdf-layout.ts`, `report-pdf-span-renderer.ts`, `report-pdf-table-renderer.ts`, `report-pdf-constants.ts` | Lay out real text, pagination, images, anchors, and tables using explicit PDF coordinates and styles. |
| `utils/report-pdf-fonts.ts`, `assets/fonts/` | Register bundled Noto Sans regular/bold font data with jsPDF. The source TTFs and `OFL.txt` retain the SIL Open Font License notice. |
| `utils/report-pdf-image-loader.ts` | Accept embedded image data or same-origin report images, load and decode bytes, and fail export on unsafe or unreadable evidence. |
| `utils/export-report-pdf.ts` | Compose the jsPDF document, produce a Blob, sanitize the identity-based filename, and trigger a browser download. |

`extractReportPdfContent()` walks the report surface in DOM order; it does not
render a screenshot or attempt general HTML/CSS conversion. It captures
headings and badges, rich-text spans and line breaks, paragraphs, warning and
provenance lists, definition-list metadata, all table rows/cells, evidence
figures/captions, anchors, and footer text. Skip links, the control report bar,
and `aria-hidden` content are excluded. The adapter consumes each semantic
subtree once, while plain wrapper elements are traversed for their children.

The composer uses the browser runtime dependencies `jspdf` and
`jspdf-autotable`. jsPDF creates compressed A4 portrait pages in millimeters
with 10 mm margins. Paragraphs and table cells remain PDF text; findings tables
retain all seven columns, wrap cell content, and use the 8 pt table floor
(ordinary tables start at 9 pt). AutoTable handles table pagination. Local
regular and bold Noto Sans font payloads are registered in jsPDF's virtual
file system, avoiding remote font requests and the limited standard-font
repertoire.

External text links are accepted through the existing `safeExternalHref`
policy and become PDF URI annotations; report-local anchors are resolved to
PDF page destinations after layout. Evidence screenshot sources are kept
separate from source URLs: only embedded data images or same-origin report
images are loaded, and image decoding failures surface in the export status.
Figures preserve image aspect ratio and retain captions as text. Export does
not visit Snyk or SonarQube; recipients follow source annotations themselves.

The download filename is `<projectId>-<runId>-report.pdf`, with unsafe
filename characters replaced. The Blob is handed to a temporary browser
object URL and anchor; the object URL is revoked after the browser handoff.
Saved report HTML continues to use its existing static/scriptless rendering
and CSP. The export adds no external renderer, print flow, upload, or server
publication path.

Phase 02 implementation verification reports 499/499 unit tests and a 9.5/10
Cycle 2 code review. Phase 03 remains responsible for release-level PDF text,
image, link, visual-layout, and browser-download verification.

`src/artifacts/aggregate-manifest-reader.ts` validates schema-v3 manifests and
their referenced artifacts before retaining them. Discovery is bounded to at
most 5,000 inspected manifests, plus directory and artifact-read budgets.
Invalid or incompatible individual entries are omitted with warnings.

`ManifestDiscoveryResult.incomplete` is true when discovery reaches its
manifest limit or exhausts a directory/artifact budget. This flag distinguishes
a fully inspected inventory from one that may have omitted history; warnings
alone are not a substitute for it.

## Persistent aggregate index

`src/artifacts/aggregate-index-builder.ts` exposes the pure
`buildAggregateIndex` builder. It accepts validated discovery, optional current
project outcomes, an optional timestamp, and warnings; it performs no file I/O.
Current outcomes lead the project list in their execution order and update their
matching historical row. Retained history for other project IDs remains in the
index, ordered by project ID; each project's runs are newest first by
`observedAt`, with `runId` as the tie-breaker.

The builder refuses `discovery.incomplete`. `src/runner.ts` also checks this
before calling the builder, so incomplete inventory cannot replace a more
complete published index. Invalid individual manifests can still be excluded
while valid history is indexed.

An empty `projects` array is a valid schema-v3 aggregate when discovery and
current outcomes are both empty. The static renderer presents this as an empty
state. This index behavior does not relax the schema-v1 configuration rule:
input documents still require 1–50 projects, and report selection still
requires an enabled report project.

The aggregate project ceiling is 5,050, separate from the 50-project input
limit. It allows up to 5,000 historical project IDs from discovered manifests
plus up to 50 current configured projects. Aggregate validation separately
limits retained run entries to 5,000 total.

## Aggregate publication bounds

`src/artifacts/aggregate-report-publisher.ts` stages `aggregate-data.json` and
the rendered root `index.html`, then checks both staged file sizes against
`MAX_STATIC_FILE_BYTES` (16 MiB per file) before writing the publication journal
or replacing the existing pair. If either file is oversized, publication fails
and the prior published files remain intact. Successful publication uses the
existing journal/backup/rollback recovery path.

## Control API report deletion

Control mode routes `DELETE /api/reports/projects/:projectId` through
`src/reporting/report-server-control-reports-api.ts` to
`src/artifacts/report-project-deletion.ts`. The whole-project HTTP contract is
in [architecture](./architecture.md); the per-run contract follows below.

`deleteProjectReports()` revalidates the safe ID and canonical report root,
acquires the shared report-root lock without waiting, then requires complete
manifest discovery and at least one validated run for the target. It preflights
the project directory before removal: symlinks and non-file/non-directory
entries fail closed; the tree is bounded to 32 levels, 4,096 entries, and
256 MiB. Removal covers the whole project subtree, including unvalidated files,
while `deletedRunsCount` counts only validated manifests.

After removal, the service rediscovers surviving manifests and calls
`buildAggregateIndex()` without current outcomes, then republishes
`aggregate-data.json` and `index.html` together through `writeAggregateDataPair`.
The aggregate therefore retains only surviving validated history; an empty
project list is allowed. Incomplete discovery prevents removal before mutation;
if refresh fails after removal, best-effort recovery runs and the API reports
that the project is deleted even though the index may require recovery.

`tests/unit/control-reports-delete-api.spec.ts` verifies successful removal and
validated-run counts (including cleanup of unvalidated subtree files), sibling,
prefix-sibling, asset, and config preservation, and a valid schema-v3 empty
aggregate after deleting the final project. Request cases cover invalid IDs and
bodies, Origin/CSRF rejection, unsupported methods/media types, missing and
repeated projects, lock-contention `409` without path leakage, and
symlink/depth preflight failures.

Injected removal and publication failures verify lock release and safe disk
state; failed refresh does not claim deleted files were restored. The suite
also confirms report mode serves GET/HEAD snapshots and rejects DELETE without
mutating saved files.

### Individual report-run deletion

Control mode routes `DELETE /api/reports/projects/:projectId/runs/:runId`
through `src/reporting/report-server-control-reports-api.ts` to
`src/artifacts/report-run-deletion.ts`. The report-only server remains
GET/HEAD-only.

Both IDs must satisfy `SAFE_ID`
(`/^[a-z0-9][a-z0-9-_]{0,80}$/u`); the route rejects malformed or double
encoding, separators, null bytes, traversal, reserved names, and dot-prefixed
IDs. Mutations require the control server's Host validation plus same-origin
Origin, accepted Fetch Metadata, and CSRF checks. DELETE may be bodyless or
carry an empty JSON object; a supplied body must use JSON and is bounded to
1 MiB. Non-empty bodies return `400`; other methods return `405` with
`Allow: DELETE`.

| Outcome | Status and contract |
| --- | --- |
| Deleted | `200 { success: true, projectId, runId, remainingRunsCount }`. The count is the remaining validated runs for that project. |
| Invalid IDs/body | `400`; `INVALID_PROJECT_ID`, `INVALID_RUN_ID`, or `INVALID_BODY`. |
| Failed Host or mutation security checks | `403 FORBIDDEN_HOST` or `403 FORBIDDEN_MUTATION`. |
| No validated run for the project/run pair | `404 RUN_NOT_FOUND`. |
| Report-root lock is held | `409 REPORT_ROOT_LOCKED`; no run is removed and the lock path is not exposed. |
| Oversized or unsupported body | `413` or `415`. |
| Unsafe root/tree, incomplete discovery, removal, or refresh failure | `500`; service-specific codes identify the failed boundary. |

`deleteProjectRunReport()` takes the shared report-root lock without waiting,
recovers interrupted aggregate publication, verifies the canonical run path,
and requires complete manifest discovery plus a validated target run. Before
removal it rejects symlinks and non-file/non-directory entries and bounds
preflight to 32 levels, 4,096 entries, and 256 MiB. It removes only the selected
run directory, leaving sibling runs untouched. It prunes the project directory
only when no filesystem entries remain.

After removal, the service rediscovers surviving manifests and republishes
`aggregate-data.json` and `index.html` from the surviving history. If removal
or refresh fails, it attempts best-effort index recovery and always releases
the lock; a refresh error reports that the run was already deleted and the
index may need recovery.

`tests/unit/control-reports-run-delete-api.spec.ts` covers single-run removal
with sibling-run preservation and aggregate refresh, final-run project
directory pruning and an empty aggregate, malformed IDs/routes, missing
project/run targets, lock contention without lock-path leakage, missing/invalid
CSRF, non-DELETE methods with `Allow`, and injected removal failure with lock
release and retained run files.

The Control report-management page at `/reports/index.html` reads the published
aggregate and offers confirmation-gated whole-project deletion plus a per-run
Delete action. The per-run dialog names the project/run and states that only
that run and its artifacts will be removed. Success and `404` refresh inventory.
Browser verification confirms cancellation leaves both run directories intact;
confirmation removes only the selected run, preserves sibling files and the
sibling row, and refreshes `aggregate-data.json` and `index.html`. Deleting the
last run removes its project from inventory. Persisted report HTML remains a
static snapshot. See [architecture](./architecture.md) for UI behavior and
[release gates](./release-gates.md) for browser verification.

## Focused contracts

- `tests/unit/aggregate-index-builder.spec.ts` covers empty indexes, incomplete
  discovery rejection, historical-only projects, current-outcome precedence,
  newest-first ordering and `runId` ties, 60-run histories, run-less outcomes
  without fake links, and warning sanitization.
- `tests/unit/persistent-aggregate-bounds.spec.ts` covers the 5,050-project
  ceiling, empty aggregate validation, incomplete discovery, oversized staged
  output preserving the prior pair, malformed-row rollback, journal recovery,
  and cross-configuration history with malformed-manifest/canary checks.
- `tests/e2e/control-report-management.spec.ts` runs under Chromium and WebKit
  against temporary roots and an in-process Control Server. It covers
  navigation, empty/history-only inventories, independent 20/21-run pagination,
  cancellation/Escape, confirmed project/run deletion, sibling preservation,
  final-project/final-run empty states, and lock/server feedback. Axe scans
  cover the retained-history table/actions and per-run confirmation dialog;
  direct disk assertions verify deletion and aggregate state. No live Jenkins
  or vendor services are contacted.
- `tests/unit/control-delete-run-ui.spec.ts` covers the per-run deletion hook
  contracts, CSRF injection, error code mapping (409/404/500), DOM IDs, and
  accessibility attributes.
- [Release gates](./release-gates.md) lists the focused test commands.

## Client-side PDF export

In Control mode (`npm run serve:control`), the final individual report viewer (`/reports/<projectId>/<runId>/index.html`) offers a direct client-side PDF download via `ReportExportButton`.

- **Real selectable text & embedded images**: jsPDF and jspdf-autotable render headings, prose, definition lists (`<dl>`), lists, table cells, and captions as selectable vector text; screenshots remain embedded images without full-page rasterization.
- **Embedded licensed fonts**: Noto Sans Regular and Bold TrueType fonts are bundled locally with full Latin, Vietnamese, punctuation, and Unicode support via VFS/addFont.
- **Portrait-first layout**: A4 portrait (210 x 297 mm, 10 mm margins) with a 10 pt body font and an 8 pt readability floor for the 7-column Snyk findings table with cell line wrapping.
- **Interactive evidence links**: Clickable URI annotations open exact validated Snyk and SonarQube source URLs without remote calls during generation; internal anchors (#jenkins-job, #snyk-test-report, #artifacts) resolve to destination pages.
- **Lifecycle & safety**: State transitions (`idle` → `preparing` → `composing` → `downloading` → `idle`), synchronous reentrancy protection, unmount guards, automatic object URL cleanup, and strict same-origin image validation. Files are named `<projectId>-<runId>-report.pdf`.
- **Focused tests**: `tests/unit/report-pdf-fonts.spec.ts`, `tests/unit/report-pdf-content.spec.ts`, `tests/unit/report-pdf-layout.spec.ts`, `tests/unit/use-report-pdf-export.spec.ts`, and `tests/unit/control-final-report-pdf-export.spec.ts`.
