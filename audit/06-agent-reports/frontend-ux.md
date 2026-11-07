# AGENT 11 — FRONTEND, UI/UX & INTERACTION DESIGN AUDIT REPORT
**Target System:** JARVIS / Sofia Personal AI Companion  
**Audit Scope:** `src/app/page.tsx` (Stage Home), `src/components/Stage.tsx`, `src/components/SofiaAvatar.tsx`, `src/components/Pane.tsx`, `src/components/PaneRail.tsx`, `src/components/CaptionLine.tsx`, `src/components/LiveDebugOverlay.tsx`, `src/app/globals.css`  
**Compliance Standard:** WCAG 2.2 AA, Evidence-over-Assumptions Principle  
**Author:** Agent 11 — Frontend, UI/UX & Interaction Design Auditor

---

## 1. Executive Summary & Verification Highlights

An exhaustive, evidence-backed inspection of the JARVIS/Sofia frontend codebase was conducted. The findings reveal a modern dark-burgundy glassmorphic companion stage with significant accomplishments in streaming layout mechanics, yet plagued by severe architectural disconnects, dead dependencies, ghost specifications, broken visual transitions, and accessibility compliance failures.

### Key Audit Findings:
1. **The 3D Avatar Ghost Specification vs. Dead Dependencies:**  
   `reports/uiux/3D-AVATAR-ARCHITECTURE-SPEC.md` claims that a 3D digital human avatar powered by `@pixiv/three-vrm` and `public/models/sofia.vrm` (4.65 MB) is "FULLY REALIZED, VERIFIED & PRODUCTION READY".  
   **Actual Codebase Truth:** `public/models/` does not exist on disk. Git history confirms commit `195306ef` explicitly executed: *"Phase 0: Removed fake CUA, deleted 3D avatar stack... Phase 5: Generated 8 crisp PNGTuber expressions with transparent alpha in public/sofia/expressions/"*. Yet `package.json` (lines 12–19) still carries `three: ^0.187.0`, `@pixiv/three-vrm: ^3.5.5`, and `@types/three: ^0.187.0` as completely unreferenced, dead dependencies (~150MB dead weight).
2. **Broken Image Fallback & Crossfade Transitions:**  
   In `src/components/SofiaAvatar.tsx` (lines 79, 154, 168), image fallback and `onError` handlers hardcode `/sofia/expressions/neutral.png`. Only `.webp` files exist in `public/sofia/expressions/`. Any load failure causes a broken 404 image loop. Furthermore, lines 163–165 contain an implementation bug (`isCrossfading ? 'opacity-100' : 'opacity-100'`) while `prevExp` is hardcoded to `opacity-0` (line 152), resulting in **zero crossfade** during emotional shifts.
3. **Mouth Phoneme Animation Discrepancy:**  
   There is zero phoneme or viseme lip-sync animation. The mouth is an artificial CSS pill (`div.bg-rose-950/90.rounded-full`) at coordinate `bottom: 36.5%, left: 48.5%` (`SofiaAvatar.tsx:173–181`). While Gemini Live mode modulates its height via an audio RMS sigmoid curve (`session.ts:586–598`), in standard TTS speech (`voice.ts:66–119`) `mouthOpen` is never calculated, freezing the mouth into a static 3px slit throughout all dialogue.
4. **Orphaned Components & Unused Hooks:**  
   Multiple production-ready UI components and hooks are completely orphaned (0 imports across `src/`):
   - `src/components/CaptionLine.tsx` (has typewriter animation and audio replay, but `Stage.tsx` re-implements an inferior inline box).
   - `src/components/SofiaPanel.tsx`, `ScoreRing.tsx`, `CategoryBars.tsx`.
   - `src/hooks/useVoiceInput.ts` (full Web Speech API + silence detector hook, completely unwired).
5. **Stage Responsive Collisions & Viewport Lock:**  
   `layout.tsx:29` locks the viewport to `h-screen max-h-screen overflow-hidden`. On viewports between 768px and 1024px, the scaled Stage Center (`scale(0.58)` + `translateX(-30%)`, `Stage.tsx:47–48`) physically collides with the 420px wide `PaneRail`. On mobile devices, the side rail gets pushed down and clipped by the `overflow-hidden` container.
