# JARVIS Full-System Engineering Audit: AI Brain & Reasoning Engine Report

**Target Component:** AI Brain, Reasoning Engine & Intelligence Architecture  
**Auditor:** Agent 2 — AI Brain & Reasoning Engine Auditor  
**Audit Status:** Complete & Verified Against Source Implementation  
**Target Path:** `audit/06-agent-reports/reasoning-engine.md`

---

## 1. Intelligence Architecture Overview

### 1.1 Central Intelligence Layer Topology
The intelligence tier of the JARVIS/Sofia platform coordinates conversational understanding, persona fidelity, stage projections, and machine control. The codebase divides this responsibility across six primary modules:

1. **`src/lib/brain.ts` (Core Brain & Turn Orchestration)**:
   - Exports `processSofiaBrainTurn` (aliased as `processSofiaChatTurn` at line 745), which acts as the central reasoning dispatcher.
   - Assembles live context telemetry via `buildLiveContextBlock` (lines 34–106).
   - Implements response formatting and mood extraction via `extractMood` (lines 108–116) and `parseTurn` (lines 118–171).
   - Houses an orphaned, legacy 11-tool definition schema (`SOFIA_TOOLS`, lines 174–333) and executor (`executeSofiaTool`, lines 335–488).
   - Executes a cascading dispatch pipeline: LiteLLM proxy $\rightarrow$ Gemini 3.5 direct fallback $\rightarrow$ deterministic local SQLite fallback.

2. **`src/lib/persona.ts` (Persona Bible & Output Specification)**:
   - Defines `DEFAULT_PERSONALITY_DIALS` (strictness: 7, warmth: 6, teasing: 6, formality: 4, verbosity: 3) (lines 3–9).
   - Supplies `TONE_CALIBRATION_FIXTURES` (lines 16–41) based on Spec §2.
   - Exports `buildPersonaPrompt` (lines 43–91), which injects dials, speech rules, hard limits, allowed moods, and a mandatory JSON output contract requiring `{ "say": string, "mood": SofiaMood, "panes": Pane[] }`.

3. **`src/lib/persona.voice.ts` (Voice Persona)**:
   - Exports `buildVoicePersona` (lines 9–83) tailored for the Gemini Live bidirectional audio WebSocket.
   - Implements natural turn-taking rules, silence handling, interruption dynamics, and concise emotional restraint based on Spec §D.3.

4. **`src/lib/tools.ts` (Tool Registry & Execution Subsystem)**:
   - Houses `UNIFIED_TOOLS` (lines 21–356), a 22+ tool catalog combining read/stage projection tools, act/todo tools, and granular Hermes machine-control tools.
   - Translates schemas for Gemini (`buildGeminiFunctionDeclarations`, lines 361–367) and OpenAI/LiteLLM (`buildOpenAITools`, lines 372–381).
   - Implements `executeTool` (lines 386–800) and `delegateToHermes` (lines 802–845).

5. **`src/lib/hermes-tools.ts` (Machine Control & CUA Tools)**:
   - Defines 13 low-level machine tools (`computer_screenshot`, `computer_click`, `computer_type`, `computer_key`, `computer_run`, `computer_file_read`, `computer_file_write`, `hermes_schedule_*`, `hermes_task_*`, `hermes_tool_call`).

6. **`src/app/api/chat/route.ts` (REST Interface)**:
   - Exposes `POST` (lines 5–43) to persist user messages, invoke `processSofiaChatTurn`, and store assistant responses.
   - Exposes `GET` (lines 45–74) to retrieve the last 30 messages.

