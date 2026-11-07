# Phase 0 — Project Discovery & Repository Topology

## 1. Executive Summary & Repository Context

The project is **Sofia**, an advanced AI personal assistant designed as a hybrid Jarvis/companion assistant.
The codebase is implemented primarily in **TypeScript (Next.js 16 App Router, React 19, Tailwind CSS 4, node:sqlite)** with Python sidecars and bash maintenance scripts.

- **Primary Repository:** `Ctum0/personal-assistant`
- **Current Branch:** `main`
- **Framework:** Next.js `16.4.5` (Turbopack, App Router)
- **Runtime:** Node.js v26.8.2 (Linux x86_64)
- **Database:** Local SQLite (`data/sofia.db`) accessed synchronously via Node 22+ built-in `node:sqlite` (`DatabaseSync`).
- **Inference Engines:**
  1. Primary Cloud LLM: Google Gemini (`gemini-3.5-flash-lite`, `gemini-3.8-live` via `GEMINI_API_KEY`)
  2. Proxy Cloud LLM: LiteLLM OpenAI-compatible gateway (`https://ai-proxy.zenova.services/v1`, `deepseek-v4.1-flash`)
  3. Local Agent Hub: Hermes Agent Gateway (`http://127.0.0.1:8642/v1` or bridge `10.0.1.1:8644/v1`)
- **Speech & Audio:**
  1. Bidirectional Real-time WebSocket: Gemini Live Multimodal API (`wss://generativelanguage.googleapis.com/.../BidiGenerateContentConstrained` with `Aoede` voice and `pcm-16k.js` AudioWorklet)
  2. Fallback TTS: Microsoft Edge TTS (`msedge-tts` `en-US-AvaNeural`) and ElevenLabs (`EXAVITQu4vr4xnSDxMaL` Bella)
  3. Speech Recognition: Web Speech API STT and Gemini Live PCM streaming.

---

## 2. Complete Repository Inventory

