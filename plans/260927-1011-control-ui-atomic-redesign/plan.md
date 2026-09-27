---
title: "Control Page UI Atomic Redesign"
description: "Refactor Control Page UI across all views with Atomic Design taxonomy and Modern Refined Light aesthetic while preserving Axe WCAG AA compliance and E2E behavioral contracts."
status: in-progress
priority: P2
effort: 13h
branch: main
tags: [frontend, ui, refactor, atomic-design, accessibility]
created: 2026-09-27
---

# Control Page UI Atomic Redesign

## Overview
Comprehensive UI refactoring and modern aesthetic overhaul of the Control Page interface served by `npm run serve:control`. The project establishes a strict five-tier Atomic Design hierarchy (Atoms, Molecules, Organisms, Templates, Pages) across all three control views (`DashboardPage`, `ReportManagementPage`, `FinalProjectReportPage`). The visual design transitions to a sleek Modern Refined Light theme (slate/zinc palette, subtle borders, high-contrast focus rings, refined cards, and semantic status indicators) while guaranteeing zero Axe WCAG AA accessibility violations and preserving all existing Playwright E2E testing contracts.

## Architecture & Design References
- [Architecture Design & State Machines](./architecture-design.md)
- [Planning Request & User Decisions](./reports/planning-request.md)
- [Research: Atomic Structure](./research/researcher-01-atomic-structure.md)
- [Research: Contracts & Accessibility](./research/researcher-02-contracts-and-a11y.md)
- [Implementation Phase Tracker](./cmd-plan.md)

## Implementation Phases

**Overall status:** **IN PROGRESS** — 1 of 4 phases complete (25% by phase count; 3 of 13 planned hours = 23%). **Next planned phase:** Phase 02 — Molecules & Form Composition.

| # | Phase | Status | Effort | Phase Plan Link |
|---|-------|--------|--------|-----------------|
| 01 | Design System Tokens & Base Atoms | **DONE** (2026-09-27) | 3h | [Phase 01: Atoms](./phase-01-design-system-tokens-and-atoms.md) |
| 02 | Molecules & Form Composition | **NEXT (PLANNED)** | 3h | [Phase 02: Molecules](./phase-02-molecules-and-form-composition.md) |
| 03 | Organisms & Layout Templates | Planned | 4h | [Phase 03: Organisms & Templates](./phase-03-organisms-and-layout-templates.md) |
| 04 | Page Integration & Verification | Planned | 3h | [Phase 04: Integration & Verification](./phase-04-page-integration-and-verification.md) |

## Dependencies & Precedence
- **Sequential Execution**: Phase 01 establishes the foundational design tokens and atoms required by Phase 02 molecules. Phase 03 organisms assemble those molecules and atoms and introduce layout templates. Phase 04 connects the live page routes to templates and executes E2E verification suites.
- **Contract Boundary**: All existing DOM IDs (`#btn-save`, `#select-workers`, `#btn-credentials`, `#status-banner`, `#raw-json-textarea`, `#run-logs`, etc.) and data attributes must remain unchanged throughout all phases.
- **Accessibility Boundary**: Axe automated audits must report 0 violations across desktop, mobile (375px), and open modal states in every phase.
- **Packaging Boundary**: Vite single-bundle pipeline (`vite.control.config.ts`) must compile cleanly with strict CSP (zero inline scripts or inline styles).

## Key Deliverables
1. **Atoms**: Refactored `Button`, `Input`, `Select`, `Badge`, `StatusBanner`, `LoadingIndicator`; new accessible `Checkbox`, compound `Card`, `IconButton`.
2. **Molecules**: Standardized `FormField`, `PageHeader`, `ConfigSelectorBar`, `CredentialRow`, `BrowserSettingRow`, `LogViewer`, `RunResultBox`, `BuildProjectOutcomeRow`, `ProjectRunsTable`, `ReportExportButton`.
3. **Organisms**: Restructured `HeaderBar`, `ProjectCard`, `ProjectGroupColumn`, `ProjectGroupBoard`, `ProjectsGrid`, `ConfigFormBuilder`, `RawJsonSection`, `ExecutionSection`, `RunStatusCard`, `ProjectReportHistoryCard`, `CredentialsDialog`, `BrowserSettingsDialog`.
4. **Templates**: Dedicated layout shells `DashboardLayout`, `ReportManagementLayout`, `FinalReportLayout`.
5. **Pages**: Pure state/lifecycle coordinators `DashboardPage`, `ReportManagementPage`, `FinalProjectReportPage`.
6. **Documentation**: Updated `docs/codebase-summary.md` and `docs/architecture.md`.

## Validation Summary

**Validated:** 2026-09-27
**Questions asked:** 4 (plus 1 layout visual preview)

### Confirmed Decisions
- **Component Primitives**: Radix UI Headless Primitives (leveraging existing `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-select` packages in `package.json` for unstyled accessible behaviors).
- **Board Layout**: Contained 1200px (all sections including Project Groups Board remain aligned within a centered 1200px max-width container; horizontal scrolling confined inside `#projects-list` region when columns overflow).
- **Iconography**: Selective High-Utility Icons (Lucide SVG icons for high-value actions: log copy, PDF export, external job links, modal close, credential clearing, and play/trigger actions).
- **Contrast & Accessibility**: Strict WCAG AA 4.5:1 Contrast Baseline (zero Axe test violations guaranteed; minimum 4.5:1 text contrast and 3:1 UI border contrast across all component states).

### Action Items
- [ ] Integrate Radix UI Slot/Dialog primitives for atom & dialog component implementations.
- [ ] Keep `#projects-list` container scoped within `max-w-[1200px]` with internal overflow-x scrolling.
- [ ] Apply Lucide icons to selective high-utility action controls while preserving existing text and data-key contracts.
- [ ] Enforce vetted slate/zinc and high-contrast color tokens in `globals.css` to satisfy strict Axe WCAG AA audits.

## Unresolved Questions
None. All architectural and UX decisions confirmed via interactive validation interview.
