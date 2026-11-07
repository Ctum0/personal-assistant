# Phase 2 — End-to-End Pipeline Audit (Pipelines A through H)

This document traces every end-to-end operational pipeline in the Sofia architecture, evaluating actual behavior vs expected behavior, missing conditions, unhandled edge cases, and failure modes.

---

## Pipeline A — Text Interaction

`User message ➔ API ➔ Session identification ➔ Context retrieval ➔ Intent recognition ➔ Reasoning ➔ Planning ➔ Tool selection ➔ Permission check ➔ Execution ➔ Result verification ➔ Response generation ➔ Conversation persistence`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. User Input** | Captured via input box with Cmd+K and suggestion chips | Input captured in `src/app/page.tsx` (`handleSendMessage`) | No input length validation before sending | **Partial** |
| **2. API Ingress** | `/api/chat` validates auth token and message non-emptiness | Validates bearer token via `verifyApiAuth()` and checks `!userMessage.trim()` | Truncation of extremely long strings (>32KB) not enforced | **Complete** |
| **3. Session ID** | Request belongs to an isolated conversation session | All messages share single flat `messages` table with hardcoded `'user'` / `'assistant'` role | No `session_id` concept; concurrent devices overwrite same thread | **Broken** |
| **4. Context Retrieval** | Fetches relevant short-term history, pinned notes, and live telemetry | Queries `events`, `tasks`, `day_stats`, and `memory_notes` (pinned=1) | History hardcoded to `slice(-8)` in memory; no semantic retrieval | **Partial** |
| **5. Reasoning & Routing** | Evaluates intent, queries tools or responds directly | Tries LiteLLM if key set; falls back to Gemini 3.5 Flash Lite with tool declarations | No explicit ambiguity detection prompt; model assumes intent | **Complete** |
| **6. Tool Selection** | Model generates typed `functionCall` | Handled via OpenAI tool format or Gemini `functionDeclarations` | Model cannot plan parallel multi-tool calls in single step | **Partial** |
| **7. Permission Check** | Consequential operations (`computer_run`, file edits) checked against policy | `executeTool()` runs `execSync()` directly without policy validation | `policy.ts` consequence ladder bypassed by `tools.ts` | **Critical Defect (P0)** |
| **8. Tool Execution** | Synchronously or asynchronously runs tool and formats Stage Pane | Runs `executeTool()`, returns result and Stage Pane | Max execution timeout per tool not enforced on local bash commands | **Partial** |
| **9. Result Verification** | Verifies execution side-effects before claiming success | Results passed back into LLM turn loop | Silent failures in bash exit code 0 with error in stderr | **Partial** |
| **10. Response Generation**| Synthesizes natural language answer and emotional mood | Returns JSON `{ say, mood, panes }`, extracts mood cleanly | Code fences occasionally emitted by LLM handled by `parseTurn` | **Complete** |
| **11. Persistence** | Persists turn and tool calls to database | Inserts user and assistant rows into `messages` | Tool call arguments serialized as JSON text, but no foreign key | **Complete** |

---

## Pipeline B — Voice Interaction

`Microphone ➔ Audio capture ➔ Voice activity detection ➔ Speech recognition ➔ Transcript validation ➔ Intent recognition ➔ Context retrieval ➔ Reasoning ➔ Execution ➔ Response generation ➔ Text-to-speech ➔ Audio playback`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. Audio Ingress** | Captures 16kHz PCM via AudioWorklet with echo cancellation | `public/worklets/pcm-16k.js` with inlined Blob fallback downsamples stream | Mobile Safari compatibility requires audioContext unlock | **Complete** |
| **2. Ephemeral Auth** | Client mints short-lived token to avoid master API key leak | `/api/live/token` mints 30-min token via Google `auth_tokens` API | Single-use token (`uses: 1`) terminates if socket reconnects | **Partial** |
| **3. VAD & Framing** | Server-side voice activity detection with configurable silence | Sent via setup frame (`automaticActivityDetection`, silence 500ms) | Client-side acoustic echo cancellation occasionally loops speakers | **Partial** |
| **4. Speech & Intent** | Multimodal end-to-end voice streaming without separate STT | Gemini Live processes raw audio directly, emitting 24kHz audio + captions | Server captions are asynchronous and stream turn-by-turn | **Complete** |
| **5. Live Tools** | Server emits `toolCall` over WebSocket, client executes via `/api/live/tool` | Handled via `SofiaLiveSession.handleServerMessage()`, posts to `/api/live/tool` | Tool execution pauses voice turn until response frame sent | **Complete** |
| **6. Audio Egress** | Plays 24kHz PCM chunks through Web Audio API playhead | Scheduled linearly on `AudioBufferSourceNode` queue | Network jitter can cause audio buffer underrun/stutter | **Complete** |
| **7. Barge-In** | User speech instantly silences active assistant playback | Server emits `{ interrupted: true }`; client calls `flushAudio()` | Unplayed buffer sources stopped; playhead reset to current time | **Complete** |
| **8. Context Sharing**| Voice conversation context logged into primary conversation history | Live sessions do NOT write turns to `messages` table | Chat text interface has no memory of voice sessions! | **Critical Defect (P1)** |

---

## Pipeline C — Autonomous Task Execution