6. **WCAG 2.2 AA Violations:**  
   Missing `<h1>` landmark on `src/app/page.tsx`; missing `<label>` on the primary text input (`page.tsx:641–657`); missing `aria-live="polite"` on stage captions (`Stage.tsx:64–123`); and low-contrast opacity text tokens (`page.tsx:656, 676`) violating the 4.5:1 ratio.

---

## 2. Stage & Interaction Design Overview

### 2.1 Stage Architecture & Visual Hierarchy
The Stage (`src/app/page.tsx:410–681`, `src/components/Stage.tsx:1–139`) implements a full-bleed luxury console with a deep burgundy-black atmosphere (`#080205`, `globals.css:19`).
- **Layout Structure:**
  - **Top Status Bar (`page.tsx:425–566`):** Clock ticker, Mood pill with pulsating status dot and live score, Activity icon (debug overlay toggle), Headphones icon (`/audition` route shortcut), Rest Day toggle (calls `PUT /api/settings`), Voice Mute toggle, and MoreHorizontal button for secondary navigation.
  - **Center Dynamic Stage (`Stage.tsx:52–136`):** Sofia Avatar container anchored by a horizontal laser datum line (`Stage.tsx:84–90`), dual floating speech captions, and an absolute-positioned companion rail (`PaneRail.tsx`).
  - **Bottom Dock Bar (`page.tsx:586–680`):** Full-duplex Talk/Hang up toggle button, unified text command bar, command suggestion pills (`/`), and keyboard shortcut hints.
  - **Navbar Exclusion:** `Navbar.tsx:40–42` deliberately returns `null` when `pathname === '/'`, dedicating the home route entirely to the Jarvis companion viewport.

### 2.2 Dynamic Stage Scaling & Layout Shifts
`Stage.tsx` implements dynamic stage adaptation based on the active pane count (`Stage.tsx:40–49`):
```tsx
let sofiaScale = 1;
let sofiaShift = '0%';

if (paneCount === 1) {
  sofiaScale = 0.75;
  sofiaShift = '-22%';
} else if (paneCount >= 2) {
  sofiaScale = 0.58;
  sofiaShift = '-30%';
}
```
These properties are injected as CSS custom properties (`--sofia-scale`, `--sofia-shift`, `Stage.tsx:56–58`) and animated via `globals.css` (lines 400–410):
```css
.stage-centre {
  transform: scale(var(--sofia-scale)) translateX(var(--sofia-shift));
  transition: transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease;
  transform-origin: center center;
}

@media (max-width: 767px) {
  .stage-centre {
    transform: scale(var(--sofia-scale)) translateX(0) !important;
  }
}
```

#### Critical Stage Defect — Coordinate Collision:
1. **Desktop / Tablet Collision (768px – 1024px):**  
   The side rail (`PaneRail`) is positioned at `md:absolute md:right-8 lg:right-16 md:top-1/2 md:-translate-y-1/2` with width `w-[380px] lg:w-[420px]`. When 2 panes are active, `.stage-centre` shifts left by `-30%`. However, the spoken caption card beneath Sofia is sized up to `max-w-xl` (576px, `Stage.tsx:95`). On a 1024px viewport, `1024px - 420px = 604px` remaining. A 576px box with a `-30%` translate offset overflows the left viewport edge or overlaps the right rail, creating severe visual collision.
2. **Mobile Overflow Clipping (< 768px):**  
   On mobile screens, `translateX(0) !important` prevents the avatar from shifting off-screen, but `scale(0.58)` still shrinks the avatar. The `PaneRail` renders in normal document flow below the avatar (`mt-6 md:mt-0`). Because `layout.tsx:29` and `Stage.tsx:53` declare `overflow-hidden`, when panes appear, they push the bottom dock or get cut off entirely, with zero scrollability.

