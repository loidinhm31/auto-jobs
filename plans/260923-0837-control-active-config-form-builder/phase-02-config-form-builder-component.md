# Phase 02 — Config Form Builder Component

## Context Links
- [Preflight report](../reports/scout-260923-0837-control-active-config-form-builder.md)
- [Schema-v1 UI types](../../src/reporting/control-page/types/index.ts)
- [Shared schema validator](../../src/config/project-config-schema.ts)
- [Shared field rules](../../src/config/project-config-field-validation.ts)
- [Config manager hook](../../src/reporting/control-page/hooks/useConfigManager.ts)
- [Existing atoms](../../src/reporting/control-page/components/atoms/Input.tsx) · [Select](../../src/reporting/control-page/components/atoms/Select.tsx) · [Button](../../src/reporting/control-page/components/atoms/Button.tsx) · [Badge](../../src/reporting/control-page/components/atoms/Badge.tsx)
- [Organism exports](../../src/reporting/control-page/components/organisms/index.ts) · [Code standards](../../docs/code-standards.md)

## Overview
**Priority:** P2 · **Status:** Complete / 100% · **Completed:** `2026-09-23` · **Estimate:** 3h. Add an accessible, controlled `ConfigFormBuilder` organism for project add/edit/remove and common-default editing. It edits the existing schema-v1 document; it does not create configuration files or credentials.

## Completion Evidence
- Approval: Phase 02 was user-approved. The canonical adviser checkpoint was explicitly waived by the user and was not run.
- Verification: Code review found no actionable findings; focused tests passed 35/35; `npm run typecheck` and `npm run build` passed. Browser smoke exercised controlled mutations, inheritance, defaults, valid/invalid raw Apply, dirty JSON, and project-removal invariants.

## Key Insights
- `ProjectConfigDocumentV1` and `ProjectConfigInput` permit unrelated supported fields (`selectors`, `allowedOrigins`, source settings, and optional execution settings). Form updates must merge only edited keys, not reconstruct the whole object.
- The runtime schema requires 1–50 projects, unique lowercase-safe IDs, at least one enabled project, valid HTTP(S) login/job URLs sharing a Jenkins context, bounded integer timeouts (1,000–3,600,000 ms), and credential *variable names* only.
- `BrowserName` and schema support `chromium`, `firefox`, and `webkit`; retain all valid existing values rather than narrowing the selector to the two-item subset mentioned in the preflight draft.
- `project-config-field-validation.ts` currently imports `node:path`, so importing the full validator into the browser bundle needs a small browser-safe path-validation boundary first. Do not duplicate URL/schema rules or ship a browser `node:path` dependency.

## Requirements
- Provide project selection, **Add New Project**, **Remove Project**, and labeled controls for ID, Name, `loginUrl`, `jobUrl`, `runType` (`report` / `auto-build`), `enabled`, and project credential references (`usernameVariable`, `passwordVariable`).
- Provide a collapsible defaults editor for `timeoutMs`, `browser`, `artifactDir`, and defaults credential references. Omitted optional fields stay omitted; clearing a field removes its key rather than serializing an empty value.
- Use only existing React/Tailwind atoms; no form package. Credential inputs edit environment-variable names only and never accept/render secret values.
- Every committed form edit updates the one current document, sets `isDirty`, and serializes formatted JSON. Raw text remains draft-only until **Apply & Validate**; applying invalid JSON/schema must leave the last valid form document unchanged and expose a useful accessible error.
- Preserve unknown-to-the-form but schema-supported project/default fields during edits. New project creation is for the active configuration only; no new configuration API.

## Architecture
Make `ConfigFormBuilder` controlled by the config-document editor state: it receives the document and narrow actions for add/update/remove project and update defaults. `useConfigManager` (or a focused `useConfigDocumentEditor` extracted from it) owns the document, raw JSON, dirty state, and validation; the builder must not maintain a second config copy. Before applying raw JSON or saving, call the shared `assertProjectConfigDocument` contract. Make its path-root check browser-safe without changing the accepted config shape or backend route behavior; prove POSIX and Windows root/traversal cases. Keep the hook below the repository's 200-line production-file guideline by extracting the cohesive document-edit responsibility rather than growing the already-long API manager.

Project editor behavior:
- Adding appends a unique safe ID (`new-project`, then the next free numeric suffix), name `New Project`, empty required URLs, `report`, and enabled. The blank URLs are an explicit draft, not a runnable config; keep it dirty and block invalid Save until the required fields validate.
- ID/name/URLs use existing schema rules and inline error associations. URL inputs accept credential-free absolute HTTP(S) URLs without query/fragment and preserve same Jenkins context validation.
- Project credential fields edit the `credentials` object. If absent, show inheritance from defaults and allow removing a project override; do not erase it when unrelated fields change.
- Removing a project must not leave zero projects or a document with no enabled project; explain the constraint inline. Defaults updates merge with the prior object, retain selectors/origin policies, and remove `defaults` only when no properties remain.

