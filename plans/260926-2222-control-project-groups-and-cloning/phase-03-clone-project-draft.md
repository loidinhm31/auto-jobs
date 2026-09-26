# Phase 03 — Clone selected project draft

## Context links

[Parent plan](./plan.md) · [Architecture](./architecture-design.md) · [Dependency: Phase 01](./phase-01-group-schema-and-document-state.md)

## Overview

Date: 2026-09-26. Priority P2. Implementation pending; review pending. Prefill the existing new-project editor safely from a selected project.

## Key Insights

ConfigFormBuilder already has selectedIndex, newProjectDraft, local validation, Save Project and Cancel. useConfigDocumentEditor.addProject accepts a supplied draft. Clone must use raw ProjectConfigInput, not ProjectCardData or normalized project values, to preserve nested settings and inherited defaults.

## Requirements

Clone the selected applied project within the current configuration. Independent nested data, unique valid ID, distinguishable bounded name, enabled false, no groupId. Preserve explicit settings/credential references and omitted overrides. No document mutation until Save Project; no disk write until global Save. Recheck 50-project and uniqueness limits at commit.

## Architecture

A focused pure clone helper creates one independent editable draft. ConfigFormBuilder invokes it through the existing add-mode state machine and validation path. No clone API, new editor, cross-config picker, secrets lookup, automatic save, or runner integration.

## Related code files

Modify:
- `src/reporting/control-page/components/organisms/ConfigFormBuilder.tsx`: Clone selected project action, source identity, common draft entry lifecycle, capacity/validation feedback.
- `src/reporting/control-page/hooks/useConfigDocumentEditor.ts`: supplied-project addition guard, shared maxProjects constant, full-document validation before committing supplied clones if needed.
- `src/reporting/control-page/pages/DashboardPage.tsx`: loading guard and replacement revision binding established in Phase 01.

Create:
- `src/reporting/control-page/utils/clone-project-draft.ts`: bounded clone identity and independent nested configuration copy.

Inspect/reuse without new parallel convention:
- `src/reporting/control-page/components/molecules/ConfigProjectEditor.tsx`.
- `src/reporting/control-page/hooks/config-document-transitions.ts`.
- `src/config/project-config-project-validation.ts`, `project-config-schema.ts`, `project-config-field-validation.ts`.

## Implementation Steps

1. Add Clone selected project adjacent to current selection/Add New Project; source is explicitly visible. Disable without source, at capacity, while adding, or during document load. Preserve existing blank-add behavior.
2. Implement helper using structuredClone of the raw source once per action. Set enabled false and delete groupId. Keep nested selector objects, credentials references, origin arrays/policies, source options, artifactDir, exact URLs and omitted overrides. Never resolve defaults or secrets.
3. Generate `<source-id>-copy`, then `-copy-2`, etc. Truncate base to make room for full suffix within 63 characters before checking collisions. Name is source name plus bounded ` (copy)` within 200 characters. Do not require unique names; unique IDs are authoritative.
4. Enter existing local newProjectDraft mode. Explain source, disabled status and shared credential references, and remind user to review copied job URL before enabling. Cancel must leave raw JSON/currentDoc/dirty state exactly as before opening.
5. Reuse validateProject and ID collision validation. Before Save Project commits, enforce latest document capacity, latest uniqueness, and full document validity; preserve local draft and actionable errors on failure. Do not create dangling membership or change last-enabled-project rules.
6. Reset draft/errors/selection only on successful document replacement revision, including reload of same file and raw Apply. Normal group edits and global Save must not erase a pending clone. Selecting another project retains the current existing add-draft cancellation behavior.
7. Remove any obsolete duplicate clone/add handling introduced during this work, but do not refactor unrelated form controls. Keep TypeScript exact optional fields (delete groupId rather than writing undefined).

## Todo list

- [ ] Clone helper and suffix-aware bounded identity.
- [ ] Existing draft form integration and review messaging.
- [ ] Latest-state commit guards and cancellation/replacement behavior.
- [ ] Clone/source independence and safety cases prepared for Phase 04.

## Success Criteria

Nested clone edits never mutate source. Save Project creates exactly one disabled, ungrouped entry with intended fields; global Save/reload preserves it. Cancel, invalid input, cap and collisions do not partially add entries. Omitted credentials still inherit defaults. Enabled source and disabled clone remain independent execution candidates.

## Risk Assessment

Shallow copies alias nested objects. Using normalized data pins inherited defaults and loses raw settings. Naive suffix append exceeds ID bounds. Reusing source identity can alias reports. Verify generated distinct identity and artifact path conventions before browser acceptance.

## Security Considerations

Credentials copied as environment-variable names only; no `/api/secrets` fetch is needed. Do not clone runtime logs, tokens, reports, history, or files. Disabled default prevents accidental inclusion in all-enabled actions, but user must still review copied URLs before enabling.

## Next steps

Phase 04 validates integration, conflicts, persistence, clone independence, and actual browser behavior.

## Unresolved questions

None.
