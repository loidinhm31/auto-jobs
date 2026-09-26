# Phase 01 — Group schema and document state

## Context links

[Parent plan](./plan.md) · [Architecture](./architecture-design.md) · [Configuration docs](../../docs/multi-project-configuration.md)

## Overview

Date: 2026-09-26. Priority P2. Status: DONE. Completed: 2026-09-26T23:40:20+07:00. Code review: Passed (9.5/10). Establish optional presentation metadata and shared mutation/replacement lifecycle.
## Key Insights

`assertProjectConfigDocument` is shared by browser and ConfigStore. Root/project allowlists currently reject new fields. Store persists the validated document without reconstructing it; no endpoint needed. Membership on projects avoids fragile project-ID references in group lists.

## Requirements

Backward-compatible optional `projectGroups` and `groupId`; bounded definitions; one membership; unknown keys/dangling refs rejected. Preserve project order, raw JSON, dirty state, existing run gates, ETag conflicts, and normalization behavior.

## Architecture

Use exact contracts in architecture-design.md. Add pure group operations to a focused browser-safe transition module; consume them through useConfigDocumentEditor. Expose a document-replacement revision for resetting transient editors only when the document is successfully replaced.

## Related code files

Modify:
- `src/config/config-types.ts`: ProjectGroupInput, optional metadata fields.
- `src/config/project-config-project-validation.ts`: root/project allowlists, groupId field syntax; never defaults.
- `src/config/project-config-schema.ts`: group-list and cross-reference validation.
- `src/config/project-config-field-validation.ts`: group count bound, reuse string validation.
- `src/reporting/control-page/types/index.ts`: shared type exports only as needed.
- `src/reporting/control-page/hooks/useConfigDocumentEditor.ts`: group actions, replacement revision, shared dirty/validation handling.
- `src/reporting/control-page/hooks/useConfigManager.ts`: distinguish successful replacement from save acknowledgement.

Create:
- `src/config/project-group-validation.ts`: pure browser-safe definition/reference validation, called once from shared schema assertion.
- `src/reporting/control-page/hooks/project-group-transitions.ts`: create, rename, delete, and replace-group-membership operations.

Inspect, intentionally unchanged unless contract migration proves necessary: `report-server-config-store.ts`, `report-server-control-api.ts`, `project-config-loader.ts`, `project-config-normalization.ts`, `project-run-selection.ts`. Existing project update/remove transitions need no group-ID remapping because membership lives on the project.

## Implementation Steps

1. Find all references to affected exported types/hooks with LSP; retain current ESM/type conventions.
2. Extend raw types and allowlists only; do not extend normalized execution types. Validate up to 50 groups, safe unique 1–63-char IDs, safe 1–200-char names, and resolvable optional groupId. Absent list equals empty; reject null, malformed arrays, unknown keys, invalid definitions/references.
3. Implement immutable group operations. Generate unique group IDs independently of names. Delete strips membership from surviving projects. Applying a checklist moves selected projects into target, clears only unchecked target members, preserves all unrelated data/order. Reject nonexistent target/selected projects instead of partially mutating.
4. Wire mutations through setDocument(updated, true), updating validation/raw JSON and leaving existing persistence API untouched. No-ops should not mark a clean document dirty.
5. Add explicit replacement revision: successful load/reload/switch and valid raw Apply increment; ordinary mutations and Save acknowledgement do not. Failed load/Apply preserve state. Expose minimal revision contract for Phase 02/03 transient state reset.
6. Update affected callers/contracts in one cutover. No compatibility aliases or duplicate model stores.

## Todo list

- [x] Shared optional metadata types and validation.
- [x] Immutable membership/group transitions.
- [x] Editor mutation and replacement lifecycle.
- [x] Caller migration; behavior cases prepared for Phase 04.
## Success Criteria

Legacy config still loads; grouped config survives schema and API roundtrip. Invalid group metadata rejected equally in browser and server. Moves never duplicate projects; deletion only ungroups. Runtime selection/order unchanged. Exact verification in Phase 04.

## Risk Assessment

Accidentally adding metadata to defaults or normalized runtime would couple presentation to execution. Resetting on document object/ETag would erase valid local drafts during normal edits/saves. Use explicit replacement revision.

## Security Considerations

Reuse safe string/unknown-key checks, 1 MiB config limit, existing CSRF and ETag gates. No filesystem path built from group names/IDs. Do not log documents or credentials.

## Next steps

Phase 02 consumes shared actions; Phase 03 consumes replacement revision. Ready for Phase 02 implementation.
## Unresolved questions

None.
