---
title: "Persistent project report management"
description: "Keep one validated all-project report index and safely delete one project's retained reports from the loopback Control Dashboard."
status: in-progress
priority: P2
effort: 16h
branch: main
tags: [reporting, control-page, artifacts, security]
created: 2026-09-24
---

# Persistent project report management

## Overview

Keep `reports/index.html` and `reports/aggregate-data.json` as a persistent index of validated retained report history across runs and configuration changes. The report CLI and `serve:report` still use the static index; read-only serving validates it as the root marker. In control mode, navigate from the dashboard to a React management view at `/reports/index.html`: list every retained project, page its run history 20 rows at a time, and confirm guarded whole-project report deletion there. Keep config, siblings, shared assets and staging untouched; reuse discovery, report-root lock, aggregate publisher and mutation security. No second inventory store.

## Phases

| Phase | Work | Status | Progress | Effort |
| --- | --- | --- | --- | --- |
| [01: Persistent aggregate index builder](./phase-01-persistent-aggregate-index-builder.md) | Merge validated history with active outcomes; migrate runner | Done · 2026-09-24 | 100% | 4h |
| [02: Guarded control reports DELETE API](./phase-02-control-reports-delete-api.md) | **DONE** · 2026-09-24 | 100% | 5h |
| [03: Report management page navigation and deletion](./phase-03-control-ui-navigation-and-deletion.md) | **DONE** · 2026-09-24 | 100% | 3h |
| [04: Verification and caller migration](./phase-04-verification-and-caller-migration.md) | Prove security, persistence, concurrency, failure recovery, browsers and callers | Pending | 0% | 4h |

## Dependencies

- Phase 01 owns one pure aggregate builder callable by runner and deletion API; Phase 02 follows its result contract. Phase 03 follows DELETE request/response contract; UI and endpoint may be developed in parallel against that agreed contract. Phase 04 runs once all slices integrate.
- Architecture: [architecture](../../docs/architecture.md), [system view](../../docs/system-architecture.md); standards: [code standards](../../docs/code-standards.md) (`docs/development-rules.md` is not present in this checkout). Research: [backend](./research/researcher-01-report.md), [frontend](./research/researcher-02-report.md).
- Keep production TS modules under 200 lines; new modules kebab-case and ESM `.js` imports. Existing PascalCase React component filenames may be extended in place; do not create duplicate parallel components. Keep Markdown below 800 lines.
- Static persisted report HTML has `default-src 'none'` and remains read-only in `serve:report`/offline contexts. Only control mode substitutes a CSRF-bearing React management view at the exact `/reports/index.html` URL with `CONTROL_CSP`; report-run links still use the static handler. Keep the saved index: `assertReportRoot` requires its marker, publisher recovery tracks the HTML+JSON pair, and CLI/report-only clients consume it.
- Deleting project files and publishing the root pair is **not one atomic filesystem transaction**. After any partial failure, rebuild from remaining valid manifests under the lock; diagnose failure without claiming removed files were restored.

## Validation Summary

**Validated:** 2026-09-24. **Questions asked:** 6.

### Confirmed decisions

- Delete all retained history for one project, including invalid files in its project subtree after a safety preflight; retain config, other projects and shared assets. Count validated runs only.
- Keep the static `reports/index.html`: scan found it required for read-only root validation, CLI/offline consumption and publication recovery. In control mode, show React management at `/reports/index.html`; no saved CSRF token or script.
- Paginate historical runs independently per project, 20 rows per page in React. Use the published aggregate within existing 5,000-manifest discovery and 16 MiB static-file boundaries; UI paging does not expand backend capacity. On incomplete discovery/oversize publication, report a limit rather than silently drop retained history; refuse deletion when inventory is incomplete.

### Action items

- [x] Phase 01: explicitly signal incomplete discovery and enforce the published pair's static serving size limit before replacing it.
- [x] Phase 03: implement independent 20-run pagination with latest-first ordering and stable page transitions after deletion/reload.
- [ ] Phase 04: prove the static/read-only index remains used, management route differs only in control mode, and the per-project pager shows all available runs without truncation.

## Unresolved questions

None blocking. History beyond existing discovery/serving limits is not within this plan; those reports stay on disk and require a separate scalable pagination/indexing design before they can be fully indexed.