```
                                  +-----------------------+
                                  |   User Message / UI   |
                                  +-----------+-----------+
                                              |
                                              v
                                  +-----------------------+
                                  |  POST /api/chat       |
                                  |  (SQLite Log User)    |
                                  +-----------+-----------+
                                              |
                                              v
                              +-------------------------------+
                              |   processSofiaBrainTurn       |
                              |   (src/lib/brain.ts:490)      |
                              +---------------+---------------+
                                              |
                     +------------------------+------------------------+
                     |                        |                        |
                     v                        v                        v
            +-----------------+      +-----------------+      +-----------------+
            | buildPersona-   |      | buildLive-      |      | Pinned Memory   |
            | Prompt()        |      | ContextBlock()  |      | Notes (LIMIT 4) |
            +--------+--------+      +--------+--------+      +--------+--------+
                     |                        |                        |
                     +------------------------+------------------------+
                                              |
                                              v
                               +-----------------------------+
                               | TIER 1: LiteLLM Proxy       |
                               | (deepseek-v4.1-flash, 45s)  |
                               +--------------+--------------+
                                              |
                                 +------------+------------+
                                 | Tool Call?              | Text / Success
                                 v                         v
                       +-------------------+     +-------------------+
                       | executeTool()     |     | parseTurn()       |
                       | (src/lib/tools.ts)|     | -> SofiaTurn      |
                       +---------+---------+     +-------------------+
                                 | (Max 2 turns)
                                 v
                     [Error / Timeout / Failed?]
                                 |
                                 v
                               +-----------------------------+
                               | TIER 2: Direct Gemini       |
                               | (gemini-3.5-flash-lite, 25s)|
                               +--------------+--------------+
                                              |
                                 +------------+------------+
                                 | FunctionCall?           | Text / Success
                                 v                         v
                       +-------------------+     +-------------------+
                       | executeTool()     |     | parseTurn()       |
                       | (src/lib/tools.ts)|     | -> SofiaTurn      |
                       +---------+---------+     +-------------------+
                                 | (Max 3 turns)
                                 v
                     [Error / Timeout / Failed?]
                                 |
                                 v
                               +-----------------------------+
                               | TIER 3: Deterministic Cache |
                               | (SQLite getDayStats/Score)  |
                               +-----------------------------+
```

---

## 2. Model Routing & Dispatch Pipeline Audit

### 2.1 Three-Tier Cascade Architecture
The dispatch loop in `processSofiaBrainTurn` (`src/lib/brain.ts:542–743`) implements a sequential three-tier fallback:

| Tier | Engine / Provider | Endpoint / Model | Max Tokens | Timeout | Max Iterations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | LiteLLM Proxy | `process.env.LITELLM_BASE_URL` (default: `https://ai-proxy.zenova.services/v1/chat/completions`)<br>Model: `deepseek-v4.1-flash` | `600` | `45,000ms` | 2 loops |
| **Tier 2** | Direct Gemini API | `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`<br>Model: `gemini-3.5-flash-lite` | `800` | `25,000ms` | 3 loops |
| **Tier 3** | Deterministic Cache | Local SQLite query (`getDayStats`, `getDayScore`) | N/A | Synchronous | N/A |

### 2.2 Critical Vulnerabilities in the Routing Pipeline

1. **State Leakage & Duplicate Tool Execution Hazard Across Cascades (`src/lib/brain.ts:544–698`)**:
   - In Tier 1, LiteLLM enters a `while (loopCount < 2)` loop. If the model invokes a mutating tool on iteration 1 (e.g., `create_task`, `computer_run`, or `computer_file_write`), the tool executes, records side effects to SQLite/disk, appends to `executedToolCalls` and `collectedPanes`, and feeds `{ role: 'tool', ... }` back to LiteLLM.
   - If LiteLLM crashes, times out, or throws an error on iteration 2, the `catch (err)` block catches the error and breaks out of Tier 1.
   - Control immediately enters Tier 2 (Gemini dispatch). In Tier 2 (`lines 628–635`), `geminiContents` is initialized **from the raw `recentHistory` and `userMessage`**. It has zero knowledge of the tool calls LiteLLM already completed.
   - Consequently, Gemini may re-invoke the identical tool (`create_task` or `computer_run`), resulting in duplicate tasks, repeated destructive shell commands, or duplicate database writes.