```
.
├── agent-pc/
│   └── agent.py                  # Standalone PC window monitor (xdotool/xprop)
├── audit/                        # Dedicated full-system engineering audit directory
│   ├── 00-executive-summary.md
│   ├── 01-project-discovery.md
│   ├── 02-system-architecture.md
│   ├── 03-component-inventory.md
│   ├── 04-data-flow.md
│   ├── 05-pipeline-analysis.md
│   └── 06-agent-reports/         # Multi-agent domain audit reports
├── data/
│   ├── backups/                  # Gzipped SQLite snapshots
│   └── sofia.db                  # Primary SQLite operational database
├── public/
│   ├── images/                   # Sofia portrait & reference renders
│   ├── sofia/expressions/        # PNGtuber 8 emotional expressions
│   └── worklets/
│       └── pcm-16k.js            # Web Audio API 16kHz PCM downsampler worklet
├── scripts/
│   ├── agent-pc.py               # ActivityWatch & window telemetry daemon
│   ├── backup.sh                 # Database gzip backup script
│   ├── capture-desktop-views.mjs # Headless screenshot utility
│   ├── hermes-relay.py           # TCP socket bridge (10.0.1.1:8644 -> 127.0.0.1:8643)
│   ├── rollup.ts                 # Daily telemetry rollup calculation
│   ├── run-axe-audit.mjs         # Axe-core accessibility test
│   └── verify-living-presence.mjs# Stage presence verification script
├── src/
│   ├── app/                      # Next.js 16 App Router
│   │   ├── api/                  # 19 REST / WebSocket helper routes
│   │   ├── audition/page.tsx     # Voice audition & preview lab
│   │   ├── chat/page.tsx         # Traditional multi-turn text interface
│   │   ├── history/page.tsx      # Conversation logs & memory review
│   │   ├── memory/page.tsx       # Knowledge notes & pinned memory editor
│   │   ├── page.tsx              # Dynamic Jarvis Stage (Center avatar + sliding panels)
│   │   ├── settings/page.tsx     # Persona, voice & API configuration
│   │   ├── tasks/page.tsx        # Task list & focus manager
│   │   ├── timeline/page.tsx     # Chronological telemetry visualizer
│   │   └── unlock/page.tsx       # Master Bearer Token unlock gate
│   ├── components/               # React UI & Stage components
│   │   ├── CaptionLine.tsx       # Live subtitles with typing animation
│   │   ├── CategoryBars.tsx      # Productivity distribution visualizer
│   │   ├── LiveDebugOverlay.tsx  # Latency, VAD & connection metrics overlay
│   │   ├── Navbar.tsx            # Navigation header
│   │   ├── Pane.tsx              # Polymorphic side panel (metric/chart/code/todo/table)
│   │   ├── PaneRail.tsx          # Dual-rail sliding containers
│   │   ├── ScoreRing.tsx         # Circular SVG daily score meter
│   │   ├── SofiaAvatar.tsx       # 2.5D breathing canvas & mouth phoneme synchronizer
│   │   ├── SofiaPanel.tsx        # Dynamic sliding card container
│   │   └── Stage.tsx             # Master viewport coordinator
│   ├── hooks/
│   │   └── useVoiceInput.ts      # Web Speech API STT hook with auto-reconnect
│   ├── lib/                      # Core business logic & subsystems
│   │   ├── actions/              # Concrete local executor actions (backup, git, obsidian, etc.)
│   │   ├── auth.ts               # Shared bearer token middleware & header validator
│   │   ├── brain.ts              # Intelligence coordinator, prompt builder & model dispatch
│   │   ├── db.ts                 # SQLite schema, queries, day rollups & settings
│   │   ├── expressions.ts        # Expression mapper (mood -> PNG expression asset)
│   │   ├── github.ts             # GitHub API commit counter
│   │   ├── hermes-tools.ts       # Hermes agent tools & computer-use definitions
│   │   ├── live/
│   │   │   ├── config.ts         # Gemini Live configuration & tool definitions
│   │   │   └── session.ts        # Gemini Live client WebSocket & audio pipeline
│   │   ├── persona.ts            # Text persona system prompt generator
│   │   ├── persona.voice.ts      # Voice persona prompt builder
│   │   ├── policy.ts             # Consequence ladder & accountability safety policy
│   │   ├── proactive.ts          # Cron scheduled notifications & Telegram push
│   │   ├── scoring.ts            # Daily score algorithm (0-100)
│   │   ├── stage.ts              # Stage pane state contracts & turn schemas
│   │   ├── tools.ts              # Unified 22-tool registry & local executor
│   │   ├── tts.ts                # Edge TTS & ElevenLabs audio synthesizers
│   │   ├── types.ts              # Global TypeScript interfaces & default settings
│   │   └── voice.ts              # Browser audio playback unlocker & speech synthesis
│   └── proxy.ts                  # Next.js edge proxy / middleware protection
├── tests/                        # Vitest unit & integration test suites
│   ├── auth.test.ts
│   ├── brain.test.ts
│   ├── cron.test.ts
│   ├── live.test.ts
│   ├── persona.test.ts
│   ├── policy.test.ts
│   ├── rollup.test.ts
│   └── scoring.test.ts
├── Dockerfile                    # Production container build
├── next.config.ts                # Next.js build configuration (Turbopack)
└── package.json                  # Dependencies & scripts
```

---

## 3. Discovered Redundancies, Unused Code & Inconsistencies

1. **PC Collector Agent Duplication:**
   - `scripts/agent-pc.py` (166 lines) supports ActivityWatch REST polling, token auth, and heartbeat emission.
   - `agent-pc/agent.py` (100 lines) uses `xdotool` and `xprop` directly with hardcoded URLs and no auth tokens.
   - *Impact:* Divergent collector implementations cause telemetry loss if deployed interchangeably.

2. **Database Backup Duplication:**
   - `scripts/backup.sh` creates timestamped backups in `data/backups/`.
   - `src/lib/actions/backup-sofia-db.ts` re-implements the same logic inside TypeScript for tool execution.

3. **Tool Registry Fragmentation (Historically Split, Recently Unified):**
   - `src/lib/tools.ts` contains the authoritative 22-tool catalog (`UNIFIED_TOOLS`).
   - `src/lib/brain.ts` previously maintained an outdated 7-tool sub-array (`SOFIA_TOOLS`). Now unified to delegate to `src/lib/tools.ts`.
