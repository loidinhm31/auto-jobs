# Phase 04 — Verification and caller migration

## Context links

- [Plan](./plan.md) · [Index phase](./phase-01-persistent-aggregate-index-builder.md) · [API phase](./phase-02-control-reports-delete-api.md) · [UI phase](./phase-03-control-ui-navigation-and-deletion.md)
- [Backend research](./research/researcher-01-report.md) · [Frontend research](./research/researcher-02-report.md) · [Release gates](../../docs/release-gates.md) · [Code standards](../../docs/code-standards.md)
- Existing tests: `tests/unit/{sequential-runner,reporting-output,artifact-paths,artifact-lifecycle,report-root-lock-owner,report-server,control-assets-routing,control-secrets-security}.spec.ts`, `tests/e2e/{control-page,generated-report,multi-project-report-flow}.spec.ts`.

## Overview

- **Date:** 2026-09-24. **Description:** Migrate consumers to persistent index and DELETE contracts, prove user-visible behavior and safety with focused unit/API/browser tests, then run final integrated release gates. **Priority:** P2. **Implementation status:** DONE (100%; completed 2026-09-25). **Review status:** approved (9.8/10).
- **Verification evidence:** `npm run test:unit` 443/443, `npm run test:control` 34/34, and `npm run test:report` 5/5 passed; typecheck passed with 0 errors. See [test report](../reports/phase04-tester-260925-0048-verification-and-caller-migration.md) and [review](../reports/code-review-260925-0053-phase-04-verification-and-caller-migration.md).

## Key Insights

- `npm run serve:control` builds and runs `.runner-build/reporting/report-server-cli.js --control`; same server serves `/reports/*`. `serve:report` is a separate read-only mode.
- Existing tests assert generated aggregate and root pair rollback, but no end-to-end switch between configs or deletion. `tests/unit/reporting-output.spec.ts` and `sequential-runner.spec.ts` are primary contract migration points.
- Persisted index has no JS (`REPORT_CSP`), while control mode serves the exact `/reports/index.html` as a CSRF-bearing React management route (`CONTROL_CSP`). Browser delete flow must exercise this page and observe actual disk state, not merely mocked fetch success.
- Project-wide validation is deferred until all integration changes land; narrow behavioral proofs first. Remove obsolete outcome-only/wording tests rather than pin old behavior.

## Requirements

### Functional

1. Verify persistent valid rows and links after successive disjoint config runs; newest-first history, >50 historical IDs, zero remaining projects, malformed runs excluded with bounded warnings. On incomplete discovery or >16 MiB staged output, verify old pair is not silently replaced and project files stay on disk.
2. Verify API status/side-effect matrix: 200 and validated `deletedRunsCount`; 400 invalid ID; 403 Host/Origin/Fetch Metadata/CSRF; 415 wrong media type; 405 unsupported method; 404 no history/repeated delete; 409 live lock; 500 partial deletion or publication failure with recovery attempt. All unaffected trees/config/staging/assets stay byte-for-byte intact.
3. Verify browser navigation to `/reports/index.html`, per-project 20-run pagination independently for multiple projects (including 0/20/21, last/first page and post-refresh clamps), historical links and confirmed delete **on that page**, keyboard/focus, loading/error/empty states, configured and unconfigured history deletion, plus static read-only report mode.
4. Migrate all callers/tests/docs referring to outcome-only aggregate or “configured project” index; preserve report runner return semantics and no auto-build report writes.

### Non-functional

- Deterministic temp roots, scoped fault injection and in-process loopback servers; no real Jenkins, external secrets, or user artifact mutation. Cross-platform symlink/junction cases conditional on platform privileges and explicit Windows behavior.
- Tests defend observable changes/negative boundaries, not source strings, forwarded mock echoes, or tautological UI assertions. Run project-wide checks once after integration, not during parallel editing.

## Architecture

### System design

- Existing Playwright unit config for pure builder/runner/filesystem/API; in-process Control server for HTTP security and lock tests; browser E2E `control-page.spec.ts` for operator flow; read-only server test for GET/HEAD boundary. Use phase 01 builder across runner/API; no per-test alternate implementation of aggregate generation.

### Component interactions

- Two injected runner executions sharing root → compare both published artifacts → Control Reports page DELETE with real token → compare filesystem and pair contents → report-only mode serves static saved index and rejects mutation. Hold/release shared lock in same and separate processes when testing concurrency.

### Data flow

- Temporary validated manifests → discovered grouped aggregate → staged/backup/journal pair → guarded mutation → surviving validated manifests → refreshed pair + UI inventory. Test 404/409/500 and recovery against on-disk state, not only HTTP codes.

## Related code files

- **Modify:** `tests/unit/sequential-runner.spec.ts`, `reporting-output.spec.ts`, `artifact-paths.spec.ts`, `artifact-lifecycle.spec.ts`, `report-server.spec.ts`, `control-assets-routing.spec.ts` where contract assumptions change; `tests/e2e/control-page.spec.ts`, `generated-report.spec.ts`, `multi-project-report-flow.spec.ts` for full user journey; `docs/architecture.md`, `docs/system-architecture.md`, `docs/code-standards.md` and relevant user docs only if design or shipped behavior needs reconciliation. Keep documentation changes within `docs/`.
- **Create:** focused `tests/unit/aggregate-index-builder.spec.ts` (cross-config/latest/empty/bounds) and `tests/unit/control-reports-api.spec.ts` (deletion/path/security/lock/recovery), if existing suites cannot host concise behavior tests. Test helpers only as needed for isolated fixtures.
- **Delete:** obsolete assertions of “ignored unconfigured” or outcome-only project counts and throwaway smoke scripts; no unrelated test/docs files.

