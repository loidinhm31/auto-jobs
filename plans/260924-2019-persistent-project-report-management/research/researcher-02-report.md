# Frontend research: persistent project report management

- Date: 2026-09-24
- Focus: Control Dashboard navigation, project actions, deletion UX, empty/unconfigured states, caller integration.

## Findings and recommendations

- **Navigation:** Control Page is organized around `pages/DashboardPage.tsx`, `DashboardLayout`, and `HeaderBar`; inspected files show ordinary anchors, not a client router. Add a visible same-tab `Reports` anchor in `HeaderBar` to `/reports/index.html` (use `/reports/` only if server routing guarantees index resolution). Keep it distinct from config selectors/settings actions.
- **Cards:** `DashboardPage` derives `projectsData` from the active config; `ProjectsGrid` maps each item to a `ProjectCard`. Existing card controls are config/run settings, plus the Jenkins job link. Add a distinct **Delete historical reports** action; do not label it Delete project. Thread a typed callback DashboardPage → ProjectsGrid → ProjectCard. Pass stable project identity, never a user-controlled filesystem path.
- **Coverage gap:** Dashboard cards represent only projects in the currently selected config. Historical retained projects that were removed from or are absent in that config cannot be managed there. Since the index must cover all retained projects, expose the same project-scoped delete action on the management index (or another all-retained-project surface) too. Keep report deletion separate from config editing/removal.
- **Confirmation pattern:** Existing `CredentialsDialog` and `BrowserSettingsDialog` use Radix UI (`@radix-ui/react-dialog`): Root/Portal/Overlay/Content, Title/Description, explicit cancel/close, existing Button. No reusable confirmation dialog found. Implement a small dedicated Radix confirmation dialog matching this pattern; avoid native `window.confirm`.
- **Suggested confirmation:** “Delete all retained reports and validated run history for **{project}**? This permanently removes this project’s historical report files. Project configuration and other projects’ reports are not affected.” Buttons: Cancel and **Delete reports** (destructive). Prevent duplicate submit, show API errors, close and refresh the index/card state only after success.
- **Empty/unconfigured:** A missing/empty current config yields empty `projectsData`; configured projects drive cards, not report history. A configured zero-run project should still have a card/action. Make deletion of a project with no retained reports safe/idempotent and communicate no-op/success. The aggregate renderer explicitly handles no projects and no validated historical run manifests (`aggregate-report-renderer.ts`, lines 21–48). Retained-only/unconfigured projects need index-side management.
- **API integration:** Reuse `useControlApi`; it handles same-origin mutation CSRF tokens. Existing secrets hooks use `DELETE`, but there is no report-delete client flow in the inspected Control Page. Add a project-scoped API contract, perform filesystem ownership/containment checks server-side, then refresh/rebuild the index after successful deletion.

## Migration map

- UI call chain: `src/reporting/control-page/pages/DashboardPage.tsx` → `components/organisms/HeaderBar.tsx`, `ProjectsGrid.tsx` → `ProjectCard.tsx`; wire API state through `hooks/useControlApi.ts` (add a dedicated hook only if it meaningfully owns delete/loading/error state).
- Confirmation precedent: `components/organisms/CredentialsDialog.tsx`, `BrowserSettingsDialog.tsx`; export any new shared component through `components/organisms/index.ts` if used by both dashboard and management surface.
- Report publishing/serving code visible in `src/reporting/`: `aggregate-report-renderer.ts`, `report-server-control-api.ts`, `report-server-control-page.ts`, `report-server.ts`, `report-server-cli.ts`; report scripts listed: `scripts/copy-report-assets.mjs`, `run-template-report.mjs`, `run-report.mjs`, `run-playwright.mjs`, `report-runtime.mjs`. Integrate deletion/index refresh with the existing publisher/server path; avoid a second disconnected report pipeline.
- **Caller-trace limitation:** The scoped search result was truncated before showing matches for `aggregate-report-publisher.ts`, `runner.ts`, or `serve:control`; their direct import/script callers are not verified here. Before migration, search all imports and `package.json` scripts for those exact names, update every invocation/contract, and preserve the current report generation path. No caller locations should be inferred from filenames alone.

## Evidence

- `DashboardPage.tsx`: `projectsData` from current config; passes props into HeaderBar/ProjectsGrid; mounts existing dialogs.
- `ProjectsGrid.tsx`: renders one ProjectCard per project.
- `ProjectCard.tsx`: project card contract and Jenkins job URL link.
- `CredentialsDialog.tsx`, `BrowserSettingsDialog.tsx`: Radix dialog implementation.
- `useControlApi.ts`, `useCredentialsManager.ts`, `useBrowserSettings.ts`: same-origin/CSRF handling and DELETE precedent.
- `aggregate-report-renderer.ts`: current aggregate HTML rendering and empty states.

## Unresolved questions

- Which exact files/scripts import or invoke `aggregate-report-publisher.ts` and `runner.ts`, and which `package.json` command implements `serve:control`? Verify complete call graph before cutover; search output available in this pass did not include those lines.
- Does `serve:control` serve `/reports/index.html` from the same origin/root path in every launch mode? Confirm before hard-coding a root-relative link.
- What stable server-owned project key associates historical manifests with config projects, including rename/case behavior?
