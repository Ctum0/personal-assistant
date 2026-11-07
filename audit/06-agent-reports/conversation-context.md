# AUDIT REPORT: CONTEXT, CONVERSATION & SESSION MANAGEMENT
**Target System:** Sofia / JARVIS (Full-System Engineering Audit)  
**Agent:** AGENT 7 — CONTEXT, CONVERSATION & SESSION MANAGEMENT AUDITOR  
**Audit Target Path:** `audit/06-agent-reports/conversation-context.md`  
**Status:** COMPLETE / EVIDENCE-VERIFIED  

---

## EXECUTIVE SUMMARY

Sofia's conversational engine presents a critical architectural dichotomy: while the UI simulates an intimate, proactive AI chief of staff, the underlying conversation and context management infrastructure operates as a **stateless, single-tenant, flat message log with zero session isolation and 0% cross-channel continuity**.

Key structural findings:
1. **Single Global Flat Log**: The database (`src/lib/db.ts:76-83`) contains a 6-column `messages` table with no `session_id`, `conversation_id`, `device_id`, or `user_id`. Every client, tab, and background cron job writes to the same unpartitioned log.
2. **Aggressive Double Truncation**: A naive truncation pipeline (`messages.slice(-6)` in `src/app/chat/page.tsx:81` followed by `history.slice(-8)` in `src/lib/brain.ts:527`) permanently discards context past 3 conversational round-trips. Furthermore, `src/app/api/chat/route.ts:49` hardcodes `LIMIT 30`, silently cutting off history without pagination.
3. **Stage Home Statelessness**: On the primary visual interface (`src/app/page.tsx:270`), text messages are sent to `/api/chat` with **zero conversation history** (`history: []`), rendering home page interactions completely amnesic.
4. **Complete Voice Channel Data Evaporation**: Full-duplex voice via Gemini 3.8 Live (`src/lib/live/session.ts`) never persists user audio, transcripts, or model turns to SQLite. Once the user hangs up or the 40-minute migration triggers, all conversational data vanishes completely.
5. **Tool Context Amnesia**: Tool calls executed during a turn are stripped by the client when preparing subsequent history (`src/app/chat/page.tsx:81`), preventing the LLM from referencing previously returned tool data.
6. **Critical Crash Defect**: The `remember` tool (`src/lib/tools.ts:534`) writes comma-separated strings instead of JSON arrays into `memory_notes.tags`, triggering a fatal `SyntaxError` in `src/app/api/memory/route.ts:23` that crashes the memory endpoint.

---

## 1. CONVERSATION & SESSION ARCHITECTURE

