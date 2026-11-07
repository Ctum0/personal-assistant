# MASTER AUDIT SYNTHESIS: PHASED REMEDIATION ROADMAP
**Audit Deliverable**: `audit/14-remediation-roadmap.md`  
**System**: JARVIS / Sofia Platform  
**Date**: November 2026  
**Auditor**: Principal Architecture & Engineering Execution Board  

---

## 1. Phased Remediation Dependency Graph

```mermaid
flowchart TD
    subgraph Phase1 ["Phase 1: Critical Security & Concurrency (P0 - Immediate)"]
        F01["FIND-01: Auth Guard on /api/live/tool"]
        F02["FIND-02 & F03: Sandbox computer_run & computer_file_*"]
        F04["FIND-04: Parameterize list_tasks SQL"]
        F05["FIND-05: Fix remember tool tag serialization"]
        F06["FIND-06: Enable SQLite WAL mode & 5s busy timeout"]
    end

    subgraph Phase2 ["Phase 2: Conversational & Voice Continuity (P1 - Core)"]
        F07["FIND-07: Wire Voice Transcripts to messages table"]
        F08["FIND-08: Add session_id & channel to messages schema"]
        F09["FIND-09: Fix Live State transitions (speaking/listening)"]
        F10["FIND-10: Fix VAD Silence Cutoff Logic"]
        F11["FIND-11: Correct Gemini Model Identifiers"]
    end

    subgraph Phase3 ["Phase 3: Integration & Gateway Alignment (P1/P2)"]
        F13["FIND-13: Set httpOnly: true on cookies & remove localStorage leak"]
        F14["FIND-14: Unify Hermes Port (8642) & Socket Cleanup"]
        F15["FIND-15 & F16: Fix Avatar Expression WebP Fallback & Crossfade"]
        F17["FIND-17: Add Database Secondary Indexes"]
    end

    subgraph Phase4 ["Phase 4: Dead Code Cleanup & Dependency Pruning (P3)"]
        F19["FIND-19: Remove Dead 3D three Dependencies"]
        F20["FIND-20: Delete Orphaned SOFIA_TOOLS in brain.ts"]
        F12["FIND-12: Implement Active Background Scheduler Poller"]
    end

    Phase1 --> Phase2
    Phase2 --> Phase3
    Phase3 --> Phase4
```

---

## 2. Remediation Execution Plan by Phase

### Phase 1: Critical Security & Concurrency (P0 — Immediate Execution)
- **Goal**: Close RCE vulnerabilities, eliminate database locking crashes, and fix data corruption bugs.
- **Actions**:
  1. Add `verifyApiAuth` to `src/app/api/live/tool/route.ts`.
  2. Implement strict command gating in `src/lib/tools.ts` for `computer_run` and workspace bounds for `computer_file_*`.
  3. Parameterize `list_tasks` SQL queries in `src/lib/tools.ts` and `src/lib/brain.ts`.
  4. Fix `remember` tool tag serialization (`JSON.stringify([args.tags || 'conversation'])`).
  5. Enable `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` in `src/lib/db.ts`.

### Phase 2: Conversational & Voice Continuity (P1 — Core)
- **Goal**: Make voice interactions persistent, eliminate conversational amnesia, and fix avatar speech reactivity.
- **Actions**:
  1. Add `session_id` and `channel` to `messages` table in `src/lib/db.ts`.
  2. Implement transcript logging in `src/lib/live/session.ts` to push voice turns into `/api/chat`.
  3. Update `session.ts` to call `this.setState('speaking')` and `this.setState('listening')` in lockstep with audio playback.
  4. Correct the VAD silence detection logic in `session.ts` (replace `now - userSpeechStartTime > 300` with `lastVoiceActiveTime`).
  5. Replace invalid model names in `src/lib/brain.ts` (`gemini-2.0-flash` or `gemini-1.5-flash`) and `src/lib/live/config.ts`.

### Phase 3: Integration & Gateway Alignment (P1/P2)
- **Goal**: Harden authentication headers, unify the Hermes machine control gateway, and polish avatar expressions.
- **Actions**:
  1. Set `httpOnly: true` on `sofia_token` cookie and eliminate token reflection in `/api/auth`.
  2. Align `scripts/hermes-relay.py` target to port `8642` and ensure sockets close on failure.
  3. Fix avatar image fallback to `.webp` and restore smooth crossfade opacity transitions in `SofiaAvatar.tsx`.
  4. Add secondary indexes on `events(ts)`, `tasks(status)`, `messages(ts)`, and `memory_notes(pinned)`.

### Phase 4: Hygiene & Maintenance (P3)
- **Goal**: Prune dead dependencies and eliminate redundant code.
- **Actions**:
  1. Run `pnpm remove three @pixiv/three-vrm @types/three`.
  2. Delete legacy `SOFIA_TOOLS` and `executeSofiaTool` from `src/lib/brain.ts`.
  3. Wire background runner for `schedules` table in Next.js server lifecycle.
