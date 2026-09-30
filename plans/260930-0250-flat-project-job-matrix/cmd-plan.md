# Flat project job matrix — plan entry

[Overview](./plan.md) · [Proposed architecture](./architecture-design.md) · [Current architecture](../../docs/architecture.md)

Replace grouped board **and** form with one editable project/column matrix. Keep schema-v1 data, legacy `jobUrl`, guarded saves, and report/build security. Generate Reports and Trigger Auto Build each execute selected nonblank cells; isolate each report pair under a virtual target ID, with results in the existing flat index.

| Phase | Status | Progress | Detail |
| --- | --- | --- | --- |
| 01 Schema and migration | DONE — 2026-09-30 | 100% | [Read](./phase-01-schema-data-model-and-migration.md) |
| 02 Matrix UI | DONE — 2026-09-30 | 100% | [Read](./phase-02-spreadsheet-matrix-ui-components.md); 110/110 selected checks; review 9.3/10 |
| 03 Document state | Pending | 0% | [Read](./phase-03-state-management-and-document-transitions.md) |
| 04 Engine and API | Pending | 0% | [Read](./phase-04-multi-job-execution-engine-and-api.md) |
| 05 Verification | Pending | 0% | [Read](./phase-05-testing-verification-and-release-audit.md) |

**Dependencies:** 01 before 03/04; 02 integrates with 03/04 contracts; 05 after all. No new dependencies. See [backend research](./research/researcher-01-backend-schema-exec.md) and [frontend research](./research/researcher-02-frontend-matrix-ui.md).

## Real remaining decisions

- Historical virtual ID collisions with unrelated old artifacts: reject or guided archive.
- Confirm any older external strict-validator binary needs a separate compatibility export.
