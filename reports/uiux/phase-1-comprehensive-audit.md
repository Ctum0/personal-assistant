# Phase 1: Comprehensive UX and UI Investigation & Critique

## Executive Summary
This document delivers an exhaustive, evidence-based critique of the Sofia Personal AI Companion web interface. The audit was conducted across all 8 user-facing routes (`/`, `/chat`, `/computer-use`, `/timeline`, `/history`, `/tasks`, `/memory`, `/settings`) using Playwright visual snapshots, Chrome DevTools DOM inspections, and `axe-core` 4.14.0 automated evaluations.

While the application features a distinctive dark glassy burgundy aesthetic, custom anime avatar SVG expressions, and deep backend integrations (Hermes AI, CUA desktop automation, telemetry pipelines), the baseline implementation exhibits significant usability, accessibility, hierarchy, and component consistency defects.

---

## 1. Information Architecture & Navigation Audit

### 1.1 Findings & Deficiencies
1. **Desktop vs Mobile Navigation Asymmetry:**
   - On desktop viewports (1280px+), the header displays 8 horizontal navigation links, a live telemetry status pill, and a prominent emergency Kill Switch.
   - On mobile viewports (<768px), navigation shifts into a horizontally overflowing bottom strip without clear touch indicators or swipe cues.
2. **Missing Active Link Semantics:**
   - Active route styling uses background tint and glow, but omits standard `aria-current="page"` attributes required by assistive technology.
3. **Emergency Kill Switch State Clarity:**
   - The kill switch uses an active pulsing animation when armed, but lacks an `aria-pressed` boolean attribute and confirmation dialog before triggering irreversible consequence disables.
4. **Deep Linking & Breadcrumbs:**
   - Sub-views (e.g., inspecting an individual hour in `/timeline` or filtering memory notes by tag) do not synchronize state to the URL search params (`?hour=14`, `?tag=habit`), preventing bookmarking or back-button recovery.

---

## 2. Layout, Grid & Page Composition

### 2.1 Findings & Deficiencies
1. **Asymmetric Spacing Rhythm:**
   - Card paddings vary inconsistently across pages: `p-3.5`, `p-4`, `p-5`, and `p-6` are used arbitrarily for cards of equal visual weight.
2. **Viewport Adaptation & Density Inconsistencies:**
   - On `/` (Dashboard), a 3-column layout (`col-span-3`, `col-span-6`, `col-span-3`) collapses on mobile, but avatar and expression chips take up more than 60% of above-the-fold height, pushing telemetry metrics completely off-screen.
3. **Competing Focal Points on Dashboard:**
   - The ambient pulsing glow behind Sofia's avatar draws immediate attention, but the top status alert banner (`Sofia Chief of Staff active...`) flashes a high-frequency spin icon (`animate-spin`), creating visual noise that distracts from the daily score ring and active focus tasks.

---

## 3. Typography & Hierarchy Audit

### 3.1 Findings & Deficiencies
1. **Skipped Heading Levels (WCAG 2.4.6 / 1.3.1):**
   - On `/`, `/chat`, and `/tasks`, no `<h1>` heading exists in the DOM. Screen reader users navigating by heading landmark cannot identify the page title.
   - On `/computer-use`, `/timeline`, `/history`, and `/memory`, sections jump directly from page title (`<h1>`) to `<h3>` sub-cards without intermediate `<h2>` container headings, triggering axe-core `heading-order` violations.
