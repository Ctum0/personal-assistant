# AGENT 5 — MEMORY & PERSONAL CONTEXT ENGINE AUDIT REPORT
**Target System:** Sofia / JARVIS Personal AI Companion
**Deliverable Path:** `audit/06-agent-reports/memory.md`
**Auditor:** Agent 5 — Memory & Personal Context Engine Auditor
**Scope:** `src/lib/db.ts`, `src/app/api/memory/route.ts`, `src/app/memory/page.tsx`, `src/lib/brain.ts`, `src/lib/tools.ts`, `src/lib/persona.ts`, `src/lib/persona.voice.ts`, `src/lib/types.ts`, `agent-pc/agent.py`, `src/lib/live/session.ts`.

---

## 1. Memory Architecture & Schema Overview

### 1.1 Underlying Database Engine
The operational storage engine is a single local SQLite database located at `data/sofia.db`, initialized and queried synchronously using Node.js 22+ built-in `node:sqlite` (`DatabaseSync` class) in `src/lib/db.ts` (lines 1, 23, 29). SQLite runs in standard rollback journal mode without write-ahead logging (WAL) explicitly enabled in `initDatabase()`, and contains zero foreign key constraints and zero secondary indexes.

### 1.2 Schema Audit of Memory-Related Tables
An exhaustive audit of `src/lib/db.ts:36-176` reveals the following tables directly underpinning the memory, telemetry, and personal context system:

| Table Name | Primary Key | Key Columns & Types | Declared Intent | Actual Operational Status |
| :--- | :--- | :--- | :--- | :--- |
| `memory_notes` | `id TEXT` | `text TEXT`, `tags TEXT`, `created_at TEXT`, `pinned INTEGER DEFAULT 0` | Long-term semantic facts, rules, user preferences | **Severely degraded**: Format conflict between JSON array and plain text crashes UI; max 4 pinned notes loaded; zero vector search. |
| `events` | `id TEXT` | `ts TEXT`, `source TEXT`, `kind TEXT`, `category TEXT`, `app TEXT`, `title TEXT`, `duration_s INTEGER`, `meta TEXT` | Episodic desktop/web telemetry, commits, reviews | **Unindexed Append-Only**: Zero indexes on `ts`, `app`, or `category`. All queries perform lifetime table scans via `WHERE ts LIKE ?`. |
| `day_stats` | `date TEXT` | `active_min INT`, `work_min INT`, `leisure_min INT`, `neutral_min INT`, `commits INT`, `woke_at TEXT`, `bed_at TEXT`, `coverage REAL`, `offline_min INT`, `tasks_done INT` | Daily episodic telemetry rollup | **Functional but shallow**: Aggregated daily. Only today's stats are injected into context; historical trends are not queried by Sofia. |
| `day_scores` | `date TEXT` | `score REAL`, `components TEXT`, `verdict_json TEXT`, `intensity INT`, `status TEXT` | Daily accountability scores & verdicts | **Functional**: Keyed by `YYYY-MM-DD`. Stores JSON stringified components and verdicts. |
| `day_summaries` | `date TEXT` | `text TEXT` | End-of-day retrospective summaries | **Dead / Orphaned Table**: Zero `INSERT` statements exist in the entire codebase. Read by `GET /api/memory` and `/memory` UI, but is permanently empty. |
| `messages` | `id TEXT` | `ts TEXT`, `role TEXT`, `content TEXT`, `mood TEXT`, `tool_calls TEXT` | Conversation history (short-term episodic memory) | **Write-Only to Sofia**: Only written during text chat. Spoken voice turns from Gemini Live are NEVER persisted. Sofia has NO tool to query or search past messages. |
| `tasks` | `id TEXT` | `title TEXT`, `due TEXT`, `status TEXT`, `est_min INT`, `done_at TEXT`, `created_at TEXT` | User task items and commitments | **Partially functional**: Injected up to 5 pending tasks into live context; tool can create/complete tasks. |
| `focus_sessions` | `id TEXT` | `start TEXT`, `end TEXT`, `goal_min INT`, `result TEXT`, `distraction_count INTEGER DEFAULT 0` | Timed focus blocks and distraction monitoring | **Ghost / Write-Only Table**: Zero `SELECT` queries exist across the entire codebase. `distraction_count` is hardcoded to 0 on insert and never incremented. |
| `proactive_log` | `id TEXT` | `ts TEXT`, `job TEXT`, `text TEXT`, `channel TEXT`, `suppressed_reason TEXT` | Scheduled nudges and alert history | **Auditing only**: Queried for the single latest proactive job in live context. |

