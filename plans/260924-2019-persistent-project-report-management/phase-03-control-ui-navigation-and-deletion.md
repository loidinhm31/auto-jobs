# Phase 03 — Report management page navigation and deletion

## Context links

- [Plan](./plan.md) · [Phase 01 aggregate JSON](./phase-01-persistent-aggregate-index-builder.md) · [Phase 02 DELETE contract](./phase-02-control-reports-delete-api.md) · [Frontend research](./research/researcher-02-report.md) · [Architecture, UI](../../docs/architecture.md)
- Existing UI/server: `src/reporting/control-page/App.tsx`, `pages/DashboardPage.tsx`, `components/organisms/{HeaderBar,CredentialsDialog}.tsx`, `hooks/useControlApi.ts`, `src/reporting/report-server-control.ts`, `src/reporting/report-server-control-page.ts`.

## Overview

- **Date:** 2026-09-24. **Description:** Navigate from dashboard to an interactive report management page at `/reports/index.html` in control mode; allow confirmed deletion of any retained project on that page. **Priority:** P2. **Implementation status:** DONE · 2026-09-24. **Review status:** approved (9.5/10).

## Key Insights

- The persisted `reports/index.html` is scriptless under `REPORT_CSP`; do not embed a mutation token/script into that file or relax report-only serving. In control mode, intercept the **exact** `/reports/index.html` route before `/reports/*` static dispatch and serve the existing CSRF-bearing React HTML shell with `CONTROL_CSP`; `/reports/<id>/<run>/...` remains immutable static evidence.
- `App.tsx` currently renders only `DashboardPage`. Path-based selection for the one management route avoids a new router dependency. Reuse the control bundle, existing `useControlApi` for DELETE, Button and Radix Dialog patterns.
- The report management page reads published `/reports/aggregate-data.json` directly (same origin), independent of active config. Historical-only IDs stay manageable after config changes. Treat absent index as a true empty state, but surface invalid/missing inventory clearly.
- This changes control-mode rendering of `/reports/index.html`; verify existing consumers expecting static markup there and retain their observable heading, project links and history table in the React view. Report-only mode and the persisted HTML remain unchanged.

## Requirements

### Functional

1. Dashboard header links to `/reports/index.html` in the same tab regardless of config state. Management page has a visible link back to `/`.
2. At `/reports/index.html` in control mode, list **all** retained validated projects from published aggregate JSON, including those absent from selected config, with name/ID, latest report link (if valid), historical run count and a separate **Delete Reports** action per project. Paginate each project's newest-first runs independently, 20 per page, with accessible previous/next and page count; never truncate the underlying inventory.
3. Confirmation explicitly states all historical report files for the named project are permanently removed while project configuration and other projects remain. Cancel leaves disk and UI unchanged.
4. Bodyless CSRF-bearing DELETE to `/api/reports/projects/${encodeURIComponent(projectId)}` displays pending/error/404/409 feedback and prevents duplicate submission. On success, reload aggregate JSON and update rows/counts without losing page location; deleting the last project shows a real empty state.
5. No destructive UI in persisted static HTML. `serve:report` remains read-only; the React management page is control-mode only. If no index has been generated yet, show no projects and do not expose DELETE for guessed IDs.

### Non-functional

- Accessible labeled Radix dialog with focus trap/restore, cancel/confirm, error announcement and disabled confirm while pending. Links use existing safe relative URL policy and React text escaping, not untrusted URL string concatenation.
- No duplicate report store, bundle, router, fetch/CSRF implementation, or new auth scheme. Client pagination slices the already-published bounded `runs` array and limits rendered DOM only; it does not relax the 5,000-manifest discovery or 16 MiB static file cap.

## Architecture

### System design

- Special-case control `GET`/`HEAD /reports/index.html` before report subtree dispatch. Return matching control-shell headers and content length for both, but no body for HEAD. Call `renderControlPageHtml(context.csrfToken)` and apply control headers; existing root `/` and `/assets/control-page.{js,css}` remain available. In React `App`, choose `ReportManagementPage` only when `location.pathname === '/reports/index.html'`, otherwise Dashboard. Report-only and all other static file routes retain existing GET/HEAD semantics.

### Component interactions

- Dashboard `HeaderBar` anchor → control management route → `ReportManagementPage` loads static published JSON → project rows and validated relative report links → shared confirmation dialog → `useControlApi` DELETE → API republishes pair → page refreshes inventory. Back link restores dashboard; no config mutation.

### Data flow

