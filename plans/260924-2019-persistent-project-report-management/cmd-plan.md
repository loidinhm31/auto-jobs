# Implementation phase tracker

Plan: [Persistent project report management](./plan.md). Date: 2026-09-24. Total: 16h. Status: pending; no implementation started.

| Phase | Status | Progress | Effort | Dependency |
| --- | --- | --- | --- | --- |
| [01 — Persistent aggregate index builder](./phase-01-persistent-aggregate-index-builder.md) | Pending | 0% | 4h | Existing manifest discovery/publisher |
| [02 — Control reports DELETE API](./phase-02-control-reports-delete-api.md) | Pending | 0% | 5h | Phase 01 builder; shared report-root lock |
| [03 — Report management page navigation/deletion](./phase-03-control-ui-navigation-and-deletion.md) | Pending | 0% | 3h | Phase 02 HTTP contract; Phase 01 index JSON |
| [04 — Verification and caller migration](./phase-04-verification-and-caller-migration.md) | Pending | 0% | 4h | Integrated phases 01–03 |

## Acceptance gate

- Report index retains validated reports across subsequent runs/config switches, including unconfigured history; malformed artifacts cannot become rows.
- DELETE is loopback-only, CSRF-gated, locked, project-contained, symlink-safe; confirms removed count and republished pair. No config/staging/assets/sibling changes.
- Dashboard links to `/reports/index.html`; control mode serves a CSRF-bearing management page with per-project confirmed deletion there. The saved index and report-only mode stay static/read-only.
- Focused unit/API tests and Chromium/WebKit browser scenarios pass; full release gate after integration only. See phase 04.
