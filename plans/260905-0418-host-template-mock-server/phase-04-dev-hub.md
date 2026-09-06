# Phase 04: Developer Hub Index Page

> Parent: [plan.md](plan.md) | Dependencies: [Phase 01](phase-01-core-server.md)

## Overview
- **Date**: 2026-09-05
- **Priority**: P3
- **Implementation status**: complete
- **Review status**: approved
- **Completed At**: 2026-09-06

## Key Insights
- The Developer Hub is a simple HTML page returned when hitting `GET /` on the template server
- Links should use the dynamically constructed URLs from the loaded fixture so they always match the server's actual origin/port
- No external CSS/JS needed — minimal inline styling

## Requirements
- `GET /` returns an HTML page listing all mock endpoints
- Each link navigates to the correct fixture page
- Page clearly labels each destination (Jenkins Login, Jenkins Job, Snyk Report, SonarQube Home, etc.)

## Architecture
- Inline HTML string built inside `template-server.ts` using fixture URLs
- No separate file needed

## Related Code Files
- `src/templates/template-server.ts` (addition to Phase 01 handler)

## Implementation Steps

- [x] In the `GET /` handler, build HTML string using fixture properties:
  - `fixture.loginUrl` → "Jenkins Login"
  - `fixture.jobUrl` → "Jenkins Job Page"
  - `fixture.buildPageUrl` → "Jenkins Build (Parameterized)"
  - `fixture.snykReportUrl` → "Snyk Report"
  - `fixture.sonarqubeLoginUrl` → "SonarQube Login"
  - `fixture.sonarqubeHomeUrl` → "SonarQube Home"
  - `fixture.sonarqubeOverallUrl` → "SonarQube Overall"
  - `fixture.sonarqubeIssuesUrl` → "SonarQube Issues"
- [x] Add minimal inline CSS for readability
- [x] Set `Content-Type: text/html; charset=utf-8`

## Todo List
- [x] Hub HTML generation
- [x] Verify all links navigate correctly in browser

## Success Criteria
- Browser at `http://127.0.0.1:4174/` shows a clean page with all 8+ clickable links
- Each link loads the correct fixture content

## Risk Assessment
- **Trivial**: String interpolation with URL escaping

## Security Considerations
- URLs must be HTML-escaped to prevent XSS (use `escapeHtml()` from `template-fixture-html.ts`)

## Next Steps
→ Phase 05: Validation