### 1.1 Database Schema & Storage Model
The database layer is implemented using Node's built-in `node:sqlite` (`DatabaseSync`) in `src/lib/db.ts`. The conversation persistence model consists of a single SQLite table defined at lines 76–83:

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  mood TEXT,
  tool_calls TEXT
);
```

#### Schema Deficiencies
| Property | Expected Modern Architecture | Actual Implementation (`src/lib/db.ts`) | Architectural Impact |
| :--- | :--- | :--- | :--- |
| **Session Identification** | `session_id TEXT NOT NULL` | **ABSENT** | All interactions coalesce into a single global chronological log. |
| **Channel Scoping** | `channel TEXT` ('chat', 'voice', 'proactive') | **ABSENT** | Background crons, chat messages, and web hooks pollute the same stream. |
| **Device / User Attribution**| `device_id TEXT`, `user_id TEXT` | **ABSENT** | Multiple devices or browser sessions interleave unpredictably. |
| **Message Hierarchy** | `parent_id TEXT`, `seq INTEGER` | **ABSENT** | Inability to track branched, retried, or interrupted turns. |
| **Token Tracking** | `tokens_in INT`, `tokens_out INT` | **ABSENT** | No observability on token consumption or window limits. |
| **Indexes** | `CREATE INDEX idx_msg_ts / idx_session`| **NONE** (Only PK on `id`) | Full table scans on chronological queries. |

### 1.2 Session Identification & Lifecycle Analysis
1. **Single Global Message Log**: Sofia does not support multiple conversations, threads, or sessions. There is no concept of creating a new session, archiving a thread, or switching contexts.
2. **Client State vs Database Reality**:
   - In `src/app/chat/page.tsx:20`, messages are kept in a local React hook: `const [messages, setMessages] = useState<ChatMessage[]>([]);`.
   - On page mount (`useEffect` at line 58), `fetchHistory()` performs `GET /api/chat`, fetching the last 30 global messages.
   - If the user opens two tabs or logs in from mobile, both interfaces write to and read from the exact same unpartitioned sequence.
3. **Primary Key Collision Vulnerability**:
   - User messages are generated with ID `msg-${Date.now()}-u` (`src/app/api/chat/route.ts:18`).
   - Assistant messages are generated with ID `msg-${Date.now()}-a` (`src/app/api/chat/route.ts:30`).
   - Proactive cron messages are generated with ID `msg-proactive-${Date.now()}` (`src/lib/proactive.ts:197`).
   - Standard `Date.now()` is not monotonic; concurrent or rapid requests in the same millisecond trigger SQLite `PRIMARY KEY constraint failed` fatal exceptions.

---

## 2. CONTEXT CONSTRUCTION & TRUNCATION ANALYSIS

```mermaid
flowchart TD
    Client["Client UI (src/app/chat/page.tsx)"] -->|messages.slice(-6)| ChatRoute["POST /api/chat (route.ts)"]
    ChatRoute -->|history + userMessage| Brain["processSofiaBrainTurn (src/lib/brain.ts)"]
    
    subgraph BrainTurn ["Context Assembly Pipeline"]
        Persona["buildPersonaPrompt(settings)"] --> ContextArray
        LiveContext["buildLiveContextBlock(db, today)"] --> ContextArray
        PinnedMem["Pinned Memory (LIMIT 4)"] --> ContextArray
        HistorySlice["history.slice(-8)"] --> ContextArray
        UserTurn["User Turn"] --> ContextArray
        ContextArray["messages[] for LLM Dispatch"]
    end
    
    Brain --> BrainTurn
    BrainTurn --> LiteLLM["LiteLLM (DeepSeek v4.1 Flash)"]
    BrainTurn --> Gemini["Gemini 3.5 Flash Lite"]
```

### 2.1 The Context Assembly Pipeline
Context is dynamically assembled in `src/lib/brain.ts:490-533` (`processSofiaBrainTurn`):

1. **System Persona Prompt** (`src/lib/persona.ts:43-91`): Injects static persona rules, speech style (≤ 60 words, 1-2 spoken sentences), strict output JSON structure (`{ "say": "...", "mood": "...", "panes": [...] }`), and dynamic personality dial numbers (strictness, warmth, teasing, formality, verbosity).
2. **Live Telemetry Block** (`src/lib/brain.ts:34-106`):
   - Computes daily metrics via `getDayStats()` and `getDayScore()`.
   - Queries latest active application from `events` table (`ORDER BY ts DESC LIMIT 1`).
   - Fetches up to 5 pending tasks (`tasks WHERE status IN ('pending', 'in_progress') ORDER BY created_at ASC LIMIT 5`).
   - Fetches next scheduled cron from `schedules`.
   - Fetches last proactive notification from `proactive_log`.
   - **Hardcoded Defect**: `streak_days: 2` is hardcoded at line 100 (`streak_days: 2`), ignoring actual historical day score records.
3. **Pinned Memory Notes** (`src/lib/brain.ts:512-515`):
   - Injects up to 4 pinned notes: `SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4`.
   - All unpinned notes or additional pinned notes past 4 are completely invisible to the prompt.
4. **History Window Truncation**:
   - `src/lib/brain.ts:527`: `const recentHistory = history.slice(-8);`
   - Appends each entry as `{ role: h.role, content: h.content }`.

### 2.2 Truncation & Windowing Analysis
The architecture suffers from cascading context loss:

1. **Client Truncation Trap (`chat/page.tsx:81`)**:
   ```typescript
   const history = messages.slice(-6).map((m) => ({
     role: m.role,
     content: m.content,
   }));
   ```
   The client arbitrarily clips history to the **last 6 messages** (3 conversational exchanges).
2. **Server Double Truncation (`brain.ts:527`)**:
   ```typescript
   const recentHistory = history.slice(-8);
   ```
   The server attempts to slice the last 8, but receives at most 6 from `/chat`, or **0** from `/`.
3. **Stage Home Zero History (`page.tsx:267-271`)**:
   ```typescript
   const res = await fetch('/api/chat', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ message: text }), // NO HISTORY SUPPLIED
   });
   ```
   When interacting from the main visual interface (`/`), `history` is omitted entirely (`body.history || []`). Every user interaction on Stage Home is evaluated in total conversational isolation.
4. **Database Retention Ceiling (`chat/route.ts:49`)**:
   ```typescript
   const rows = db.prepare('SELECT id, ts, role, content, mood, tool_calls FROM messages ORDER BY ts DESC LIMIT 30').all();
   ```
   The API only ever returns the last 30 messages. Once a conversation surpasses 30 turns, earlier turns cannot be scrolled into view or loaded.

---

## 3. CROSS-CHANNEL STATE CONTINUITY (VOICE vs TEXT vs LIVE)

Sofia features three interaction channels, which operate in complete isolation:

```
+-----------------------------------------------------------------------------+
|                          CROSS-CHANNEL CONTINUITY                           |
+-----------------------------------------------------------------------------+
|                                                                             |
|  [CHANNEL 1: Web Chat]          [CHANNEL 2: Stage Home]                     |
|  (/chat)                        (/)                                         |
|    |                              |                                         |
|    | POST /api/chat               | POST /api/chat (history=[])             |
|    v                              v                                         |
|  +-------------------------------------+                                    |
|  |       SQLite `messages` Table       |                                    |
|  +-------------------------------------+                                    |
|    ^                              ^                                         |
|    | INSERT (Cron background)     |                                         |
|    |                              |                                         |
|  [CHANNEL 4: Proactive Crons]     | NO TRANSCRIPTS / NO LOGGING             |
|  (proactive.ts)                   |                                         |
|                                   x (ZERO DATA RECORDED)                    |
|                                   |                                         |
|                             [CHANNEL 3: Gemini 3.8 Live Voice]              |
|                             (SofiaLiveSession - WebSocket)                  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### 3.1 Detailed Channel Audit

