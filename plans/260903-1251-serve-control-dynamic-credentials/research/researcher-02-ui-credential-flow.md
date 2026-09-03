# UI credential flow research

## Existing surface and conventions

- `control-page.html` has a compact header (`.app-header`/`.header-container`) with configuration select, Reload, and Save Config controls (lines 13-23). Keep credential state out of the raw JSON editor and config files.
- The page already has a reusable live `#status-banner` (line 26), project grid (`#projects-list`, lines 28-31), report action (line 50), run status card/badge (lines 54-61), and an existing build confirmation dialog. A credential dialog can follow the same native `<dialog>` convention instead of introducing a modal library.
- `control-page.js` centralizes DOM references, has CSRF meta-token extraction (line 11), `apiFetch` (starts line 56), dirty-state handling (Save/Run are coordinated at lines 49-53), and project/run state. Extend these seams; do not add a second fetch or notification abstraction.
- `control-page.css` already defines card, button, success/warning/error status colors (variables lines 2-20), `.visually-hidden`, header flex layout, `.dashboard-section`, `.btn`, and `.status-banner.hidden` (lines 53-140). Reuse these tokens/classes and add only credential-specific layout rules.
- Existing API tests use Playwright request fixtures, temporary roots via `fs.mkdtempSync`, `test.beforeEach`, server CSRF tokens, and direct `request.get/put` plus `expect(res.status())`/JSON assertions (`control-config-api.spec.ts` lines 23-83; `control-run-api.spec.ts` lines 37-62). The E2E fixture also uses temporary config/report roots and `createReportServer` (`control-page.spec.ts` lines 41-90).

## 1. Discovering required variables

1. After every successful config load (initial load, config selection, Reload, and Apply & Validate), derive:
   ```js
   const requiredKeys = [...new Set(
     (config.projects ?? []).flatMap((project) =>
       Array.isArray(project.credentialVariables)
         ? project.credentialVariables
         : []
     )
   )].sort();
   ```
   Treat only non-empty strings as keys; do not trust a value merely because it came from the browser. Prefer the normalized project shape already used by the server.
2. Query `GET /api/secrets?keys=...` (or the agreed equivalent) only for this deduplicated allowlist. If the API intentionally returns all known keys, intersect its response with `requiredKeys` before rendering. Query after loading the project list so the dashboard never shows stale credentials from a previous configuration.
3. Require a redacted response: statuses such as `{ key, configured }` (or an object map of booleans), never plaintext, masked values, lengths, or values in error text. UI must use `textContent`/DOM nodes, not `innerHTML` with key data.
4. Render an explicit empty state when no loaded project declares credentials. Loading/error state belongs in the existing status banner or dialog status area. Preserve the stable sorted key order so E2E selectors and operator scanning do not jump.
5. Scope discovery to projects that can be run from the current configuration. Safest default is all normalized projects (including disabled ones) unless the server contract defines that only enabled/run-selected projects are eligible; document and test whichever rule is selected. A run must still be guarded server-side.

## 2. Proposed UI integration

### HTML

- Add a `Credentials` button beside Reload/Save Config in `.config-selector-group` (or a small adjacent header action group), with an accessible label and `type="button"`.
- Add `<dialog id="credentials-dialog" aria-labelledby="credentials-dialog-title">` near the existing build confirmation dialog. Inside: title/help text warning that values are stored locally, a `#credentials-list` container, `#credentials-loading`/`#credentials-message` live status, and a form footer with Close and `Save Credentials` buttons. Keep the dialog out of raw configuration JSON.
- Each generated row should contain a visible `<label>` naming the variable, a password-masked `<input type="password">` (use `autocomplete="username"` for an explicitly identified username key and `autocomplete="new-password"`/`off` for secrets), and a status badge with exactly `Configured` or `Missing`. Use `aria-describedby` for per-field help.
- Do not put existing secret values into `value`, `data-*`, placeholders, or logs. For configured rows, leave the input blank and explain “leave blank to keep current value”; if clearing is required, use an explicit Clear control/confirmation rather than conflating blank with omission.

### JavaScript behavior