### 1.3 Short-Term vs. Long-Term Memory Separation
- **Short-Term Memory (Working Context)**:
  - **Text Chat (`src/lib/brain.ts:527-530`)**: Only the last 8 turns of conversation history (`const recentHistory = history.slice(-8)`) are passed into the LLM context. There is no conversation summarization, no sliding window compression, and no memory distillation. Once a conversation exceeds 8 turns, earlier context drops off a cliff.
  - **Voice Chat (`src/lib/live/session.ts`)**: The Gemini Live Multimodal WebSocket session holds working context only in Google's cloud session memory. The session is constrained by a 40-minute hard cap (`hardCapMs: 40 * 60_000`, line 51) and 45-second go-away grace periods. When the WebSocket disconnects, all spoken dialogue is completely lost—transcripts are not written to SQLite `messages` or summarized into long-term memory.
- **Long-Term Memory**:
  - Exclusively confined to `memory_notes` (explicit notes) and daily rollups (`day_stats`, `day_scores`).
  - There is no tiering between working memory, episodic episodic episodic timeline, and consolidated semantic memory.

### 1.4 Episodic vs. Semantic Memory Capabilities
- **Episodic Memory (What happened and when)**:
  - Stored passively in `events` (desktop telemetry) and `messages` (chat turns).
  - Sofia has **no episodic query capability**: Sofia cannot recall what you discussed yesterday, what code you were editing 3 days ago, or what caused your score to drop last Tuesday. The `buildLiveContextBlock` function (`src/lib/brain.ts:34-106`) only looks at *today's* events and stats.
- **Semantic Memory (What Sofia knows about you)**:
  - Stored as flat records in `memory_notes`.
  - Sofia has no knowledge graph, no entity linking, no ontology of user attributes (e.g. relations, tech stack, health constraints), and no concept of certainty/confidence.

---

## 2. Memory Ingestion & Extraction Audit

### 2.1 Automatic Fact Extraction vs. Explicit Tool Calling
- **Auditor Finding**: Sofia **NEVER automatically extracts facts** from user conversations.
- **Verification in Code**:
  - In `src/app/api/chat/route.ts:16-36`, incoming user messages are stored in `messages` and immediately passed to `processSofiaChatTurn(db, userMessage, history)`. Sofia's response is written to `messages`. There is no asynchronous post-turn LLM pass, no regex extraction, and no background worker analyzing conversations for personal facts, preferences, or project updates.
  - In `src/lib/persona.ts`, `src/lib/persona.voice.ts`, and `src/lib/brain.ts`, the system prompt contains no instructions or few-shot examples prompting Sofia to memorize user facts.
  - Memory ingestion occurs through only two entry points:
    1. **Manual User Input**: The user navigates to `/memory` and submits the "Teach Sofia a Fact, Goal, or Rule" form (`src/app/memory/page.tsx:42-70`), dispatching `POST /api/memory`.
    2. **Autonomous Tool Call**: Sofia explicitly decides to invoke the `remember(text, tags)` tool (`src/lib/tools.ts:209-227`). If the LLM does not spontaneously call `remember`, any fact stated in conversation is permanently lost once it leaves the 8-turn buffer.

### 2.2 Telemetry Ingestion Pipeline
- **PC Activity Watcher (`agent-pc/agent.py`)**:
  - Python script detecting active X11/Wayland window via `xdotool` and `xprop` every 60 seconds (`agent.py:17-53`).
  - Sends payload with `app`, `title`, and `duration_s: 60` to `POST /api/ingest/events` (`agent.py:66-88`).
  - Server-side handler (`src/app/api/ingest/events/route.ts:4-24`) calls `ingestEvents(db, events)` in `src/lib/db.ts:402-432`.
