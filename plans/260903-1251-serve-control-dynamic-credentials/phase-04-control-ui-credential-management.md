# Phase 04: Control UI Credential Modal & State

## Context Links
- Parent Plan: [plan.md](./plan.md)
- Research: [researcher-02-ui-credential-flow.md](./research/researcher-02-ui-credential-flow.md)
- HTML Template: `src/reporting/control-page/control-page.html`
- UI Logic: `src/reporting/control-page/control-page.js`
- UI Styling: `src/reporting/control-page/control-page.css`

## Overview
- **Date**: 2026-09-03
- **Description**: Implement a native credential management modal in the `serve:control` dashboard, enabling operators to inspect presence of required variables and securely update credentials.
- **Priority**: P1
- **Implementation Status**: pending
- **Review Status**: pending
- **Estimated Effort**: 1.5h

## Key Insights
- The page already uses native `<dialog>` for auto-build confirmation; we can follow the exact same native pattern for the credentials dialog (`<dialog id="credentials-dialog">`).
- Project configs define variable names via `project.credentialVariables` (defaults to `JENKINS_USERNAME` and `JENKINS_PASSWORD`).
- The UI should automatically discover all unique required variable names from the loaded config document:
  ```js
  const requiredKeys = [...new Set(
    (currentDoc.projects || []).flatMap((p) => [
      p.credentials?.usernameVariable || 'JENKINS_USERNAME',
      p.credentials?.passwordVariable || 'JENKINS_PASSWORD',
    ])
  )].sort();
  ```
- For each variable, display:
  - Variable Name (e.g. `JENKINS_USERNAME`)
  - Status Badge: `Configured` (green badge) or `Missing` (red badge)
  - Input: `<input type="password" placeholder="•••••••• (leave blank to keep)">`
- "Save Credentials" sends `PUT /api/secrets` with only the non-empty entered values.

## Requirements
- Add "Credentials" button in header action bar beside "Reload" and "Save Config".
- Add `<dialog id="credentials-dialog">`:
  - Title: "Local Credential Management"
  - Informational notice: "Stored locally in config/secrets.local.json (git-ignored)."
  - Dynamic list of credential rows (`#credentials-form-rows`).
  - Actions: "Cancel" / "Save Credentials".
- Wire open/close logic and keyboard accessibility (`Escape` closes).
- On open:
  1. Derive required variable keys from `currentDoc`.
  2. Fetch `GET /api/secrets?keys=...`.
  3. Render input rows with current status badges.
- On save:
  1. Collect non-empty input values into `secrets` payload.
  2. Call `apiFetch('/api/secrets', { method: 'PUT', body: JSON.stringify({ secrets }) })`.
  3. Update badges, clear inputs, show success banner.

## Architecture
```
Header
  └── [Credentials] Button
          │
          ▼ Click
  openCredentialsModal()
          │
          ├── 1. Extract required variables from currentDoc
          │
          ├── 2. GET /api/secrets ──► { secrets: { JENKINS_USERNAME: true, ... } }
          │
          └── 3. Render rows in <dialog id="credentials-dialog">:
                 - Label: JENKINS_USERNAME
                 - Badge: [Configured] or [Missing]
                 - Input: <input type="password">
```

## Related Code Files
- Modify: `src/reporting/control-page/control-page.html`
- Modify: `src/reporting/control-page/control-page.js`
- Modify: `src/reporting/control-page/control-page.css`

## Implementation Steps
1. In `control-page.html`:
   - Add `<button id="btn-credentials" class="btn btn-secondary" type="button">Credentials</button>`.
   - Add `<dialog id="credentials-dialog">` markup with header, body container, and footer buttons.
2. In `control-page.css`:
   - Add styling for credentials dialog, input rows, and status badges matching existing card styles.
3. In `control-page.js`:
   - Add event listener on `#btn-credentials` to open dialog.
   - Implement `loadCredentialStatuses()` calling `apiFetch('/api/secrets')`.
   - Implement row rendering and badge updates.
   - Implement `btnSaveCredentials` click handler to submit `PUT /api/secrets`.
   - Handle empty state when no projects require credentials.

## Todo List
- [ ] Add Credentials button and dialog markup to `control-page.html`.
- [ ] Add dialog and form styling to `control-page.css`.
- [ ] Implement variable discovery logic in `control-page.js`.
- [ ] Implement `GET /api/secrets` fetch and badge rendering.
- [ ] Implement `PUT /api/secrets` submission and success handling.
- [ ] Ensure input fields use `type="password"` and clear upon save.

## Success Criteria
- Clicking "Credentials" opens the modal displaying all required variables for the active config.
- Badges accurately reflect whether each variable is stored in `secrets.local.json`.
- Submitting new values updates the badges to `Configured` and clears the password input fields.
- Closing and reopening the dialog retains the `Configured` status without showing raw values.

## Risk Assessment
- **Risk**: User accidentally enters password into wrong input.
  - **Mitigation**: Clear variable labels and password masking; explicit "Save Credentials" button.

## Security Considerations
- Never populate `input.value` with retrieved secret data; inputs start empty with placeholder.
- Clear password fields from memory once submission completes.

## Next Steps
Proceed to Phase 05: Unit, API & Playwright E2E Verification.