- Aggregate project ID/name/state/runs feed rendering only; DELETE request carries encoded ID, and backend independently checks CSRF, validity, lock and filesystem. JSON cache policy remains no-store. Management route never puts token into persisted `reports/index.html`.

## Related code files

- **Modify:** `src/reporting/report-server-control.ts` (exact control-mode route before `/reports/` branch); `src/reporting/control-page/App.tsx` (path selection); `src/reporting/control-page/components/organisms/HeaderBar.tsx` (Reports anchor); `src/reporting/control-page/types/component-contracts.ts` only if actual shared props require it.
- **Create:** `src/reporting/control-page/pages/ReportManagementPage.tsx` (existing PascalCase component convention); `src/reporting/control-page/components/organisms/DeleteReportsConfirmationDialog.tsx` and a small `hooks/useDeleteReports.ts` only if needed to keep page under repo size target. Reuse existing control bundle and API hook.
- **Delete:** no obsolete dashboard deletion UI (none exists); do not modify static `src/reporting/project-report-renderer.ts` to carry scripts/tokens.

## Implementation Steps

1. Add a visible native Reports link in dashboard header; keep active-config state unchanged. Add explicit back-to-dashboard navigation to management page.
2. Register control-only exact GET/HEAD `/reports/index.html` handler before the static `/reports/*` branch using `renderControlPageHtml` and `writeControlSecurityHeaders`. HEAD returns matching metadata but no body. Keep Host validation; preserve static file behavior for all other routes and entire `serve:report` mode.
3. Select `ReportManagementPage` in `App` based on exact pathname, no additional router. Fetch `/reports/aggregate-data.json` with no-store; handle 404 before first run, valid empty `projects: []`, corrupt JSON and failed fetch distinctly.
4. Render persisted aggregate projects and historical run links using safe path helpers; display warnings/count/latest state and allow per-project deletion only for verified nonempty historical entries. For each project store its own page index, slice 20 newest-first runs, show accessible previous/next and "Page X of Y" state, reset/clamp the page after refresh/deletion and hide paging controls when ≤20. Never use current config cards as management inventory.
5. Build a dedicated Radix confirmation dialog with clear permanent-delete warning, cancel, labeled danger confirm, focus and error state. Use `requestJson<{success:true; projectId:string; deletedRunsCount:number}>` and bodyless DELETE, no content-type; block second click while pending.
6. On success refetch aggregate and show confirmation/count. On 404 refresh stale inventory; on 409 show busy/retry-manually hint; on 500 show failure without assuming disk rollback. Refresh after page revisit; preserve linkable immutable run URLs.
7. Keep page/module sizes reasonable and match existing Button/Dialog styling; phase 04 tests actual browser, persisted/static vs control view, success/error/empty states and disk side effects.

## Todo list

- [x] Add control-only report management route and exact React path selection.
- [x] Add dashboard Reports link and management back link; render full validated inventory.
- [x] Add per-project danger action, accessible confirmation and guarded DELETE flow.
- [x] Page historical run lists independently by 20, including last/empty page transitions; refresh surviving history and verify read-only modes stay intact.

## Success Criteria

- Operator clicks Reports in control header, reaches `/reports/index.html`, sees projects retained across configs, pages through each project's historical runs 20 at a time, and deletes exactly one project on that page after confirmation. Index JSON/HTML on disk refresh; project config and sibling reports unchanged. Report-only mode serves scriptless saved index with no action.
- **Validation:** Real control server browser flow (Chromium/WebKit) on isolated report root plus direct GET/HEAD and CSP checks in control/report modes, API/lock tests and disk inspection in phase 04.

## Risk Assessment

- **CSP mismatch:** control route must serve control headers and CSRF-bearing shell, while report-only and immutable artifacts stay report-CSP static. Test every route boundary and ensure no token is serialized to persisted reports.
- **Stale/invalid aggregate:** empty only on true not-yet-created index; no DELETE enabled for failed parsing or stale guess. API lock/404 remains authoritative.
- **Overlarge UI:** bounded index and browser rendering; use existing component patterns, no duplicate config-card inventory.

## Security Considerations

- Control origin, Host gate, CSRF, fetch metadata and Origin guard remain mandatory for DELETE; UI disabling is not authorization. React escapes project labels, links use safe relative-path helper, IDs are encoded only for transport. No automatic DELETE retry.

## Next steps

- Phase 04 verifies persisted static snapshot and live control management page against same retained inventory, deletion flows, keyboard behavior and report-only isolation.