2. **Over-reliance on Monospace Fonts for Body Copy:**
   - Sub-captions, status descriptions, and error states frequently use `font-mono text-xs`, which diminishes reading speed for lengthy text (e.g. Sofia's dialogue explanations and memory recaps).
3. **Type Scale Gaps:**
   - Large headings jump from `text-2xl` directly down to `text-xs` or `text-[10px]` with minimal intermediate scale (`text-base`, `text-sm`), creating harsh typographical steps.

---

## 4. Colour, Contrast & Visual Design Audit

### 4.1 Contrast Failures (WCAG 1.4.3 AA)
1. **Muted Secondary Text on Deep Wine Backgrounds:**
   - Tailwind opacity modifiers (`text-rose-400/60`, `text-rose-300/40`, `text-rose-400/50`) against `#080205` / `#14030a` yield measured contrast ratios between 2.8:1 and 3.6:1, falling far below the 4.5:1 minimum threshold for body text.
2. **Form Placeholder Contrast:**
   - Input placeholders using `placeholder:text-rose-400/40` measure ~2.9:1 contrast, making input prompts hard to read in bright ambient conditions.
3. **Borders & Form Controls (WCAG 1.4.11):**
   - Subtle borders (`border-rose-500/15`, `border-rose-500/20`) fail the 3:1 non-text contrast requirement for interactive boundaries against dark cards.

---

## 5. Component & Design Pattern Audit

### 5.1 Non-Semantic Clickable Elements (WCAG 2.1.1 Keyboard Accessibility)
1. **Interactive `div` Elements:**
   - In `tasks/page.tsx`, task completion checkboxes are rendered as `<div onClick={() => handleToggleTask(task)}>` without `role="checkbox"`, `tabIndex={0}`, or keyboard listeners (`onKeyDown`).
   - In `timeline/page.tsx`, the 24-hour bars are rendered as clickable `<div onClick={() => setSelectedHour(item.hour)}>` without keyboard navigation or accessible name.
   - In `SofiaAvatar.tsx`, the avatar wrapper is a clickable `div` lacking button semantics.
2. **Missing Icon Button Labels (WCAG 4.1.2):**
   - Chat send button: `<button type="submit"><Send className="w-4 h-4" /></button>` lacks `aria-label="Send message"`.
   - Voice replay buttons: `<button><Volume2 className="w-3 h-3" /></button>` lack `aria-label="Replay speech"`.
   - Delete task / note buttons: `<button><Trash2 className="w-3.5 h-3.5" /></button>` lack `aria-label="Delete item"`.
3. **Form Controls Missing Labels (WCAG 3.3.2):**
   - 17 range sliders in `/settings` have label text in sibling spans rather than formal `<label htmlFor="...">` bindings.
   - Sliders lack `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`.
   - Duration inputs and category selects in `/timeline` lack connected labels.

### 5.2 Touch Targets (WCAG 2.5.8)
- Expression selector pills on the home page measure 26px in height.
- Mobile navigation bar items measure ~28px.
- Timeline hour bars measure 14px in width.
- All must provide minimum 44px clickable target areas or appropriate padding hitboxes.

---

## 6. Page-by-Page Detailed Audit

| Route | Primary Deficiencies | Impact | Priority |
|---|---|---|---|
| **`/` (Home)** | Missing `<h1>`; low contrast on stat labels (`text-rose-300/60`); small touch targets on expression pills; clickable avatar `div`. | Moderate / High | P1 |
| **`/chat`** | Missing `<h1>`; send button missing accessible name; voice dock mic button missing `aria-label`; chat input missing accessible label. | Critical | P0 |
| **`/computer-use`** | Heading order skips (`<h1>` to `<h3>`); action trigger buttons lack loading spinner/disabled feedback during async execution. | Moderate | P1 |
| **`/timeline`** | Select element and duration input missing `<label>`; 24-hour bars are non-semantic clickable divs; heading order skips. | Critical / Moderate | P0 |
| **`/history`** | Heading order skips (`<h3>`); trend trajectory bars lack accessible name and keyboard focus. | Moderate | P1 |
| **`/tasks`** | Missing `<h1>`; task toggle is a clickable `div` without checkbox semantics; delete button lacks accessible label; estimated minutes input has title only. | Critical | P0 |
| **`/memory`** | Heading order skips (`<h3>`); note search input lacks connected label; delete note button lacks `aria-label`. | Moderate | P1 |
| **`/settings`** | 17 range sliders missing linked `<label>` and ARIA attributes; save button lacks keyboard focus ring. | Critical | P0 |

---

## 7. Conclusion & Next Steps
The interface has high visual potential and strong foundational functionality, but requires systematic remediation of typography tokens, contrast ratios, semantic HTML landmarks, and ARIA attributes. We transition directly to `reports/uiux/accessibility-audit.md` before establishing the formal design system in Phase 2 & 3.
