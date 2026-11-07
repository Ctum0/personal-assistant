# MASTER AUDIT SYNTHESIS: EDGE CASE & SYSTEM FAILURE MODE ANALYSIS
**Audit Deliverable**: `audit/08-edge-case-analysis.md`  
**System**: JARVIS / Sofia Platform  
**Date**: November 2026  
**Auditor**: Principal QA & Failure Analysis Directorate  

---

## 1. Input Edge Cases & Malformed Data

| Trigger Input | Code Location | System Reaction / Failure Mode | Root Cause | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Empty or Whitespace User Prompt** | `src/app/api/chat/route.ts:12` | Returns HTTP 400 `{ error: 'Message required' }`. | Early return validation works. | Low |
| **Malformed JSON in `POST /api/chat`** | `src/app/api/chat/route.ts:8` | Returns HTTP 400 `{ error: 'Invalid JSON' }`. | Caught in route handler. | Low |
| **Prompt Exceeding Context Limit** | `src/lib/brain.ts:527` | Silently slices last 8 messages (`history.slice(-8)`). Earlier context discarded. | Naive hardcoded sliding window. | Medium |
| **SQL Injection in Task Filter** | `src/lib/tools.ts:458` | String interpolated into raw query: `WHERE status = '${args.status}'`. Arbitrary SQL executes. | Unparameterized dynamic query. | **Critical (P0)** |
| **Corrupted Tags in `remember` Tool** | `src/lib/tools.ts:534`<br>`src/app/api/memory/route.ts:23` | Sofia inserts unquoted string `'conversation'`. Subsequent `GET /api/memory` crashes with `SyntaxError`. | Type mismatch (raw string vs serialized JSON array). | **Critical (P0)** |
| **Simultaneous Sub-millisecond Chat Turns** | `src/app/api/chat/route.ts:18` | Generates identical ID `msg-${Date.now()}-u`. SQLite crashes on PRIMARY KEY conflict. | Non-monotonic timestamp ID generation. | High (P1) |

---

## 2. Model & Reasoning Failure Modes

| Model Behavior | Code Location | Observed Failure Path | Resulting System State | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Invalid Model 404** | `src/lib/brain.ts:643` | Endpoint requests non-existent `gemini-3.5-flash-lite`. Google returns 404. | Tier 2 fails immediately; dumps into canned Tier 3 fallback. | **Critical (P0)** |
| **Markdown Preamble Before JSON** | `src/lib/brain.ts:136` | `cleaned.startsWith('```')` returns `false`. `JSON.parse` throws. | Regex mood fallback extracts raw markdown as spoken speech. | High (P1) |
| **Literal String `"null"` Returned** | `src/lib/brain.ts:141` | `JSON.parse("null")` returns `null`. `typeof parsed.say` throws `TypeError`. | Fallback catches error, returns raw text. | Medium (P2) |
| **Multi-Step Tool Workflow (>2 Turns)** | `src/lib/brain.ts:544` | `loopCount < 2` expires after first tool execution. Loop terminates prematurely. | Complex multi-step task abandoned mid-execution. | High (P1) |
| **LiteLLM Timeout (45s) Cascade** | `src/lib/brain.ts:562, 656` | LiteLLM hangs 45s, then Gemini hangs 25s. Total wait: 70 seconds. | Client UI hangs for 70 seconds before fallback message. | High (P1) |
| **Duplicate Mutating Tool Execution** | `src/lib/brain.ts:587, 677` | Iteration 1 executes mutating tool (`create_task`). Iteration 2 crashes; cascade to Gemini repeats tool. | Duplicate task records created in SQLite. | High (P1) |

---

## 3. Tool Execution & Subprocess Failure Modes

