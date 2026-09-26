# Phase 04 — Verification and documentation

## Context links

[Parent plan](./plan.md) · [Architecture](./architecture-design.md) · Dependencies: Phases [01](./phase-01-group-schema-and-document-state.md), [02](./phase-02-compact-grouped-project-board.md), [03](./phase-03-clone-project-draft.md)

## Overview

Date: 2026-09-26. Priority P2. Status: DONE. Completed: 2026-09-27T02:40:00+07:00. Implementation complete; verification and review complete. Persisted project groups, column scrolling, and safe project draft cloning verified across unit suites, Control E2E, and real-browser smoke scenarios.
## Key Insights

Existing tests/e2e/control-page.spec.ts launches the real control server using temporary config/report roots and injected offline executors. playwright.control.config.ts covers Chromium/WebKit. package.json test:control explicitly lists current files, so adding an E2E file without updating that script would skip it.

## Requirements

Run consolidated checks after changes, not mid-flight. Real browser smoke mandatory; test assertions/source snapshots alone do not prove nested scrolling. No live Jenkins calls, production config writes, secret changes, or report deletion. Durable tests only for consumer-visible boundaries and uncertain transitions.

## Architecture

Use existing temporary-directory/in-process server patterns for HTTP persistence contracts. Add behavioral schema/transition coverage to current relevant suites; narrow new unit file only for group/clone transition boundaries. Reuse current E2E fixtures rather than duplicate server scaffolding. Browser smoke may use a throwaway server/scenario and synthetic data, removed after proof.

## Related code files

Inspect/update where contracts changed:
- `tests/unit/project-config.spec.ts`: legacy/new schema acceptance and invalid group metadata.
- `tests/unit/control-config-api.spec.ts`: real PUT/GET group roundtrip and stale ETag rejection with preserved disk content.
- `tests/unit/control-hooks-and-types.spec.ts`: document replacement and mutation behavior if appropriate to existing harness.
- `tests/unit/control-atomic-components.spec.ts`: remove incidental layout/source-copy expectations encountered, never repin them to new markup.
- `tests/e2e/control-page.spec.ts`: preserve existing consumer scenarios when locators/contracts change. Extend only where permanent regression coverage is warranted.
- New `tests/unit/control-project-transitions.spec.ts`: membership move/delete invariants, clone identity bounds, nested mutation independence, latest-state cap/collision rejection.

Documentation after smoke:
- `README.md`: compact groups and clone operator workflow in current control section.
- `docs/multi-project-configuration.md`: optional projectGroups/groupId, schema example, limits and rollback caveat.
- `docs/architecture.md`: replace planned-design pointer with accurate implemented status; stay within 800 LOC.
- `docs/system-architecture.md`, `docs/codebase-summary.md`: targeted updates to directly changed control model/component descriptions; do not expand unrelated sections or worsen existing size limits.
- `docs/project-overview-pdr.md`, `docs/release-gates.md`, `docs/project-roadmap.md`: acceptance evidence and status only after behavior is exercised.

No package/dependency change expected. Example configs remain valid ungrouped; show optional metadata in documentation instead of modifying operator files.

## Implementation Steps

1. Review affected suite harnesses; remove tests that only assert source strings/wording/incidental markup. Keep/update actual interaction contracts. Use focused permanent tests for:
   - Legacy omission, empty groups, safe unique IDs, malformed/null fields, dangling refs, disallowed defaults, group/project capacity limits.
   - Move A to B, uncheck to Ungrouped, delete occupied group, rename, invalid target/selection; preserve project order, unrelated fields and source input objects.
   - Max-length clone ID/name, existing copy suffix collisions, full capacity, nested clone/source independence and absent inheritance; disabled ungrouped clone after Save Project.
   - Config API exact roundtrip, stale If-Match conflict and no lost disk updates. Reuse existing security tests rather than duplicate them.
