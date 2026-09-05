---
title: Host Template Mock Server
description: Dedicated standalone HTTP server on port 4174 to serve templates/ fixtures for browser preview and Control Page execution
status: in_progress
priority: P2
effort: 6h
branch: main
tags: [backend, server, templates, mock, control-page]
created: 2026-09-05
---

# Plan: Host Template Mock Server

## Problem
Template fixtures are currently served only via Playwright route interception (`installTemplateReportRoutes`) targeting virtual origin `https://templates.invalid`. The Control Page runner launches a real browser that needs real HTTP endpoints. This plan creates a standalone mock HTTP server so templates can be both previewed in a browser and executed from Control Page.

## Architecture Decision
Dedicated standalone server on port 4174, isolated from Control Server (4173). Prevents template legacy scripts/styles from accessing Control Page cookies, secrets, or CSRF tokens under Same-Origin Policy.

## Key Design
Reuses `loadTemplateReportFixture(env, "http://127.0.0.1:{port}")` and `templateResponse()` — converts existing Playwright interception logic into a real HTTP server. No template HTML files are modified; all link/form rewrites happen dynamically in memory.

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | Core template HTTP server | [phase-01-core-server.md](phase-01-core-server.md) | **DONE** (2026-09-05) |
| 2 | CLI entrypoint + npm script | [phase-02-cli-entrypoint.md](phase-02-cli-entrypoint.md) | **DONE** (2026-09-05) |
| 3 | Template project config | [phase-03-template-config.md](phase-03-template-config.md) | **DONE** (2026-09-05) |
| 4 | Developer Hub index page | [phase-04-dev-hub.md](phase-04-dev-hub.md) | ⬜ pending |
| 5 | Validation & testing | [phase-05-validation.md](phase-05-validation.md) | ⬜ pending |

Phase 01 completion: **DONE** — 2026-09-05
Phase 02 completion: **DONE** — 2026-09-05
Phase 03 completion: **DONE** — 2026-09-05

## Final Artifacts
- `src/templates/template-server.ts` — Core HTTP server
- `src/templates/template-server-cli.ts` — CLI entrypoint
- `package.json` — `"serve:templates"` script
- `config/projects.template.json` — Pre-configured project config

## Scope Boundary
- **In**: Standalone template HTTP server, CLI, config template, developer hub page
- **Out**: Modifying core capture engine, modifying offline template HTML files, adding new dependencies
