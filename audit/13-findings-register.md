# MASTER AUDIT SYNTHESIS: UNIFIED FINDINGS REGISTER (P0 – P4)
**Audit Deliverable**: `audit/13-findings-register.md`  
**System**: JARVIS / Sofia Platform  
**Date**: November 2026  
**Auditor**: Principal Architecture & Quality Assurance Directorate  

---

## 1. Findings Classification Standards
- **P0 (Critical / Blocker)**: Remote Code Execution, security bypass, data corruption, severe concurrency crashes, or total feature failure. Must be remediated before production operation.
- **P1 (High)**: Data loss, persistent state amnesia, major network failure loops, unhandled API timeouts, or severe protocol misconfigurations.
- **P2 (Medium)**: Broken UI animations, missing secondary indexes, dead code clutter, or accessibility non-compliance.
- **P3 (Low)**: Minor code style inconsistencies, cosmetic text alignment, or unused dependencies.
- **P4 (Informational)**: Architectural evolution recommendations, future vector database migrations, or long-term multi-agent DAG frameworks.

---

## 2. Master Findings Register

| ID | Title | Severity | Component / File & Line | Description & Evidence | Remediation Action |
|---|---|---|---|---|---|
| **FIND-01** | Unauthenticated RCE via `/api/live/tool` | **P0** | `src/app/api/live/tool/route.ts:5-27` | Route accepts unauthenticated tool requests, allowing arbitrary `computer_run` host command execution via `execSync`. | Wrap with `verifyApiAuth` and enforce policy gating on dangerous tools. |
| **FIND-02** | Arbitrary Shell Execution & Event Loop Freeze | **P0** | `src/lib/tools.ts:671` | `computer_run` executes arbitrary unsandboxed bash commands via synchronous `execSync`, blocking the single-threaded Node loop for up to 10s. | Whitelist allowed commands or return confirmation pane; make async. |
| **FIND-03** | Arbitrary Filesystem Write & Read | **P0** | `src/lib/tools.ts:700, 723` | `computer_file_write` and `read` operate on arbitrary paths without workspace jailing, enabling code overwrite and secret exfiltration. | Enforce `path.resolve(process.cwd(), args.path)` workspace boundary. |
| **FIND-04** | SQL Injection in Task Filter | **P0** | `src/lib/tools.ts:458`<br>`src/lib/brain.ts:395` | `args.status` is directly interpolated into raw SQL string: `WHERE status = '${args.status}'`. | Use parameterized query with bound `?` parameter. |
| **FIND-05** | Memory Crash on Note Tags Parse | **P0** | `src/lib/tools.ts:534`<br>`src/app/api/memory/route.ts:23` | `remember` tool inserts unquoted string `'conversation'` instead of JSON array, causing fatal `SyntaxError` in `/api/memory`. | Store `JSON.stringify([args.tags || 'conversation'])`. |
| **FIND-06** | SQLite Concurrency Crash (No WAL / 0ms Timeout) | **P0** | `src/lib/db.ts:27-33` | SQLite in `DELETE` journal mode with 0ms busy timeout. Concurrent read/write throws `SQLITE_BUSY: database is locked`. | Set `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;`. |
| **FIND-07** | Live Voice Transcript Amnesia | **P1** | `src/lib/live/session.ts:335-350` | Gemini Live spoken audio and transcripts are never written to SQLite `messages`. 100% of voice conversation evaporates on hangup. | Post completed voice turns to `/api/chat` or dedicated persist route. |
| **FIND-08** | Global Message Collision (No Session ID) | **P1** | `src/lib/db.ts:76-83` | `messages` table lacks `session_id`, `channel`, and `device_id`. All clients and cron jobs share one unpartitioned flat log. | Add `session_id` and `channel` columns with compound index. |
| **FIND-09** | Avatar Mouth Never Moves in Voice Mode | **P1** | `src/lib/live/session.ts:109, 537` | `SofiaLiveSession` never transitions to `'speaking'` state. `page.tsx`'s `isSpeaking` stays `false`, and mouth DOM is unmounted. | Call `this.setState('speaking')` during playback; wire RMS to mouth. |
| **FIND-10** | VAD Premature Cutoff Bug | **P1** | `src/lib/live/session.ts:487` | Checks `now - userSpeechStartTime > 300` instead of silence duration. First 100ms pause cuts off user mid-sentence. | Track `lastVoiceActiveTime` and require $\ge 500\text{ms}$ sustained silence. |
| **FIND-11** | Hallucinated Gemini Model 404s | **P1** | `src/lib/brain.ts:643`<br>`src/lib/live/config.ts:26` | Hardcodes non-existent `gemini-3.5-flash-lite` and `gemini-3.8-live`, returning HTTP 404 from Google APIs. | Use valid model names (`gemini-2.0-flash` / `gemini-1.5-flash`). |
| **FIND-12** | Dead Code Scheduler (`schedules` Table) | **P1** | `src/lib/db.ts:150-159` | Schedules table records crons, but no runner or background daemon ever queries or executes them. | Implement an active background cron scheduler in server lifecycle. |
| **FIND-13** | Insecure Cookie (`httpOnly: false`) & Token Echo | **P1** | `src/app/api/auth/route.ts:20, 28` | Cookie set without `httpOnly: true`; token duplicated into `localStorage`; plaintext token reflected in response JSON. | Set `httpOnly: true`, remove `localStorage` copy, don't echo token. |
| **FIND-14** | Hermes Port Mismatch & Socket Leak | **P1** | `scripts/hermes-relay.py:14`<br>`src/lib/tools.ts:803` | Relay forwards to 8643; code targets 8642. Relay leaks client sockets on connection errors. | Unify port to 8642; close client socket on connection failure. |
| **FIND-15** | Broken Avatar Expressions Image Fallback | **P2** | `src/components/SofiaAvatar.tsx:79` | Fallback and `onError` point to `.png`, but assets on disk are `.webp`. Triggers 404 image loop on failure. | Change fallback string to `/sofia/expressions/neutral.webp`. |
| **FIND-16** | Broken Avatar Expression Crossfade | **P2** | `src/components/SofiaAvatar.tsx:163` | Both ternary branches render `'opacity-100'`, while `prevExp` is hardcoded `opacity-0`. Zero crossfade animation. | Fix CSS transition classes to fade `prevExp` out as `currentExp` fades in. |
| **FIND-17** | Unindexed Database Tables | **P2** | `src/lib/db.ts:36-176` | Zero secondary indexes across 14 tables; timeline and chat history perform full table scans. | Add indexes on `events(ts)`, `tasks(status)`, `messages(ts)`. |
| **FIND-18** | Missing Production Pages (`/computer-use`) | **P2** | `README.md:33, 43` | Advertised `/computer-use` hub page is completely absent from repository. | Create `/computer-use` route or remove misleading doc entries. |
| **FIND-19** | Dead 3D VRM Dependencies | **P3** | `package.json:12, 13, 19` | `three`, `@pixiv/three-vrm`, `@types/three` installed with 0 imports in codebase. | Run `pnpm remove three @pixiv/three-vrm @types/three`. |
| **FIND-20** | Duplicate Tool Engine in Brain | **P3** | `src/lib/brain.ts:174-488` | `SOFIA_TOOLS` and `executeSofiaTool` are dead duplicate code; production uses `src/lib/tools.ts`. | Delete dead tool declarations and switch in `brain.ts`. |