- Add DOM refs and a small in-memory `credentialState` keyed by variable. `openCredentials()` derives keys, fetches statuses, creates rows, and calls native `dialog.showModal()`; restore focus to the opener on close.
- Reuse `apiFetch` so the existing CSRF header behavior applies. `GET` needs no CSRF mutation header; `PUT /api/secrets` must carry the same CSRF token and same-origin behavior as config Save. Disable Save while loading/saving and prevent duplicate submissions.
- On Save, send only fields the operator intentionally changed (plus an explicit clear list if supported). Payload must be an allowlisted key/value map; never accept arbitrary field names from the form. Trim only where the server contract says it is safe (passwords must otherwise be preserved byte-for-byte). On success, refresh redacted statuses, show the existing success banner, and leave the dialog usable. On failure, retain typed values in memory, show an actionable error without echoing values, and re-enable Save.
- Refresh credential statuses whenever the active project set changes, after config Save/Apply, and after a successful credential PUT. Do not make credentials participate in `isDirty`; config Save and credential Save are separate persistence operations. Disable report/build actions only for config dirtiness as existing code does.
- Never infer “configured” from an input value; trust only the redacted API response. Handle missing/invalid `credentialVariables` defensively and keep all authorization/key/value validation on the server.

## 3. Regression tests

### SecretStore unit coverage (new focused unit spec)

- Use a temporary directory and cross-platform `path.join`; test first write and update produce valid JSON at `config/secrets.local.json`.
- Verify atomicity contract: write through a temp file in the same directory, rename/replace target, clean temp files on errors, and never leave a truncated target. If the implementation exposes an injectable rename/write failure, assert the original remains readable.
- Verify restrictive permissions immediately after create and update (POSIX mode, and the Windows-compatible behavior/ACL policy chosen by implementation). Do not assert unsupported mode bits on Windows without a platform guard.
- Reject invalid keys (path separators, traversal, empty strings, malformed variable names, prototype-sensitive names if relevant) and invalid values/types; assert file is unchanged. Verify reads return status only through the API-facing projection, never secret text.

### API unit coverage

Extend `control-config-api.spec.ts` or add a focused `control-secrets-api.spec.ts` using its existing temp-root/server/CSRF setup:

- `GET /api/secrets` returns 200, stable key/status data, and no stored plaintext; cover absent secrets file and filtering to requested/allowed keys.
- `PUT /api/secrets` with valid CSRF and Origin writes/updates the local file, accepts only the agreed payload shape, and returns redacted statuses. Assert an existing key survives when omitted (patch semantics), if that is the chosen contract.
- Reject invalid/unknown keys, malformed JSON, wrong value types, oversize input, and path traversal with 4xx; assert no mutation. Submit without CSRF, with an invalid token, and with a disallowed/missing Origin; expect the established CSRF rejection status and unchanged disk.
- Assert response bodies and errors never contain submitted usernames/passwords. Include concurrent/rapid PUT behavior if the API promises serialized atomic writes.

### Playwright E2E (`tests/e2e/control-page.spec.ts`)

- Extend the existing temp fixture with `credentialVariables: ['JENKINS_USERNAME', 'JENKINS_PASSWORD']` and a temp-root secret path. Use `page.goto(serverUrl)` and role/label locators rather than CSS implementation details.
- Open Credentials; assert both labels, password input types, and `Missing` badges. Mock/seed a configured status and assert the UI says `Configured` while the input remains blank and no secret appears in page content.
- Fill both fields, click `Save Credentials`, wait for the success/status assertion, then assert both badges become `Configured`. From the test process read `path.join(configRoot, 'secrets.local.json')` and compare exact values; assert the browser-visible body does not contain them.
- Trigger the existing Generate Reports/run action and wait using the page's run status/log UI (or existing polling helper). Assert success/no `variable is required` failure. The current E2E report executor is a mock; make this fixture credential-aware (or use the real variable-resolution seam) so a missing secret would genuinely fail rather than making the test a false positive.
- Reload the page/server, reopen Credentials, and assert configured badges persist. Add a missing-project/empty-key case and a failed PUT case: typed fields stay local, save re-enables, and no run starts from an unconfigured state.

## Unresolved questions

- Exact `GET /api/secrets` response and query/filter contract (array vs map; all keys vs requested keys) must match the SecretStore/API implementation.
- Whether `credentialVariables` is available on normalized config today, and whether disabled projects should contribute keys, needs a single documented rule.
- PUT semantics for omitted, blank, and explicit-clear values; define before implementing UI/tests.
- Windows permission guarantee (mode bits vs ACL) needs the chosen SecretStore policy reflected in platform-guarded assertions.
