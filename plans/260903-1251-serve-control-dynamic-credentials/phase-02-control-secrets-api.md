# Phase 02: Control Secrets API & Security Gates

## Context Links
- Parent Plan: [plan.md](./plan.md)
- Research: [researcher-01-backend-secret-store.md](./research/researcher-01-backend-secret-store.md)
- Security Gate: `src/reporting/report-server-control-security.ts`
- API Router: `src/reporting/report-server-control.ts`

## Overview
- **Date**: 2026-09-03
- **Description**: Add `GET /api/secrets` and `PUT /api/secrets` to the control server, applying CSRF, Host, and Fetch Metadata gates while ensuring zero credential leakage in responses.
- **Priority**: P1
- **Implementation Status**: pending
- **Review Status**: pending
- **Estimated Effort**: 1.0h

## Key Insights
- `GET /api/secrets` must strictly return boolean presence flags (e.g. `{ "secrets": { "JENKINS_USERNAME": true } }`), never the actual secret values.
- `PUT /api/secrets` must be protected by the existing `validateMutationRequest` helper (Host, Origin, Fetch Metadata, CSRF token).
- Request payloads should accept `{ "secrets": { "NAME": "VALUE" } }` or `{ "name": "...", "value": "..." }`.
- Response to PUT should only confirm presence without echoing the secret value.

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

## Implementation Steps
1. Add `secretStore: SecretStore` to `ControlRouterContext`.
2. In `report-server.ts`, initialize `createSecretStore(configRoot)` in control mode.
3. In `report-server-control-api.ts`, implement `handleSecretsApi(context, searchParams, method, request, response)`:
   - Handle `GET`: query `secretStore.readSecrets()`, map keys to `true`, filter if `searchParams.get('keys')` provided, send JSON.
   - Handle `PUT`: validate mutation request, parse bounded JSON body, validate keys and string values, call `secretStore.putSecrets(data.secrets)`, send JSON presence response.
4. Route `/api/secrets` in `handleApiRequest`.

## Todo List
- [ ] Add `secretStore` property to `ControlRouterContext` interface.
- [ ] Implement `handleSecretsApi` in `src/reporting/report-server-control-api.ts`.
- [ ] Wire `/api/secrets` route in `src/reporting/report-server-control.ts`.
- [ ] Test CSRF rejection and Host validation on `/api/secrets`.
- [ ] Confirm no secret values are returned in responses or error logs.

## Success Criteria
- `GET /api/secrets` returns `{ "secrets": { ... } }` with boolean values only.
- `PUT /api/secrets` without valid CSRF token or wrong Origin returns 403 Forbidden.
- `PUT /api/secrets` with valid credentials updates `config/secrets.local.json` and returns presence status.
- Non-string or invalid variable names return 400 Bad Request.

## Risk Assessment
- **Risk**: API accidentally returns plaintext secret values in JSON response.
  - **Mitigation**: Unit test explicitly checks that no returned value equals the input secret string.

## Security Considerations
- Set `Cache-Control: no-store` on all responses.
- Enforce strict JSON body size limit (1 MiB).
- Validate all variable names before writing.

## Next Steps
Proceed to Phase 03: Run Executor Environment Injection.
