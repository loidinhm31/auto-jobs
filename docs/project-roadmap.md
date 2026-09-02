# Project roadmap

Last updated: 2026-09-02T14:30:11+07:00  
Plan: [Jenkins Control Page and Auto-Build](../plans/260902-0251-jenkins-control-page-and-auto-build/plan.md)

## Overall status

- Status: **In progress**
- Progress: **31%** (16 of 52 weighted planned hours; 2 of 5 phases complete)
- Current milestone: **Phase 2 — Jenkins auto-build workflow DONE**
- Phase 2 completed: **2026-09-02T14:30:11+07:00**

## Phase progress

| Phase | Status | Progress | Effort | Evidence/detail |
|---|---|---:|---:|---|
| 1. Configuration and run contracts | Completed | 100% | 6h | [Phase 1](../plans/260902-0251-jenkins-control-page-and-auto-build/phase-01-configuration-run-contracts.md) |
| 2. Jenkins auto-build workflow | **DONE** | **100%** | 10h | [Phase 2](../plans/260902-0251-jenkins-control-page-and-auto-build/phase-02-jenkins-auto-build-workflow.md) |
| 3. Build-page fixture and routes | Pending | 0% | 8h | [Phase 3](../plans/260902-0251-jenkins-control-page-and-auto-build/phase-03-build-template-fixture.md) |
| 4. Control Page server, API, and UI | Pending | 0% | 18h | [Phase 4](../plans/260902-0251-jenkins-control-page-and-auto-build/phase-04-control-page-server-and-ui.md) |
| 5. Verification, quality gates, and docs | Pending | 0% | 10h | [Phase 5](../plans/260902-0251-jenkins-control-page-and-auto-build/phase-05-verification-and-documentation.md) |

## Phase 2 milestone

Delivered the isolated, target-branch auto-build path:

- Reuses validated Jenkins login and exact configured `jobUrl` navigation.
- Validates the scoped **Build with Parameters** link and **Build** button/form before any side effect.
- Observes exactly one build POST and classifies `submitted`, `rejected`, or `submission-unknown` without automatic retry.
- Keeps auto-build execution separate from report capture; `npm run report` excludes auto-build projects.
- Uses a fresh browser context, bounded cleanup, and secret-redacted outcomes.

Validation evidence:

- [Tester validation](../plans/reports/tester-260902-1302-phase-02-jenkins-auto-build-workflow.md): fresh `npm test` passed with 190 unit and 5 e2e tests; direct full Playwright run passed 201 tests.
- [Code review](../plans/reports/code-review-260902-1311-phase-02-jenkins-auto-build-workflow.md): 10/10, no critical issues or warnings; all modified production files remain below 200 lines.

The earlier failed test run is superseded by the fresh passing rerun; no Phase 2 blocker remains. Live Jenkins execution remains intentionally outside deterministic validation and requires the [preflight contract](../plans/260902-0251-jenkins-control-page-and-auto-build/preflight-contract-and-side-effects.md).

## Next milestones

1. **Phase 3 — Build-page fixture and routes (0%)**: add the bounded build-detail fixture and exact GET/POST route map.
2. **Phase 4 — Control Page server, API, and UI (0%)**: expose loopback-only config/run controls with CSRF, ETag, and sanitized DTO boundaries.
3. **Phase 5 — Verification, quality gates, and docs (0%)**: complete cross-browser/UI/security evidence and release documentation.

## Changelog

### 0.1.0 (development) — 2026-09-02

- Completed Phase 2 Jenkins target-branch auto-build workflow at 100%.
- Recorded exactly-once POST and unknown-after-POST safety semantics.
- Updated plan status/progress and linked validation/review evidence.

## Unresolved questions

None.