- **Classification Rules**:
  - `classifyAppOrDomain` (`src/lib/db.ts:343-367`) scans table `rules` for matches on `app`, `domain`, or `keyword` to categorize activities as `work`, `leisure`, or `neutral`.
- **GitHub Ingestion (`src/lib/github.ts`)**:
  - Polls `/users/{username}/events?per_page=30` (`github.ts:30`), maps `PushEvent` commits and `PullRequestReviewEvent` reviews into `events` table records, and triggers `rebuildDayStats(db, today)`.

---

## 3. Retrieval, Ranking & Context Injection Audit

### 3.1 Context Injection Architecture
Context injection occurs inside `processSofiaBrainTurn` (`src/lib/brain.ts:509-525`) and `buildVoicePersona` (`src/lib/persona.voice.ts:13-26`):

```typescript
// src/lib/brain.ts:512-520
const pinnedNotes = db
  .prepare('SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4')
  .all() as Array<{ text: string }>;

const contextMessage = `LIVE CONTEXT:
${JSON.stringify(contextBlock, null, 2)}

PINNED MEMORY:
${pinnedNotes.map((n, i) => `${i + 1}. ${n.text}`).join('\n')}`;

const messages: any[] = [
  { role: 'system', content: systemPrompt },
  { role: 'system', content: contextMessage },
];
```

### 3.2 Audit of Retrieval & Ranking Deficiencies
1. **Hardcoded Limit of 4 Pinned Notes**:
   - `SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4`
   - If the user has 10 pinned notes, notes 5 through 10 are completely excluded. Because there is no `ORDER BY` clause, SQLite returns whichever 4 rows it encounters first on disk.
2. **Metadata Elimination**:
   - Only `text` is retrieved. Note `id`, `tags`, and `created_at` timestamps are stripped out. The LLM has no idea whether a note was pinned today or three years ago, and has no note ID to reference for updates or deletions.
3. **Unpinned Memory Is 100% Invisible Without Tool Call**:
   - Unpinned notes are never injected into the system prompt. If the user asks Sofia about a topic stored in an unpinned note, Sofia can only answer if the LLM proactively recognizes it needs information and calls `search_memory`.
4. **SQL `LIKE` Substring Matching vs. Semantic Vector Retrieval**:
   - Retrieval tool `search_memory` (`src/lib/tools.ts:480-494` and `src/lib/brain.ts:386-391`):
     ```typescript
     const query = `%${args.query || ''}%`;
     const notes = db
       .prepare('SELECT id, text, tags FROM memory_notes WHERE text LIKE ? ORDER BY pinned DESC LIMIT 5')
       .all(query);
     ```
   - **Zero Vector Embeddings**: There are no dense vector embeddings (e.g. `text-embedding-004`, `text-embedding-3-small`, or local HuggingFace models), no vector tables, and no vector extensions (`sqlite-vss`, `sqlite-vec`).
   - **Zero Semantic Understanding**: Searching for "dietary restrictions" will never match a note stating "Severe peanut allergy and vegetarian". Searching for "current sprint" will not match "Working on milestone 2".
   - **Tags Column Blindspot**: The query is strictly `WHERE text LIKE ?`. The `tags` column is completely ignored in `search_memory`! Even if a note has `tags: '["diet", "allergies"]'`, querying `"diet"` returns 0 rows if the word "diet" does not appear in the `text` field.
   - **Crude Ranking**: Results are ordered by `pinned DESC LIMIT 5`. If 10 notes match `%project%`, the top 5 are returned based purely on pin status and insertion order, not relevance.

---

## 4. Semantic Memory, Contradictions & Forgetting Gaps

