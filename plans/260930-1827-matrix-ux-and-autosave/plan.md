---
title: "Matrix UX controls and one-click Save & Reload"
description: "Add ID visibility, row and project bulk controls, top-right execution, and an atomic-feeling save/reload lifecycle."
status: completed
priority: P2
effort: 10h
branch: main
tags: [feature, frontend, api]
created: 2026-09-30
---

# Matrix UX and Save & Reload

## Outcome and scope
Five tasks only: hide/show IDs; row Targets All/None; Enabled master checkbox; Execute Actions above matrix, right-aligned; successful Save automatically reloads active config. “Autosave” means the requested explicit **Save & Reload** action, not background/debounced persistence or automatic execution.

## Phases and progress
| Phase | Scope | Status / progress | Effort |
| --- | --- | --- | --- |
| [01](./phase-01-pure-transitions-and-save-reload-lifecycle.md) | Pure bulk edits; guarded PUT → GET lifecycle | DONE — 2026-09-30 | 4h |
| [02](./phase-02-matrix-ui-controls.md) | ID visibility; row All/None; Enabled master | DONE — 2026-09-30 | 2h |
| [03](./phase-03-dashboard-layout-execute-actions.md) | Top-right actions; responsive/accessible composition | DONE — 2026-09-30 | 1h |
| [04](./phase-04-verification-and-release-audit.md) | Behavioral proof; side-effect and release audit | DONE — 2026-09-30 | 3h |
Dependencies: 01 → 02; 03 uses 01 busy-state contract; 04 follows all implementation. Main/integration owner runs project-wide validation once after changes land. No implementation performed by this plan.

## Preflight contract
- Re-read current files and user changes before edits; preserve unrelated work. Planning skill and frontend guidance were read explicitly; current React/createElement/Tailwind conventions override unrelated MUI/query recommendations.
- `docs/development-rules.md` absent at research time; use [code standards](../../docs/code-standards.md), [architecture](../../docs/architecture.md), and [release gates](../../docs/release-gates.md). Recheck rules if added. Preserve 200-line materially changed TypeScript and 800-line Markdown limits.
- Saved document is sole data state. Bulk transitions stay pure/immutable in `src/reporting/control-page/hooks/matrix-document-transitions.ts`; effective Enabled means `enabled !== false`. No-op transitions preserve reference and dirty state.
- Row All selects every declared column, including blank links; None selects none. Selection does not enable projects; Enabled bulk edits do not alter targets. Existing blank-link skipping and explicit report/auto-build modes remain.
- ID visibility is local matrix state `isIdColumnHidden = false`; never persisted, never alters IDs or dirty state.
- Save contract: valid draft + config name + current ETag → one PUT → one GET of captured name → authoritative synchronized state. Keep busy throughout; no page refresh, list refetch, extra click, retry, or run.
- Conflicts/PUT failures retain draft; failed post-save GET reports partial success, retains draft and acknowledged PUT ETag, remains dirty/execution-blocked. Stale responses never replace a newer config. [Phase 01](./phase-01-pure-transitions-and-save-reload-lifecycle.md#architecture) defines outcomes.
- Keep `#btn-save`, `#btn-reload`, `#projects-job-matrix`, `#section-matrix`, `#heading-matrix`, `#section-actions`, `#heading-actions` exactly once when their surfaces render; preserve existing row/column/run IDs.
- New IDs: `#checkbox-show-id-column`, `#checkbox-enabled-all`, `#btn-select-all-targets-${projectId}`, `#btn-deselect-all-targets-${projectId}`. Master is unchecked/disabled for zero projects and mixed for partial enablement.
- Existing lifecycle test and docs assert Save acknowledgement does not advance replacement revision. New post-save GET is a real replacement: update that contract, not ordinary-edit behavior.

## Side-effect review checklist
- [x] Hide/show: zero document mutation, HTTP calls, dirty changes, or lost ID values/errors.
- [x] Bulk controls: one document emission per action; preserve order, URLs, credentials references, legacy group metadata, defaults, worker count, and explicit mode.
- [x] Save: one CSRF-protected If-Match PUT followed by GET only on success; no transient execution window or editable data loss during either request.
- [x] Failures/stale responses: no false success, forced overwrite, retry, run, wrong-file reload, or stale busy-state cleanup.
- [x] Layout: one action region; unchanged handlers, distinct report/build buttons, worker selector, feedback, and accessible headings.
- [x] Release: observable UI/network/disk proof, no live Jenkins submissions or secret-bearing artifacts; update affected docs/contracts after smoke proof.

## Research anchors
Current source: [matrix](../../src/reporting/control-page/components/organisms/projects-job-matrix.tsx), [save hook](../../src/reporting/control-page/hooks/useConfigManager.ts), [layout](../../src/reporting/control-page/components/templates/DashboardLayout.tsx). Prior matrix plan is historical only; current source confirmed flat matrix already implemented.

## Unresolved questions
None. Failure semantics, empty rows, optional Enabled, blank targets, and visibility lifetime are resolved in the phases; external infrastructure blockers must be reported, not hidden.