| Dimension | Channel 1: Text Chat (`/chat`) | Channel 2: Stage Text (`/`) | Channel 3: Gemini Live (`SofiaLiveSession`) | Channel 4: Proactive Crons |
| :--- | :--- | :--- | :--- | :--- |
| **Route / File** | `src/app/chat/page.tsx` | `src/app/page.tsx` | `src/lib/live/session.ts` | `src/lib/proactive.ts` |
| **Transport** | HTTP POST `/api/chat` | HTTP POST `/api/chat` | Bidirectional WebSocket (`wss://...`) | Internal SQLite Execution |
| **History Injected** | Client `messages.slice(-6)` | **None** (`[]`) | **None** (Only telemetry & pinned notes) | N/A |
| **Persisted to DB** | **Yes** (`messages` table) | **Yes** (`messages` table) | **NO (0% recorded)** | **Yes** (`messages` table) |
| **Restored on Reload**| Last 30 messages | Transient caption only | **None (Evaporates on hangup)** | Appears in chat stream |
| **Voice Output** | Optional TTS replay (`/api/tts`)| Edge/ElevenLabs (`/api/tts`)| Native 24kHz PCM from Gemini Live | Optional audio alert |

### 3.2 Evidence of Voice Data Evaporation
In `src/lib/live/session.ts:329-350`:
```typescript
if (msg.serverContent?.modelTurn) {
  const parts = msg.serverContent.modelTurn.parts || [];
  for (const p of parts) {
    if (p.text) {
      this.modelCaption += p.text;
      this.callbacks.onCaption?.(this.userCaption, this.modelCaption);
    }
    if (p.inlineData?.data) {
      this.enqueueAudioChunk(p.inlineData.data);
    }
  }
}
```
Captions are fired exclusively to browser memory callbacks (`this.callbacks.onCaption`). No network call is made to `/api/chat` or any transcript logging route. When the call is terminated:
1. `stop()` (`src/lib/live/session.ts:673`) tears down the WebSocket and audio contexts.
2. The transcripts vanish completely from both client and server.
3. The next interaction in `/chat` or on the home page has zero awareness of what occurred during the voice call.