### 2.3 Dual Caption System vs. Orphaned `CaptionLine.tsx`
- **User Caption (`Stage.tsx:64–69`):** Live speech transcription rendered in a compact pill above the avatar (`bg-rose-950/40 border-rose-800/30 text-rose-300/80 font-mono text-xs`).
- **Sofia Spoken Caption (`Stage.tsx:94–123`):** Floating card (`backdrop-blur-xl bg-[#14030a]/75 border-burgundy-800/40`) displaying dialogue with live status indicators (`Volume2` when speaking, `Sparkles` or bouncing dots when thinking).
- **Code Duplication & Orphaned Component:**  
  `src/components/CaptionLine.tsx` was engineered with a smooth typewriter character reveal effect (`displayedText` slicing at 22ms intervals, lines 21–33) and an audio replay button (`onReplayAudio`, lines 56–66). However, `CaptionLine.tsx` is completely unimported (0 references in `src/`). `Stage.tsx` re-implemented its own inline caption container without typewriter smoothing or audio replay controls.

---

## 3. Avatar Presentation & Expression System Audit

### 3.1 2.5D Breathing PNGTuber vs. 3D Three.js VRM Placeholder
- **Dead Dependencies in `package.json`:**
  - `@pixiv/three-vrm`: `^3.5.5`
  - `three`: `^0.187.0`
  - `@types/three`: `^0.187.0`
  - *Audit Finding:* `grep -rn "three" src/` yields **zero** imports (the single match in `persona.voice.ts:40` is natural prose: *"One to three sentences"*).
- **Ghost Specification Discrepancy:**  
  `reports/uiux/3D-AVATAR-ARCHITECTURE-SPEC.md` outlines an elaborate Three.js VRM setup (`public/models/sofia.vrm`, `src/lib/avatar3d/VRMAvatarController.ts`, MToon shaders, SpringBone physics, ACES Filmic tone mapping). Inspection of Git history reveals commit `195306ef` explicitly purged the 3D stack:  
  `"Phase 0: Removed fake CUA, deleted 3D avatar stack & SaaS skill traps... Phase 5: Generated 8 crisp PNGTuber expressions with transparent alpha in public/sofia/expressions/"`.  
  The 3D model files do not exist; the active implementation is 100% 2.5D PNGTuber.

### 3.2 The 8 Emotional Expressions
The system defines 8 emotional expressions (`src/lib/types.ts:179–187`):
`neutral`, `pleased`, `amused`, `disappointed`, `concerned`, `focused`, `sleepy`, `stern`.
- **Asset Verification:**
  All 8 assets exist in `public/sofia/expressions/` as WebP images:
  - `neutral.webp` (39.2 KB)
  - `pleased.webp` (39.7 KB)
  - `amused.webp` (39.9 KB)
  - `focused.webp` (39.9 KB)
  - `stern.webp` (40.3 KB)
  - `disappointed.webp` (39.5 KB)
  - `concerned.webp` (40.2 KB)
  - `sleepy.webp` (40.4 KB)
- **Mood Mapping (`src/lib/expressions.ts:3–22`):**  
  `MOOD_TO_EXPRESSION` successfully normalizes semantic agent moods (`proud` $\rightarrow$ `pleased`, `strict` $\rightarrow$ `stern`, `curious` $\rightarrow$ `focused`, `alarmed` $\rightarrow$ `stern`).
- **Asset Fallback 404 Bug (`SofiaAvatar.tsx:79, 154, 168`):**  
  ```tsx
  // SofiaAvatar.tsx:79
  const getSrc = (exp: SofiaExpression) => {
    return EXPRESSION_IMAGES[exp] || '/sofia/expressions/neutral.png';
  };
  // Lines 154, 168:
  onError={(e) => {
    (e.target as HTMLImageElement).src = '/sofia/expressions/neutral.png';
  }}
  ```
  *Defect:* There are **zero** `.png` files in `public/sofia/expressions/`. If an expression fails to load or an invalid key is supplied, the browser triggers a 404 error and enters an infinite image load failure loop.