### 4.1 Contradiction Detection & Resolution
- **Auditor Finding**: **Zero contradiction handling**.
- There is no deduplication, no entity extraction, no superseding mechanism, and no validation logic.
- If Note 1 states: *"User works exclusively from 9 PM to 4 AM"* and Note 2 states: *"User switched to morning routine: wake at 06:00, sleep at 22:00"*, both notes will coexist indefinitely.
- If both are pinned, both are injected into Sofia's prompt, creating contradictory instructions that lead to erratic assistant behavior and hallucinations.

### 4.2 Expiration, Retention & Forgetting
- **Auditor Finding**: **Zero TTL or expiration logic**.
- The `memory_notes` table contains no `expires_at`, no `ttl`, no `last_accessed_at`, and no decay factor.
- Highly time-sensitive notes (e.g., *"Sprint deadline is Thursday Nov 14"*, *"Taking amoxicillin twice daily until Oct 5"*) remain in memory forever unless the user manually deletes them.
- There is no implementation of an Ebbinghaus forgetting curve, recency weighting, or archival tiered storage.

### 4.3 Privacy Controls & Telemetry Leakage
- **Auditor Finding**: **Privacy settings are completely DEAD CODE**.
- `src/lib/types.ts:104-107` and `166-169` define privacy configurations:
  ```typescript
  privacy: {
    window_titles: 'off' | 'counts_only' | 'full';
    web_domains: 'off' | 'counts_only' | 'full';
  };
  // default: { window_titles: 'counts_only', web_domains: 'counts_only' }
  ```
- **Code Reality**: In `src/lib/db.ts:402-432` (`ingestEvents`), incoming `title` and `meta` fields from `agent-pc` are written directly to SQLite without any check against `settings.privacy`:
  ```typescript
  // src/lib/db.ts:422
  insert.run(id, ts, source, kind, category, app, title, duration, meta);
  ```
- A `grep -rn "window_titles" src/` reveals that `window_titles` appears ONLY in `types.ts`.
- **Security & Privacy Impact**: Full window titles—which often contain sensitive passwords, confidential email subjects, private health searches, or banking portal details—are stored in plaintext in `events.title` regardless of the user's privacy setting.

### 4.4 User Corrections & Deletion Audit
- **Creation**: Supported via `POST /api/memory` and tool `remember`.
- **Deletion**: Supported via `DELETE /api/memory?id=...` (`src/app/api/memory/route.ts:65-79`).
- **Update / Edit**: **COMPLETELY UNSUPPORTED**. There is no `PATCH` or `PUT` route for `memory_notes`. If a user needs to fix a typo or update a fact, they are forced to delete the note and create a new one. Sofia herself has no tool to update or delete a memory note.
- **Messages & Events**: Zero deletion or redaction endpoints. Telemetry and chat history cannot be scrubbed by the user.

---

## 5. Detailed Defects & Failure Modes

### Defect 1: Critical Crash — `remember` Tool Breaks `GET /api/memory` via Unquoted String Tags
- **Severity**: Critical (P0)
- **Files**: `src/lib/tools.ts:531-536` vs. `src/app/api/memory/route.ts:23`
- **Mechanism**:
  - `POST /api/memory` saves tags as a serialized JSON array: `JSON.stringify(newNote.tags)` -> `'["tag1", "tag2"]'`.
  - `GET /api/memory` parses tags using `JSON.parse(r.tags || '[]')`.
  - However, when Sofia invokes the `remember` tool (`src/lib/tools.ts:531`), it inserts `args.tags || 'conversation'` directly into the `tags` column as a plain string:
    ```typescript
    db.prepare('INSERT INTO memory_notes (id, text, tags, created_at, pinned) VALUES (?, ?, ?, ?, 0)').run(
      id,
      args.text,
      args.tags || 'conversation',
      new Date().toISOString()
    );
    ```
  - As soon as Sofia executes `remember`, the `tags` column contains the raw string `"conversation"`.
  - The next time the user opens `/memory`, `GET /api/memory` executes `JSON.parse("conversation")`, throws `SyntaxError: Unexpected token 'c', "conversation" is not valid JSON`, returns HTTP 500, and permanently breaks the Memory Vault UI until someone manually edits the SQLite database.

