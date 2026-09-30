# Phase 04 — Verification and release audit

## Context links
- [Overview/preflight/checklist](./plan.md), [Phase 01](./phase-01-pure-transitions-and-save-reload-lifecycle.md), [Phase 02](./phase-02-matrix-ui-controls.md), [Phase 03](./phase-03-dashboard-layout-execute-actions.md).
- [Unit transition suite](../../tests/unit/matrix-document-transitions.spec.ts), [hook lifecycle suite](../../tests/unit/config-document-editor-groups.spec.ts), [Control browser suite](../../tests/e2e/control-page.spec.ts).
- [Release gates](../../docs/release-gates.md), [architecture](../../docs/architecture.md), [configuration docs](../../docs/multi-project-configuration.md), [npm scripts](../../package.json).

## Overview
- Date: 2026-09-30. Priority: P2. Implementation: pending. Review: pending. Verification: pending. Effort: 3h.
- Prove the five user tasks end-to-end, failure boundaries and unchanged execution safety. Main/integration owner alone runs project-wide validation after all changes land.
- This planning deliverable does not claim tests or runtime verification of unimplemented features.

## Key Insights
- Static render tests cannot prove ID-toggle state, `.indeterminate`, actual layout or multi-request busy lifecycle; use actual browser surface.
- Existing lifecycle test explicitly forbids save revision increment. Replace that obsolete assertion with PUT/GET replacement behavior; normal edit revision behavior remains.
- Existing E2E suite repeats exact saved-success wording. Remove incidental wording pinning and assert state/requests/persistence instead; retain explicit failure feedback assertions where users need partial-success distinction.
- Existing Control tests run in-process loopback server with per-test temp config/report roots and injected executors. Reuse isolation; no external Jenkins or credentials needed.

## Requirements
### Functional
- Exercise every acceptance criterion, including blank links, omitted Enabled, mixed state, external file reload, post-save GET error, stale ownership and delayed-read locking.
- Validate GET-authoritative document/ETag, raw JSON, clean state, revision and execution readiness after one click; not merely response count or success text.
- Preserve required IDs, existing row/column/run IDs, distinct execution modes and legacy matrix/group data behavior.
### Non-functional
- Permanent tests cover consumer-visible state boundaries and invariants; no source-text checks, prop-forwarding mocks, static markup snapshots or duplicated happy-path rows.
- Deterministic controlled deferred responses; no arbitrary sleeps. Temp file roots and explicit local routes; cleanup server/files in fixture teardown.
- Keep evidence secret-free. Failures are reported, not hidden by narrowed suites, timeouts, forced writes or broad route fallbacks.

## Architecture
### Behavior matrix
| Layer / scenario | Evidence and expected result |
| --- | --- |
| Pure row transition | Select known IDs including blanks, unknown/duplicate inputs, document-order normalization, invalid indices, empty selection and unchanged selection. Frozen input unmodified; unrelated row/jobs/group/default references preserved; no-op same reference. |
| Pure Enabled transition | Mixed true/false/omitted fields and zero projects. Enable/disable changes only effective mismatches; stable project order/targets/URLs/group metadata; already-matching document identity retained. |
| Hook success | GET state deliberately distinguishable from PUT acknowledgement; final name/ETag/document/raw JSON come from GET, revision advances exactly once, dirty false, sequence stale result not adopted. |
| Hook errors | Invalid draft makes no requests; PUT 409 and 412 retain draft and old ETag, no GET; non-conflict errors retain draft; successful PUT + failed GET retains dirty draft with PUT ETag and partial-success feedback. |
| Hook races | Deferred PUT/GET plus newer load; older result/banner/finally cannot replace/unlock newer operation. Duplicate Save while pending produces no second write. Use deferred promises and distinct config identities. |
| UI visibility | Visible by default, Hide removes ID header/cells only, Show restores values/errors; no HTTP/dirty change from view toggle. Then edit a name/job with IDs hidden, Save & Reload, Show IDs and verify values unchanged. |
| UI row targets | All/None affect only one row; blank selected cell still gets skip hint; individual toggle after All works; disabled project row may preselect without enabling; dirty state requires save before runs. |
| UI master | Rows true/false/omitted → mixed DOM property/aria state; click mixed → all; click checked → none; per-row toggle → mixed; zero-row document → unchecked/disabled. Targets retained when rows disabled then reenabled. |
| UI save/read | Intercept/delay only second read; controls disabled until released, no run POST while pending; read changes adopted. After save, disk file includes intended edits and run POST uses refreshed configEtag and only enabled selections. |
| UI partial recovery | Fail post-save GET through scoped route; banner distinguishes saved-but-not-reloaded, draft retained/run blocked. Remove route failure and click manual Reload; no new PUT, authoritative state clean. |
| UI external reload | Change temporary config file externally, click #btn-reload; matrix/raw JSON/Enabled master reflect new file, one read without save. |
| Layout/accessibility | Wide and narrow screenshots; unique required IDs, valid region names/heading associations, keyboard order, tri-state checked states, table header/cell alignment, action controls outside table overflow. Axe scan with loaded config and representative mixed/hidden state. |
| Execution safety | Explicit Generate Reports and Trigger Auto Build retain separate payload runType; blank/disabled rows excluded by existing rules; workers bounded and saved; no action runs automatically after save. |

Avoid testing the same behavior at every layer: pure invariants in transition suite, async lifecycle in hook suite, a compact integrated journey and actual accessibility/layout boundaries in browser suite. Scoped network routes prove uncertain failure branches; real temp-server/disk path proves the complete ordinary journey.