- **Broken Crossfade Transition Bug (`SofiaAvatar.tsx:148–169`):**  
  ```tsx
  {/* SofiaAvatar.tsx:163-165 */}
  <img
    src={getSrc(currentExp)}
    alt={`Sofia ${currentExp}`}
    className={`relative w-full h-full object-contain pointer-events-none drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)] transition-opacity duration-180 ${
      isCrossfading ? 'opacity-100' : 'opacity-100'
    }`}
  />
  ```
  *Defect:* Both ternary branches render `'opacity-100'`. Simultaneously, the outgoing image (`prevExp`, line 152) has a hardcoded class of `opacity-0`. Consequently, no CSS crossfade transition occurs; expressions snap instantaneously with 0 visual blending.

### 3.3 Mouth Phoneme & Lip Sync Animation Audit
- **Non-Phonetic Reality:**  
  There is zero phoneme-to-viseme analysis (no visemes for `A`, `E`, `I`, `O`, `U`, `M`, `F`).
- **Mouth Construction (`SofiaAvatar.tsx:173–181`):**  
  The mouth is a single dark CSS pill placed over the 2D WebP image:
  ```tsx
  <div
    aria-hidden="true"
    style={{
      height: `${mouthHeightPx}px`,
      width: `${mouthWidthPx}px`,
    }}
    className="absolute bottom-[36.5%] left-[48.5%] -translate-x-1/2 bg-rose-950/90 rounded-full border border-rose-400/60 shadow-[0_0_8px_rgba(244,63,94,0.5)] pointer-events-none transition-all duration-75 ease-out"
  />
  ```
  Where `mouthHeightPx` ranges from 3px to 14px, and `mouthWidthPx` from 12px to 20px.
- **Live Voice vs. Standard TTS Discrepancy:**  
  - *Gemini Live Mode (`session.ts:586–598`):* Computes `mouthOpen` via a sigmoid curve `1 / (1 + Math.exp(-45 * v + 5))` using microphone/model audio RMS, providing dynamic mouth movement.
  - *Text / TTS Mode (`page.tsx:323–329`, `voice.ts:66–119`):* When Sofia speaks via Edge TTS or ElevenLabs, `mouthOpen` is **never updated** (`mouthOpen = 0`). The mouth overlay remains a completely frozen 3px slit (`mouthHeightPx = 3`, `mouthWidthPx = 12`) for the entire duration of speech synthesis.

---

## 4. Dynamic Pane & Telemetry Projection Audit

### 4.1 Companion Rail Mechanics (`src/components/PaneRail.tsx`)
- **Docking & Inactivity Timeout:**  
  Panes are rendered in a companion rail (`w-full md:w-[380px] lg:w-[420px]`). An inactivity timer (`inactivityTimeoutMs = 240000`, 4 minutes; `PaneRail.tsx:24–36`) automatically dismisses unpinned panes.
- **Pinning Semantics:**  
  Clicking the pin icon (`Pane.tsx:50–61`) toggles `pane.pinned`. Pinned panes are immune to the 4-minute eviction timer and survive `Escape` key dismissals (`page.tsx:353`).
- **Stacking & Tab Switching (`PaneRail.tsx:43–85`):**  
  Desktop displays a maximum of 2 panes concurrently (`MAX_VISIBLE_DESKTOP = 2`). When $>2$ panes exist, panes 2+ are collapsed into an interactive tab rail (`Layers` icon with pill tabs).

### 4.2 The 8 Dynamic Pane Renderers (`src/components/Pane.tsx`)
1. **`chart` (`Pane.tsx:91–234`):** Pure SVG rendering without external chart library overhead. Supports `donut` (circumference calculation with legend), `line` (smooth polyline with area fill gradient), and `bar` (normalized horizontal progress bars).
2. **`stat` (`Pane.tsx:239–262`):** 2-column KPI grid with primary metric values and delta change badges (`+12%`, `-5m`).
3. **`table` (`Pane.tsx:267–294`):** Striped data table with column headers.
4. **`timeline` (`Pane.tsx:299–322`):** Connected vertical timeline with rose dot anchors and duration tags.
5. **`web` (`Pane.tsx:327–364`):** Web Reader Card (**strictly non-iframe**). Parses hostname, displays thumbnail banner, article title with external link, and text snippet. Avoids iframe security sandbox blocks and framebusting.
6. **`image` (`Pane.tsx:369–384`):** Aspect-constrained image viewer with caption.
7. **`todo` (`Pane.tsx:389–436`):** Interactive task checklist. Clicking an item toggles its state and fires an asynchronous `PATCH /api/tasks` (`Pane.tsx:399–404`).
8. **`code` (`Pane.tsx:442–470`):** Syntax box with language pill badge and one-click copy-to-clipboard functionality with checkmark feedback.

