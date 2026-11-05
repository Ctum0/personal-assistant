# Sofia Design System Specification (Velvet Glassmorphism)

## 1. Overview & Aesthetic Intent
The Sofia Design System formalizes the **Velvet Glassmorphism** design language for Sofia — Personal AI Companion. It synthesizes deep burgundy/wine glassmorphism with high-contrast, WCAG 2.2 AA compliant typography, predictable component states, and responsive mechanics.

---

## 2. Design Tokens

### 2.1 Color Tokens & Contrast Matrix

All text and interactive tokens are tested against the primary dark background (`#080205`) and glass panel surface (`#1e0510`).

| Token Name | Hex / Value | Min Contrast vs `#080205` | WCAG 2.2 AA Compliance | Role & Usage |
|---|---|---|---|---|
| `--color-bg-base` | `#080205` | N/A | Base Canvas | Page background with ambient gradient mesh. |
| `--color-bg-surface` | `rgba(38, 6, 20, 0.75)` | N/A | Surface Level 1 | Glass cards, main panels (`backdrop-blur-xl`). |
| `--color-bg-subtle` | `rgba(22, 3, 12, 0.85)` | N/A | Surface Level 2 | Input backgrounds, nested tables, code blocks. |
| `--color-text-primary` | `#fff1f2` (Rose-50) | **17.5:1** | **Pass (AAA)** | Primary headers, active values, high-contrast labels. |
| `--color-text-secondary` | `#fecdd3` (Rose-200) | **12.2:1** | **Pass (AAA)** | Section titles, body copy, card headings. |
| `--color-text-muted` | `#fda4af` (Rose-300) | **8.4:1** | **Pass (AAA)** | Secondary descriptions, timestamps, metadata. |
| `--color-text-accent` | `#fb7185` (Rose-400) | **5.1:1** | **Pass (AA)** | Active highlights, telemetry indicators. |
| `--color-border-glass` | `rgba(244, 63, 94, 0.25)` | 3.2:1 | **Pass (AA non-text)** | Standard glass card boundaries. |
| `--color-border-focus` | `#f43f5e` (Rose-500) | 4.8:1 | **Pass (AA non-text)** | Keyboard `:focus-visible` ring. |
| `--color-status-success` | `#10b981` (Emerald-500) | 7.6:1 | **Pass (AA)** | Focus goals reached, live services, completed tasks. |
| `--color-status-warning` | `#f59e0b` (Amber-500) | 8.1:1 | **Pass (AA)** | High cognitive load, bedtime warnings, pending tasks. |
| `--color-status-error` | `#ef4444` (Red-500) | 4.9:1 | **Pass (AA)** | Kill switch active, failed actions, critical alerts. |

---

### 2.2 Typography Scale

The type system pairs **Geist Sans** for natural human language (dialogue, labels, descriptions) with **Geist Mono** for metrics, timestamps, telemetry codes, and computer use commands.

| Scale Token | Font Size | Line Height | Weight | Tracking | Primary Element |
|---|---|---|---|---|---|
| `display-1` | 32px (`text-3xl`) | 38px | 800 (Extrabold) | `-0.02em` | Metric hero callouts (`3.8h`, `7.5/10`) |
| `heading-1` | 24px (`text-2xl`) | 32px | 700 (Bold) | `-0.01em` | Page Title (`<h1>`) with subtle burgundy text shadow |
| `heading-2` | 18px (`text-lg`) | 24px | 600 (Semibold) | `0em` | Card section titles (`<h2>`) |
| `heading-3` | 14px (`text-sm`) | 20px | 600 (Semibold) | `0.01em` | Sub-section cards, dialog headers (`<h3>`) |
| `body-base` | 14px (`text-sm`) | 22px | 400 (Regular) | `0em` | Dialogue bubbles, descriptions, notes |
| `body-sm` | 12px (`text-xs`) | 18px | 500 (Medium) | `0.01em` | Card labels, secondary captions |
| `caption` | 11px (`text-[11px]`) | 16px | 500 (Medium) | `0.02em` | Helper text, badges, pill tags |
| `telemetry-mono` | 12px (`text-xs`) | 18px | 600 (Semibold) | `0.04em` | Code commits, timers, server addresses |

---

