# Phase 02: Control Secrets API & Security Gates

## Context Links
- Parent Plan: [plan.md](./plan.md)
- Research: [researcher-01-backend-secret-store.md](./research/researcher-01-backend-secret-store.md)
- Security Gate: `src/reporting/report-server-control-security.ts`
- API Router: `src/reporting/report-server-control.ts`

## Overview
- **Date**: 2026-09-03
- **Description**: Add `GET /api/secrets`, `PUT /api/secrets`, and `DELETE /api/secrets` to the control server, applying CSRF, Host, and Fetch Metadata gates while ensuring zero credential leakage in responses.
- **Priority**: P1
- **Implementation Status**: **DONE**
- **Review Status**: **DONE** (approved with non-blocking warnings)
- **Completed At**: 2026-09-03T15:25:00+07:00
- **Estimated Effort**: 1.0h

## Key Insights
- `GET /api/secrets` must strictly return boolean presence flags (e.g. `{ "secrets": { "JENKINS_USERNAME": true } }`), never the actual secret values.
- `PUT /api/secrets` must be protected by the existing `validateMutationRequest` helper (Host, Origin, Fetch Metadata, CSRF token).
- Request payloads should accept `{ "secrets": { "NAME": "VALUE" } }` or `{ "name": "...", "value": "..." }`.
- Response to PUT/DELETE should only confirm presence without echoing the secret value.
- Explicit `null`/delete actions clear entries through the same guarded mutation path.

## Requirements
- Route `/api/secrets` in `handleApiRequest` in `src/reporting/report-server-control.ts`.
- `GET /api/secrets`:
  - Enforce Host header validation.
  - Optional `?keys=A,B` filter to check specific variables.
  - Return `200 OK` with `{ "secrets": { [key: string]: boolean } }`.
- `PUT /api/secrets`:
  - Run `validateMutationRequest(request, host, port, csrfToken)`.
  - Read body via `readBoundedJsonBody`.
  - Validate keys with `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/`.
  - Update store via `secretStore.putSecrets(secrets)`.
  - Return `200 OK` with updated presence map.
- `DELETE /api/secrets`:
  - Run the same `validateMutationRequest` security gate.
  - Accept a validated `name` query parameter or JSON `name`/`names` body.
  - Remove entries and return the redacted presence map.

## Architecture
```
Browser Request
      │
      ▼
handleControlRequest
      │
      ▼
validateHostHeader ──────────(Fail)──► 403 FORBIDDEN_HOST
      │
      ▼
handleApiRequest ('/api/secrets')
      │
      ├── GET ──► readSecrets() ──► Return { secrets: { [key]: true } }
      │
      └── PUT ──► validateMutationRequest (CSRF, Origin, Sec-Fetch-*)
                       │
                      (Pass)
                       ▼
                  putSecrets() ──► Return { secrets: { [key]: true } }
```

## Related Code Files
- Modify: `src/reporting/report-server-control-api.ts` (add `handleSecretsApi`)
- Modify: `src/reporting/report-server-control.ts` (dispatch to `handleSecretsApi`)
- Modify: `src/reporting/report-server.ts` (wire `secretStore` into `ControlRouterContext`)
- Add: `src/reporting/report-server-control-secrets-api.ts` (secrets handler)
- Test: `tests/unit/control-secrets-api.spec.ts`
- Test: `tests/unit/control-secrets-security.spec.ts`

## Implementation Steps
1. Add `secretStore: SecretStore` to `ControlRouterContext`.
2. In `report-server.ts`, initialize `createSecretStore(configRoot)` in control mode.
3. In `report-server-control-api.ts`, implement `handleSecretsApi(context, searchParams, method, request, response)`:
   - Handle `GET`: query `secretStore.readSecrets()`, map keys to `true`, filter if `searchParams.get('keys')` provided, send JSON.
   - Handle `PUT`: validate mutation request, parse bounded JSON body, validate keys and string values, call `secretStore.putSecrets(data.secrets)`, send JSON presence response.
4. Route `/api/secrets` in `handleApiRequest`.

## Todo List
- [x] Add `secretStore` property to `ControlRouterContext` interface.
- [x] Implement `handleSecretsApi` in `src/reporting/report-server-control-api.ts`.
- [x] Wire `/api/secrets` route in `src/reporting/report-server-control.ts`.
- [x] Test CSRF rejection and Host validation on `/api/secrets`. (Note: Host validation test gap noted in review)
- [x] Confirm no secret values are returned in responses or error logs.
- [x] Complete review and targeted validation.

## Success Criteria
- `GET /api/secrets` returns `{ "secrets": { ... } }` with boolean values only.
- `PUT /api/secrets` without valid CSRF token or wrong Origin returns 403 Forbidden.
- `PUT /api/secrets` with valid credentials updates `config/secrets.local.json` and returns presence status.
- Non-string or invalid variable names return 400 Bad Request.
- Valid DELETE/explicit clear removes keys without returning plaintext.
- Targeted API and security tests pass with no secret leakage.

## Risk Assessment
- **Risk**: API accidentally returns plaintext secret values in JSON response.
  - **Mitigation**: Unit test explicitly checks that no returned value equals the input secret string.

## Security Considerations
- Set `Cache-Control: no-store` on all responses.
- Enforce strict JSON body size limit (1 MiB).
- Validate all variable names before writing or deleting.
- Reuse Host, Origin, Fetch Metadata, and CSRF gates; never log request bodies or secret values.

## Validation
- Targeted tests: `node scripts/run-playwright.mjs playwright test tests/unit/control-secrets-api.spec.ts tests/unit/control-secrets-security.spec.ts --config=playwright.unit.config.ts --reporter=line` — **16 passed, 0 failed, 0 skipped**.
- Typecheck: `npm run typecheck` (`tsc --noEmit`) — **passed, 0 errors**.
- Review: [code review report](../reports/code-review-260903-1510-phase-02-control-secrets-api.md) — **APPROVED WITH WARNINGS, 9.0/10**, no critical issues.
- Remaining warnings are non-blocking and carried into follow-up hardening/UI contract work.

## Next Steps
Proceed to Phase 03: Run Executor Environment Injection.