### 3.3 Session Resumption & Migration Breakdown
- Gemini Live enforces a 40-minute hard cap (`LIMITS.hardCapMs = 40 * 60_000`).
- At minute 40, `migrateSession()` triggers (`src/lib/live/session.ts:628-640`):
  ```typescript
  private async migrateSession() {
    this.flushAudio();
    if (this.ws) this.ws.close();
    this.resumptionHandle = null; // WIPES HANDLE
    await this.start();
  }
  ```
- Because `resumptionHandle` is explicitly set to `null`, the connection starts as an entirely blank session, instantly wiping model context mid-conversation.

---

## 4. MULTI-TURN CONTEXT RETENTION & COHERENCE

### 4.1 Tool Call Retention Drop (Context Amnesia)
When Sofia executes a tool in `src/lib/brain.ts:577-599`:
1. The assistant message containing `tool_calls` is pushed to the local turn array.
2. The tool output (`role: 'tool'`) is executed and pushed.
3. The LLM produces its final verbal response `say`.
4. The API returns `{ text, say, mood, panes, toolCalls, turn }`.
5. The API saves `tool_calls` to SQLite (`messages.tool_calls`).

**The Failure:**
In `src/app/chat/page.tsx:81-84`, when the user replies:
```typescript
const history = messages.slice(-6).map((m) => ({
  role: m.role,
  content: m.content,
}));
```
- `history` only includes `role` and `content`.
- Neither `tool_calls` nor the tool response (`role: 'tool'`) are preserved in `history`.
- In Turn 2, the LLM receives:
  - User: "What tasks do I have?"
  - Sofia: "You have 3 tasks: Finish audit, wire Hermes, check timeline."
  - User: "When is the second one due?"
- The LLM no longer has the `list_tasks` execution payload in its prompt history. It must either hallucinate or guess.

### 4.2 Interrupted Conversations & State Desynchronization
1. **Dangling User Query on Failure**:
   In `src/app/api/chat/route.ts:17-24`:
   ```typescript
   // 1. Insert user message BEFORE brain turn processing
   db.prepare('INSERT INTO messages (id, ts, role, content) VALUES (?, ?, ?, ?)').run(
     `msg-${Date.now()}-u`,
     new Date().toISOString(),
     'user',
     userMessage
   );

   // 2. Process turn (can throw timeout or network error)
   const result = await processSofiaChatTurn(db, userMessage, history);
   ```
   If LiteLLM or Gemini fails, times out (45s), or throws, the user message is already committed to SQLite. The assistant reply is never written. The database is left with two consecutive user turns, corrupting conversational turn-taking for subsequent sessions.
2. **Client-Server State Desync**:
   When an error occurs, `src/app/chat/page.tsx:116` appends an error message to the React state with ID `msg-${Date.now()}-err`. This message is never written to SQLite. Upon page reload, the message disappears, causing state desynchronization.

---

## 5. DEFECTS, DATA LOSS & SESSION ISOLATION GAPS

### Inventory of Concrete Defects

