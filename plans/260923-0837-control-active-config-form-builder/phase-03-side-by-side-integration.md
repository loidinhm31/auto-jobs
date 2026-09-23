# Phase 03 — Side-by-Side Integration

## Context Links
- [Preflight report](../reports/scout-260923-0837-control-active-config-form-builder.md)
- [Raw JSON section](../../src/reporting/control-page/components/organisms/RawJsonSection.tsx)
- [Dashboard layout](../../src/reporting/control-page/components/templates/DashboardLayout.tsx)
- [Dashboard page wiring](../../src/reporting/control-page/pages/DashboardPage.tsx)
- [Form builder phase](./phase-02-config-form-builder-component.md)
- [Existing E2E DOM contract](../../tests/e2e/control-page.spec.ts)

## Overview
**Priority:** P2 · **Status:** Pending · **Estimate:** 2h. Place the structured builder and existing raw JSON editor in one responsive workspace. Preserve the old document controls and use one document state for both surfaces.

## Key Insights
- `DashboardLayout` already owns the main dashboard sections; `DashboardPage` supplies `rawJsonSection` as a React node. `RawJsonSection` owns `#raw-json-textarea`, `#btn-apply-json`, `#json-validation-msg`, and `#section-editor-title`.
- The current raw editor is inside a closed `<details>`. A side-by-side editor must be visible by default for the requested workflow while retaining the existing `details`/`summary` and selector contract.
- `setRawJsonString` changes the draft text; `applyRawJson` is the deliberate validation boundary. Preserve this guard rather than parsing every partial keystroke into the builder.

## Requirements
- Render builder and raw JSON in `grid grid-cols-1 lg:grid-cols-2 gap-6`; mobile stacks in builder-then-JSON order.
- Form edits update document state and formatted textarea immediately. Applying valid JSON updates the form; invalid raw text remains visible but does not replace the last valid document.
- Keep the raw JSON editor initially open/visible, retain all existing IDs/classes/accessible labels, and preserve Save, Reload, project cards, and execution sections.
- Do not add another state store or copy JSON into component-local state. Keep the raw editor's existing details summary and validation live region accessible.

## Architecture
Add a `formBuilderSection` prop to `DashboardLayout` and group it with the existing `rawJsonSection` node in the responsive grid inside the existing configuration section. Keep `RawJsonSection` as the owner of the textarea and Apply controls; update its `<details>` default to open and maintain `#section-editor-title`. In `DashboardPage`, pass `ConfigFormBuilder` with the same `currentDoc` and mutation callbacks used by the hook. The single direction flow is:

`ConfigFormBuilder action -> document editor commit -> currentDoc + rawJsonString + isDirty -> textarea render`

`textarea typing -> rawJsonString draft -> Apply -> shared schema validation -> currentDoc/form update`

A failed Apply updates only `jsonValidationMsg`; it must not mutate `currentDoc` or overwrite the form's last valid document.

## Related Code Files
- Modify `src/reporting/control-page/components/templates/DashboardLayout.tsx` — accept builder content and render the responsive two-column configuration workspace.
- Modify `src/reporting/control-page/pages/DashboardPage.tsx` — wire the same hook state/actions into builder and JSON editor.
- Modify `src/reporting/control-page/components/organisms/RawJsonSection.tsx` — keep selectors and accessible editor controls; expose textarea visibly by default.
- Reuse `src/reporting/control-page/components/organisms/ConfigFormBuilder.tsx` from phase 2.
- Modify `tests/e2e/control-page.spec.ts` in phase 4 to assert sync, layout, and selectors.

## Implementation Steps
1. Extend `DashboardLayoutProps` with required form-builder content; update the sole dashboard caller rather than adding a compatibility alias.
2. Wrap builder and raw editor in exactly `grid grid-cols-1 lg:grid-cols-2 gap-6`; preserve the enclosing section, project/action/run section order, and mobile DOM order.
3. Pass `currentDoc`, project/default update callbacks, and add/remove callbacks from `DashboardPage`; keep the `rawJsonString` and `applyRawJson` callbacks unchanged in meaning.
4. Open `RawJsonSection` by default without renaming/removing its `<details>`, summary ID, textarea ID, Apply ID, or validation message ID.
5. Verify builder-originated changes serialize once through the document editor, raw Apply commits only after schema validation, and selection changes do not reset unrelated sections or project card behavior.

## Todo List
- [ ] Add the builder slot and two-column grid to `DashboardLayout`.
- [ ] Wire the builder to the manager-owned document actions in `DashboardPage`.
- [ ] Make the JSON editor visible by default while preserving its controls and summary.
- [ ] Confirm form-to-JSON immediate sync and JSON-to-form Apply sync.
- [ ] Confirm mobile stacking and no existing selector/class removals.

## Success Criteria
- At desktop (`lg` and wider), builder and JSON editor appear side-by-side; below `lg`, they stack with no horizontal overflow.
- Editing a builder field changes formatted `#raw-json-textarea` immediately and enables the existing save state.
- Applying valid JSON refreshes the builder; invalid JSON/schema reports an accessible error and keeps the previous form document.
- Existing selectors remain unique and functional, especially `#config-select`, `#btn-save`, `#raw-json-textarea`, `#btn-apply-json`, `#json-validation-msg`, `#projects-list`, and `.project-card`.

## Preflight Contract
- The raw JSON editor remains a native textarea and keeps all legacy control IDs/classes; do not replace it with a code editor.
- API, save/ETag, project-card, run, credentials, and browser-settings behavior stay owned by their existing components/hooks.

## Side-Effect Review Checklist
- [ ] Grid/layout changes only affect presentation and do not re-order lifecycle effects or trigger requests.
- [ ] Builder edits remain local until Save; Apply validates/commits locally only.
- [ ] Keep raw Apply explicit; do not auto-apply incomplete JSON on every keystroke.
- [ ] No form action invokes a run or credentials endpoint.

## Risk Assessment
- **Hidden raw editor:** set `details` open initially and verify the textarea is actually visible at desktop and mobile widths.
- **Duplicate state:** pass document/actions from `DashboardPage`; do not mirror config into builder state.
- **Accessibility regression from regrouping:** retain valid section labeling, heading order, field labels, and the existing polite validation region; check both viewport layouts with Axe.
- **DOM compatibility:** moving the textarea or buttons could break selectors; preserve IDs, classes, and native element semantics.

## Security Considerations
- Keep raw config text escaped by React/native textarea rendering; never inject user-supplied JSON as HTML.
- Persistence remains selection-name only; the layout must not introduce browser storage for document contents or credential values.
- Do not weaken CSP or add inline scripts/styles; use existing Tailwind utility classes.

## Next Steps
After integration, phase 4 adds browser-facing reload, edit, Apply, layout, and Axe coverage, then runs the complete release gate.

## Unresolved Questions
- None; raw-to-form synchronization occurs on the existing explicit Apply action, not on incomplete keystrokes.
