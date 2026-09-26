# Final-report PDF export — planning entry point

Status: in progress; Phase 01 DONE (2026-09-26); Phases 02–03 pending.

[Full plan](./plan.md) · [Architecture](./architecture-design.md) · [Enhanced request](./reports/planning-request.md)

| Phase | Status | Progress | Link |
|---|---|---|---|
| Shared control report viewer | **DONE** | 100% | [Phase 01](./phase-01-control-report-viewer.md) |
| Real-text browser PDF | Pending | 0% | [Phase 02](./phase-02-browser-pdf-export.md) |
| Verification and documentation | Pending | 0% | [Phase 03](./phase-03-verification-and-documentation.md) |

Confirmed: text stays selectable/searchable text; screenshots stay images; A4 portrait with font fitting before wider tables; real Snyk/Sonar links clickable.

Chosen: React + jsPDF + jspdf-autotable + local embedded fonts. Full-page raster export rejected. No server Chromium, print dialog, remote service, or static-report script injection.

Workflows: `/cmd-plan__hard` and `/cmd-plan__validate` instructions loaded and followed through tools; native slash dispatch unavailable. Skills read directly: planning, PDF, frontend-development.

Active-plan persistence unavailable: helper reports absent `EVCRATE_SESSION_ID`. Use this explicit plan directory.

## Unresolved questions
No product questions. Exact font coverage, readable table fit, link geometry, and actual browser/PDF behavior require implementation proof.
