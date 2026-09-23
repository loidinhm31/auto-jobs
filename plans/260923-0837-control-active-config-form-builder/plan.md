---
title: "Control Active Config Persistence & Form Builder"
description: "Restore the selected configuration and add a responsive, schema-valid form editor synchronized with raw JSON."
status: in-progress
priority: P2
effort: 9h
branch: main
tags: [feature, frontend, config]
created: 2026-09-23
---

# Control Active Configuration & Form Builder

## Overview
Add client-side active-configuration restoration and a structured editor beside the existing raw JSON editor in `npm run serve:control`. Preserve the schema-v1 document contract, save flow, backend routes, and Playwright DOM selectors; this plan does not implement the feature.

## Phase Progress & Navigation
**Overall status:** In Progress / **50%** (4.5 of 9.0 planned hours; Phases 01–02 complete, Phases 03–04 pending).

| # | Phase | Status / progress | Effort | Deliverable |
|---|---|---|---:|---|
| 1 | [Active configuration persistence](./phase-01-active-config-persistence.md) | Complete / 100% · 2026-09-23T09:28:48+07:00 | 1.5h | URL + localStorage selection restoration |
| 2 | [Config form builder component](./phase-02-config-form-builder-component.md) | Complete / 100% · 2026-09-23 | 3h | Controlled project and defaults editor |
| 3 | [Side-by-side integration](./phase-03-side-by-side-integration.md) | Pending / 0% | 2h | Responsive workspace and synchronized editors |
| 4 | [Verification and release audit](./phase-04-verification-and-release-audit.md) | Pending / 0% | 2.5h | Unit/E2E coverage, Axe audit, release gate |

## Deliverables and Scope
- Persist only the active config filename as `jenkins_control_active_config` and `?config=<name>`; resolve a valid URL name first, then a valid localStorage name, then `configs[0]`.
- Add project CRUD and defaults editing through React and existing Tailwind atoms; retain all unrelated supported config fields.
- Pair the form with the existing `#raw-json-textarea`; builder changes update JSON immediately, and valid JSON applies back to the form through `#btn-apply-json`.
- Keep `GET /api/configs`, `GET /api/config`, and `PUT /api/config` unchanged; retain ETag/If-Match save protection. No form dependency or secret-value editor.

## Context
- [Preflight contract](../reports/scout-260923-0837-control-active-config-form-builder.md)
- [Current architecture](../../docs/architecture.md) · [Code standards](../../docs/code-standards.md)
- Primary hook, page, layout, and test paths are linked in each phase.

## Preflight Contract
- Preserve `#config-select`, `#btn-save`, `#raw-json-textarea`, `#btn-apply-json`, `#json-validation-msg`, `#projects-list`, `.project-card`, and other existing selectors/classes.
- Validate schema-v1 through the shared `assertProjectConfigDocument` boundary; keep credential values out of config JSON, URL, and localStorage.
- Form edits remain local/dirty until the existing Save action performs the guarded PUT. Do not change server routes or run/credential workflows.

## Side-Effect Review Checklist
- [ ] Storage contains only a configuration name; URL changes use same-page `history.replaceState`, preserve other query parameters/hash, and do not navigate.
- [ ] Add/edit/remove/default changes only update the in-memory document and formatted textarea; only explicit Save writes config.
- [ ] No builder action calls `/api/run`, `/api/secrets`, or modifies runtime credentials; retain the existing ETag conflict path.
- [ ] Invalid documents remain visible and dirty but cannot be saved; reload remains the discard path for unsaved edits.

## Dependencies and Exit Gate
Phase 1 is independent; phase 2 supplies controlled form actions to phase 3; phase 4 verifies the integrated flow. Finish only when all E2E selectors remain compatible, desktop/mobile Axe scans report zero violations, and `npm run test:release` passes. The implementation run—not this planning assignment—owns those checks.

## Unresolved Questions
- None. When source files and the scout report disagree, preserve the schema's currently supported values (including `firefox` for `BrowserName`).