## Implementation Steps

1. Trace actual imports/scripts of runner, aggregate publisher, renderer, server router and Dashboard props with targeted searches; migrate all consumers of changed contracts. Do not replace public import paths or create compatibility aliases unless a verified external contract requires them.
2. Build isolated fixtures with ≥2 valid projects and multiple immutable runs, one malformed manifest, a configured run-less ID, a historical-only ID, shared assets/config/staging canaries. Run A, then disjoint B, then rebuild to assert both history and latest state in JSON+HTML; test deterministic newest-first ordering, no fake link, warning sanitization, >50-project cap, and incomplete/oversize publication fail-closed without losing the prior pair.
3. Verify empty aggregate: delete final eligible project, assert schema v3 `projects: []`, valid `index.html` empty message, and both files published. Ensure existing publisher rejects malformed nonempty row and still rolls back both outputs.
4. Exercise API matrix via loopback server and actual filesystem: valid CSRF bodyless/JSON request, invalid/encoded/trailing IDs and reserved names, path prefix siblings, case sensitivity, symlink child and nested symlink/junction, protected root files/other projects; assert no mutation on rejection. Verify valid project deletion removes adjacent invalid files safely while counting only validated runs. Incomplete discovery refuses deletion. Repeated delete returns 404. Test same-root lock across competing deletes and active runner; 409 arrives without exposing lock internals.
5. Inject removal failure after partial deletion and pair publication failure; assert 500, bounded diagnostic, lock released, remaining valid manifests drive refreshed pair where possible. If forced refresh also fails, recover journal on next run and assert no corrupt mixed pair; do not assume deleted files reappear.
6. Run browser against real local Control server: Reports header link opens `/reports/index.html` (interactive control view), lists all retained projects, and pages each run history 20 at a time without changing siblings' page state. Confirm deletion there via Radix dialog; verify back link, focus/escape/cancel, destructive wording, CSRF request, in-flight disabled controls, 404/409/500 feedback, empty state and aggregate refresh. Verify `/reports/aggregate-data.json` and on-disk saved HTML match surviving projects. Control GET/HEAD route/CSP vs report-mode static GET/HEAD/CSP remain distinct.
7. Start report-only server separately and assert GET/HEAD serve retained reports while DELETE on `/api/reports/projects/id`, `/reports/index.html`, and project file paths cannot mutate anything. Confirm no files under staging/config/shared assets/sibling trees change after successful deletion.
8. Reconcile architecture/system docs against actual implementation (design gate already documented); update user-facing report-control/release guidance and remove obsolete copy. Check <200 lines for new/materially changed TS modules, kebab-case except existing React component convention, ESM `.js` imports and Markdown <800 lines.
9. Run focused tests and real smoke first, then integrated `npm run typecheck`, `npm run build`, targeted Playwright unit/E2E configs, and project release gate once all slices complete. Record exercised commands/results and browser observations; fix regressions before marking phase complete.

## Todo list

- [x] Migrate all known callers/obsolete aggregate assumptions.
- [x] Cover multi-run history, invalid manifests, empty/large index.
- [x] Cover DELETE route/security/filesystem/concurrency/fault recovery.
- [x] Cover Control browser UX plus report-only read-only boundary.
- [x] Reconcile docs and run final integrated gates once.

## Success Criteria

- **Definition of done:** All named acceptance scenarios pass on isolated roots; no malformed/traversal/symlink input deletes outside selected project; aggregate pair matches surviving history including empty state; configured/unconfigured reports are manageable at `/reports/index.html` in control mode; report-only index stays static and read-only.
- **Validation methods:** targeted unit/API commands, Chromium/WebKit Playwright UI scenario with actual disk comparisons, integrated typecheck/build/release gate after all code merges. Keep direct smoke evidence of both publication and deletion.

## Risk Assessment

- **Platform path semantics:** Windows reparse/link creation privileges vary; test supported link types conditionally and fail closed in production; avoid assumptions based solely on POSIX.
- **Partial failure:** deterministic fault injection observes real state and index recovery rather than fake transactional rollback.
- **Test flakiness under lock:** use explicit barriers/fakes for heartbeat and acquisition contention, no arbitrary sleeps; separate-process case validates cross-process shared lock.
- **Overlarge history:** enforce bounds without silently dropping eligible projects; surface discovered-budget warnings and fail closed for deletion when inventory incomplete.

## Security Considerations

- **Auth/authorization:** in-process HTTP tests cover Host, same-origin HTTP(S) Origin, Fetch Metadata, timing-safe CSRF, content-type and loopback-only binding. UI disable is not security enforcement.
- **Data protection:** assert no config/secrets, sibling reports, staging or assets are touched; bounded sanitized errors do not include raw paths or secret values; serve:report exposes GET/HEAD only.

## Next steps

- Phase complete 2026-09-25. Main owns the once-only post-integration `npm run test:release` gate after all workstreams land.
