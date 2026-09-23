# Phase 04 — Verification and Release Audit

## Context Links
- [Preflight report and acceptance criteria](../reports/scout-260923-0837-control-active-config-form-builder.md)
- [Unit hook/type suite](../../tests/unit/control-hooks-and-types.spec.ts)
- [Control dashboard E2E suite](../../tests/e2e/control-page.spec.ts)
- [Package scripts](../../package.json)
- [Release-gate documentation](../../docs/release-gates.md)
- [Persistence phase](./phase-01-active-config-persistence.md) · [Builder phase](./phase-02-config-form-builder-component.md) · [Integration phase](./phase-03-side-by-side-integration.md)

## Overview
**Priority:** P2 · **Status:** Complete / 100% · **Completed:** `2026-09-23T13:24:08+07:00` · **Estimate:** 2.5h. Prove persisted selection, editor behavior, two-way synchronization, selector compatibility, accessibility, and release readiness. Verification completed across unit, control E2E, and full release suites.

## Key Insights
- `tests/e2e/control-page.spec.ts` already creates isolated config/report roots, starts a real in-process control server, and imports `AxeBuilder`; extend those fixtures rather than creating another server harness.
- The fixture currently writes one config. Persistence tests need a second schema-valid config with distinct project IDs/names so the selected file is observable after reload.
- `npm run test:control` targets this E2E suite; `npm run test:release` includes typecheck, build, unit, template E2E, control E2E, report E2E, and WebKit release checks.

## Requirements
- Add unit behavior coverage in `tests/unit/control-hooks-and-types.spec.ts` for config-name precedence/fallback and document editing/validation invariants.
- Add E2E coverage in `tests/e2e/control-page.spec.ts` for selection persistence after reload, valid `?config=` deep-link precedence, stale-name fallback, project add/edit/remove, defaults editing, builder-to-JSON live sync, and valid raw JSON Apply back into form controls.
- Assert invalid raw JSON/schema reports an error without changing the current form model; valid edits mark the page dirty and use the existing `#btn-save` save path.
- Run Axe against the expanded desktop and mobile editor surfaces; require exactly zero violations. Verify layout at a desktop width and a narrow mobile width.
- Keep full release validation as the final implementation gate: `npm run test:release`.

## Architecture
Extend existing tests in layers:
1. Unit: exercise the pure config-name resolver for valid URL > valid storage > first config, unknown URL with valid storage, stale storage, and empty config list. Exercise observable document helpers for project/default operations: preserve advanced fields, maintain unique IDs and enabled/project-count rules, clear optional defaults, validate schema, and keep invalid Apply from committing.
2. E2E: create an alternate fixture config before server start. Select it through `#config-select`, assert localStorage and URL parameter, reload and assert it remains active. Navigate directly with `?config=alternate.json` while storage names the default to prove deep-link priority; stale names must resolve deterministically.
3. E2E editor: use labels/roles to add a project, populate its ID/name/URLs/run type/enabled/credential references, edit a project/default, remove a project, and assert the formatted textarea and dirty/save state. Apply a changed valid JSON document and assert the matching form values; apply malformed/schema-invalid JSON and assert the prior form value survives.
4. Accessibility/layout: run `AxeBuilder` on the populated state at desktop and mobile widths; assert no violations, all form fields have accessible names, and the responsive grid stacks without overflow.
5. Release: run `npm run test:release` once after focused tests and integration are complete; fix only failures related to changed contract, preserve report evidence.

## Related Code Files
- Modify `tests/unit/control-hooks-and-types.spec.ts` — resolver and document-editor contracts.
- Modify `tests/e2e/control-page.spec.ts` — reload/deep-link, form editing, synchronization, responsive DOM, Axe audit.
- Test implementation targets from phases 1–3; no test-only production branches or new dependencies.
- `package.json` already defines `test:control` and `test:release`; no script change expected.

