# Control project groups and cloning — planning entry point

Status: planned; no implementation started.

[Full plan](./plan.md) · [Architecture](./architecture-design.md) · [Enhanced request](./reports/planning-request.md)

| Phase | Status | Progress | Link |
|---|---|---|---|
| Shared group schema and document state | Pending | 0% | [Phase 01](./phase-01-group-schema-and-document-state.md) |
| Compact grouped project board | Pending | 0% | [Phase 02](./phase-02-compact-grouped-project-board.md) |
| Clone selected project draft | Pending | 0% | [Phase 03](./phase-03-clone-project-draft.md) |
| Verification and documentation | Pending | 0% | [Phase 04](./phase-04-verification-and-documentation.md) |

Confirmed: file-persisted groups; one group per project; Ungrouped fallback; disabled, ungrouped clones. Each group scrolls vertically; board scrolls horizontally. No new dependencies or execution behavior.

Workflow: `/cmd-plan__fast` and `/cmd-plan__validate` instructions loaded and followed inline; native slash dispatch unavailable. Planning/frontend-development skills read directly. Architecture doc includes a clearly proposed-design pointer only.

Active-plan persistence unavailable: published helper reports missing `EVCRATE_SESSION_ID`. Use this explicit plan directory.

## Unresolved questions

None. Three-question validation completed: rename/delete groups, clone current applied edits, and retain prefilled URLs confirmed. No plan revisions needed; implementation awaits a separate request.
