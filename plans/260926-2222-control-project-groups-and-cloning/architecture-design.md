# Proposed architecture — not implemented

[Plan](./plan.md) · [Current architecture](../../docs/architecture.md) · [Confirmed request](./reports/planning-request.md)

## Decisions

User confirmed file-persisted groups, one group per project, disabled/ungrouped clones. Keep React, Tailwind, Radix, browser-safe validation, and existing configuration persistence. No new packages, endpoints, sidecar files, drag/drop, nested groups, group execution, cross-file cloning, or report changes.

## Data contract

Extend `ProjectConfigDocumentV1` with optional `projectGroups: readonly ProjectGroupInput[]`; each group has `id: string`, `name: string`. Extend `ProjectConfigInput` with optional `groupId: string`. Omission is Ungrouped; reject null/empty IDs and dangling references. Do not add `groupId` to defaults or normalized execution types.

- Group IDs: same lowercase safe 1–63-character syntax as project IDs, unique within groups; independent namespace from projects. UI generates `group`, `group-2`, etc., never derives IDs from display names.
- Group names: existing safe nonblank string rule, max 200 characters; trim on form submission. Duplicate display names allowed, distinguished by ID; display ID in management UI when needed.
- Root group list: absent or empty allowed, up to 50 groups (matches current project cap, bounds empty groups). Unknown group keys rejected using existing field validator.
- Project membership: optional single group ID referencing the root list. No duplicated project list inside groups. Project ID edits/removal consequently need no group member-reference migration.
- Group deletion removes that definition and matching `groupId` fields in one immutable document transition; projects themselves, enabled flags, run types, and artifacts remain intact. Rename changes only group name.
- Group order follows root array; cards in each column follow original project array. No stored card order; no mutation of execution order.
- Old schema-v1 files remain valid without migration. Older application versions reject newly populated fields; document that rollback requires a backup or deliberate removal of group metadata.

## State and persistence

`ConfigStore GET -> useConfigManager -> useConfigDocumentEditor.currentDoc -> DashboardPage -> ProjectsGrid/group dialogs and ConfigFormBuilder`.

Group changes and confirmed project additions call shared pure transitions, then `setDocument(updated, true)`. Raw JSON mirrors the same model. Global Save validates and sends the existing CSRF-protected, If-Match-guarded PUT. No autosave or automatic conflict merge. Failed save preserves local draft; existing conflict banner and reload workflow stay authoritative.

Add a local monotonically increasing document-replacement revision to editor state. Increment only on successful load/reload/config switch and successful raw-JSON Apply, not ordinary edits or successful persistence of the same document. Expose a narrow replacement operation or explicit replacement flag to existing manager callers. Key only transient form/group-dialog state by this revision (not document object identity, active name alone, or ETag); this clears drafts on reloading the same file as well as switching files without remounting the whole dashboard on every save. Failed load/Apply must not reset local state.

## Compact group board

Reuse `ProjectsGrid.tsx` as the board composition owner and `ProjectCard.tsx` as the compact entry; retain current exported symbols rather than introduce a duplicate board API. Add focused kebab-case group-column and group-editor-dialog components.

Board: no-wrap flex row, `min-width: 0`, `max-width: 100%`, `overflow-x: auto`; scoped to Projects, never body-level horizontal scrolling. Columns about 18rem wide, shrink-disabled, capped to available width on narrow screens. Header/actions outside scrollable card list; list max-height approximately `min(32rem, 65vh)`, `overflow-y: auto`, `min-height: 0`. Cards cannot shrink vertically. Keep native wheel/touch/keyboard behavior and visible focus; no custom wheel interception. Named keyboard-focusable scroll regions. Ungrouped first and always visible, including empty state.

Card: reduced padding and gaps; name/ID compact header, enabled and run-type controls on one wrapping row, truncated job link on another. Full identity/link available by focus/accessibility text, not hover alone. Retain existing control IDs and safe external links where behavior is unchanged. Do not remove controls or introduce run buttons. Project headings move to a sensible level beneath group headings.

New Group: enter name -> create empty group in shared draft -> open project checklist for that group. Manage Projects lists all projects, current membership, and checked target members. Apply sets selected projects to target group (moving them from old groups) and clears target membership for unchecked projects; unrelated assignments unchanged. Cancel leaves document unchanged. Rename/Delete are minimal management actions; delete confirms ungrouping, not project deletion. No document loaded: creation/management unavailable.

## Clone draft

Select an existing project in Project configuration -> Clone selected project -> inspect/edit existing new-project form -> Save Project -> global Save. Source is the current applied raw document, including applied unsaved form edits; unapplied raw text is not a clone source. Clone only within active configuration.

Create independent nested JSON data with `structuredClone(source)` once on the clone action, not during rendering. Replace ID with bounded deterministic `<source>-copy`, then `-copy-2` etc.; truncate base before suffix so ID never exceeds 63. Name uses a bounded ` (copy)` suffix within 200 characters. Set enabled false; delete groupId. Preserve explicit URLs verbatim, runType, timeouts, browser, artifactDir, credentials references, selector objects, origin arrays/policies, Snyk/SonarQube options, and omitted overrides. Shared defaults remain shared defaults; never copy resolved secrets. Preserve artifactDir because report identity is separately project-ID based; verify that invariant in implementation before accepting the clone path.

Use existing local draft validation and add callback; enforce current 50-project cap at start and commit, safe unique ID and full schema validity. Disable clone while adding, loading/replacing the document, or without source/capacity. Cancel causes no currentDoc/raw JSON/dirty mutation. Replacing document clears pending clone. Group edits while a clone is open must not clear it; clone stays ungrouped.

## Invariants and risks

- Groups cannot enable/disable, select, reorder execution, mutate reports, or copy projects.
- Each project rendered exactly once. Invalid form-stage dangling membership is surfaced in validation and displayed under Ungrouped so entries remain accessible; do not silently repair persisted invalid JSON. Raw JSON Apply/save reject it.
- Source/clone nested settings independent; disabled clone never enters execution until explicitly enabled and saved.
- Project and group mutations retain last-enabled-project and capacity constraints.
- No raw HTML, secret API reads, new networking, credentials storage, or altered security gates.
- Verify layout in actual Chromium and WebKit with long labels, 50 projects, several columns, small viewport, zoom, and keyboard navigation. DOM snapshots alone cannot prove scrolling.

## Unresolved questions

None blocking. Column dimensions are initial design values, to adjust based on actual browser evidence without changing the agreed scrolling behavior.