## Implementation Steps
1. Add the second config fixture using the existing `createValidConfig` shape but unique project IDs/names; ensure no browser run or Jenkins network is needed.
2. Add deterministic unit cases for selection precedence, stale/empty handling, valid document update preservation, and invalid apply rejection. Assert observable state/document output rather than source text or internal setter wiring.
3. Add E2E persistence test: select alternate, assert `localStorage['jenkins_control_active_config']`, assert encoded `config` query, reload, and verify alternate project cards/config selection. Add a direct-link case proving URL beats storage and stale names fall back.
4. Add E2E builder workflow using accessible labels: add and complete a project, verify fields and raw JSON, modify a field/default, remove the project, and verify JSON/dirty/save state after each meaningful transition.
5. Apply valid modified raw JSON, assert builder controls update. Apply invalid JSON/schema, assert validation message is announced and last valid form state remains unchanged.
6. Run Axe on the full initial page and edited builder at desktop/mobile sizes; fix actual violations without changing legacy selectors.
7. Run `npm run test:control` and focused unit spec during implementation; after all work lands, run `npm run test:release` once. Review the resulting diff for API/ETag and DOM contract preservation.

## Todo List
- [x] Add unit coverage for resolver, edit invariants, defaults, and validation.
- [x] Add an alternate configuration fixture and reload/deep-link/stale fallback tests.
- [x] Add builder add/edit/remove/default and bidirectional synchronization E2E coverage.
- [x] Audit selectors, desktop/mobile layout, and Axe violations.
- [x] Complete `npm run test:release` after focused verification; record exact outcome.

## Success Criteria
- Selecting a non-first config survives reload; URL deep link takes precedence over storage; stale names fall back to an available config.
- Add/edit/remove and defaults updates are observable in the raw textarea, dirty/save state, and form controls; valid JSON Apply updates the builder; invalid apply cannot replace valid form state.
- All legacy E2E selectors remain unchanged and existing API/If-Match tests pass.
- Desktop/mobile Axe scans each have zero violations; mobile editor stacks with no overflow.
- `npm run test:release` completes successfully with its full configured gates.

## Preflight Contract
- Keep only the selected filename in storage/query. Never persist config JSON, ETag, secret values, or arbitrary user-entered URL text outside the active document/API save.
- E2E uses local temporary roots and the in-process control server; no live Jenkins/controller request or external secret is needed.

## Side-Effect Review Checklist
- [x] Test fixture writes stay under the per-test temp config/report roots and are removed by existing teardown.
- [x] E2E tests do not click execution buttons; project `auto-build` values are data only and must not submit Jenkins builds.
- [x] Form operations call no server mutation until explicit Save; Save continues using the existing ETag and CSRF-aware client.
- [x] Release gate is run only after work lands; no linters or unrelated project-wide validation during plan authoring.

## Risk Assessment
- **False-positive reload test:** wait for config selection/project text to settle after reload; assert the chosen document, not only query text.
- **Fixture collisions:** use unique IDs and names in the alternate config and isolate each test with the existing temporary config root.
- **Brittle locators:** prefer accessible labels/roles for new controls; keep existing ID/class locators only for compatibility contract assertions.
- **Axe test incomplete:** audit after the builder is open/populated and at both viewport classes, not only the collapsed initial page.
- **Release-only regressions:** run the full named release script after focused cases and preserve the existing ETag, secrets, and run behavior.

## Security Considerations
- Assert storage/query contents are filenames only; verify test values include no credential values and no config JSON is persisted.
- Keep E2E credentials as environment-variable references; never add plaintext secrets to config fixtures, page assertions, or logs.
- Use the isolated local server and avoid triggering `#btn-run-reports`, `.btn-auto-build`, or `/api/run` as part of these form tests.

## Next Steps
Phase 04 complete. All gates passed: `npm run test:unit` (337/337), `npm run test:control` (14/14), and `npm run test:release` (371/371 tests across unit, template E2E, control E2E, report E2E, and WebKit, plus typecheck and build). Ready for final release integration.

## Unresolved Questions
- None; test fixtures and acceptance outcomes are specified above.
