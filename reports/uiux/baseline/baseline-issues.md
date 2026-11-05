# Baseline UI/UX Issues & Weaknesses Inventory

**Date:** 2026-11-06  
**Auditor:** Antigravity 2.0 (Auditor)  

---

## 1. Executive Summary

While the application features an evocative dark glassy burgundy visual identity and working Hermes AI integrations, the initial audit identifies key usability, accessibility, keyboard interaction, and design token consistency areas that require engineering and refinement.

---

## 2. Identified Weaknesses & Deficiencies

### Issue B-01: Inadequate Text Contrast on Muted Labels (WCAG 1.4.3)
- **Routes Affected**: All routes (`/`, `/chat`, `/timeline`, `/history`, `/tasks`, `/memory`, `/settings`)
- **Severity**: High
- **Problem**: Secondary descriptions and metadata tags use colors like `text-rose-400/50`, `text-rose-300/40`, or `text-rose-300/60` against `#080205` / `rgba(38,6,20,0.65)`. Several text elements fall below the 4.5:1 contrast ratio required by WCAG 2.2 AA.
- **Root Cause**: Reliance on high opacity reduction (`/40`, `/50`) on dark wine backgrounds.
- **Recommended Fix**: Standardize text color tokens to ensure all body/metadata text achieves at least 4.5:1 contrast (e.g., `#fecdd3` for secondary, `#f43f5e` for accents, `#ffffff` for primary).

---

### Issue B-02: Non-Semantic Clickable Elements & Missing Keyboard Handlers (WCAG 2.1.1)
- **Routes Affected**: `/`, `/tasks`, `/timeline`, `/chat`
- **Severity**: Critical
- **Problem**: Multiple interactive controls are implemented as `div` or `span` elements with `onClick` but without `role="button"`, `tabIndex={0}`, or `onKeyDown` (Enter/Space) handlers. Examples:
  - Sofia avatar click-to-speak on `/`
  - Task completion toggle on `/tasks`
  - Timeline hourly bars on `/timeline`
  - Expression selector chips on `/`
- **Root Cause**: Custom UI elements implemented without native `<button>` primitives or ARIA semantics.
- **Recommended Fix**: Refactor interactive elements into semantic `<button>` elements with keyboard accessibility, proper focus-visible rings, and ARIA state attributes.

---

### Issue B-03: Icon-Only Buttons Lacking Accessible Names (WCAG 4.1.2)
- **Routes Affected**: `/chat`, `/tasks`, `/memory`, `/settings`
- **Severity**: High
- **Problem**: Icon buttons (speech replay `<Volume2>`, delete task `<Trash2>`, delete memory note, mic toggle) have visible icons and visual tooltips, but lack explicit `aria-label` attributes for screen readers.
- **Root Cause**: Missing `aria-label` on icon button components.
- **Recommended Fix**: Add descriptive `aria-label` attributes (e.g. `aria-label="Replay Sofia's spoken response"`, `aria-label="Delete task: ..."`).

---

### Issue B-04: Sub-44px Touch Targets on Mobile (WCAG 2.5.8)
- **Routes Affected**: `/`, `/memory`, `/history`
- **Severity**: Medium
- **Problem**: Expression switcher chips, tag badges, and timeline hour selectors have vertical padding of `py-0.5` or `py-1` (effective height ~24px - 28px), which fails the 44x44px minimum touch target guideline for mobile devices.
- **Root Cause**: Compact desktop-first styling without touch target expansion.
- **Recommended Fix**: Add minimum touch target dimensions or invisible hit-area padding (`min-h-[44px]` or adequate padding) on touch viewports.

---

### Issue B-05: Missing Form Accessible Labels & ARIA Slider Semantics
- **Routes Affected**: `/settings`, `/tasks`, `/memory`
- **Severity**: High
- **Problem**:
  - The range inputs in Settings (`Strictness`, `Warmth`, etc.) use text in a preceding `div` rather than an explicit `<label htmlFor="...">`.
  - The range inputs lack `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext`.
- **Root Cause**: Standard HTML inputs wrapped in custom flex containers without explicit label associations.
- **Recommended Fix**: Wire every form control with explicit `id` and `<label htmlFor="...">`, plus full ARIA range attributes.

---

### Issue B-06: Hardcoded Hex Colors & Dispersed Styling Tokens
- **Routes Affected**: All components
- **Severity**: Medium
- **Problem**: Color values (`#080205`, `#1f0611`, `#f43f5e`, `#881337`, `rgba(225,29,72,0.2)`) are hardcoded across multiple component files rather than referenced through centralized Tailwind theme tokens.
- **Root Cause**: Rapid initial MVP styling.
- **Recommended Fix**: Establish a centralized Design System token dictionary in `globals.css` and a shared design system module.