2. **Model Identifier Anomaly (`src/lib/brain.ts:643`)**:
   - The direct Gemini REST endpoint hardcodes:
     ```ts
     `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`
     ```
   - Google Generative AI’s production model naming conventions are `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`, or `gemini-2.5-flash`. The model `gemini-3.5-flash-lite` does not exist in standard Google AI documentation. If the upstream API returns HTTP 404 (Resource Not Found), Tier 2 fails silently on every invocation, dumping directly into Tier 3.

3. **Cumulative Latency Shock**:
   - LiteLLM timeout is configured to `45,000ms` (`src/lib/brain.ts:562`).
   - Gemini timeout is configured to `25,000ms` (`src/lib/brain.ts:656`).
   - In the event of proxy downtime or network partitions, the client experiences a **70-second blocking delay** before the local fallback response is rendered.

4. **Gemini Protocol Role Incompatibility (`src/lib/brain.ts:686–696`)**:
   - When Gemini returns a `functionCall`, line 686 pushes the tool response with:
     ```ts
     geminiContents.push({
       role: 'user',
       parts: [{ functionResponse: { name: fn.name, response: { ... } } }]
     });
     ```
   - In Google Generative AI v1beta specifications, `functionResponse` blocks must belong to `role: 'function'` (or `role: 'tool'`). Sending `role: 'user'` containing `functionResponse` violates strict schema checking on Google's API endpoints and can trigger HTTP 400 Bad Request.

5. **Tool Definition Duplication & Systemic Drift (`src/lib/brain.ts:174–488` vs `src/lib/tools.ts:21–356`)**:
   - `src/lib/brain.ts` contains 315 lines of legacy code defining `SOFIA_TOOLS` (11 tools) and `executeSofiaTool`.
   - `src/lib/tools.ts` contains `UNIFIED_TOOLS` (22 tools) and `executeTool`.
   - In commit `0420f79`, `processSofiaBrainTurn` was updated to import `buildOpenAITools` and `executeTool` from `tools.ts`.
   - `SOFIA_TOOLS` and `executeSofiaTool` in `brain.ts` are completely orphaned from production. However, `tests/brain.test.ts` (lines 3, 130–152) tests `SOFIA_TOOLS` and `executeSofiaTool`. CI tests an obsolete path while production runs untested schemas.

6. **The Missing `request_consequence` Tool**:
   - `src/lib/persona.ts:67` instructs Sofia: *"You can request consequences via tools; the policy module decides whether to approve, clamp, or reject."*
   - `src/lib/tools.ts:3` imports `evaluateConsequenceRequest` from `./policy`.
   - However, `request_consequence` was omitted from `UNIFIED_TOOLS` and has no handler in `executeTool`.
   - If the model tries to enforce accountability via `request_consequence`, `executeTool` hits `default` (`line 795`) and returns:
     ```json
     { "result": null, "error": "Unknown tool: request_consequence" }
     ```

---

## 3. Prompt & Context Assembly Analysis

### 3.1 Live Context Block Assembly (`src/lib/brain.ts:34–106`)
`buildLiveContextBlock` constructs the telemetry state fed into the reasoning context:
- `today.woke_at`: First activity timestamp of the day (`stats.woke_at`).
- `today.focus_min`: Work minutes logged (`stats.work_min`).
- `today.leisure_pct`: Calculated as `round((leisure_min / active_min) * 100)`.
- `today.commits`: Commit count (`stats.commits`).
- `today.score`: Composite score from `getDayScore`.
- `today.coverage`: Tracking coverage ratio (`stats.coverage`).
- `open_tasks`: Top 5 pending/in-progress tasks (`ORDER BY created_at ASC LIMIT 5`).
- `current_app`: Most recent event from `events` table with elapsed minutes.
- `next_event`: Earliest enabled schedule from `schedules`.
- `last_proactive`: Most recent trigger from `proactive_log`.

### 3.2 Context Assembly Flaws & Hallucination Vectors