2. Run `npm run typecheck`, `npm run build`, `npm run test:unit`, then `npm run test:control` once after integration. Existing scripts include Chromium/WebKit control scenarios. For any reported failure, diagnose observed output rather than rerun merely to confirm.
3. Launch the actual control CLI against temporary config/report directories using supported options discovered in `report-server-cli.ts`; do not point smoke mutations at user's files. Exercise the built dashboard with the browser tool in addition to automated suites. Verify default `npm run serve:control` launch behavior remains intact without running jobs.
4. Browser scenario: legacy config shows Ungrouped; create empty group, select projects, move between two groups, cancel edit, rename, delete-to-Ungrouped. Save and reload, open second browser context, confirm persisted membership. Switch between two configs with overlapping project IDs; no metadata/draft leakage. Valid raw Apply updates board; invalid Apply leaves applied model intact. Same-file Reload/valid Apply dismiss pending dialogs and clone drafts.
5. Layout smoke: 50 projects distributed across 6 groups, include long identities/URLs and empty group. Capture desktop and narrow viewport screenshots plus zoom/keyboard checks. Vertically scroll a full column to its last project; verify neighboring scroll position unchanged. Horizontally reveal last group; page body must not overflow. Verify all controls usable, focus visible, dialogs escape/return focus, no focus trap in scroll lists.
6. Clone smoke: choose a configured auto-build source with nested options and inherited defaults, open clone, edit then Cancel; confirm source/model/disk unchanged. Clone again, verify unique identity and disabled/ungrouped state, edit fields, Save Project then global Save/reload. Confirm source unchanged and no `/api/run` or secrets-value requests. Exercise cap/duplicate-ID errors and replacement while draft open; ordinary group edits must retain clone draft.
7. Run existing offline execution-selection checks: grouping cannot change enabled/runType targets or ordering, and disabled clone stays excluded. Keep last-enabled and dirty-config run gates.
8. After browser proof, update documentation/status with exact observed commands/scenarios and limitations. Remove throwaway smoke scripts/data/services; do not delete user fixtures. Review affected callsites/types/docs, keeping unrelated behavior unchanged.

## Todo list

- [x] Boundary/transition and persistence regression coverage.
- [x] Typecheck/build/unit/control checks after integration.
- [x] Actual browser grouping/clone/scroll/accessibility smoke.
- [x] Evidence-backed documentation and final review.

## Success Criteria and Verification Results

All acceptance criteria exercised across unit, E2E, and real-browser environments:
- `npm run typecheck`: passed (0 errors)
- `npm run build`: passed (TypeScript + Vite bundle 2.68 MB)
- `npm run test:unit`: 593/593 passed (includes 15 in `tests/unit/control-project-transitions.spec.ts`, 12 in `tests/unit/control-config-api.spec.ts`)
- `npm run test:control`: 44/44 passed across Chromium and WebKit
- Browser smoke: 7/7 scenarios verified:
  1. Legacy configs without groups display in "Ungrouped".
  2. Group CRUD: Create, rename, delete (safely ungroups members), and membership moves.
  3. Multi-context persistence: changes survive reload and second browser context.
  4. Config switching preserves isolation without leaking drafts or metadata.
  5. Bidirectional raw JSON sync preserves form edits.
  6. Project cloning creates independent disabled/ungrouped draft with collision-safe ID.
  7. Compact layout: 50 projects across 6 groups with independent vertical scrolling per column and horizontal board scroll.
- Documentation synced across `README.md`, `docs/multi-project-configuration.md`, `docs/architecture.md`, `docs/codebase-summary.md`, `docs/project-overview-pdr.md`, `docs/release-gates.md`, `docs/project-roadmap.md`, `docs/system-architecture.md`.

## Risk Assessment

Tests passing cannot establish compact layout or scroll usability. Fake forwarding/mocked echoes cannot establish saved group data; assert real server/disk roundtrip. Test script explicit file list can silently omit new E2E suites; prefer current suite or update every relevant invocation if splitting becomes necessary.

## Security Considerations

Use synthetic credential references only. Existing origin/CSRF/If-Match checks must remain active. No real browser credentials, secret values, report history, or network Jenkins interaction in artifacts/screenshots.

## Next steps

All 4 phases complete. Feature ready for release.

## Unresolved questions

None.