### Defect 2: Orphaned Dead Table — `day_summaries` Has Zero Writers
- **Severity**: High (P1)
- **Files**: `src/lib/db.ts:71-74`, `src/app/api/memory/route.ts:28-31`, `src/app/memory/page.tsx:182-198`
- **Mechanism**:
  - Table `day_summaries` is created in SQLite and queried by `GET /api/memory` to render the "Sofia End-of-Day Recaps & Retrospectives" card grid.
  - Across the entire repository, there is **not a single `INSERT INTO day_summaries` statement**. Even the `daily_verdict` proactive cron job (`src/lib/proactive.ts:162-199`) only logs to `proactive_log` and `messages`. The UI section is perpetually empty.

### Defect 3: Ghost Table — `focus_sessions` Is Write-Only with Fake Telemetry
- **Severity**: Medium (P2)
- **Files**: `src/lib/db.ts:103-110`, `src/app/api/focus/start/route.ts`, `src/app/api/focus/stop/route.ts`, `src/lib/brain.ts:435`, `src/lib/tools.ts:568`
- **Mechanism**:
  - The database contains a `focus_sessions` table with column `distraction_count INTEGER NOT NULL DEFAULT 0`.
  - The tool description in `src/lib/brain.ts:263` claims: `"Start a timed focus session with strict distraction monitoring"`.
  - In reality, `distraction_count` is hardcoded to 0 on insert and never incremented anywhere.
  - Furthermore, there is **not a single `SELECT ... FROM focus_sessions`** in the entire codebase. The data is written to disk and never read by Sofia or any dashboard.

### Defect 4: Arbitrary Pinned Memory Ceiling (Limit 4) with No Ordering
- **Severity**: High (P1)
- **Files**: `src/lib/brain.ts:513`, `src/lib/persona.voice.ts:14`
- **Mechanism**:
  - `SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4`
  - Notes 5 and beyond are silently dropped from prompt context.
  - Lack of `ORDER BY created_at DESC` means SQLite returns rows based on internal B-Tree storage order, causing nondeterministic memory context between database vacuum/rebuild cycles.

### Defect 5: Unindexed Hot Query Paths in SQLite
- **Severity**: High (P1)
- **Files**: `src/lib/db.ts:36-176`
- **Mechanism**:
  - `initDatabase` defines zero secondary indexes.
  - `events` table (which accumulates thousands of entries from PC agent) is scanned with `WHERE ts LIKE ?` (`rebuildDayStats`, `getHourlyTimeline`).
  - `messages` is queried with `ORDER BY ts DESC LIMIT 30` on every chat load without an index on `ts`.
  - `memory_notes` is scanned with `WHERE pinned = 1` and `WHERE text LIKE ?` without indexes on `pinned` or `created_at`.

### Defect 6: Hardcoded Telemetry in Live Context Block
- **Severity**: Medium (P2)
- **Files**: `src/lib/brain.ts:100`
- **Mechanism**:
  - `buildLiveContextBlock` returns `streak_days: 2` hardcoded as a static number, completely bypassing actual calculation from `day_scores` history.

### Defect 7: Duplicated, Out-of-Sync Tool Catalogs
- **Severity**: High (P1)
- **Files**: `src/lib/brain.ts:174-333`, `335-488` vs. `src/lib/tools.ts:18-356`, `397-620`
- **Mechanism**:
  - `src/lib/brain.ts` declares `SOFIA_TOOLS` and `executeSofiaTool`.
  - `src/lib/tools.ts` declares `SOFIA_TOOL_CATALOG` and `executeTool`.
  - `executeSofiaTool` in `brain.ts` is missing `remember`, `show_web`, `show_chart`, and `ask_hermes`. Any subsystem using `executeSofiaTool` fails when the LLM attempts to store a memory.