1. **Hardcoded Streak Days (`src/lib/brain.ts:100` & `src/lib/policy.ts:154`)**:
   - Line 100 explicitly hardcodes:
     ```ts
     streak_days: 2,
     ```
   - In `src/lib/policy.ts:154`, `streak_days: 14` is hardcoded.
   - The engine never calculates real streak longevity from SQLite daily records. The LLM is forced to recite an invariant 2-day streak.

2. **Synthetic Telemetry Injected Despite "Never Invent Data" Rule**:
   - `src/lib/persona.ts:59` establishes Rule 4: *"Never invent data. Ever. If data is missing or coverage is low (< 0.80), say 'I only saw part of your day...'"*
   - However, in `src/lib/db.ts:488–493`, when GitHub activity is unavailable, `rebuildDayStats` fabricates commit numbers:
     ```ts
     commits = existing?.commits ?? Math.min(12, Math.max(2, Math.round(workMin / 45)));
     ```
   - The context pipeline violates its own Persona Bible by synthesizing fake commit counts based on active minutes and presenting them as verified facts.

3. **Direct Contradiction Between Chat and Voice Personas**:
   - **Chat Persona (`src/lib/persona.ts:57`)**: *"2. ALWAYS cite a concrete fact or number from today's stats or tool results: wake time, focus hours, commits, leisure %, score, streak. Never speak in generic platitudes."*
   - **Voice Persona (`src/lib/persona.voice.ts:43`)**: *"Numbers only when a number is the point — never to prove you were listening."*
   - These prompts define contradictory core conversational instructions. Under `persona.ts`, Sofia must cite numbers on every turn; under `persona.voice.ts`, doing so is prohibited unless numbers are the explicit subject.

4. **Pinned Memory Bottleneck & Zero Semantic Grounding**:
   - In `src/lib/brain.ts:512–520`, memory injection is restricted to:
     ```sql
     SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4
     ```
   - Historical conversation summaries, user preferences, and project context are invisible to the model unless the user explicitly asks and the model calls `search_memory` (which uses naive SQL `LIKE %query%`).

---

## 4. Multi-Turn Reasoning & Structured Output Parsing

### 4.1 Multi-Turn Loop Limitations
The reasoning loops in `processSofiaBrainTurn` are severely bounded:
- **LiteLLM**: Hardcoded to `loopCount < 2` (maximum 1 tool call round).
- **Gemini**: Hardcoded to `geminiLoops < 3` (maximum 2 tool call rounds).

**Failure Mode on Complex Workflows**:
If a user issues a command requiring multi-step sequential reasoning (e.g. *"Check if port 8080 is open, read the config file if it is, and restart the service"*):
1. Round 1: Model calls `computer_run("lsof -i :8080")`.
2. Round 2: Model receives output, calls `computer_file_read("config.json")`.
3. In LiteLLM, `loopCount` is now 2. The loop condition `loopCount < 2` evaluates to `false`.
4. The loop exits without returning a final response. It drops down into Gemini fallback, discarding the findings of Round 1 and Round 2!
5. In Gemini, `geminiLoops < 3` breaks on the third turn, causing the request to crash into Tier 3 (the canned fallback message: *"Acknowledged. I'm operating on local telemetry cache..."*).

### 4.2 Structured Output Parsing Analysis (`src/lib/brain.ts:118–171`)

```ts
export function parseTurn(raw: string): SofiaTurn { ... }
```