`Task request ➔ Task classification ➔ Goal definition ➔ Task decomposition ➔ Planning ➔ Dependency analysis ➔ Agent assignment ➔ Tool execution ➔ Progress tracking ➔ Result validation ➔ Recovery ➔ Completion`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. Decomposition** | Breaks complex request into dependency-ordered DAG of subtasks | Single-turn model generates 1 tool call at a time (max 2-3 loops) | No DAG or subagent task queue exists in `brain.ts` | **Missing (P1)** |
| **2. Background Tasks**| Long-running operations run in background without blocking turn | Next.js API route has 90s timeout; long tasks block HTTP connection | No background task daemon or job queue (e.g. BullMQ / Redis) | **Missing (P1)** |
| **3. State Tracking** | Task state persisted with progress percentage and cancellation | Tasks stored in SQLite `tasks` table (`status: pending/completed`) | No live execution status (running/failed/retry) during tool run | **Partial** |
| **4. Recovery** | If step fails, engine attempts alternative or asks user | If tool throws, error returned to model; loop exits after count >= 2 | No automated retry or rollback mechanism | **Partial** |

---

## Pipeline D — Multi-Agent Collaboration

`Orchestrator ➔ Agent selection ➔ Task delegation ➔ Context transfer ➔ Agent execution ➔ Result reporting ➔ Result validation ➔ Conflict resolution ➔ Result aggregation ➔ Final response`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. Agent Discovery**| Discovers available agent personas (Research, Code, Machine) | Single monolithic brain prompt (`persona.ts`) | No multi-agent registry in TypeScript core | **Missing (P1)** |
| **2. Delegation** | Orchestrator delegates subtask to specialized agent | Tools delegate to Hermes gateway via HTTP `/chat/completions` | Hermes connection is optional and falls back if offline | **Partial** |
| **3. Shared Context** | Agents share memory and blackboard state | SQLite database serves as global state store | No transaction locking or message broker between agents | **Partial** |

---

## Pipeline E — Memory Lifecycle

`Interaction ➔ Information extraction ➔ Classification ➔ Relevance evaluation ➔ Privacy evaluation ➔ Storage ➔ Indexing ➔ Retrieval ➔ Ranking ➔ Context injection ➔ Correction ➔ Deletion`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. Extraction** | Automatically detects facts, preferences, and personal details | Only extracts memory if model explicitly calls `remember(text)` | Passive interactions do not generate memory notes | **Partial** |
| **2. Storage** | Persists memory with embeddings, tags, and timestamps | Inserts into `memory_notes (id, text, tags, created_at, pinned)` | Plaintext text column; no vector embeddings | **Partial** |
| **3. Retrieval** | Semantic search by cosine similarity and recency ranking | Queries `SELECT * FROM memory_notes WHERE pinned = 1 LIMIT 4` | Search tool uses SQL `text LIKE '%query%'`; no semantic search | **Partial** |
| **4. Contradictions**| Resolves conflicts between old and new facts | Duplicate notes can be created with contradictory information | No deduplication or conflict resolution logic | **Missing (P2)** |
| **5. Forgetting** | Allows user to delete or expire memories | Supported via `/api/memory?id=...` (DELETE) and UI | No automated decay or time-to-live expiration | **Partial** |

---

## Pipeline F — External Tool Execution

`Intent ➔ Tool discovery ➔ Tool selection ➔ Schema validation ➔ Permission validation ➔ Execution ➔ External response ➔ Output validation ➔ Result verification ➔ State update ➔ User notification`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. Registry** | 22 unified tools declared in both Gemini and OpenAI schemas | `src/lib/tools.ts` exports `UNIFIED_TOOLS` with both schemas | Schemas are hardcoded; no runtime plugin registration | **Complete** |
| **2. Validation** | Validates parameter types and required fields | Type casting done in switch cases (`Number(args.minutes)`) | Zod validation schemas not executed on tool arguments | **Partial** |
| **3. Security Gate**| High-risk tools (`computer_run`, `computer_file_write`) require user consent | Executed immediately with Node `child_process.execSync` | **Critical Security Gap (P0)**: Arbitrary command execution without confirmation | **Broken** |
| **4. Verification** | Verifies file written or command completed successfully | Checks file exists or returns stdout | Stderr and non-zero exit codes throw generic errors | **Complete** |

---

## Pipeline G — Background Tasks & Proactive Schedulers

`Task scheduling ➔ Queue insertion ➔ Worker assignment ➔ Execution ➔ Progress updates ➔ Persistence ➔ Completion notification ➔ Recovery`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. Scheduling** | Schedules stored with cron expressions | Stored in `schedules` table (`id, name, cron, action, enabled, next_run`)| Cron string parsing relies on external caller | **Complete** |
| **2. Execution** | External VPS cron or internal timer hits `/api/cron/[job]` | `/api/cron/[job]/route.ts` executes `runProactiveJob(job)` | If server restarts, missed crons are not backfilled | **Partial** |
| **3. Notifications**| Proactive verdicts pushed to Telegram and displayed on Stage | Pushes to Telegram if bot token configured, writes to `proactive_log` | Stage UI does not poll `proactive_log` in real time | **Partial** |

---

## Pipeline H — Failure Recovery

`Failure detection ➔ Classification ➔ Error reporting ➔ Retry eligibility ➔ Recovery strategy ➔ State reconciliation ➔ Final status`

| Step | Expected Behavior | Actual Behavior | Missing Conditions / Gaps | Status |
|:---|:---|:---|:---|:---|
| **1. LLM Failure** | If primary model times out or 5xx, falls back seamlessly | LiteLLM ➔ Gemini 3.5 Flash Lite ➔ Dynamic DB Telemetry | Verified in tests; never hangs or repeats canned text | **Complete** |
| **2. Audio Failure**| If AudioWorklet fails network fetch, falls back to memory Blob | Handled via inlined Blob URL fallback in `session.ts` | Fully resilient across strict CORS environments | **Complete** |
| **3. DB Lock** | Handles SQLite `SQLITE_BUSY` or concurrent lock | `node:sqlite` in WAL mode handles readers, but write locks throw | No exponential backoff retry for SQLite busy errors | **Partial** |
