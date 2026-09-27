# Phase 01: Design System Tokens & Base Atoms

## Context Links
- Parent Plan: [Implementation Plan](./plan.md)
- Access Overview: [cmd-plan.md](./cmd-plan.md)
- Architecture Design: [Architecture Design](./architecture-design.md)
- Research Reports: [Atomic Structure](./research/researcher-01-atomic-structure.md) · [Contracts & A11y](./research/researcher-02-contracts-and-a11y.md)
- Codebase Standards: [docs/code-standards.md](../../docs/code-standards.md) · [docs/codebase-summary.md](../../docs/codebase-summary.md)

## Overview
- Date: 2026-09-27
- Description: Establish Modern Refined Light design tokens in Tailwind/CSS and implement standardized, accessible Atomic Design base primitives (`Button`, `Input`, `Select`, `Badge`, `Checkbox`, `Card`, `IconButton`, `StatusBanner`, `LoadingIndicator`).
- Priority: P2
- Implementation Status: DONE (100%)
- Review Status: Approved (Score: 9.8/10)
- Completed: 2026-09-27

## Key Insights
- Existing atoms (`Button`, `Input`, `Select`, `Badge`, `StatusBanner`, `LoadingIndicator`) use a mix of CSS classes and inline Tailwind styles.
- Missing dedicated `Checkbox` atom forces `ProjectCard` and `build-project-outcome-row` to use raw `<input type="checkbox">`.
- Missing compound `Card` atom leads to redundant container styles (`bg-white border border-slate-300 rounded-lg p-5 shadow-sm`) duplicated across 8+ organism components.
- Axe WCAG AA requires minimum 4.5:1 text contrast and high-visibility focus indicators across all interactive controls.
- Validation Confirmed: Implement primitives with Radix UI Headless Primitives (`@radix-ui/react-slot`), enforce strict WCAG AA 4.5:1 contrast baseline, and integrate selective Lucide SVG icons.

## Requirements
- Functional:
  - Provide complete, backward-compatible atom exports in `src/reporting/control-page/components/atoms/`.
  - Refactor `Button` to support modern variants (`primary`, `secondary`, `danger`, `outline`, `ghost`) and sizes (`sm`, `md`, `lg`) with loading spinners.
  - Refactor `Badge` with modern pill styling, subtle borders, and semantic status variants (`idle`, `queued`, `running`, `succeeded`, `failed`, `unknown`, `configured`, `missing`).
  - Implement dedicated accessible `Checkbox` atom with visible focus rings and keyboard toggle.
  - Implement compound `Card` atom (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) using Radix `Slot` pattern for flexible polymorphism.
  - Implement accessible `IconButton` atom with required tooltip/aria-label support and Lucide SVG icon rendering.
  - Integrate Radix UI headless primitives (`@radix-ui/react-slot`) to provide clean `asChild` composition across buttons and cards.
- Non-Functional:
  - Strict WCAG AA contrast compliance: minimum 4.5:1 text contrast and 3:1 UI border contrast across all component states.
  - High-visibility focus indicators (`focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2`).
  - Zero bundle regression and CSP compliance (no inline script/style injections).

## Architecture
Atoms are pure presentational primitives with zero side effects or business dependencies:

```
components/atoms/
├── Button.tsx           # Button atom (variants: primary, secondary, danger, outline, ghost)
├── Input.tsx            # Clean text/number/password input atom
├── Select.tsx           # Styled select atom
├── Checkbox.tsx         # Accessible custom checkbox atom
├── Badge.tsx            # Modern status pill badge atom
├── Card.tsx             # Compound Card container atom
├── IconButton.tsx       # Icon-button atom with accessible label
├── StatusBanner.tsx     # Animated alert notification banner
├── LoadingIndicator.tsx # Accessible loading spinner / pulse
└── index.ts             # Clean facade export
```