### Defect 8: Ephemeral Voice Turns — Complete Memory Amnesia in Live Sessions
- **Severity**: High (P1)
- **Files**: `src/lib/live/session.ts`
- **Mechanism**:
  - Spoken dialogue over the Gemini Live Web Audio API (`src/lib/live/session.ts`) streams PCM audio chunks over WebSocket.
  - While tools called during the session are executed via `/api/live/tool`, the actual spoken user inputs and Sofia voice replies are **never posted to `/api/chat` or persisted to SQLite `messages`**.
  - As soon as the voice call ends, the entire conversation evaporates from the system's memory.

---

## 6. Blueprint for Jarvis-Grade Long-Term Memory

To transition Sofia from a rudimentary SQLite-backed string store to a production-grade cognitive memory engine, the following architecture must be implemented:

```
+----------------------------------------------------------------------------------+
|                           COGNITIVE MEMORY ENGINE                                |
+----------------------------------------------------------------------------------+
|                                                                                  |
|  [ Ingestion Sources ]                                                           |
|    - Text Chat Turns (REST)                                                      |
|    - Spoken Voice Transcripts (Live AudioWorklet WebSocket)                     |
|    - Machine Telemetry (agent-pc, GitHub, Wazuh, Calendar)                       |
|                                                                                  |
|                                     |                                            |
|                                     v                                            |
|  [ Asynchronous Memory Pipeline (Worker / Queue) ]                              |
|    1. Entity & Fact Extractor (LLM structured JSON schema)                       |
|    2. Temporal Anchor Resolution ("next Tuesday" -> 2026-11-17)                  |
|    3. Contradiction & Supersession Engine (Vector match + Graph Conflict Check) |
|    4. Importance & Epistemic Confidence Scoring (0.0 - 1.0)                      |
|                                                                                  |
|                                     |                                            |
|                                     v                                            |
|  [ Multi-Store Cognitive Database (SQLite + Vector Extension) ]                  |
|    +-----------------------------+     +-------------------------------------+   |
|    | Episodic Memory (Events/Log)|     | Semantic Memory (Facts & Knowledge) |   |
|    | - Conversation transcripts  |     | - Atomic subject-predicate-object   |   |
|    | - Window/Git telemetry      |     | - Valid time intervals (start/end)  |   |
|    | - Daily Rollups & Verdicts  |     | - Embeddings (sqlite-vec 768-dim)   |   |
|    +-----------------------------+     +-------------------------------------+   |
|                                                                                  |
|                                     |                                            |
|                                     v                                            |
|  [ Hybrid Retrieval & Ranking (RRF) ]                                            |
|    - BM25 Full-Text Search (SQLite FTS5 on text + tags)                          |
|    - Dense Semantic Vector Search (Cosine distance on embeddings)                |
|    - Recency & Ebbinghaus Decay Weighting                                        |
|    - Dynamic Token Budget Packing (Inject top-K most relevant into context)      |
|                                                                                  |
+----------------------------------------------------------------------------------+
```

### 6.1 Multi-Store Memory Schema Migration

#### 1. Semantic Memory Store (`semantic_facts`)
```sql
CREATE TABLE semantic_facts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,          -- 'preference', 'identity', 'rule', 'project', 'health'
  subject TEXT NOT NULL,           -- 'user', 'sofia', 'project:archimedes'
  predicate TEXT NOT NULL,         -- 'dislikes', 'uses_tool', 'has_deadline'
  object TEXT NOT NULL,            -- 'nagging', 'cursor', '2026-11-20'
  raw_text TEXT NOT NULL,          -- Natural language source representation
  confidence REAL NOT NULL,        -- 0.0 to 1.0
  source_turn_id TEXT,             -- Foreign reference to messages.id
  valid_from TEXT NOT NULL,        -- ISO timestamp
  valid_to TEXT,                   -- Nullable: set when superseded by newer fact
  superseded_by TEXT,              -- References semantic_facts.id
  pinned INTEGER NOT NULL DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_facts_subject_predicate ON semantic_facts (subject, predicate);
CREATE INDEX idx_facts_valid ON semantic_facts (valid_from, valid_to);
CREATE INDEX idx_facts_pinned ON semantic_facts (pinned);
```