| ID | Severity | File & Lines | Description | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | **CRITICAL** | `src/lib/db.ts:76-83` | `messages` table lacks `session_id`, `channel`, and `device_id`. | Zero session isolation; all clients share a single unpartitioned log. |
| **DEF-02** | **CRITICAL** | `src/lib/live/session.ts:335-350` | Voice audio and transcripts are never logged to SQLite or `/api/chat`. | 100% data loss for all voice interactions upon session termination. |
| **DEF-03** | **HIGH** | `src/lib/tools.ts:531-537`<br>`src/app/api/memory/route.ts:23` | `remember` tool inserts unformatted strings (e.g. `'conversation'`) into `memory_notes.tags`. | `JSON.parse(r.tags)` in `/api/memory` crashes with fatal `SyntaxError`. |
| **DEF-04** | **HIGH** | `src/app/chat/page.tsx:81-84` | Client strips `tool_calls` and tool responses from history payload. | LLM loses all tool context and parameters on subsequent turns. |
| **DEF-05** | **MEDIUM** | `src/app/page.tsx:267-271` | Stage Home text input sends `{ message: text }` with no `history`. | All text turns initiated from Stage Home are completely stateless. |
| **DEF-06** | **MEDIUM** | `src/app/api/chat/route.ts:49` | `SELECT ... FROM messages ORDER BY ts DESC LIMIT 30` with no pagination. | History past the 30 most recent messages is permanently inaccessible. |
| **DEF-07** | **MEDIUM** | `src/app/chat/page.tsx:81`<br>`src/lib/brain.ts:527` | Cascading double truncation (`slice(-6)` then `slice(-8)`). | Context window artificially constrained to at most 3 conversation exchanges. |
| **DEF-08** | **MEDIUM** | `src/app/api/chat/route.ts:18,30` | Non-unique ID generation: `msg-${Date.now()}-u`. | Sub-millisecond concurrent requests trigger SQLite primary key collisions. |
| **DEF-09** | **MEDIUM** | `src/lib/brain.ts:613`<br>`src/app/chat/page.tsx:101` | Property casing mismatch: server sends `toolCalls`, client expects `tool_calls`. | Tool execution chips fail to render upon receiving responses. |
| **DEF-10** | **MEDIUM** | `src/app/api/chat/route.ts:17-36` | User message inserted prior to LLM completion. | Unhandled LLM timeouts leave dangling user messages without assistant replies. |
| **DEF-11** | **LOW** | `src/hooks/useVoiceInput.ts:1-293` | 293 lines of Web Speech API and silence monitoring logic. | Dead code; never imported or utilized anywhere in the codebase. |
| **DEF-12** | **LOW** | `src/lib/db.ts:71`<br>`src/app/api/memory/route.ts:29`| `day_summaries` table defined and queried, but never populated. | Summaries endpoint returns empty arrays; no summarization job exists. |

---

## 6. RECOMMENDATIONS FOR PERSISTENT CONTEXT ENGINE

### 6.1 Database Schema Evolution

Migrate `messages` and introduce first-class `conversations` / `sessions`:

```sql
-- 1. Conversation Sessions Table
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('text_chat', 'stage_dock', 'voice_live', 'proactive_cron')),
  device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'migrated')),
  summary TEXT,
  metadata TEXT
);

-- 2. Enhanced Messages Table
CREATE TABLE IF NOT EXISTS messages_v2 (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES messages_v2(id),
  ts TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  mood TEXT,
  tool_calls TEXT,     -- JSON array of tool calls
  tool_call_id TEXT,   -- Set if role == 'tool'
  tool_results TEXT,   -- JSON result if role == 'tool'
  tokens_in INTEGER,
  tokens_out INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_v2_session_ts ON messages_v2(session_id, ts ASC);
CREATE INDEX IF NOT EXISTS idx_messages_v2_parent ON messages_v2(parent_id);
```

### 6.2 Unified Real-Time Transcript Logging for Voice
Add a streaming or turn-completion endpoint for `SofiaLiveSession`:
1. In `src/lib/live/session.ts`, implement an asynchronous queue that flushes user speech transcript and model response to `/api/live/transcript`.
2. Persist voice exchanges under `channel: 'voice_live'` with the active `session_id`.
3. Provide the user with an uninterrupted, cohesive log across both voice and chat views.

### 6.3 Token-Budgeted Sliding Window & Context Summarizer
Replace the naive `slice(-6)` and `slice(-8)` with an explicit Token Budget Manager:
1. **Dynamic Token Budget**: Allocate a fixed 4,000 token budget for dialogue history.
2. **Proper Tool Reconstruction**: Format multi-turn tool history according to standard OpenAI/Gemini message specs (`assistant` message with `tool_calls` followed immediately by `tool` role responses with matching `tool_call_id`).
3. **Automated Hierarchical Summarization**: When a session reaches 20 messages, trigger an asynchronous background summary job (`gemini-3.5-flash-lite`). Store the resulting narrative in `conversation_sessions.summary` and `day_summaries`.
4. **Context Injection**: Prepend the rolling session summary to the prompt before the recent turns, guaranteeing infinite conversational continuity without context overflow.

### 6.4 Defensive Transactional Turn-Taking
Refactor `src/app/api/chat/route.ts` to execute inside a database transaction:
- Do not commit the user message until the LLM turn resolves successfully, OR flag the user turn as `status: 'processing'` and update it to `status: 'completed'` / `status: 'failed'` alongside the assistant response.
- Prevent dangling, unreciprocated user turns upon network timeouts.

---
*Report prepared by Agent 7 for the JARVIS System Engineering Audit.*
