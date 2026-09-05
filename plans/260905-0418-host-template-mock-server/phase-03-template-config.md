# Phase 03: Template Project Config

> Parent: [plan.md](plan.md) | Dependencies: none (parallel with Phase 01-02) | Docs: [projects.example.json](../../config/projects.example.json)

## Overview
- **Date**: 2026-09-05
- **Priority**: P2
- **Implementation status**: ⬜ pending
- **Review status**: ⬜ pending

## Key Insights
- `loginUrl` must end with `/login` to pass `LOGIN_ENDPOINTS` validation in `config-values.ts`
- `loginUrl` and `jobUrl` must share the same origin to pass `deriveJenkinsBaseUrl()` — since both use `http://127.0.0.1:4174`, the base context is `/` which is valid
- `release%252Fsit` preserves the branch slash through double URL-encoding layers
- All three source origins (jenkins, snyk, sonarqube) must be set to `http://127.0.0.1:4174` since the mock server hosts all services on one port
- `sonarqube.projectId` must match the ID embedded in the template HTML: `package-id:service-id`

## Requirements
- Config passes schema validation with zero errors
- Control Page can load it and display projects correctly
- Credentials reference env variable names (not values)

## Architecture
- Static JSON file following `projects.example.json` schema

## Related Code Files
- `config/projects.template.json` **(NEW)**
- [projects.example.json](../../config/projects.example.json) — schema reference
- [project-config-project-validation.ts](../../src/config/project-config-project-validation.ts) — validation rules
- [config-values.ts](../../src/config-values.ts) — `deriveJenkinsBaseUrl()`

## Implementation Steps

- [ ] Create `config/projects.template.json` with exact content:
```json
{
  "schemaVersion": 1,
  "defaults": {
    "credentials": {
      "usernameVariable": "TEMPLATE_FIXTURE_USERNAME",
      "passwordVariable": "TEMPLATE_FIXTURE_PASSWORD"
    },
    "timeoutMs": 300000,
    "browser": "chromium",
    "artifactDir": "reports"
  },
  "projects": [
    {
      "id": "template-fixture-service",
      "name": "Template Fixture Service",
      "enabled": true,
      "runType": "report",
      "loginUrl": "http://127.0.0.1:4174/login",
      "jobUrl": "http://127.0.0.1:4174/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/",
      "sourceOrigins": {
        "jenkins": ["http://127.0.0.1:4174"],
        "snyk": ["http://127.0.0.1:4174"],
        "sonarqube": ["http://127.0.0.1:4174"]
      },
      "snyk": {
        "allowedOrigins": ["http://127.0.0.1:4174"]
      },
      "sonarqube": {
        "allowedOrigins": ["http://127.0.0.1:4174"],
        "projectId": "package-id:service-id"
      }
    }
  ]
}
```

## Todo List
- [ ] Create config file
- [ ] Verify it passes validation by loading in Control Page

## Success Criteria
- `normalizeProjectConfigDocument()` accepts this config without errors
- Control Page renders the project card with correct name and URLs

## Risk Assessment
- **Low**: Direct application of the brainstorm-approved URL format
- **Watch**: Ensure `sonarqube.projectId` exactly matches the value parsed by `projectIdFromSonarqubeUrl()` from the SonarQube template canonical URL

## Security Considerations
- Credential variables are names only, not values — real credentials set via Control Page Secrets Manager or env vars

## Next Steps
→ Phase 05: Validation