#### 2. Vector Embeddings (`facts_vec`)
Leverage `sqlite-vec` (a zero-dependency native SQLite vector extension):
```sql
CREATE VIRTUAL TABLE facts_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[768]             -- Matches gemini-embedding-exp-0827 or text-embedding-004
);
```

#### 3. Full-Text Search Table (`facts_fts`)
```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
  id UNINDEXED,
  raw_text,
  category,
  tokenize = 'porter unicode61'
);
```

### 6.2 Hybrid Retrieval Engine with Reciprocal Rank Fusion (RRF)
Replace raw SQL `LIKE` queries with a hybrid retrieval pipeline combining lexical FTS5 and vector similarity, penalized by temporal decay:

$$\text{FinalScore}(f) = w_{\text{bm25}} \cdot \text{RRF}_{\text{bm25}}(f) + w_{\text{vec}} \cdot \text{RRF}_{\text{vec}}(f) + w_{\text{recency}} \cdot e^{-\lambda \Delta t} + w_{\text{pinned}} \cdot \text{is\_pinned}(f)$$

```typescript
export async function retrieveRelevantMemory(
  db: DatabaseSync,
  query: string,
  tokenBudget: number = 1000
): Promise<SemanticFact[]> {
  // 1. Generate dense query embedding via Gemini text-embedding-004
  const queryEmbedding = await generateEmbedding(query);

  // 2. Vector ANN query via sqlite-vec
  const vectorHits = db.prepare(`
    SELECT id, distance FROM facts_vec
    WHERE embedding MATCH ? AND k = 10
  `).all(queryEmbedding);

  // 3. BM25 keyword query via SQLite FTS5
  const ftsHits = db.prepare(`
    SELECT id, rank FROM facts_fts
    WHERE facts_fts MATCH ?
    ORDER BY rank LIMIT 10
  `).all(sanitizeFtsQuery(query));

  // 4. Reciprocal Rank Fusion + Temporal Decay + Pinned Priority
  return fuseAndRankResults(vectorHits, ftsHits, tokenBudget);
}
```

### 6.3 Automated Conversation Extraction Worker
Implement a non-blocking post-turn event listener on `/api/chat` and `/api/live/session`:
1. When a turn completes, queue the turn `(userMessage, assistantReply, timestamp)`.
2. Asynchronous LLM distillation prompts Gemini 3.5 Flash Lite with a strict JSON schema:
   ```json
   {
     "facts": [
       {
         "category": "preference",
         "subject": "user",
         "predicate": "prefers_feedback_style",
         "object": "sharp, fact-based",
         "raw_text": "Responds best to sharp, fact-based feedback. Dislikes vague nagging.",
         "confidence": 0.95,
         "temporal_scope": "permanent"
       }
     ]
   }
   ```
3. Before inserting, execute a conflict check: If a fact exists with matching `(subject, predicate)` but differing `object`, prompt the LLM or apply timestamp priority to mark the old fact as superseded (`valid_to = now()`, `superseded_by = new_id`).

### 6.4 Voice Transcript Episodic Persistence
In `src/lib/live/session.ts`:
- Hook into the AudioWorklet transcription callbacks (`onCaption`).
- When user finishes speaking (VAD silence detected) and when the model finishes its audio playback turn, post the completed turn to `POST /api/chat/persist`:
  ```typescript
  await fetch('/api/chat/persist', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      role: 'user',
      content: this.userCaption,
      channel: 'voice_live',
      session_id: this.sessionId
    })
  });
  ```
- This bridges the amnesia gap between voice sessions and text chat.

### 6.5 Strict Privacy Redaction Pipeline
Update `ingestEvents` in `src/lib/db.ts`:
```typescript
const settings = getSettings(db);
const privacyMode = settings.privacy?.window_titles || 'counts_only';

for (const e of events) {
  let title = e.title || '';
  if (privacyMode === 'off') {
    title = '[REDACTED]';
  } else if (privacyMode === 'counts_only') {
    title = e.app || 'Unknown'; // Keep app name only, strip file paths/browser URLs
  } else {
    title = redactPii(title); // Regex strip tokens, emails, IPs, passwords
  }
  // Store sanitized title
}
```