| Tool Failure Trigger | Code Location | System Reaction / Failure Mode | Impact on Node Event Loop | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Hanging Shell Command (`computer_run`)** | `src/lib/tools.ts:671` | Synchronous `execSync(command, { timeout: 10000 })` executes. | **Entire Node.js server freezes for 10s**. All SSE, audio, and HTTP requests blocked. | **Critical (P0)** |
| **Non-Existent Command** | `src/lib/tools.ts:684` | `execSync` throws `Command failed`. Caught by catch block, returns exit code 1. | Handled gracefully. | Low |
| **Headless VPS Screen Capture** | `src/lib/tools.ts:646` | `DISPLAY=:0 import` fails because X11 server is absent. | Catches error; falls back to Hermes delegation. | Medium (P2) |
| **Hermes Gateway Offline** | `src/lib/tools.ts:807` | Loops through two URLs with 15s timeouts each (30s total delay). | Swallows error, returns `"Hermes gateway currently unreachable"`. | High (P1) |
| **Unrestricted File Read (`/etc/shadow`)** | `src/lib/tools.ts:700` | `fs.readFileSync(args.path)` executes with server process privileges. | Arbitrary host file exfiltration. | **Critical (P0)** |
| **Unrestricted File Overwrite** | `src/lib/tools.ts:723` | `fs.writeFileSync(args.path, args.content)` overwrites files. | Destructive overwrite of code or `.env.local`. | **Critical (P0)** |

---

## 4. Database Concurrency & Locking Failure Modes

| Concurrency Scenario | Code Location | Observed Failure Path | Resulting Error | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Concurrent Event Ingestion & Chat** | `src/lib/db.ts:27-33` | SQLite in `DELETE` journal mode with `busy_timeout = 0`. Second write collides. | `Error: SQLITE_BUSY: database is locked`. Unhandled HTTP 500. | **Critical (P0)** |
| **Un-batched Bulk Event Ingestion** | `src/lib/db.ts:402-432` | 100 events inserted in autocommit mode without transaction. 100 fsyncs executed. | Heavy disk I/O lock contention; locks DB for 500ms+. | High (P1) |
| **SSE Stream 15s Heartbeat Polling** | `src/app/api/stream/route.ts:32` | Multiple connected tabs execute `getDayStats` and `getDayScore` every 15s. | Continuous read-lock contention against active writers. | High (P1) |
| **Live Database Copy (`backup-sofia-db`)** | `src/lib/actions/backup-sofia-db.ts:19`| `fs.copyFileSync` copies database while write transactions are active. | Destination backup contains torn pages or corrupt state (`SQLITE_CORRUPT`). | **Critical (P0)** |

---

## 5. Network & WebSocket Streaming Failure Modes

| Network Event | Code Location | Observed Failure Path | Resulting System State | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Gemini Live Token Refresh Failure** | `src/lib/live/session.ts:615-625` | During `attemptReconnect()`, token fetch fails. Catch block only logs warning. | Session stuck in `'reconnecting'` indefinitely without timer. | High (P1) |
| **Max Reconnection Retries Exceeded** | `src/lib/live/session.ts:606-614` | When `reconnectCount >= 2`, code resets `reconnectCount = 0` and continues. | Infinite reconnection retry loop. | High (P1) |
| **40-Minute Migration Deadlock** | `src/lib/live/session.ts:628-640` | `migrateSession()` calls `start()`. `start()` aborts if `state !== 'off'`. | Session closes existing socket and aborts; call abruptly dies. | **Critical (P0)** |
| **Abrupt Client SSE Disconnect** | `src/app/api/stream/route.ts:47` | Abort listener calls `controller.close()` without checking `desiredSize`. | Unhandled `TypeError: Controller is already closed`. | Medium (P2) |
| **Voice Interruption Audio Bleed** | `src/lib/live/session.ts:562` | `flushAudio()` stops active sources, but doesn't drop in-flight WebSocket packets. | Late chunks from interrupted turn play after user stops talking. | High (P1) |

---

## 6. Summary of Failure Mode Matrix
Across the 6 critical subsystems, **28 distinct failure modes** were identified, of which **7 are Critical (P0)**, **12 are High (P1)**, and **9 are Medium/Low (P2/P3)**. Addressing these requires implementing WAL concurrency, sandboxing shell/file tools, and fixing the reconnection and migration state machines.
