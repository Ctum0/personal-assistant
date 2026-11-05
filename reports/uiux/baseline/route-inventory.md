# Route Inventory — Sofia Personal AI Companion

**Date:** 2026-11-06  
**Auditor:** Antigravity 2.0 (Auditor)  

---

## 1. User-Facing Frontend Routes

| Path | Name | Primary Function | Key Components | Auth Required |
|---|---|---|---|---|
| `/` | **Home Dashboard** | Main live companion overview; displays animated Sofia avatar, live caption dialogue, today's focus & output metrics, score ring, activity category bars, telemetry simulator. | `SofiaAvatar`, `CaptionLine`, `ScoreRing`, `CategoryBars`, Expression Selector | No (Single-user local dashboard) |
| `/chat` | **Sofia Chat** | Interactive conversation with Sofia; Hermes API streaming integration, push-to-talk voice dock, speech playback, tool execution chips, suggested questions. | `SofiaAvatar`, `VoiceDock`, Message List, Chat Input, Tool Chips | No |
| `/computer-use` | **Hermes Computer Use** | Background desktop automation center; CUA driver (0.21.0) status, toolset status badges, quick verified system tasks, interactive command console. | Toolset Cards, Task Action Buttons, Execution Console | No |
| `/timeline` | **Activity Timeline** | 24-hour activity audit; stacked category bars by hour, detailed app breakdown upon hour selection, manual offline activity logger. | 24h Stacked Bar Chart, Hourly App Inspector, Manual Event Form | No |
| `/history` | **Trends & History** | Long-term consistency analysis; 14-day score trajectory bar graph, average consistency score, daily facts & verdicts log. | Trajectory Chart, Verdict Cards, Streak Badge | No |
| `/tasks` | **Tasks & Focus** | Daily goals management and deep work block timer; strict focus block with radial countdown, drift alerts, task CRUD with estimated minutes. | Focus Timer Dial, Task List CRUD, Task Progress Bar | No |
| `/memory` | **Memory Vault** | What Sofia remembers; search filter, long-term memory notes, tags, pinned context facts, and daily recap records. | Search Input, Memory Note Cards, Note Creation Form | No |
| `/settings` | **Settings & Rules** | Configuration panel; personality dials (Strictness, Warmth, Teasing, Formality, Verbosity), accountability targets, Hermes AI config, consequence safety ladder. | Dial Sliders, Target Inputs, Safety Toggles, Save Button | No |

---

## 2. Backend API Routes

| Method | Path | Function | Payload / Response |
|---|---|---|---|
| `GET` | `/api/stats` | Fetches today's rolled-up minutes (work, leisure, neutral), commits, wake time, coverage. | `DayStats` JSON |
| `GET` | `/api/score` | Calculates and returns 0-10 score, component weights, verdict, and optional history. | `DayScore` JSON |
| `GET` | `/api/timeline` | Groups events into 24-hour buckets with per-hour application minutes breakdown. | Array of 24 hourly records |
| `GET, POST` | `/api/chat` | Retrieves chat history or processes a new user message turn through Hermes AI. | `ChatMessage` / Sofia response JSON |
| `GET, POST` | `/api/computer-use` | Queries Hermes gateway toolsets or executes background desktop automation actions. | Hermes status / Action execution result |
| `POST` | `/api/focus/start` | Initiates a strict focus block with goal minutes. | Session metadata |
| `POST` | `/api/focus/stop` | Terminates active focus block and marks status. | Changes count |
| `POST` | `/api/ingest/events` | Ingests batches of activity events from PC agent or simulator; recalculates stats. | Ingest count |
| `POST` | `/api/ingest/heartbeat` | Health check heartbeat from PC agent. | Heartbeat confirmation |
| `GET, POST, DELETE` | `/api/memory` | Retrieves, creates, or removes long-term memory notes. | Note CRUD responses |
| `GET, PUT` | `/api/settings` | Reads or updates global personality dials, targets, and consequence safety settings. | `SofiaSettings` JSON |
| `GET` | `/api/stream` | Server-Sent Events (SSE) live stream delivering 15s heartbeats and real-time state. | SSE event stream |
| `GET, POST, PATCH, DEL`| `/api/tasks` | Full CRUD for user priorities and completion status. | `TaskItem` responses |

---

## 3. Route Accessibility & State Matrix

All 8 primary UI routes are functional, render without 404 or runtime exceptions, and provide live real-time synchronization with the underlying SQLite database and Hermes API service.
