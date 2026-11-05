# Architecture Inventory — Sofia Personal AI Companion

**Date:** 2026-11-06  
**Auditor:** Antigravity 2.0 (Auditor)  
**System Under Test:** Sofia Personal AI Companion  
**Workspace:** `/home/ctum/Documents/antigravity/agitated-archimedes`  

---

## 1. Stack & System Overview

| Layer | Component / Technology | Version / Specification |
|---|---|---|
| **Framework** | Next.js (App Router, Turbopack) | `16.4.5` |
| **Language & Runtime** | TypeScript + Node.js | TypeScript `5.9.3`, Node `v26.8.2` |
| **Styling & CSS** | Tailwind CSS v4 | `@import "tailwindcss";` with custom theme variables |
| **Component Architecture** | React 19 Client & Server Components | `19.3.0` |
| **Icons & Media** | Lucide React | `1.68.0` |
| **Package Manager** | pnpm | `12.11.2` |
| **Database & Persistence** | Built-in `node:sqlite` (SQLite 3 WAL) | Database at `data/sofia.db` |
| **AI / Brain Engine** | Local Hermes Agent HTTP API Server | Port `8642` (`/v1/chat/completions`) |
| **Model Provider** | GitHub Copilot / GPT-4o via Hermes | Provider `copilot`, model `gpt-4o` |
| **Desktop Automation** | Hermes CUA Driver | `0.21.0` (Linux X11/AT-SPI/Wayland bridge) |
| **Telemetry Ingest** | REST JSON Ingestion | ActivityWatch / PC agent format |
| **Realtime Channel** | Server-Sent Events (SSE) | `/api/stream` (15s heartbeat) |
| **Test Framework** | Vitest | `5.1.0` |

---

## 2. Directory & Component Structure

```text
agitated-archimedes/
├── agent-pc/
│   └── agent.py                  # Linux active window tracking & heartbeat daemon
├── data/
│   └── sofia.db                  # Local SQLite database (WAL mode)
├── reports/
│   └── uiux/                     # Comprehensive UI/UX audit & redesign reports
├── src/
│   ├── app/
│   │   ├── (dash)/
│   │   ├── api/
│   │   │   ├── chat/             # Sofia streaming persona chat route
│   │   │   ├── computer-use/     # Hermes CUA actions & status
│   │   │   ├── cron/             # Scheduled proactive events
│   │   │   ├── focus/start & stop
│   │   │   ├── ingest/events & heartbeat
│   │   │   ├── memory/           # Memory notes CRUD
│   │   │   ├── score/            # 0-10 score & history
│   │   │   ├── settings/         # Configuration & safety dials
│   │   │   ├── stats/            # Category minutes rollup
│   │   │   ├── stream/           # Server-Sent Events live feed
│   │   │   ├── tasks/            # Task list CRUD
│   │   │   └── timeline/         # Hourly activity grouping
│   │   ├── chat/page.tsx         # Chat interface + voice dock
│   │   ├── computer-use/page.tsx # Background desktop automation hub
│   │   ├── history/page.tsx      # Score trends & verdict log
│   │   ├── memory/page.tsx       # Memory notes vault
│   │   ├── settings/page.tsx     # Personality & safety settings
│   │   ├── tasks/page.tsx        # Tasks & focus block timer
│   │   ├── timeline/page.tsx     # 24h activity chart & app breakdown
│   │   ├── layout.tsx            # Global layout with glassy burgundy backdrop
│   │   └── page.tsx              # Home dashboard with Sofia avatar
│   ├── components/
│   │   ├── CaptionLine.tsx       # Typewriter dialogue with speech playback
│   │   ├── CategoryBars.tsx      # Real-time category meters
│   │   ├── Navbar.tsx            # Glassy header with kill switch
│   │   ├── ScoreRing.tsx         # 0-10 radial progress gauge
│   │   ├── SofiaAvatar.tsx       # Animated anime character with glasses & short hair
│   │   └── VoiceDock.tsx         # Push-to-talk & audio controls
│   └── lib/
│       ├── brain.ts              # Persona prompt & Hermes context builder
│       ├── db.ts                 # SQLite schema & query methods
│       ├── hermes.ts             # Hermes API client & local executor
│       ├── policy.ts             # Safety limits & quiet hours
│       ├── scoring.ts            # Pure 0-10 weighted scoring engine
│       └── types.ts              # Shared TypeScript definitions
└── tests/
    ├── policy.test.ts            # Consequence safety rules test suite
    └── scoring.test.ts           # Daily score formula unit test suite
```

---

## 3. Existing Styling & Design Conventions

1. **Color Palette**: Dark burgundy/wine tones (`#080205`, `#1f0611`, `#2a0818`, `#881337`, `#e11d48`, `#f43f5e`).
2. **Glassmorphism**: `.glass-panel`, `.glass-card`, `.glass-input` utilizing `backdrop-filter: blur()`, semi-transparent backgrounds and borders.
3. **Typography**: Monospace numerals and labels for technical data; refined sans-serif for Sofia's dialogue and conversational text.
4. **State Management**: React `useState` / `useEffect` with live SSE stream updates and REST sync.
