# Phase 05 — testing, verification and release audit

## Context links

[Plan](./plan.md) · [Architecture/invariants](./architecture-design.md#preservation-and-release-invariants) · [Backend research](./research/researcher-01-backend-schema-exec.md) · [Frontend research](./research/researcher-02-frontend-matrix-ui.md) · [Release gates](../../docs/release-gates.md) · [Code standards](../../docs/code-standards.md#testing-standards)

## Overview

- Priority: P2 · Status: Pending · Estimate: 5h.
- Prove the complete schema/edit/run/artifact flow; retire obsolete board/form assertions and reconcile architecture, docs and consumers. Use deterministic unit/API fixtures, then actual Control Page browser interactions, then full repo gates once integration is stable. No production Jenkins/network access.

## Key insights

- Existing tests cover legacy V1 configs, groups, form cloning, board, ETag, API run/SecretStore redaction, worker pools, aggregate/history/deletion and Chromium/WebKit e2e. Update consumer-visible contracts; delete implementation/wording-only tests tied to removed cards or form.
- Report artifact manifest/aggregate strict validators and history/deletion routes are as important as the new run engine: two virtual targets must stay independently discoverable and deletable without affecting sibling/history.
- Project docs currently say per-project run type, one `jobUrl`, and two all-enabled buttons. They remain true for direct CLI/old API, but must be carefully revised for the matrix-mode control UI after implementation; avoid implying new behavior is shipped before then.

## Requirements

1. Unit/API tests cover V1 zero-write projection, complete matrix validation, field preservation, edit transitions, saved ETag conflict, request gates, deterministic batch selection, mode precedence, blank skip, bounded concurrency, report path/aggregate isolation, redaction and rollback-read limitations.
2. E2E browser verifies **only** one flat editor, column CRUD + row URL editing + selections and Save/reload, advanced/default editing and invisible group retention, clone/add/remove, both explicit run buttons, per-target outcome/viewer links, dirty/invalid/running locks, small viewport/keyboard/axe in Chromium and WebKit.
3. Smoke run actual Control Page against isolated config and fixture roots: observe table/edit/Save/reload, one report run and one auto-build run, independent report directories/aggregate entries and failure/skip behavior. Tests alone are insufficient; no real Jenkins side effect.
4. Remove obsolete board/form exports/tests/docs/code and scaffolds. Update config/architecture/system architecture, report pipeline, code standards and user-facing README as relevant to shipped state; preserve old CLI/API contract description explicitly. Ensure every affected module <200 LOC, TS strict, kebab-case for new filenames, docs <800 lines.

## Architecture

Verification pyramid: pure validators/transitions -> in-process API/store/run manager with injected workers and isolated filesystem -> report fixture artifact/history/viewer -> browser Control Page Chromium/WebKit -> full release gates. Use snapshots only where they protect semantic output, never replace behavior tests. Ensure all fresh artifact directories/scratch configs are isolated and cleaned; no production credentials.

## Related code files

| Action | Path | Planned change |
| --- | --- | --- |
| Modify | `tests/unit/project-config.spec.ts`, `tests/unit/config.spec.ts`, `tests/unit/control-config-api.spec.ts` | V1/matrix schema and guarded round-trip, mirror, fields and strict validation. |
| Modify | `tests/unit/config-document-editor-groups.spec.ts`, `tests/unit/control-hooks-and-types.spec.ts`, `tests/unit/clone-project-draft.spec.ts` | State lifecycle, clone and preservation, group compatibility. |
| Modify/delete obsolete tests | `tests/unit/control-grouped-project-board.spec.ts`, `tests/unit/control-atomic-components.spec.ts` | Replace board/card/form-only checks with matrix actions; keep useful unrelated contracts. |
| Modify | `tests/unit/control-run-api.spec.ts`, `tests/unit/control-run-executor-secrets.spec.ts` and actual worker/artifact/deletion suites | Request gates, saved resolution, pool ordering, redaction, two-report isolation/history and no retry. |
| Modify | `tests/e2e/control-page.spec.ts`, report-management/viewer e2e suites if affected | Real browser table, two explicit report/build actions, accessible UI, flat artifact index links/history. |
| Modify after shipping | `docs/architecture.md`, `docs/system-architecture.md`, `docs/multi-project-configuration.md`, `docs/report-pipeline.md`, `docs/code-standards.md`, `docs/release-gates.md`, relevant `README.md` section if present | Reconcile shipped contracts, diagram/selection differences, compatibility caveat, verification procedures. |
| Delete after integration | Unused board/form components and alias exports listed in Phase 02; obsolete tests/assets only when behavior replaced. |

## Implementation steps

1. Before changes, capture representative schema-v1 fixture with group membership, defaults, project advanced fields, scalar URL, disabled project, explicit waits. Assert GET does not rewrite bytes/ETag and one-cell projection is deterministic. Keep old V1 CLI report/build selection tests intact.
2. Test schema limits/edge cases: 50 projects × 50 columns within size bound, 16-character safe column IDs, URL containing credentials/query/outside Jenkins base, duplicate headings, mismatched mirror, stale selection, whitespace cells, all URLs blank, prototype key, invalid raw Apply. Assert preserved metadata and direct CLI primary behavior after Save.
3. Exercise column add/rename/remove-with-confirm, row ID edit then cell edit, multi-row selection differences, clone independence, disabled/group/default retention, no-op dirty behavior, valid Apply revision, invalid Apply unchanged state, Save acknowledgement and 409/412 local draft preservation. Test unselected URL never executes.
4. Test API security (Host/Origin/CSRF, non-JSON, >1 MiB body), invalid/duplicate/unknown/disabled coordinates, ETag race, mixed mode legacy `runType` override for matrix but legacy API/CLI still gated, all-blank rejected, workerCount rejection. Inject controlled pool completion order and one injected failure; assert request order independence, document order outcomes, cap 1–4 and one-active-run behavior.
5. Run fixture report with two selected columns on one project; assert distinct `<reportRoot>/<targetId>/<runId>` dirs, separate manifests and aggregate entries, project/column/URL provenance, correct links/viewer and old history retained. Verify one target's report deletion does not affect sibling; collision with real/historical identity rejects before unsafe publish; root lock and incomplete discovery fail closed. Verify auto-build two distinct guarded submissions with stages/unknown-after-POST classification and no retries, secrets redacted everywhere.
6. Start actual loopback Control server using isolated config/SecretStore and checked-in exact fixture routes; in Chromium and WebKit inspect/edit/Save/reload matrix, select independent row columns and trigger each explicit report/build button. Inspect rendered matrix at desktop/mobile zoom, focus behavior, keyboard, screen reader labels and axe. Confirm old board/form and group-management controls absent, advanced/default editing reachable, `projectGroups`/`groupId` survive Save, blank-cell skip feedback and per-target results appear in the existing flat report index.
7. Run scoped tests first then project-wide typecheck/lint/unit/e2e/build **once after** all code lands; use exact existing npm scripts documented in `package.json`/release gates. Fix failures, repeat relevant scopes and final gates. Review diffs for missing callers, dead exports, old labels and docs; update diagrams and source documentation to shipped behavior, retain backup guidance for old binary rollback. Measure <200 LOC production modules and <800-line Markdown changes.

## Todo list

- [ ] Schema/migration/edit/ETag behavioral regressions with real configs.
- [ ] Batch API/worker/redaction/security/report history proofs with fixture infrastructure.
- [ ] Actual UI Chromium/WebKit smoke, axe, keyboard and narrow/wide matrix evidence.
- [ ] Delete legacy board/form/caller/test scaffolds and reconcile docs/architecture diagrams.
- [ ] Scoped and integrated release gates pass; publish verified compatibility note.

## Success criteria

- Test outputs prove V1 loads intact and first Save retains all fields + `jobUrl`; matrix Save/reload keeps headings/URLs/selections. Old CLI mode behavior remains stable for updated binary; strict older-binary limit documented.
- In-process/fixture report confirms two distinct safe artifacts and aggregate identities with preserved history and names/URLs; build confirms two ordered independent outcomes and no duplicate POST. CSRF, ETag, URL safety, redaction and worker bounds remain enforced.
- Browser observation verifies only one project editing surface, accessible horizontal scroll, two explicit report/build actions and working saved-field/settings flows without group-management UI. Final release gate results and documentation correspond to actual shipped code.

## Risk assessment

- **Old tests lock UI wording:** delete/replace test assertions of removed implementation, keep only user-visible contracts.
- **Fixture setup misses multi-column identity:** assert filesystem/manifest/index and report viewer, not just run status or mocked echoes.
- **Older binary reads expanded config:** back up V1 originals, document explicit export/manual rollback need; do not downgrade schema silently or erase matrix fields.

## Security considerations

- Fixture URLs only; no production Jenkins or credentials in committed files or logs. Assert secret values absent in status/logs/manifests/screenshots and URLs, not merely placeholders. Keep bounded GET/POST, control CSRF/Host/Origin gates, canonical artifact paths and safe deletion preflight under report lock. Confirm disabled projects and unsafe URLs never trigger network operations.

## Next steps

- Release only after all success criteria and documented rollback path. Post-implementation compare shipped code to architecture and revise any intentional drift; no unfinished follow-up disguised as acceptance.

## Real remaining decisions

- Verify whether existing historical artifact IDs collide with proposed virtual IDs in deployment data; choose fail-closed rejection or explicitly reviewed archive procedure before cutover.
- Identify any older external binary consumers needing separate matrix-to-legacy export; updated repository CLI is compatible but old strict binaries are not.