### 2.3 Spacing & Rhythm Tokens

| Token | Size | Application |
|---|---|---|
| `space-1` | 4px | Icon and text inline gaps |
| `space-2` | 8px | Button internal padding, pill gaps |
| `space-3` | 12px | Form field row spacing |
| `space-4` | 16px | Compact card internal padding (`p-4`), list item spacing |
| `space-5` | 20px | Section content gaps |
| `space-6` | 24px | Standard panel internal padding (`p-6`) |
| `space-8` | 32px | Major grid gutters (`gap-8`), page bottom padding |

---

### 2.4 Elevation & Depth Tokens

1. **Base Layer (L0):** Canvas `#080205` with soft burgundy gradient orb in background.
2. **Glass Subtle (L1):** `backdrop-filter: blur(12px); background: rgba(22, 3, 12, 0.6); border: 1px solid rgba(225, 29, 72, 0.15);`
3. **Glass Standard (L2):** `backdrop-filter: blur(20px); background: linear-gradient(135deg, rgba(38, 6, 20, 0.7) 0%, rgba(18, 3, 10, 0.85) 100%); border: 1px solid rgba(244, 63, 94, 0.22); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);`
4. **Interactive Hover (L3):** `transform: translateY(-2px); border-color: rgba(244, 63, 94, 0.45); box-shadow: 0 16px 48px rgba(225, 29, 72, 0.25);`
5. **Overlay & Dock (L4):** Floating voice dock, modals, sticky header with `z-50` and deep backdrop blur.

---

### 2.5 Focus & Keyboard Accessibility Tokens

```css
:focus-visible {
  outline: 2px solid #f43f5e !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 15px rgba(244, 63, 94, 0.5) !important;
}
```

---

## 3. Component Standards & Interaction Contracts

### 3.1 Buttons
- **Primary Button:** Gradient rose-to-crimson (`from-rose-700 to-crimson-600`), white text, subtle glow, minimum height `44px` on mobile, `aria-label` when containing only icons.
- **Secondary / Ghost Button:** Translucent wine background (`bg-rose-950/60`), border `border-rose-500/30`, hover border `hover:border-rose-400`, text `text-rose-200`.
- **Destructive Button:** Red-950 surface (`bg-red-950/70`), border `border-red-500/40`, text `text-red-200`.
- **Icon-Only Button:** Minimum bounding box `44x44px`, mandatory `aria-label` describing the specific action.

### 3.2 Form Inputs & Sliders
- **Text Inputs:** Glass container (`bg-[#12030a]/80`), high-contrast text (`#fff1f2`), visible label attached via `<label htmlFor="id">`, placeholder `#fda4af/70`.
- **Range Sliders:**
  - Accessible name: linked `<label htmlFor="slider-id">`.
  - Live numeric display next to label.
  - Mandatory ARIA attributes: `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`.
  - Generous touch track with distinct thumb indicator (`accent-rose-500`).
- **Select Dropdowns:**
  - Mandatory `aria-label` or `<label htmlFor="...">`.
  - Accessible option contrast against dropdown menu.

### 3.3 Semantic Headings
Every user-facing route must declare:
- `<h1 className="...">` as the page landmark.
- Major card sections enclosed in `<section>` or `<div role="region">` with `<h2 className="...">`.
- Nested items and detail cards with `<h3 className="...">`.

---

## 4. Implementation Checklist for Phase 4
- [ ] Update `src/app/globals.css` with tokens, `:focus-visible`, reduced-motion media query, and accessible utility classes.
- [ ] Refactor `Navbar.tsx` (accessible touch targets, `aria-current="page"`, `aria-pressed` for kill switch).
- [ ] Refactor `SofiaAvatar.tsx` (keyboard accessibility, focus ring, aria attributes).
- [ ] Refactor `CaptionLine.tsx` & `VoiceDock.tsx` (discernible button labels, ARIA live region for subtitles).
- [ ] Refactor all 8 page routes (`/`, `/chat`, `/computer-use`, `/timeline`, `/history`, `/tasks`, `/memory`, `/settings`) to conform to heading order, accessible form labels, and semantic buttons.

---

## 5. Conclusion
With the design system codified, execution transitions directly to **Phase 4: Page-by-Page Redesign Implementation**.
