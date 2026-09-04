# Phase 06: Legacy Cleanup & Documentation

## Context Links
- Parent Plan: [plan.md](plan.md)
- Prior Phase: [phase-05-verification-and-release-audit.md](phase-05-verification-and-release-audit.md)
- Legacy Files: [control-page.js](../../src/reporting/control-page/control-page.js), [control-page.html](../../src/reporting/control-page/control-page.html), [control-page.css](../../src/reporting/control-page/control-page.css)
- Asset Script: [scripts/copy-report-assets.mjs](../../scripts/copy-report-assets.mjs)

## Parallelization Info
- Concurrency: Sequential after Phase 05 verification passes.
- Depends on: Phase 05 (all tests green)
- Blocks: None (Final phase)

## Overview
- Date: 2026-09-04
- Description: Remove legacy imperative control page files that are now replaced by the React application, verify that the build pipeline and tests still pass without them, and update documentation.
- Priority: P2
- Implementation Status: Pending
- Review Status: Pending

## Key Insights
1. After Phase 05 passes all tests, the legacy files are no longer referenced by any code path. Vite produces the replacement assets.
2. `copy-report-assets.mjs` should already have been updated in Phase 01 to stop copying legacy control-page files. This phase verifies that change is complete.
3. The server's `loadControlAssets()` (updated in Phase 01) reads from the Vite build output, not the legacy source files.

## Requirements

### Legacy File Deletion
Delete the following files that are fully replaced by the React application:
- `src/reporting/control-page/control-page.js` (~780 lines of imperative DOM scripting)
- `src/reporting/control-page/control-page.html` (legacy HTML template — replaced by `index.html` Vite template)
- `src/reporting/control-page/control-page.css` (legacy stylesheet — replaced by Tailwind + `globals.css`)

### Verification After Deletion
1. `npm run build` — must still succeed (Vite builds from `index.html` + `main.tsx`, not legacy files)
2. `npm run typecheck` — must pass (no TypeScript files reference the deleted JS)
3. `npm run test:control` — must pass (tests exercise the running server, not source files)
4. `npm run test:release` — full suite green

### Documentation Updates
- Update `README.md` if it references the legacy control page architecture.
- Verify no other scripts or documentation reference the deleted files.

## Related Code Files
- `src/reporting/control-page/control-page.js` (to be deleted)
- `src/reporting/control-page/control-page.html` (to be deleted)
- `src/reporting/control-page/control-page.css` (to be deleted)
- `scripts/copy-report-assets.mjs` (verify update from Phase 01)

## File Ownership
- Owns deletion of legacy files and documentation updates.

## Implementation Steps
1. Verify `scripts/copy-report-assets.mjs` no longer references legacy control-page files (should have been done in Phase 01).
2. Delete `src/reporting/control-page/control-page.js`.
3. Delete `src/reporting/control-page/control-page.html`.
4. Delete `src/reporting/control-page/control-page.css`.
5. Run `npm run build` to confirm clean build.
6. Run `npm run test:release` to confirm all tests pass.
7. Search codebase for any remaining references to deleted files (`grep -r "control-page.js" --include="*.ts" --include="*.mjs" --include="*.md"`).
8. Update `README.md` if needed.

## Todo List
- [ ] Verify `copy-report-assets.mjs` is already updated
- [ ] Delete `control-page.js`
- [ ] Delete `control-page.html`
- [ ] Delete `control-page.css`
- [ ] Run `npm run build`
- [ ] Run `npm run test:release`
- [ ] Search for stale references
- [ ] Update documentation

## Success Criteria
- Legacy files are removed from the repository.
- Full test suite passes without any legacy files present.
- No dangling references to deleted files exist in the codebase.

## Conflict Prevention
- Only executed after Phase 05 confirms all tests pass. If any test fails, do NOT delete legacy files — investigate the failure first.

## Risk Assessment
- **Risk**: Premature deletion breaks a code path that still references legacy files.
- **Mitigation**: This phase runs ONLY after Phase 05 verifies all tests pass. Deletion is the last step.
- **Risk**: Other branches or scripts reference legacy files.
- **Mitigation**: Grep-based search for all references before committing deletion.

## Next Steps
- Implementation complete; ready for code review and merge.
