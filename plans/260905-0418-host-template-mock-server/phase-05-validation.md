# Phase 05: Validation & Testing

> Parent: [plan.md](plan.md) | Dependencies: [Phase 01](phase-01-core-server.md), [Phase 02](phase-02-cli-entrypoint.md), [Phase 03](phase-03-template-config.md), [Phase 04](phase-04-dev-hub.md)

## Overview
- **Date**: 2026-09-05
- **Priority**: P1
- **Implementation status**: complete
- **Review status**: approved
- **Completed At**: 2026-09-06

## Key Insights
- Primary validation is integration: does the real HTTP server produce the same fixture responses that Playwright route interception previously mocked?
- URL encoding edge case: `%252F` (double-encoded slash) must round-trip correctly through Node.js HTTP request parsing
- SonarQube auth flow needs browser session state — cookie or in-memory flag
- Existing test suites (`test:e2e:templates`, `test:control`) must still pass unchanged

## Requirements
- Template server + Control server run concurrently without port conflicts
- Control Page loads `projects.template.json` without validation errors
- "Run Reports" generates complete aggregate report with Snyk/Sonar evidence
- "Auto Build" POST submission succeeds with 302 redirect
- Existing test suites remain green

## Related Code Files
- All files from Phases 01-04
- [control-page.spec.ts](../../tests/e2e/control-page.spec.ts)
- [vendor-template-capture.spec.ts](../../tests/e2e/vendor-template-capture.spec.ts)
- [template-server-integration.spec.ts](../../tests/e2e/template-server-integration.spec.ts)

## Implementation Steps

### Manual Smoke Test
- [x] Run `npm run serve:templates` — verify server starts on port 4174
- [x] Open `http://127.0.0.1:4174/` in browser — verify Dev Hub renders
- [x] Click each Dev Hub link — verify fixture pages render correctly
- [x] Test POST login flow: submit form at `/login`, verify redirect to job page
- [x] Test SonarQube auth: visit home (should redirect to login), submit, verify access
- [x] Test build submission: visit build page, submit form, verify redirect

### Control Page Integration Test
- [x] Run `npm run serve:control` concurrently
- [x] Open Control Page, load `projects.template.json`
- [x] Set template credentials via Secrets Manager (any values accepted)
- [x] Click "Run Reports" — verify Playwright captures evidence and generates report
- [x] Check generated `reports/template-fixture-service/{run-id}/index.html` exists
- [x] Click "Auto Build" — verify submission state

### Regression Check
- [x] Run `npm run test:e2e:templates` — verify existing template tests pass unchanged
- [x] Run `npm run test:control` — verify control page tests pass
- [x] Run `npm run typecheck` — verify no type errors from new files

## Todo List
- [x] Smoke test all endpoints
- [x] Control Page integration test
- [x] Regression test suite
- [x] Verify no cross-origin errors in browser console

## Success Criteria
- All manual smoke tests pass
- Control Page report run produces evidence + screenshots
- Auto-build submission returns `succeeded` or `submission-unknown`
- Zero regressions in existing test suites
- No cross-origin security errors

## Risk Assessment
- **Medium**: URL encoding edge cases (`%252F` paths) may parse differently between Playwright's in-memory routing and Node.js `http.IncomingMessage.url`
- **Mitigation**: Compare `request.url` raw string handling — may need to avoid double-decoding in the server's URL parser

## Security Considerations
- Confirm Control Server CSP still blocks unauthorized cross-origin requests
- Template server must not leak into the Control Server's origin
- Template credentials are mock-only — no real secrets at risk