## Related Code Files
- Modify:
  - `src/reporting/control-page/styles/globals.css` (modern tokens, focus-visible utilities, button/badge styles)
  - `src/reporting/control-page/components/atoms/Button.tsx` (modern styling & variants)
  - `src/reporting/control-page/components/atoms/Badge.tsx` (modern pill tokens & semantic maps)
  - `src/reporting/control-page/components/atoms/Input.tsx` (decouple pure input from form label)
  - `src/reporting/control-page/components/atoms/Select.tsx` (modern select styling & focus ring)
  - `src/reporting/control-page/components/atoms/StatusBanner.tsx` (modern notification design)
  - `src/reporting/control-page/components/atoms/LoadingIndicator.tsx` (sleek spinner)
  - `src/reporting/control-page/components/atoms/index.ts` (re-export new atoms)
  - `src/reporting/control-page/types/component-contracts.ts` (updated atom prop interfaces)
- Create:
  - `src/reporting/control-page/components/atoms/Checkbox.tsx`
  - `src/reporting/control-page/components/atoms/Card.tsx`
  - `src/reporting/control-page/components/atoms/IconButton.tsx`

## Implementation Steps
1. Update `src/reporting/control-page/styles/globals.css` to define Modern Refined Light CSS custom properties and focus ring utilities.
2. Update `src/reporting/control-page/types/component-contracts.ts` with new atom prop types (`CheckboxProps`, `CardProps`, `IconButtonProps`).
3. Refactor `Button.tsx` to apply modern variants, transitions, and accessible focus outlines.
4. Refactor `Badge.tsx` with refined color pairs (Emerald, Amber, Rose, Sky) meeting 4.5:1 contrast.
5. Create `Checkbox.tsx` with accessible keyboard navigation and custom SVG checkmark.
6. Create `Card.tsx` compound component (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) leveraging Radix `@radix-ui/react-slot`.
7. Create `IconButton.tsx` ensuring mandatory `aria-label` or `title`, integrated with `lucide-react` SVG icons.
8. Refactor `Input.tsx` and `Select.tsx` to support pure control rendering while maintaining backward compatibility.
9. Update `components/atoms/index.ts` to export all new and refactored atoms.
10. Run `npm run build` and `npm run typecheck` to confirm zero compilation errors.

## Todo List
- [x] Define Modern Refined Light tokens in `globals.css`
- [x] Update `component-contracts.ts` for atom interfaces
- [x] Refactor `Button.tsx` with modern styling and variants
- [x] Refactor `Badge.tsx` with high-contrast semantic palettes
- [x] Create `Checkbox.tsx` accessible primitive
- [x] Create `Card.tsx` compound primitive using Radix `Slot` pattern
- [x] Create `IconButton.tsx` primitive with Lucide icon support
- [x] Verify strict WCAG AA 4.5:1 contrast across all atom token pairs (Verified: `--primary` #0369a1 with white text is 5.93:1)
- [x] Refactor `Input.tsx` and `Select.tsx` (Remediated: base classes merged unconditionally, w-full aligned)
- [x] Refactor `StatusBanner.tsx` and `LoadingIndicator.tsx` (Remediated: role="alert"/aria-live added to StatusBanner, role="status"/loading-indicator added to LoadingIndicator)
- [x] Re-export all atoms from `components/atoms/index.ts`
- [x] Verify build and typecheck

## Success Criteria
- All atoms render cleanly with Modern Refined Light aesthetics.
- Axe WCAG AA 0-violation baseline preserved for all atom states.
- TypeScript compiler passes with zero errors (`npm run typecheck`).
- Vite bundle builds with single-bundle JS/CSS (`npm run build`).

## Risk Assessment
- Risk: Changing existing button/badge class names breaks tests checking specific CSS classes.
  - Mitigation: Retain legacy class hooks (`btn`, `btn-primary`, `badge`, `badge-*`, `status-banner`) alongside modern Tailwind classes.
- Risk: Color changes reduce contrast below WCAG AA 4.5:1 threshold.
  - Mitigation: Strictly use vetted slate/zinc and high-contrast text pairs verified in research report 02.

## Security Considerations
- Zero inline styles or scripts; all styling managed via external CSS bundle adhering to strict CSP.
- No dynamic HTML injection in atom rendering.

## Next Steps
1. Remediation and Cycle 2 code review complete with score 9.8/10.
2. All 3 critical issues and 5 warnings successfully resolved and tested across 37 atom tests and full 608 unit tests.
3. Proceed to [Phase 02: Molecules & Form Composition](./phase-02-molecules-and-form-composition.md).