### 4.3 Telemetry Projection HUD (`src/components/LiveDebugOverlay.tsx`)
- **Visual Design:** Floating cybernetic HUD (`w-72 bg-black/85 border-rose-500/40 backdrop-blur-xl`, lines 53–56) positioned fixed in top-right.
- **Key Metrics Tracked:**
  - **TTFA (Time to First Audio):** User phoneme to first audio packet. Displays in emerald green if $<1300\text{ms}$, amber otherwise (`LiveDebugOverlay.tsx:86`).
  - **TTFT (Time to First Token):** First server message latency.
  - **Connection & Session Timers:** Formatted `mm:ss` durations (`lines 100–104`).
  - **Drops & Reconnects:** Reconnection count and dropped audio packet count.
  - **Voice & Model Identifiers:** `Aoede` / `Leda` / `Achernar` and model name.
- **Minimization:** Can be collapsed into a compact pill badge (`LIVE DEBUG (###ms)`).

---

## 5. Multi-Modal Input & User Feedback Audit

### 5.1 Input Modalities in `src/app/page.tsx`
1. **Unified Text Bar (`page.tsx:633–672`):** Translucent glass pill (`glass-panel border-burgundy-700/50`) with auto-submit on `Enter`.
2. **Slash Command Suggestions (`page.tsx:588–600`):** Typing `/` immediately displays 5 command chips:
   - `/stats` $\rightarrow$ *"Give me a summary of my stats and output today"*
   - `/screenshot` $\rightarrow$ *"Take a screenshot of my laptop screen"*
   - `/tasks` $\rightarrow$ *"What tasks are on my list today?"*
   - `/wazuh` $\rightarrow$ *"Run the wazuh log tail action"*
   - `/focus` $\rightarrow$ *"Start a 45-minute focus session"*
3. **Full-Duplex Gemini Live Toggle (`page.tsx:605–630`):**
   - Click-to-start / Click-to-hang-up button.
   - States: "Talk" (Rose gradient) vs. "Hang up" (Pulsing Red/Crimson gradient).
4. **Keyboard Accelerators (`page.tsx:340–358`):**
   - `Cmd+K` / `Ctrl+K`: Focuses the text input field.
   - `Escape`: Instantly flushes audio buffers, stops TTS speech, and dismisses all unpinned panes.

### 5.2 Hold-to-Talk vs. Click-to-Toggle Discrepancy
- **Audit Requirement:** The audit scope called for inspecting the *"hold-to-talk mic button"*.
- **Codebase Reality:** There is **no hold-to-talk button** on the Stage. The mic button is strictly a click-to-toggle duplex voice connection.
- **The Orphaned Hook (`src/hooks/useVoiceInput.ts`):**  
  `useVoiceInput.ts` (293 lines) contains a production-grade Web Speech API recognition manager with audio RMS volume analysis (`analyser.createAnalyser()`, lines 185–189), speech threshold monitoring (`SPEECH_THRESHOLD = 0.02`), silence timeout auto-commit (`silenceTimeoutMs = 1600`, lines 228–244), and microphone preflight checks.  
  *Finding:* `useVoiceInput` has **zero imports** in the entire application (`grep -rn "useVoiceInput" src/` matches only its own definition). Push-to-Talk (PTT) is completely unbuilt in the UI.

---

## 6. Accessibility, Responsiveness & State Management Gaps