## Related code files
Modify as required:
- `tests/unit/matrix-document-transitions.spec.ts` — bulk transition invariants; update clean-cutover imports for moved draft helpers.
- `tests/unit/config-document-editor-groups.spec.ts` — remove obsolete Save-only replacement assertion; add deterministic lifecycle boundaries using existing hook-runner convention.
- `tests/e2e/control-page.spec.ts` — integrate matrix controls, disk save/reload/external reload, busy/error paths and accessible visual positioning.
- `tests/unit/control-matrix-components.spec.ts`, `control-atomic-components.spec.ts` — update broken typed contracts; delete affected incidental wording/wiring assertions instead of adding new ones.
Documentation after runtime proof:
- `docs/architecture.md` — bulk transitions, local visibility, top-right actions and guarded Save → GET replacement/failure states; distinguish historical Save acknowledgement from real reload.
- `docs/code-standards.md`, `docs/codebase-summary.md` — correct lifecycle/revision wording and module responsibility inventory after any extraction.
- `docs/multi-project-configuration.md`, `README.md` — five visible controls, explicit Save & Reload/manual Reload, All includes blank targets, Enabled separate from selections; no background autosave claim.
- `docs/release-gates.md`, `docs/project-roadmap.md` — evidence and release/changelog entry; do not claim unrelated gates passed.
Create/delete: no new permanent test file unless existing relevant suite cannot host an isolated behavior. Remove temporary smoke scripts/routes/artifacts after evidence capture; retain only useful release proof per repository convention.

## Implementation Steps
1. Re-read all affected consumers/docs after integration; verify preflight and side-effect checklist against actual behavior, not code shape alone. Check materially changed production modules remain under 200 lines.
2. Add focused transition and lifecycle boundary tests; remove obsolete acknowledgement-only contract and incidental saved-success wording assertions. Preserve normal load/edit/raw Apply tests.
3. Run scoped checks once each as relevant owner after that slice is ready:
   ```sh
   node scripts/run-playwright.mjs playwright test tests/unit/matrix-document-transitions.spec.ts tests/unit/config-document-editor-groups.spec.ts --config=playwright.unit.config.ts
   node scripts/run-playwright.mjs playwright test tests/e2e/control-page.spec.ts --config=playwright.control.config.ts
   ```
   Main can combine these with final validation rather than duplicate full suites. Do not run project-wide checks during concurrent edits.
4. Smoke the actual Control Dashboard after build is ready: start `npm run serve:control` against isolated test configuration using existing server startup conventions, open browser, complete Hide → row All/None → mixed Enabled master → Save & Reload → manual external Reload. Capture wide/narrow screenshots and safe network metadata. If using a throwaway in-process server, use the existing temp-root/local-executor fixture setup rather than real production configs.
5. During smoke, deliberately delay post-save GET; try raw Apply, worker changes, matrix edits and execute buttons; observe they cannot mutate/run. Inject read failure and recover with Reload. Confirm disk content and refreshed run configEtag with local fixture executor only.
6. Run browser accessibility scan; inspect unique preserved IDs, native mixed state, control focus and table alignment in both ID visibility states. Observe top-right placement at desktop and above-table stacking on narrow viewport.
7. After smoke proof, update affected docs/changelog with actual implemented behavior and any extraction paths. No docs claim merely planned feature has shipped.
8. Main/integration owner runs project-wide release validation **once**, using `npm run test:release` (existing typecheck/build/unit/templates/control/report/WebKit sequence). Prefer this combined script over separately rerunning its constituent project-wide gates. Record command/exit and actual blockers. User-reported known failures are ground truth; do not rerun just to confirm them.
9. Complete side-effect audit: only intended PUT/GET traffic, no config-list refetch, automatic execution, retries, secrets leakage, wrong-file updates or duplicate action region. Mark phases complete only after actual corresponding proof; overview status completed only after named acceptance and release disposition recorded.

## Todo list
- [ ] Update focused behavior tests; remove obsolete/incidental contract assertions.
- [ ] Prove one-click persisted GET synchronization and each failure/race boundary.
- [ ] Smoke actual UI; capture desktop/mobile, keyboard and accessibility evidence.
- [ ] Audit side effects and backwards-compatible IDs.
- [ ] Update lifecycle/user-facing docs and release/changelog after smoke.
- [ ] Main records one final project-wide validation and honest release disposition.

## Success Criteria
- All five user tasks observed on actual surface; request/disk/state evidence confirms save/reload is one user action.
- Required selectors remain unique and usable; mixed/zero-row/blank/optional-field boundaries match preflight.
- No silent draft loss, false success, force overwrite, extra save/read loop, background persistence or automatic run.
- Tests catch behavior, not implementation trivia; actual UI proof complements them. Final docs match observed behavior.
- Project-wide validation output is recorded accurately. Any unreachable infrastructure prerequisite explicitly documented; no fabricated passed gates or feature-complete label masking failed acceptance.

## Risk Assessment
- Broad existing suites/environment prerequisites → use exact configured commands, isolate temp roots and routes; main distinguishes known unrelated failures without narrowing acceptance.
- Static-only verification → require real DOM interaction, screenshots, native checkbox property and persisted disk evidence.
- Mock GET echo masks missing reload → distinct authoritative read data and one real server/disk journey.
- Feedback copy causes brittle tests → assert semantic dirty/readiness state; failure text only where distinction is consumer-visible.

## Security Considerations
Use loopback local test roots, existing CSRF/If-Match/filename validation and injected no-live-side-effect executors. Do not submit real builds, store credentials in config, log request bodies or expose secret paths in screenshots. Preserve disabled-row and blank-cell server safeguards and explicit mode split.

## Next steps
Release only after named acceptance, side-effect audit and final validation disposition. No extra feature backlog; no background autosave or save-and-run follow-up in this plan.

## Unresolved questions
None at planning time. Runtime/browser infrastructure availability must be established by implementation owner and any actual blocker listed in terminal release report.
