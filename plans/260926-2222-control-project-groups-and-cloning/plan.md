---
title: "Control page compact project groups and cloning"
description: "Persist single-membership groups, display compact scrollable project columns, and clone existing project settings into safe drafts."
status: in-progress
priority: P2
effort: not-estimated
branch: main
tags: [feature, frontend, configuration]
created: 2026-09-26
---

# Control page project groups and cloning

## Scope

Phase 01 implementation is complete; focused behavior tests, full unit tests, typecheck/build, and review are recorded in the [Phase 01 test report](../reports/phase01-test-suite-260926-2311-group-schema-and-document-state.md) and [code review](../reports/code-review-260926-2315-phase-01-group-schema-and-document-state.md). Phases 02–04 remain pending.

User confirmed:
1. Compact project cards; groups saved inside the selected configuration JSON.
2. One group per project; unassigned items in Ungrouped. Vertical scrolling inside groups; horizontal scrolling across columns.
3. Clone existing project settings into editable draft; unique identity; disabled and ungrouped initially.

[Architecture and exact contracts](./architecture-design.md) · [Enhanced prompt and answers](./reports/planning-request.md) · [Phase index](./cmd-plan.md)

## Phases

| Phase | Status | Progress | Dependency | Detail |
|---|---|---|---|---|
| 01 Shared group schema and document lifecycle | DONE | 100% | None | Completed 2026-09-26T23:40:20+07:00; [Phase 01](./phase-01-group-schema-and-document-state.md) |
| 02 Compact grouped project board | Pending | 0% | 01 | [Phase 02](./phase-02-compact-grouped-project-board.md) |
| 03 Clone selected project draft | Pending | 0% | 01 | [Phase 03](./phase-03-clone-project-draft.md) |
| 04 Behavioral verification and documentation | Pending | 0% | 01–03 | [Phase 04](./phase-04-verification-and-documentation.md) |
Phases 02/03 share DashboardPage and editor wiring: integrate sequentially or assign a single owner. Do not have concurrent agents edit those files. Check references through LSP before exported contract changes; migrate all callers in the same cutover.

## Main decisions

- Optional root `projectGroups` definitions plus project-only optional `groupId`; existing schema-v1 documents remain valid.
- Existing document editor, raw JSON, validation, CSRF, ETag, and ConfigStore save pipeline. No new endpoint or personal browser layout storage.
- Reuse ProjectsGrid/ProjectCard; narrow new group-column/dialog modules. No drag/drop, nested groups, group execution, sort controls, new framework, or new packages.
- New Group creates an empty column, then opens project selection. Manage Projects moves checked entries atomically; unchecked target members return to Ungrouped. Minimal rename/delete management; deleting a group never deletes projects.
- Clone selected raw project, not normalized runtime data. Copy nested settings independently; preserve absent inherited fields and exact URLs. Reuse draft editor, Save Project, Cancel, global Save.
- Clear transient group/clone drafts on successful document replacement, not normal edits or saves.

## Acceptance gate

- Every project appears exactly once; stable project ordering and existing enabled/run-type/job-link functionality.
- Independent vertical group scrolling and board-only horizontal scrolling in real browser; empty groups and Ungrouped remain usable.
- Group membership survives global Save, reload, and a second browser; configurations remain isolated.
- Invalid/dangling group metadata rejected; stale ETag conflicts preserve the local draft rather than overwrite another writer.
- Clone Cancel changes nothing; Save Project adds an independent disabled/ungrouped entry; global Save persists; original remains unchanged.
- Collision/max-length/50-project boundaries enforced; no copied secrets, report files, or unintended execution.
- Existing report/build selection, credentials, raw-JSON Apply, and last-enabled-project safeguards preserved.

## Risks and verification

Schema allowlists currently reject extra metadata. Update the shared browser/server boundary first. Grouping must not leak into execution models. Long IDs need suffix-aware truncation; shallow copies would alias nested clone settings. Local drafts currently outlive some document replacements: make replacement state explicit.

Phase 04 defines commands and actual browser smoke scenarios. Existing source-text/wording-only tests encountered during migration must be removed, not repinned. Keep durable tests focused on membership, validation, persistence conflicts, and clone independence. No live Jenkins execution for these changes.

## Validation Summary

**Validated:** 2026-09-26. **Questions asked:** 3 validation questions, after 3 initial product questions.

### Confirmed Decisions
- Include group rename/delete; deletion confirms ungrouping only, never deletes projects/reports.
- Clone current applied form edits, including unsaved changes; ignore unapplied raw JSON.
- Keep login/job URLs prefilled; disabled clone includes a reminder to review target before enabling.

### Action Items
- No plan revisions required; all answers match the documented design.
- Planning check passed: 8 Markdown files, 4 phase files, all relative links resolved and required sections/frontmatter present.

## Planning status and unresolved questions

Product questions resolved and validation interview completed. Phase 01 completed 2026-09-26T23:40:20+07:00; focused/full unit tests, typecheck/build, and review are recorded in the [test report](../reports/phase01-test-suite-260926-2311-group-schema-and-document-state.md) and [code review](../reports/code-review-260926-2315-phase-01-group-schema-and-document-state.md). Phases 02–04, including integrated browser verification, remain pending. Active-plan persistence unavailable: helper reported missing EVCRATE_SESSION_ID; use this plan path explicitly.