### 6.1 WCAG 2.2 AA Contrast & Color Token Deficits
- **Passing Ratios:** `#fff1f2` on `#080205` yields $>18:1$ contrast (exceeds WCAG AAA).
- **Failing Contrast Instances (Normal Text $<4.5:1$):**
  - `page.tsx:676`: `text-[10px] font-mono text-rose-400/60` (keyboard shortcuts hint) on `#080205` yields $\sim 3.6:1$.
  - `page.tsx:656`: `placeholder:text-rose-400/50` yields $\sim 3.1:1$.
  - `page.tsx:444`: `text-rose-400/40` yields $\sim 2.4:1$.
  - `Pane.tsx:431`: `text-[10px] font-mono text-rose-400/70` on `#16030c` yields $\sim 4.2:1$.

### 6.2 Semantic Structure & ARIA Compliance Failures
1. **Missing `<h1>` Landmark (`src/app/page.tsx`):**  
   The primary stage has no `<h1>` heading element anywhere in its DOM tree (WCAG 2.4.6 / 1.3.1 violation).
2. **Missing Input Label (`src/app/page.tsx:641–657`):**  
   The primary command input has no `<label>`, `aria-label`, or `aria-labelledby`. Screen readers announce only an untitled edit box.
3. **Missing `aria-live` on Spoken Dialogue (`Stage.tsx:94–123`):**  
   Neither `captionText` nor `userCaption` containers declare `aria-live="polite"` or `role="status"`. Screen reader users receive zero auditory feedback when Sofia speaks or when their voice is transcribed.
4. **Inaccessible Secondary Navigation Menu (`page.tsx:502–564`):**  
   The MoreHorizontal trigger button lacks `aria-expanded={menuOpen}` and `aria-haspopup="menu"`. The dropdown container lacks `role="menu"`, individual links lack `role="menuitem"`, and there is no keyboard arrow navigation or focus trap.
5. **Icon Buttons Missing Accessible Names:**  
   The telemetry toggle (`page.tsx:453`), audition shortcut (`page.tsx:465`), and mute toggle (`page.tsx:489`) rely on the `title` attribute without `aria-label` or `<span className="sr-only">`.

### 6.3 Responsiveness & Viewport Lock Issues
- **`h-screen overflow-hidden` (`layout.tsx:29`):**  
  Hard-locking the viewport height to 100vh breaks when virtual keyboards open on mobile browsers (iOS Safari/Android Chrome), causing the bottom dock to collide with the avatar or vanish entirely.
- **Side Rail Mobile Inaccessibility:**  
  When panes open on mobile devices, they render below the avatar inside an `overflow-hidden` container, becoming inaccessible or clipped without scrollability.

### 6.4 State Management & Component Bloat
- **Unmanaged Local State:** `src/app/page.tsx` holds 18 individual `useState` hooks. Navigating to `/chat` or `/tasks` completely unmounts the Stage, disconnecting the WebSocket live session, dumping active panes, and losing telemetry metrics.
- **Orphaned Component Roster:**
  - `src/components/CaptionLine.tsx`
  - `src/components/SofiaPanel.tsx`
  - `src/components/ScoreRing.tsx`
  - `src/components/CategoryBars.tsx`
  - `src/hooks/useVoiceInput.ts`

---

## 7. UI/UX Evolution Plan towards Cinematic Jarvis Interface

### Phase 1: Foundation Hardening & Defect Remediation (Immediate)
1. **Clean Dependencies:** Remove `three`, `@pixiv/three-vrm`, and `@types/three` from `package.json` until genuine 3D WebGL rendering is implemented, saving ~150MB of dependency bloat.
2. **Fix Image Fallbacks & Crossfade:**  
   Update `SofiaAvatar.tsx:79, 154, 168` to point to `/sofia/expressions/neutral.webp`. Repair the crossfade logic so `prevExp` transitions from `opacity-100` to `opacity-0` while `currentExp` fades in.
3. **WCAG Compliance Fixes:**  
   Add a visually hidden `<h1 className="sr-only">Sofia Stage Console</h1>`; attach `aria-label="Ask Sofia or type / for commands"` to the primary input; add `aria-live="polite"` to `Stage.tsx` captions; and replace opacity tokens with high-contrast `#fda4af` / `#fecdd3`.

