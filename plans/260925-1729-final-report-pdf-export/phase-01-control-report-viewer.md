# Phase 01 — Control-only React report viewer

## Context links
- [Parent plan](./plan.md), [architecture](./architecture-design.md), [integration research](./research/report-viewer-integration.md).
- [Current architecture](../../docs/architecture.md), [standards](../../docs/code-standards.md).

## Overview
- Date: 2026-09-25. Status: **DONE**; completed 2026-09-26. Priority: P2. Implementation and review complete; review scored 9.0/10 with no critical findings ([review report](../reports/code-review-260926-0624-phase-01-control-report-viewer.md)).
- Preserve final report URL/content; add a React-owned surface suitable for browser-side export.

## Key Insights
- The final evidence report is static HTML today; the React report-history index is a different page.
- Existing JSON validators, view-model builder, escaped section renderers, and safe static reads are reusable.
- Global report CSS and Tailwind base styles must not fight for report layout.

## Requirements
- Existing linked `/reports/<projectId>/<runId>/index.html` opens equivalent complete evidence in control mode.
- Persisted HTML, offline output, report-only serving, aggregate history, and raw artifacts keep existing behavior.
- No raw saved/vendor HTML insertion, iframe viewer, permissive CSP, new API, or schema change.
- Loading, missing, corrupt, inconsistent, and fetch-error states are visible; invalid evidence never enables export.

## Architecture
- Exact control route → existing React shell → validated sibling JSON → shared view model → shared escaped report body.
- Extract the whole report body (header, sections, footer), not just sections, so PDF and offline output cannot drift.
- React may use one narrowly owned HTML sink only for locally generated, fully escaped shared-renderer output; no network HTML input.
- Keep relative screenshot/artifact links valid by preserving the nested URL. Explicit canonical resource base handles directory-form requests if supported.

## Related code files
All paths relative to repository root `G:/ws/sharing/auto-jobs`.

Modify:
- `src/reporting/report-server-control.ts` — exact guarded run-report shell route; GET/HEAD/405 handling.
- `src/reporting/control-page/App.tsx` — select final-report page without disturbing existing two pages.
- `src/reporting/project-report-renderer.ts` — consume extracted body renderer; preserve static document/CSP.
- `src/reporting/report.css` — shared scoped report styles; preserve static appearance.
- `src/reporting/control-page/styles/globals.css` — report-surface isolation, not dashboard restyling.

Create:
- `src/reporting/project-report-body-renderer.ts` — existing header/section/footer composition moved intact.
- `src/reporting/project-report-route.ts` — browser-safe exact run-route/ID parser shared by server/UI; no Node imports.
- `src/reporting/control-page/pages/final-project-report-page.tsx` — report surface and state composition.
- `src/reporting/control-page/hooks/use-project-report.ts` — fetch/validate/readiness lifecycle.

Reuse without unnecessary edits:
- `src/reporting/report-server-files.ts`, `report-server-file-io.ts`, `report-server-control-page.ts`.
- `src/artifacts/result-validation.ts`, `artifact-identity.ts`, `src/reporting/report-view-model.ts`, `report-links.ts`, `sections/*.ts`.
- Existing control Button/StatusBanner primitives; fixed built asset URLs.

## Implementation Steps
1. Before exported renderer changes, use LSP references to enumerate static callers/tests; inspect full browser dependency graph. Keep runtime Node code out of UI imports.
2. Match exact raw path segments before decoding IDs, rejecting encoded separators, traversal, malformed/double encoding, reserved `assets`, and extra segments. Apply existing `SAFE_ID`. Never rely on decoded segment count alone.
3. Reuse Host validation, canonical report-root reference, `decodeRequestPath`, and `openReportFile` to preflight an existing bounded index; close handles in all outcomes. Missing/unsafe files remain rejected. No catch-all shell.
4. Return existing shell under control headers only for GET/HEAD. HEAD must have the same content length and no body; reject unsupported methods. Keep other report assets on current static handler.
5. Existing file opener also resolves directory URLs. Preserve those reads; if the final-viewer matcher covers directory forms, canonicalize them to the explicit index URL with the same preflight. Do not add an alternate export-only route or break relative assets. Primary acceptance targets existing explicit index links.
6. Fetch `data.json` and `manifest.json` concurrently with no-store and abort-on-unmount. Parse as unknown; reuse project/failure/manifest validators. Require project ID/name, run ID/timestamp, state, and shared Jenkins identity to agree and match the route.
7. Extract pure full-body composition and switch static renderer to it directly. Preserve section IDs, title, escape functions, safe links, empty/failed messages, screenshots, warnings, and footer. No duplicated report implementation.
8. Render trusted body inside `.project-report-surface`; scope shared CSS and explicitly counter Tailwind preflight where necessary. Load report stylesheet through existing local asset path; preserve standalone CSS usage. No inner `<html>`, `<head>`, CSP meta, or `<body>` insertion.
9. Set browser title; restore heading/anchor navigation after async rendering, including deep-linked fragments. Show accessible loading/error status outside report body.
10. Integrate the ready surface/identity with Phase 02; do not ship an inert export button.

## Todo list
- [x] Safe exact routing and mode isolation.
- [x] Shared body rendering and schema/identity validation.
- [x] Visual parity, CSS isolation, title/anchor/link behavior.
- [x] Ready/error lifecycle for export integration.
## Success Criteria
- Control final report displays the same report evidence as static output for success, partial, and failed runs.
- Report-only HTML remains scriptless with original security policy; dashboard/history unaffected.
- Invalid/missing/mismatched inputs produce no report export; all file handles and aborted fetches settle.
- No missing asset, runtime Node import, CSP violation, or external resource fetch.

## Risk Assessment
- Privileged React origin makes arbitrary HTML injection unacceptable; use generated escaped markup only.
- Screen CSS parity and PDF semantic-content completeness are separate checks; verify visible report content rather than string snapshots.
- Deletion during JSON loading yields missing evidence: explicit error rather than stale mixed-run display.
- Phase 01 review (2026-09-26, 9.0/10) recorded two non-blocking warnings: a case-only duplicate page filename and global `report.css` selectors that may affect control-bar styling; see the [review report](../reports/code-review-260926-0624-phase-01-control-report-viewer.md).

## Security Considerations
- Do not change REPORT_CSP or blanket CONTROL_CSP for the viewer.
- Retain strict URL policy, safe artifact membership, same-origin fetches, and file size/root identity checks.
- Viewer/renderer must never include control CSRF meta or credentials in export content.

## Next steps
- Phase 02 consumes only a ready, validated report surface. PDF implementation and integrated verification remain in Phases 02–03; Phase 03 must prove browser download, text/image/link fidelity, and visual layout.

## Unresolved questions
- None requiring product input. Real-text fonts, portrait table fitting, and clickable PDF evidence links are addressed in Phase 02.