1. **Brittle Markdown Code Fence Trimming (`lines 136–138`)**:
   ```ts
   let cleaned = raw.trim();
   if (cleaned.startsWith('```')) {
     cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
   }
   ```
   - If the LLM generates conversational conversational preamble before the fence (e.g. `Here is your status:\n```json\n{"say": "..."}\n````), `cleaned.startsWith('```')` returns `false`.
   - If the model appends conversational postamble (e.g. ````json\n{"say": "..."}\n```\nLet me know if you need anything else!`), the trailing regex fails.
   - In both cases, `JSON.parse(cleaned)` throws an error and falls into `catch (lines 164–170)`.
   - The fallback extracts regex mood and assigns `say = raw`. The entire raw JSON string with markdown fences is returned as the spoken text.

2. **Unchecked Null Pointer Vulnerability (`lines 141–142`)**:
   - If the LLM returns the literal string `"null"`, `JSON.parse("null")` succeeds and returns `null`.
   - Line 142 accesses `typeof parsed.say`, throwing `TypeError: Cannot read properties of null (reading 'say')`. While caught by `catch`, it degrades structured output into raw text.

3. **Stage Pane Schema Passthrough Without Validation (`lines 158–161`)**:
   ```ts
   let panes: Pane[] | undefined;
   if (Array.isArray(parsed.panes)) {
     panes = parsed.panes.filter((p: any) => p && typeof p === 'object' && p.kind).slice(0, 4);
   }
   ```
   - Only checks `p.kind`. No schema validation is performed on nested fields (`metrics`, `series`, `events`, `code`, or `url`). Malformed panes are passed directly to client Stage renderers, risking client-side React rendering crashes.

4. **Data Loss on Chat Message History (`src/app/api/chat/route.ts:28–36` vs `48–70`)**:
   - `POST /api/chat` saves Sofia's reply to SQLite:
     ```ts
     db.prepare('INSERT INTO messages (id, ts, role, content, mood, tool_calls) VALUES (?, ?, ?, ?, ?, ?)')
     ```
   - **`result.panes` is completely omitted from the database schema.**
   - When `GET /api/chat` is queried on page refresh, all generated Stage panes (charts, timeline breakdowns, file diffs) are permanently lost.

---

## 5. Weaknesses, Failure Modes, and Ambiguity Gaps

### 5.1 Absolute Lack of Intent Classification
The intelligence engine lacks any query classification or semantic routing layer:
- There is **no distinction** between informational questions (*"What is my commit count?"*), safe mutations (*"Add task to fix bug"*), and high-risk system commands (*"Delete all temporary logs"*).
- Every prompt is forwarded with all 22 tools attached. The LLM alone decides whether to execute arbitrary shell commands.

### 5.2 Catastrophic Machine Control Security Risks

1. **Unsanitized, Unauthenticated Host Shell Execution (`src/lib/tools.ts:668–696`)**:
   ```ts
   case 'computer_run': {
     try {
       const timeout = Number(args.timeout_ms) || 10000;
       const stdout = execSync(args.command, { encoding: 'utf8', timeout }).trim();
   ```
   - Executes arbitrary shell commands on the host OS with the privileges of the Next.js process (`ctum`).
   - Zero command blocklist (`rm -rf`, `mkfs`, `curl | bash`, `git reset --hard`).
   - Zero human-in-the-loop authorization or confirmation challenge.
   - Synchronous blocking: `execSync` completely blocks the Node.js event loop for up to 10 seconds, stalling all concurrent HTTP requests and WebSocket connections across the platform.

2. **Arbitrary File System Read and Write (`src/lib/tools.ts:698–741`)**:
   - `computer_file_write`: Calls `fs.writeFileSync(args.path, args.content, 'utf8')`. Can overwrite source files, `.env.local` secrets, or OS configurations.
   - `computer_file_read`: Calls `fs.readFileSync(args.path, 'utf8')`. Can exfiltrate SSH private keys, environment files, or shadow passwords.

3. **Unvalidated Cron Schedule Deletion (`src/lib/tools.ts:779–782`)**:
   - `hermes_schedule_delete`: Executes `db.prepare('DELETE FROM schedules WHERE id = ?').run(args.id)` with zero checks, allowing silent deletion of critical audit or wake schedules.

### 5.3 Ambiguity & Dangerous Action Gap Summary

| Operation Category | Current Handling | Safety Gate | Expected Behavior |
| :--- | :--- | :--- | :--- |
| **Questions / Informational** | Sent to LLM with 22 tools | None | Answer from context or invoke read-only tool |
| **Multi-Step Plans** | Bounded loops (1–2 tool turns) | Breaks loop $\rightarrow$ Cascades to fallback | Multi-step agent planner with state preservation |
| **Ambiguous User Commands** | LLM hallucinates or guesses parameters | None | Sofia must pause and ask clarifying question |
| **Host Shell Execution** | `execSync(args.command)` | None (0 security checks) | Sandboxed runner + explicit user confirmation token |
| **Arbitrary File Modification** | `fs.writeFileSync(path, content)` | None | Path whitelist + diff preview + confirmation |
| **Consequence Escalation** | Dropped / Unimplemented | Fails with `Unknown tool` | Policy engine approval / clamp evaluation |

---

## 6. Recommendations & Action Items

### Priority 1: High-Risk Security & Safety Fixes (Immediate)
1. **Gate Destructive Operations Behind Stage Confirmation Tokens**:
   - Split `UNIFIED_TOOLS` into `READ_ONLY_TOOLS`, `SAFE_USER_ACTIONS`, and `DANGEROUS_MACHINE_TOOLS`.
   - For `computer_run`, `computer_file_write`, and `hermes_schedule_delete`, require a two-phase commit: the engine generates a `confirmation_request` Stage Pane; execution occurs only after the user explicitly signs off.
2. **Replace Synchronous `execSync`**:
   - Replace `execSync` with asynchronous, promise-based `exec` wrapped in sandboxed process isolation (e.g. restricted working directory, timeout, non-root user).
3. **Validate and Fix Gemini Model Routing Endpoint**:
   - Replace hardcoded `gemini-3.5-flash-lite` in `src/lib/brain.ts:643` with a configurable environment variable (`GEMINI_FALLBACK_MODEL ?? 'gemini-2.5-flash'`).
   - Fix Gemini function response formatting by setting `role: 'function'` (or `role: 'tool'`) instead of `role: 'user'` on line 686.

### Priority 2: Architectural Consistency & Dead Code Cleanup
1. **Purge Orphaned Tool Definitions**:
   - Remove `SOFIA_TOOLS` (lines 174–333) and `executeSofiaTool` (lines 335–488) from `src/lib/brain.ts`.
   - Update `tests/brain.test.ts` to test `processSofiaBrainTurn` and `UNIFIED_TOOLS` from `src/lib/tools.ts`.
2. **Implement Missing `request_consequence` in `tools.ts`**:
   - Add `request_consequence` to `UNIFIED_TOOLS` and wire its execution in `executeTool` to call `evaluateConsequenceRequest` from `src/lib/policy.ts`.
3. **Prevent Duplicate Tool Invocations Across Cascade Tiers**:
   - In `processSofiaBrainTurn`, pass already executed tools (`executedToolCalls`) into Gemini dispatch so Gemini does not repeat actions already committed by LiteLLM.

### Priority 3: Robustness & Context Integrity
1. **Robust JSON Extraction**:
   - Refactor `parseTurn` to extract JSON using balanced brace matching or a regex scanning for `\{[\s\S]*\}` rather than relying on naive `startsWith('```')`.
2. **Persist Panes Across Sessions**:
   - Alter `messages` table schema in `src/lib/db.ts` to add `panes TEXT`. Store `JSON.stringify(result.panes)` in `POST /api/chat` and return it in `GET /api/chat`.
3. **Eliminate Synthetic Commit Inflation & Compute Real Streaks**:
   - Refactor `rebuildDayStats` (`db.ts:488`) to report real commits (`0` if no GitHub events exist) to adhere to Sofia's "Never invent data" rule.
   - Implement real streak calculation across historical records in `day_scores` instead of hardcoding `streak_days: 2`.
4. **Reconcile Speech Rules Between Chat and Voice**:
   - Unify `src/lib/persona.ts` and `src/lib/persona.voice.ts` so Sofia's conversational directives do not contradict each other regarding numeric citations.