### Phase 2: True Push-to-Talk (PTT) & TTS Audio Reactivity
1. **Wire Push-to-Talk (PTT):**  
   Integrate `useVoiceInput.ts` into a dedicated Hold-to-Talk mic button (`onMouseDown`/`onMouseUp`, `onTouchStart`/`onTouchEnd`), allowing rapid dictation without forcing an open duplex Gemini Live call.
2. **Audio-Reactive TTS Lip Sync:**  
   Connect an `AudioContext` and `AnalyserNode` to `speakSofia` (`voice.ts:98–110`). Feed RMS amplitude into `setMouthOpen` during Edge TTS/ElevenLabs playback, resolving the frozen mouth slit defect.

### Phase 3: Spatial Hologram Stage & Cinematic HUD
1. **Radial 3D Perspective Projection:**  
   Transform `.stage` using CSS 3D transforms (`perspective: 1200px; transform-style: preserve-3d;`). Project companion panes into an orbital cylindrical arc (`rotateY(-18deg) translateZ(-40px)`), creating true depth around the central avatar.
2. **Interactive Hologram Pedestal:**  
   Replace the static laser line with a dynamic WebGL audio frequency ring that expands into concentric acoustic ripples in sync with speech frequencies.
3. **Omnibox Command Palette:**  
   Upgrade the `/` suggestion bar into an Alfred/Spotlight-style floating modal palette (`Cmd+K`) featuring fuzzy search, keyboard arrow navigation, tool execution previews, and live telemetry graphs.

---

## 8. Detailed File & Line Citation Matrix

| Component / File | Lines | Description / Finding | Severity |
|---|---|---|---|
| `package.json` | 12–13, 19 | Dead dependencies: `three`, `@pixiv/three-vrm`, `@types/three` (0 imports in `src/`) | Moderate |
| `reports/uiux/3D-AVATAR-ARCHITECTURE-SPEC.md` | 1–79 | Ghost spec claiming production 3D VRM; purged in commit `195306ef` | Informational |
| `src/components/SofiaAvatar.tsx` | 79, 154, 168 | Hardcoded `.png` fallback (`/sofia/expressions/neutral.png`); files are `.webp` | Critical |
| `src/components/SofiaAvatar.tsx` | 152, 163–165 | Broken crossfade: `opacity-100 : opacity-100` and `prevExp` hardcoded `opacity-0` | Moderate |
| `src/components/SofiaAvatar.tsx` | 84–85, 173–181 | Non-phonetic mouth pill; frozen 3px slit during non-live TTS speech | Serious |
| `src/components/Stage.tsx` | 40–49, 127–135 | Center stage scaling collisions with absolute 420px `PaneRail` on 768–1024px screens | Serious |
| `src/components/Stage.tsx` | 64–69, 94–123 | Captions lack `aria-live="polite"`; screen readers receive no spoken updates | Critical |
| `src/components/CaptionLine.tsx` | 1–70 | Orphaned component; typewriter and replay audio unimported in `Stage.tsx` | Minor |
| `src/components/PaneRail.tsx` | 24–36, 43–85 | 4-minute auto-dismissal for unpinned panes; tabs snap without animation | Minor |
| `src/components/Pane.tsx` | 413–435 | Todo checklist buttons lack `role="checkbox"` and `aria-checked` | Moderate |
| `src/app/page.tsx` | 410–415 | Missing `<h1>` page landmark tag | Critical |
| `src/app/page.tsx` | 641–657 | Primary text input lacks `<label>` or `aria-label` | Critical |
| `src/app/page.tsx` | 502–564 | Secondary dropdown menu lacks `aria-expanded`, `role="menu"`, and keyboard trap | Serious |
| `src/hooks/useVoiceInput.ts` | 1–293 | Fully implemented Web Speech + silence hook completely orphaned (0 callers) | Moderate |
| `src/app/globals.css` | 400–410 | `.stage-centre` and `.pane-host` keyframe transition declarations | Reference |
| `src/app/layout.tsx` | 29 | `h-screen max-h-screen overflow-hidden` breaks mobile virtual keyboard viewports | Serious |
