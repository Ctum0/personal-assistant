# Sofia — Personal AI Companion

> A composed, dry-witted, quietly strict personal AI companion and chief of staff who watches over your day, remembers your habits, and holds you to your own goals.

Designed with a **dark aesthetic blurry, glassy burgundy vibe** and featuring **Sofia**, an original animated anime girl with glasses and short hair, powered by **Hermes AI** with **background Computer Use (`cua-driver`)**.

---

## 🍷 Visual Aesthetic & Design

- **Live Production URL**: [https://sofia.ctum.org](https://sofia.ctum.org)
- **Deployment**: Coolify containerized standalone Next.js 16 runtime with automated git-push CD.

- **Palette**: Deep wine and dark burgundy background (`#080205` to `#240715`), crimson glowing accents (`#e11d48`, `#f43f5e`), and soft rose highlights (`#fda4af`).
- **Glassmorphism**: Layered `backdrop-blur-2xl` glass panels with delicate semi-translucent crimson borders and ambient radial neon glows.
- **Sofia Character**:
  - Original vector animated anime girl with stylish short bob/pixie cut with dark wine highlights.
  - Cute thin-rimmed glasses with subtle diagonal light shimmer reflections.
  - Blinking anime eyes, breathing/floating idle motion, and mouth animation synchronized to speech.
  - **8 Expressive States**: `neutral`, `pleased`, `amused`, `disappointed`, `concerned`, `focused`, `sleepy`, `stern`.

---

## 🧠 Brain & Hermes AI Integration

Sofia uses your local **Hermes Agent** API:
- **API Server Endpoint**: `http://127.0.0.1:8642/v1` (with systemd persistence and auto-start on login)
- **Model**: `copilot / gpt-4o`
- **Live Context Block**: Every turn injects live telemetry (woke time, focus minutes, commits, leisure %, current score, open tasks, memory notes).
- **Hermes Background Computer Use**:
  - Connected via `cua-driver` (0.21.0) on Linux (AT-SPI / XTest / Wayland virtual keyboard).
  - Background desktop execution without focus stealing or cursor warping.
  - Dedicated **Computer Use** dashboard tab (`/computer-use`) for background tasks, window audits, system diagnostics, and terminal commands.

---

## 📊 Pages & Capabilities

| Route | Name | Purpose |
| --- | --- | --- |
| `/` | **Home** | Center Sofia avatar with real-time expression, typewriter caption line, score ring (0-10), focus and output metrics, activity classification bars, and quick telemetry simulation buttons. |
| `/chat` | **Chat** | Full streaming chat with Sofia, voice link dock (push-to-talk speech recognition & speech synthesis), tool call chips, and suggestion prompts. |
| `/computer-use` | **Computer Use** | Hermes background computer use hub: CUA driver status, toolsets overview, quick system audits, and interactive execution console. |
| `/timeline` | **Timeline** | 24-hour stacked activity bar chart by category (Work, Leisure, Neutral), hourly app/window inspection, and manual offline event entry. |
| `/history` | **History** | 14-day score trajectory bar graph, average consistency score, and daily verdicts log. |
| `/tasks` | **Tasks** | Priorities list with CRUD, estimated minutes, completion toggles, and strict focus session countdown with drift warning. |
| `/memory` | **Memory** | Knowledge vault of long-term memory notes, tags, pinned facts, and daily summaries. |
| `/settings` | **Settings** | Personality dials (Strictness, Warmth, Teasing, Formality, Verbosity), accountability targets, Hermes config, and consequence safety ladder. |

---

## 🛡️ Consequence Safety Policy (Section 11)

Consequences are strictly guarded by pure TypeScript code outside the LLM:
1. **Master Switch**: Default OFF in Settings with automatic expiry.
2. **Hard Intensity Ceiling**: Clamps any requested stimulus to configured max.
3. **Daily Action Cap**: Default max 2 per day, with minimum 30-minute cooldown gap.
4. **Quiet Hours**: Enforced between bedtime and wake time.
5. **Emergency Kill Switch**: Accessible right from the top navigation header on every screen.

---

## 🚀 Running the Project

```bash
# 1. Install dependencies
pnpm install

# 2. Run unit tests (scoring engine & safety policy)
pnpm vitest run

# 3. Build for production
pnpm build

# 4. Start production server
pnpm start
# App runs at http://localhost:3000
```

### Starting the PC Activity Watcher Agent

```bash
python3 agent-pc/agent.py
```
Tracks active Linux desktop windows and posts heartbeats + normalized events to Sofia every 60 seconds.