## Related Code Files
- Create `src/reporting/control-page/components/organisms/ConfigFormBuilder.tsx`; export it from `components/organisms/index.ts`.
- Modify `src/reporting/control-page/hooks/useConfigManager.ts` and, if needed for the 200-line rule, create `hooks/useConfigDocumentEditor.ts` for shared document edit/apply/validation state.
- Modify `src/config/project-config-field-validation.ts` (and validator tests in the named unit spec) only to make the shared path rule safe in both Node and the browser; `assertProjectConfigDocument` remains the one schema authority.
- Modify `tests/unit/control-hooks-and-types.spec.ts` for observable project/default mutation, preservation, invalid-document rejection, and validator boundary cases.
- `src/reporting/control-page/components/atoms/{Input,Select,Button,Badge}.tsx` are reused, not forked.

## Implementation Steps
1. Define controlled props and actions around `ProjectConfigDocumentV1`; keep selection UI state separate from the document and normalize it after add/remove/apply.
2. Extract document-edit state from `useConfigManager` if needed to keep the API manager maintainable and under the current line limit. Centralize the commit operation so every form action updates document, JSON, dirty state, and validation status together.
3. Add project list selection and add/remove operations. Generate a collision-free schema-valid ID; keep new URLs blank until the operator supplies a real target. Prevent removal that violates project-count/enabled invariants.
4. Add project fields and defaults controls with labels, stable field IDs, native `Select`/checkbox semantics, contextual inheritance, optional-key clearing, and visible inline errors.
5. Make the shared schema validator browser-safe without weakening the existing server validation; use it for Apply and before PUT. Invalid input changes only the validation message/raw text, not the active document.
6. Add focused unit behavior checks and export the new organism. Keep the public hook contract consumed by `DashboardPage` coherent; do not introduce duplicate source-of-truth state.

## Todo List
- [x] Add the controlled builder and public organism export.
- [x] Add project selection, add/edit/remove, defaults editing, and inheritance handling.
- [x] Keep schema-valid optional values and untouched advanced fields intact.
- [x] Make shared validation browser-safe and use it for Apply/Save.
- [x] Test mutations, document preservation, invalid constraints, and default field bounds.

## Success Criteria
- Operators can create a project draft and fill every requested project field; changes immediately update the controlled document and dirty state.
- Project edits preserve selectors/source policy and unrelated fields; default edits preserve other defaults and clear optional values correctly.
- Raw JSON apply updates the builder only for valid schema-v1 documents; invalid JSON/config leaves the current form model intact and announces errors.
- No password/token values are accepted; schema validation agrees with the unchanged server on URLs, ID uniqueness, project count/enabled invariant, browser choices, and timeout bounds.

## Preflight Contract
- No new API or dependency. `credentials` means names of environment variables, not stored secret values.
- Keep the existing raw editor selectors and save/ETag contract; schema-v1 remains the only document shape.

## Side-Effect Review Checklist
- [x] Add/update/remove/default operations touch only the in-memory selected document and formatted raw JSON.
- [x] Do not call `/api/config`, `/api/secrets`, or `/api/run` from field handlers.
- [x] Removing a project does not delete files, secrets, saved configs, or browser data; persistence occurs only through the existing explicit Save.
- [x] The browser-safe validator does not alter server acceptance or introduce Node-only imports into the Vite bundle.

## Risk Assessment
- **Schema drift:** reuse `assertProjectConfigDocument`; the browser-safe extraction must retain existing server boundary cases.
- **Invalid drafts:** new projects begin with blank URLs; show why Save is blocked and preserve the draft so the operator can finish it.
- **Accidental data loss:** merge patches, preserve schema-supported advanced keys, and remove only explicitly cleared optional editor keys.
- **Form size/accessibility:** group fields with headings/fieldset semantics and keep controls independently labeled rather than adding nested generic form abstractions.

## Security Considerations
- Never store secret values in project/default credential fields; these are validated variable names only (`^[A-Za-z_][A-Za-z0-9_]{0,127}$`).
- Validate Jenkins URLs with the shared credential-free HTTP(S), same-origin/base-context policy. Do not render user-supplied values through HTML or build links from them.
- Treat project IDs as data, not selectors or paths; unique ID and bounded string validation remain required.

## Next Steps
Phase 3 supplies the builder into the existing dashboard layout beside the JSON editor. Phase 4 exercises add/edit/remove/default flows, shared validation, and accessible error handling in the specified unit and E2E suites.

## Unresolved Questions
- None; schema-supported browser values and explicit draft behavior are determined from current types/validation.
