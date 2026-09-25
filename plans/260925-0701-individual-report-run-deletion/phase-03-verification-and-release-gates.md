# Phase 03 — Verification and release gates

## Overview

Verify the end-to-end functionality of individual report run deletion across Chromium and WebKit browsers, unit test suites, filesystem pruning assertions, and project release gates.

## Requirements

1. **Browser E2E Verification:**
   - Exercise single-run deletion in Chromium and WebKit.
   - Assert modal confirmation, cancel dismissal, and confirmed execution.
   - Assert sibling runs in the same project remain on disk and in UI.
   - Assert empty project directory is pruned when deleting the sole remaining run.
   - Assert aggregate index (`aggregate-data.json` and static `index.html`) updates accurately.
   - Accessibility check with `AxeBuilder` for the new dialog and table action.
2. **Release Gates:**
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:unit`
   - `npm run test:control`
   - `npm run test:report`
3. **Documentation:**
   - Update `docs/report-pipeline.md`, `docs/code-standards.md`, and `docs/release-gates.md`.
