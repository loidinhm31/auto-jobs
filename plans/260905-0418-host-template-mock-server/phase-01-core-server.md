# Phase 01: Core Template HTTP Server

> Parent: [plan.md](plan.md) | Dependencies: none | Docs: [templates/jenkins-template/README.md](../../templates/jenkins-template/README.md)

## Overview
- **Date**: 2026-09-05
- **Priority**: P1 (blocking all other phases)
- **Implementation status**: ✅ complete (2026-09-05)
- **Review status**: ✅ approved (2026-09-05)

## Key Insights
- `loadTemplateReportFixture(env, origin)` already handles all origin remapping and HTML link/form rewriting — the server just needs to call it once at startup with `"http://127.0.0.1:{port}"` as origin
- `templateResponse(url, fixture)` from `template-fixture-routes.ts` maps parsed URLs to fixture bodies for GET requests
- POST handlers (login, SonarQube auth, build submission) need explicit redirect logic — same as `installTemplateReportRoutes` but using HTTP 302 instead of `route.fulfill()`
- SonarQube auth state needs in-memory tracking (simple boolean flag, same as `sonarqubeAuthenticated` in routes)

## Requirements
- Serve all fixture responses on a configurable port (default 4174)
- Handle POST login → 302 to jobUrl
- Handle POST SonarQube auth → set auth state, 302 to sonarqubeHomeUrl
- Handle POST build → 302 to jobUrl
- Serve SonarQube login page when unauthenticated user visits home
- Abort/404 unrecognized routes

## Architecture
Use Node.js native `node:http` `createServer` — matches existing `report-server.ts` pattern. No Express or external deps. Single module exporting a `createTemplateServer(options)` async function returning a handle with `{ server, url, close() }`.

## Related Code Files
- `src/templates/template-server.ts` **(NEW)**
- [template-fixture-loader.ts](../../src/templates/template-fixture-loader.ts) — `loadTemplateReportFixture()`
- [template-fixture-routes.ts](../../src/templates/template-fixture-routes.ts) — `templateResponse()`
- [template-fixture-types.ts](../../src/templates/template-fixture-types.ts) — `TemplateReportFixture`
- [report-server.ts](../../src/reporting/report-server.ts) — server pattern reference

## Implementation Steps

- [x] Create `src/templates/template-server.ts`
- [x] Export `createTemplateServer(options: { host?: string; port?: number })` function
- [x] On startup: call `loadTemplateReportFixture(process.env, \`http://${host}:${port}\`)` to build fixture
- [x] Create `node:http` server with request handler
- [x] Route GET requests through `templateResponse(parsedUrl, fixture)`
- [x] Add explicit POST handlers:
  - `POST /j_spring_security_check` → 302 to `fixture.jobUrl`
  - `POST /sessions/new` (or `fixture.sonarqubeLoginActionUrl`) → set `sonarqubeAuthenticated = true`, 302 to `fixture.sonarqubeHomeUrl`
  - `POST {buildActionUrl}` → 302 to `fixture.jobUrl`
- [x] Guard SonarQube home: if `!sonarqubeAuthenticated && GET sonarqubeHomeUrl`, serve `fixture.sonarqubeLoginHtml` instead
- [x] Return 404 for unrecognized routes
- [x] Add `close()` method with graceful socket tracking (same pattern as `report-server.ts`)
- [x] Return handle: `{ server, host, port, url, close }`

## Todo List
- [x] Core server implementation
- [x] POST redirect handlers
- [x] SonarQube auth state guard
- [x] 404 fallback
- [x] Graceful close

## Success Criteria
- Server starts on port 4174 and logs URL
- All GET endpoints return correct fixture content with `text/html` or `application/json` content-type
- POST login returns 302 to job URL
- POST SonarQube auth returns 302 to home URL
- Unauthenticated SonarQube home shows login page
- Unrecognized routes return 404

## Risk Assessment
- **Low**: Repurposes existing Playwright interception logic; `templateResponse()` is already battle-tested
- **Watch**: URL matching uses `isExactFixtureUrl` with parsed URLs — need to verify real HTTP request URLs parse identically to Playwright route URLs (especially `%252F` double-encoding)

## Security Considerations
- Bind to loopback (`127.0.0.1`) by default — no LAN exposure
- No authentication required (mock server serves test fixtures only)
- Isolated from Control Server port, so no CSP or CSRF concerns

## Next Steps
→ Phase 02: CLI entrypoint
