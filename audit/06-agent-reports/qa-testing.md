# AUDIT REPORT 13: QA, TESTING & FAILURE SCENARIO AUDIT
**Auditor**: AGENT 13 — QA, Testing & Failure Scenario Auditor  
**Repository**: `ctum0/sofia-v6` (`agitated-archimedes`)  
**Scope Target**: `audit/06-agent-reports/qa-testing.md`  
**Date**: November 7, 2026  
**Status**: COMPLETE — Exhaustive Implementation-Level Verification  

---

## EXECUTIVE SUMMARY

A rigorous, line-by-line inspection of the test infrastructure, test suites (`tests/*.test.ts`), runtime execution paths, and failure resilience across the Jarvis/Sofia platform was conducted. The audit reveals a critical dichotomy: while pure mathematical algorithms (scoring formulas, consequence policy guardrails, and basic text parsing) exhibit high unit-test fidelity, **the core operational systems—full-duplex Gemini Live voice streaming, Next.js API routes, SQLite transactional resilience, React/VRM UI components, external LLM failover, and hardware integrations—are almost completely untested.**

### Key Findings Matrix
| Audit Vector | Implementation Reality | Quality & Risk Assessment |
| :--- | :--- | :--- |
| **Test Runner & Config** | Vitest v5.1.0 installed in `devDependencies`; **no `vitest.config.ts`**, **no `test` script in `package.json`**, no coverage provider (`@vitest/coverage-v8`). | **HIGH RISK**: Zero-config default runner, tests not run during build/CI. |
| **Test Suite Coverage** | 8 test files (`42` unit tests total, passing in ~450ms). Zero API tests, zero UI/component tests, zero E2E tests. | **CRITICAL RISK**: Estimated repo line coverage is ~18%; runtime engine is blind. |
| **Mock vs Reality Gap** | 4 out of 8 test suites hand-code duplicate SQL `CREATE TABLE` schemas instead of using `initDatabase()`. | **HIGH RISK**: Severe schema drift risk; migrations and schema constraints unverified. |
| **Failure Modes** | SQLite runs with **no WAL mode**, **no busy timeout**, and non-transactional batch ingestion. | **CRITICAL RISK**: Concurrency yields instant `SQLITE_BUSY` (`database is locked`). |
| **LLM Resilience** | LiteLLM has a 45s timeout; Telegram cron fetch has **no timeout**; Edge TTS has **no timeout**. | **HIGH RISK**: Unhandled network hangs block API routes indefinitely. |
| **WebSocket / Live API** | `SofiaLiveSession` (`src/lib/live/session.ts`, 717 lines) is **0% covered**. | **CRITICAL RISK**: Reconnect loops, VAD barge-in, and 40m migrations untested. |

---

## 1. TEST SUITE COVERAGE & QUALITY ANALYSIS

### 1.1 Testing Framework & Tooling Audit
* **Configuration File**: Absent. There is no `vitest.config.ts`, `vitest.config.mjs`, or `vitest.config.js` in the repository root. Vitest executes using implicit Node.js defaults without custom environment isolation, aliases, or reporter setups.
* **Package Scripts (`package.json`)**:
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  }
  ```
  Noticeably, `"test": "vitest"` or `"test:coverage"` is **completely missing**. Developers and CI pipelines running standard `pnpm test` will fail with missing script errors.
* **Coverage Tooling**: Attempting to execute `pnpm vitest --coverage` halts because neither `@vitest/coverage-v8` nor `@vitest/coverage-istanbul` is installed in `devDependencies`.
* **DOM Environment**: Neither `jsdom` nor `happy-dom` is installed. As a result, Vitest cannot evaluate React components or hooks without throwing `ReferenceError: document is not defined`.

### 1.2 Existing Test Suite Inventory (8 Test Suites, 42 Tests)

| Test File | Test Count | Target Source File | Execution Time | Quality Rating |
| :--- | :---: | :--- | :---: | :---: |
| `tests/auth.test.ts` | 4 | `src/lib/auth.ts` | 18ms | Moderate |
| `tests/brain.test.ts` | 5 | `src/lib/brain.ts` | 18ms | Low |
| `tests/cron.test.ts` | 6 | `src/lib/proactive.ts` | 17ms | Moderate |
| `tests/live.test.ts` | 9 | `src/lib/tools.ts`, `src/lib/actions/*`, `src/lib/db.ts` | 18ms | Low |
| `tests/persona.test.ts` | 3 | `src/lib/persona.ts` | 5ms | Low (Weak Assertions) |
| `tests/policy.test.ts` | 6 | `src/lib/policy.ts` | 10ms | High |
| `tests/rollup.test.ts` | 2 | `src/lib/db.ts` | 16ms | Moderate |
| `tests/scoring.test.ts` | 7 | `src/lib/scoring.ts` | 11ms | High |

### 1.3 Detailed Evaluation of Individual Suites

#### 1.3.1 `tests/auth.test.ts` (4 Tests)
* **What it tests**: Verifies `verifyApiAuth(req)` in `src/lib/auth.ts`: unconfigured token allows all, configured token returns 401 when missing, valid Bearer token returns authorized, `/api/health` path bypasses auth.
* **Omissions & Implementation Gaps**:
  1. `SOFIA_AUTH_TOKEN` fallback (`src/lib/auth.ts` line 8) is never verified when `SOFIA_API_TOKEN` is unset.
  2. Alternative header `x-sofia-token` (line 32) is never tested.
  3. Cookie extraction `sofia_token` (line 38) is never tested.
  4. Specialized ingest header `x-device-token` with `DEVICE_TOKEN` / `SOFIA_DEVICE_TOKEN` (lines 44–50) is untested.
  5. Cron header `x-cron-secret` with `CRON_SECRET` (lines 53–59) is untested.
  6. The core higher-order wrapper `withAuth(handler)` (lines 73–83) used by route handlers is completely untested.
  7. Timing-attack safety: Comparison uses standard JavaScript strict equality (`token === expectedToken`) instead of `crypto.timingSafeEqual()`, vulnerable to side-channel timing analysis.

#### 1.3.2 `tests/brain.test.ts` (5 Tests)
* **What it tests**: `buildLiveContextBlock` returns expected dictionary fields; `extractMood` strips `[MOOD:...]` tags; `SOFIA_TOOLS` contains tool name strings; `executeSofiaTool` runs `get_stats`; `parseTurn` parses JSON, code fences, and plain text.
* **Omissions & Implementation Gaps**:
  1. **Core LLM Orchestration Untested**: `processSofiaBrainTurn` (`src/lib/brain.ts` lines 490–745, over 250 lines) is the central intelligence engine that dispatches to LiteLLM, executes tool loops, and falls back to Gemini or local cache. It has **zero tests**.
  2. **10+ Sofia Tools Untested**: In `brain.ts`, only `get_stats` is executed. Unchecked tools include: `get_timeline`, `search_memory`, `list_tasks`, `create_task`, `complete_task`, `start_focus_session`, `set_reminder`, `request_consequence`, `browse_url`, `show_image`.
  3. **Weak Assertions**: Lines 131–143 only check `toolNames.toContain("...")`. They do not validate JSON Schema correctness or parameter declarations.

#### 1.3.3 `tests/cron.test.ts` (6 Tests)
* **What it tests**: `canSendProactive()` guardrails: quiet hours blocking (02:00), emergency mute, rest day blocking for `midday_check`, daily message cap (8/day), 30-minute min gap; `executeProactiveJob()` executes `wake_report` when `{ force: true }`.
* **Omissions & Implementation Gaps**:
  1. Route handler `src/app/api/cron/[job]/route.ts` is never tested.
  2. Other proactive cron jobs (`midday_check`, `daily_verdict`, `github_sync`) are never tested.
  3. `JOB_ALIASES` mapping (`morning` -> `wake_report`, `midday` -> `midday_check`, `evening`/`night` -> `daily_verdict`) is untested.
  4. The suppression branch in `executeProactiveJob` (`if (!guardrail.allowed)`) and suppressed log insertion into SQLite are never asserted.
  5. Weak assertion: Line 162 uses `expect(res.text).toMatch(/\d/)` (merely checks if text contains any digit).

#### 1.3.4 `tests/live.test.ts` (9 Tests)
* **What it tests**: Array lengths of `HERMES_TOOLS`, `buildGeminiFunctionDeclarations()`, and `buildOpenAITools()`; allowlisted actions dictionary; execution of `system-status`; `trackLiveUsage` and `getTodayLiveSeconds`; `executeTool` for `hermes_schedule_create` and `hermes_schedule_list`.
* **Mock vs Reality Disconnect**:
  1. The suite title `describe("Gemini 3.8 Live & Machine Control (Sofia v6)")` is a misnomer. It **never imports, instantiates, or tests `SofiaLiveSession` (`src/lib/live/session.ts`)**.
  2. Live WebSockets, 16kHz PCM streaming, 24kHz audio synthesis, hybrid VAD, barge-in detection, and session migration have **zero tests**.
  3. Non-hermetic test: `executeNamedAction("system-status")` (line 88) calls real Node.js `os` APIs on the host machine.
  4. Missing tool coverage: Out of 22 tools in `src/lib/tools.ts`, only 2 (`hermes_schedule_create`, `hermes_schedule_list`) are executed.

#### 1.3.5 `tests/persona.test.ts` (3 Tests)
* **What it tests**: Fixtures array length >= 6; every sample contains a digit; `buildPersonaPrompt(defaultSettings)` contains specific strings.
* **Weak Assertions**:
  1. Line 12: `const containsDigit = /\d/.test(fixture.line); expect(containsDigit).toBe(true);` validates only that a digit exists, not that tone or strictness rules are satisfied.
  2. Line 24: `expect(prompt).not.toContain("The user is not a software developer");` is an ad-hoc negative assertion.
  3. `src/lib/persona.voice.ts` (`buildVoicePersona`), which formats the prompt for low-latency live speech, is **completely untested**.

#### 1.3.6 `tests/policy.test.ts` (6 Tests)
* **What it tests**: Consequence safety policy (`evaluateConsequencePolicy`): blocks on master switch false, blocks on kill switch active, clamps intensity to hard ceiling (40%), blocks during quiet hours (02:00), blocks when daily cap is reached, blocks when 30-min cooldown is active.
* **Omissions**:
  1. `evaluateConsequenceRequest` wrapper (`src/lib/policy.ts` lines 131–180) is untested.
  2. Day status blocking (`scoreData.status !== "normal"`, e.g. sick, travel, rest) is untested.
  3. Low coverage bypass (`!scoreData.verdict.consequence_eligible`) is untested.
  4. Dry-run mode response message assertion (`APPROVED (DRY RUN)`) is untested.

#### 1.3.7 `tests/rollup.test.ts` (2 Tests)
* **What it tests**: `rebuildDayStats()` computes `work_min`, `leisure_min`, `active_min`, and `woke_at` from discrete events; detects offline gaps > 15 min.
* **Omissions & Flakiness**:
  1. Timezone-dependent assertion: Line 80 asserts `expect(stats.woke_at).toBe(new Date(`${today}T08:00:00Z`).toTimeString().slice(0, 5));`, which varies according to the host machine timezone.
  2. Other functions in `src/lib/db.ts` (`ingestEvents`, `classifyAppOrDomain`, `getHourlyTimeline`, `getHistoryScores`) are untested.

#### 1.3.8 `tests/scoring.test.ts` (7 Tests)
* **What it tests**: Mathematical functions: `computeWakeScore`, `computeFocusScore`, `computeOutputScore`, `computeLeisureScore`, `computeSleepScore`, `calculateDayScore` with high score and low coverage.
* **Quality**: Highest quality unit test in the suite with deterministic boundaries, edge cases, and clamping checks.

---

## 2. MOCK VS REALITY GAP AUDIT

### 2.1 Database Schema Duplication (The "Phantom Schema" Anti-Pattern)
In `tests/brain.test.ts`, `tests/cron.test.ts`, `tests/live.test.ts`, and `tests/rollup.test.ts`, the tests do not call `initDatabase(db)` from `src/lib/db.ts`. Instead, each test author wrote raw SQL `CREATE TABLE` statements in their `beforeEach` hook.

```
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│        src/lib/db.ts (REAL)          │        │    tests/*.test.ts (MOCK/PHANTOM)    │
│                                      │        │                                      │
│  CREATE TABLE day_stats (            │        │  CREATE TABLE day_stats (            │
│    date TEXT PRIMARY KEY,            │        │    date TEXT PRIMARY KEY,            │
│    active_min INTEGER NOT NULL,      │        │    active_min INTEGER NOT NULL,      │
│    ...                               │        │    ...                               │
│    offline_min INTEGER DEFAULT 0,    │        │    (Missing in brain.test.ts!)       │
│    tasks_done INTEGER DEFAULT 0      │        │    (Missing in brain.test.ts!)       │
│  );                                  │        │  );                                  │
└──────────────────────────────────────┘        └──────────────────────────────────────┘
```

**Consequences of this Gap**:
1. In `tests/brain.test.ts` lines 24–34, `day_stats` does NOT include `offline_min` or `tasks_done`.
2. In `tests/live.test.ts` lines 31–39, `day_stats` does NOT include `woke_at`, `bed_at`, `offline_min`, or `tasks_done`.
3. Schema migrations in `initDatabase()` (`ALTER TABLE day_stats ADD COLUMN ...`) are bypassed completely during test execution. If migration syntax breaks or a default value is null-violating, the test suite passes green while production crashes.

### 2.2 Complete Isolation from Real External Services
1. **Gemini Live WebSocket**: Zero integration testing against mock WebSockets. The entire protocol sequence (`setup`, `realtimeInput`, `serverContent`, `turnComplete`, `barge-in`, `goAway`) is simulated nowhere.
2. **LiteLLM / Gemini REST Endpoints**: Neither mocked with MSW (Mock Service Worker) nor tested against a local staging mock.
3. **Microsoft Edge TTS & ElevenLabs**: No test verifies that generated audio buffers are valid MP3 format or that stream errors are safely intercepted.
4. **Agent-PC / Hermes Relay**: `hermes-relay.py` and `scripts/agent-pc.py` communicate via HTTP POST to `/api/ingest/events` and execute shell commands. No end-to-end integration test exists between the Python daemon and the Next.js ingest endpoint.

---

## 3. FAILURE SCENARIO & EDGE CASE ANALYSIS

### 3.1 SQLite Concurrency & Storage Failure Analysis

#### 3.1.1 Lack of WAL Mode & Busy Timeout (`src/lib/db.ts`)
* **Code Evidence**: In `src/lib/db.ts` lines 27–33:
  ```ts
  export function getDatabase(): DatabaseSync {
    if (!_db) {
      _db = new DatabaseSync(DB_PATH);
      initDatabase(_db);
    }
    return _db;
  }
  ```
  `node:sqlite`'s `DatabaseSync` is opened without setting `PRAGMA journal_mode = WAL;` or `PRAGMA busy_timeout = 5000;`.
* **Failure Impact**: In Next.js, concurrent API route handlers (e.g., `/api/ingest/events` writing telemetry while `/api/cron` writes proactive logs and `/api/chat` records messages) execute across asynchronous event-loop ticks sharing synchronous file locks. With default journal mode (`DELETE`) and `0ms` busy timeout, concurrent writes immediately fail with:
  `SqliteError: database is locked`.
* **Test Status**: **UNTESTED**. All tests use isolated `:memory:` databases where lock contention cannot occur.

#### 3.1.2 Non-Transactional Batch Ingestion (`src/lib/db.ts` lines 402–432)
* **Code Evidence**:
  ```ts
  export function ingestEvents(db: DatabaseSync, events: Array<Partial<ActivityEvent>>): number {
    const insert = db.prepare(`INSERT OR REPLACE INTO events ...`);
    for (const e of events) {
      insert.run(id, ts, source, kind, category, app, title, duration, meta);
      count++;
      datesToRecalc.add(ts.slice(0, 10));
    }
    for (const d of datesToRecalc) {
      rebuildDayStats(db, d);
    }
  }
  ```
* **Failure Impact**: If 100 events are ingested and disk writes fail on event 50 (disk full, lock failure, process termination), the database is left in a partially written state. No `db.exec('BEGIN TRANSACTION')` or `COMMIT` is used. Furthermore, `rebuildDayStats()` will never be called for that batch, leaving day statistics desynchronized from raw events.
* **Test Status**: **UNTESTED**.

#### 3.1.3 Primary Key Collisions via Millisecond Timestamps
* **Code Evidence**:
  * `src/lib/proactive.ts` line 189: `id: log-${Date.now()}`
  * `src/lib/proactive.ts` line 197: `id: msg-proactive-${Date.now()}`
  * `src/lib/tts.ts` line 61: `id: tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  * `src/lib/actions/system-status.ts` line 18: `id: pane-sys-${Date.now()}`
* **Failure Impact**: Rapid successive invocations within the same millisecond trigger primary key constraint violations: `SqliteError: UNIQUE constraint failed: proactive_log.id`.
* **Test Status**: **UNTESTED**.

---

### 3.2 Malformed LLM Responses & Tool Loops

#### 3.2.1 Non-JSON and Truncated LLM Responses
* **Implementation (`src/lib/brain.ts` lines 118–170)**:
  `parseTurn()` attempts `JSON.parse()`. If parsing fails, it falls back to `extractMood(raw)`:
  ```ts
  } catch {
    const extracted = extractMood(raw);
    const validMood = VALID_MOODS.includes(extracted.mood as SofiaMood)
      ? (extracted.mood as SofiaMood)
      : 'neutral';
    return { say: extracted.text, mood: validMood };
  }
  ```
* **Vulnerability**: If the model emits raw markdown containing tool syntax (e.g. `Thought: I should check stats\nAction: get_stats`), `parseTurn` treats the entire scratchpad as the spoken utterance.
* **Test Status**: Only clean text and standard code fences are tested in `tests/brain.test.ts`. Malformed or thought-chain dumps are untested.

#### 3.2.2 Malformed Tool Call Arguments
* **Implementation (`src/lib/brain.ts` lines 582–586)**:
  ```ts
  let parsedArgs = {};
  try {
    parsedArgs = JSON.parse(tc.function.arguments || '{}');
  } catch {}
  ```
* **Vulnerability**: If `arguments` is truncated JSON (e.g. `{"date": "2026-11`), `parsedArgs` defaults to `{}`. When passed to tools expecting mandatory parameters (e.g. `search_memory` requiring `query`), the tool execution throws or produces unhelpful results.
* **Test Status**: **UNTESTED**.

#### 3.2.3 LLM Tool Call Infinite Loop Protection
* **Implementation**:
  * LiteLLM loop: `while (loopCount < 2)` (`src/lib/brain.ts` line 544).
  * Gemini loop: `while (geminiLoops < 3)` (`src/lib/brain.ts` line 639).
* **Vulnerability**: Clamping at 2 and 3 iterations prevents runaway token consumption. However, if the tool call fails or throws an exception, the error bubbles up, aborts the loop, and forces fallback to local telemetry cache without explaining the failure to the user.
* **Test Status**: **UNTESTED**.

---

### 3.3 WebSocket Abrupt Drops & Voice Session Failures

#### 3.3.1 Silent Reconnection Abortion (`src/lib/live/session.ts` lines 605–626)
* **Code Evidence**:
  ```ts
  private async attemptReconnect() {
    if (this.reconnectCount >= LIMITS.maxResumeAttempts) {
      this.resumptionHandle = null;
      this.reconnectCount = 0;
    }
    this.reconnectCount++;
    const backoff = LIMITS.resumeBackoffMs[Math.min(this.reconnectCount - 1, 1)];

    setTimeout(async () => {
      try {
        const tokenRes = await fetch('/api/live/token', { method: 'POST', headers: getAuthHeaders() });
        if (tokenRes.ok) {
          const cfg = await tokenRes.json();
          await this.connectSocket(cfg, true);
        }
      } catch (err) {
        console.warn('Reconnect failed:', err);
      }
    }, backoff);
  }
  ```
* **Failure Impact**: If `/api/live/token` returns 401 or network is completely severed, the `catch` block merely logs `console.warn`. It **never notifies the UI callbacks (`onError`)**, **never sets state to `'failed'`**, and **never retries**. The UI permanently displays `'reconnecting'` while completely dead.
* **Test Status**: **UNTESTED**.

#### 3.3.2 WebSocket 1006 Abnormal Close
* **Implementation (`src/lib/live/session.ts` lines 300–306)**:
  ```ts
  ws.onclose = (e) => {
    console.log('WebSocket closed:', e.code, e.reason);
    if (this.state !== 'off' && this.state !== 'closing') {
      this.dropCount++;
      this.attemptReconnect();
    }
  };
  ```
* **Failure Impact**: When the Gemini Live server closes abnormally (code 1006) during active model audio playback, `this.flushAudio()` is NOT called in `onclose`. Unplayed audio chunks in the WebAudio queue continue playing while the connection is dropped.
* **Test Status**: **UNTESTED**.

---

### 3.4 Network Timeouts & Resource Leaks

| Network Call | File & Line | Timeout Mechanism | Failure Mode |
| :--- | :--- | :---: | :--- |
| **LiteLLM Completion** | `src/lib/brain.ts:562` | `AbortSignal.timeout(45000)` | 45-second UI freeze if LiteLLM proxy hangs. |
| **Gemini REST Dispatch** | `src/lib/brain.ts:643` | **NONE** | Request hangs indefinitely until Vercel/Node socket timeout. |
| **Telegram Cron Alert** | `src/app/api/cron/[job]/route.ts:61` | **NONE** | If Telegram API is blocked or slow, cron job hangs indefinitely. |
| **GitHub Event Sync** | `src/lib/github.ts:30` | **NONE** | GitHub rate-limiting or network outage hangs sync job. |
| **Edge TTS Stream** | `src/lib/tts.ts:101-106` | **NONE** | Stream event listener hangs if remote connection drops before 'end'. |
| **ElevenLabs TTS** | `src/lib/tts.ts:149` | **NONE** | Network delay hangs audio synthesis. |

---

## 4. MISSING TEST SUITES

### 4.1 Next.js API Routes (20 Out of 20 Untested)
The platform exposes 20 production API routes under `src/app/api/`. None of them have automated integration tests:

1. `POST /api/chat` (`src/app/api/chat/route.ts`): Orchestrates prompt construction, memory retrieval, tool execution, and database logging.
2. `POST /api/cron/[job]` (`src/app/api/cron/[job]/route.ts`): Triggers scheduled wake reports, midday checks, evening verdicts, and GitHub syncs.
3. `POST /api/live/token` (`src/app/api/live/token/route.ts`): Ephemeral token generation for Gemini Live.
4. `POST /api/live/tool` (`src/app/api/live/tool/route.ts`): Client tool execution dispatch.
5. `POST /api/live/usage` (`src/app/api/live/usage/route.ts`): Real-time voice seconds telemetry tracking.
6. `POST /api/ingest/events` (`src/app/api/ingest/events/route.ts`): Ingestion from agent-pc ActivityWatch daemon.
7. `POST /api/ingest/heartbeat` (`src/app/api/ingest/heartbeat/route.ts`): Device liveness heartbeat.
8. `POST /api/tts` (`src/app/api/tts/route.ts`): Speech synthesis fallback route.
9. `GET/POST /api/tasks` (`src/app/api/tasks/route.ts`): Task CRUD operations.
10. `GET/POST /api/memory` (`src/app/api/memory/route.ts`): Pinned memory note management.
11. `GET/POST /api/settings` (`src/app/api/settings/route.ts`): User preferences and consequence dials.
12. `GET /api/stats` (`src/app/api/stats/route.ts`): Daily telemetry statistics.
13. `GET /api/timeline` (`src/app/api/timeline/route.ts`): Hourly activity breakdown.
14. `GET /api/score` (`src/app/api/score/route.ts`): Real-time calculated score.
15. `POST /api/focus/start` & `/stop` (`src/app/api/focus/*/route.ts`): Focus timer management.
16. `GET /api/stream` (`src/app/api/stream/route.ts`): Server-sent events streaming.
17. `POST /api/browse` (`src/app/api/browse/route.ts`): Headless web scraping reader.
18. `GET /api/health` (`src/app/api/health/route.ts`): Health check endpoint.
19. `POST /api/auth` (`src/app/api/auth/route.ts`): Token validation.
20. `src/proxy.ts`: Root Next.js middleware protecting routes and redirecting to `/unlock`.

### 4.2 Frontend & UI Components (10 Out of 10 Untested)
1. `SofiaAvatar.tsx`: Three.js VRM rendering, eye blinking, lip-sync mapping, expressions.
2. `SofiaPanel.tsx`: Chat interface, speech bubble animations, mic toggle state machine.
3. `Stage.tsx`, `Pane.tsx`, `PaneRail.tsx`: Widget projection cards (stat, chart, timeline, todo, code).
4. `ScoreRing.tsx` & `CategoryBars.tsx`: SVG metric rings and bar graphs.
5. `LiveDebugOverlay.tsx`: Real-time audio TTFA/TTFT diagnostic telemetry.
6. `CaptionLine.tsx` & `Navbar.tsx`: Audio captions and navigation.
7. `useVoiceInput.ts`: SpeechRecognition hook and fallback handling.

### 4.3 Uncovered Library & Utility Modules
* `src/lib/live/session.ts`: `SofiaLiveSession` class (717 lines).
* `src/lib/tts.ts`: `synthesizeEdge`, `synthesizeElevenLabs`, `pruneAudioCache`.
* `src/lib/voice.ts`: `speakSofia`, `unlockAudio`, browser speech synthesis.
* `src/lib/github.ts`: `syncGitHubActivity` parsing PushEvents and PR reviews.
* `src/lib/persona.voice.ts`: `buildVoicePersona` voice-specific prompt generator.
* `src/lib/expressions.ts`: VRM blend shape expression mappings.

---

## 5. FLAKY TESTS & REGRESSION VULNERABILITIES

### 5.1 Timezone-Dependent Test Assertions
* **`tests/rollup.test.ts` Line 80**:
  ```ts
  expect(stats.woke_at).toBe(new Date(`${today}T08:00:00Z`).toTimeString().slice(0, 5));
  ```
  `toTimeString()` formats the UTC timestamp into local machine time. If tests run on a server set to UTC (e.g. GitHub Actions runner), `stats.woke_at` is `'08:00'`. If run on a local workstation in IST (UTC+5:30), `stats.woke_at` evaluates to `'13:30'`. This test will intermittently fail across developer machines and CI servers.

### 5.2 Midnight Rollover Flakiness
* **`tests/brain.test.ts` Lines 98 & 106**:
  ```ts
  const today = new Date().toISOString().slice(0, 10);
  ```
  If test execution starts at 23:59:59.990 UTC and crosses midnight before subsequent queries execute, data seeded for yesterday will fail to match `buildLiveContextBlock(db, today)`, causing spurious test failures.

### 5.3 Ad-hoc Scripts Masking as Automated Tests
In `scripts/`:
* `scripts/run-axe-audit.mjs`
* `scripts/verify-living-presence.mjs`
* `scripts/capture-desktop-views.mjs`

These scripts require a pre-running local server on `http://localhost:3000`. Furthermore, line 9 of `run-axe-audit.mjs` and line 8 of `capture-desktop-views.mjs` navigate to `{ name: "Computer Use", path: "/computer-use" }`—a route that **does not exist in `src/app/`**, resulting in unhandled 404 navigation errors during manual runs.

---

## 6. END-TO-END TEST PLAN FOR JARVIS ASSISTANT

To elevate the Jarvis/Sofia platform to enterprise-grade stability, an automated testing pyramid must be established across three layers:

```
                  ┌──────────────────────┐
                  │ Playwright E2E Tests │  10% (Critical User Journeys)
                  ├──────────────────────┤
                  │ API & Mock Live WS   │  30% (Integration / Routes)
                  ├──────────────────────┤
                  │   Vitest Unit & DOM  │  60% (Algorithms, State, Math)
                  └──────────────────────┘
```

### 6.1 Layer 1: Unit & Component Testing (Vitest + Testing Library)
1. **Configure Vitest Properly**:
   Create `vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config';
   import path from 'path';

   export default defineConfig({
     test: {
       environment: 'node',
       globals: true,
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
         include: ['src/lib/**/*.ts', 'src/app/api/**/*.ts'],
       },
       alias: {
         '@': path.resolve(__dirname, './src'),
       },
     },
   });
   ```
2. **Schema Verification Tests**:
   Eliminate phantom schemas in `tests/*.test.ts`. Replace manual SQL DDL with:
   ```ts
   import { initDatabase } from '@/lib/db';
   beforeEach(() => {
     db = new DatabaseSync(':memory:');
     initDatabase(db);
   });
   ```
3. **Mock Service Worker (MSW)**:
   Intercept outgoing HTTP calls to `https://ai-proxy.zenova.services/v1`, `https://generativelanguage.googleapis.com`, `https://api.github.com`, and `https://api.elevenlabs.io` with deterministic mock fixtures.

### 6.2 Layer 2: API Route Integration Tests
Test all 20 API routes using simulated `NextRequest` and `NextResponse` cycles without requiring a live HTTP socket:

* **Route Ingestion Test (`POST /api/ingest/events`)**:
  * Send valid ActivityWatch event array.
  * Assert 200 response and verified rows in `events` and `day_stats`.
  * Send missing device token -> verify 401.
  * Inject invalid payload -> verify 400 validation error.
* **Cron Execution Test (`POST /api/cron/morning`)**:
  * Verify `JOB_ALIASES` resolves `morning` to `wake_report`.
  * Verify proactive log entry created.
  * Verify `x-cron-secret` authentication enforcement.

### 6.3 Layer 3: Playwright End-to-End Scenarios

#### Scenario 1: First-Time User Unlock & Session Initialization
* Navigate to `/` without token -> verify redirection to `/unlock`.
* Enter master secret token -> submit -> verify cookie set and redirect to `/`.
* Assert 3D avatar canvas renders without WebGL context loss.
* Verify stage initializes with default greeting.

#### Scenario 2: Full-Duplex Voice Turn & Stage Projection
* Launch headless Chromium with fake audio device (`--use-fake-device-for-media-stream`).
* Intercept `/api/live/token` and mock Gemini Live WebSocket server using `ws` library.
* Inject user speech chunk -> assert `SofiaLiveSession` triggers speech end.
* Mock server sends `modelTurn` with audio chunk and `toolCall` for `show_stats_today`.
* Verify visual Stage dynamically renders the Telemetry stat pane.
* Verify lip-sync animation frame fires on avatar canvas.

#### Scenario 3: Mid-Turn Barge-In Handling
* Trigger assistant speech playback.
* Simulate user mic speech exceeding `SPEECH_RMS_THRESHOLD = 0.035` for >200ms.
* Assert `flushAudio()` executes: audio queue cleared, mouth animation returns to rest.
* Assert client sends `audioStreamEnd` and begins new user turn.

#### Scenario 4: Consequence Escalation & Safety Guardrails
* Seed database with weak day stats (wake: 12:30, focus: 45m, leisure: 65%).
* Trigger daily verdict cron job.
* Verify score calculated <= 4.0.
* Verify policy clamps consequence intensity to hard ceiling (40%).
* Toggle kill switch in `/settings` -> trigger again -> verify consequence immediately BLOCKED.

---

## 7. AUDIT RECOMMENDATIONS & ACTION PLAN

| Priority | Action Item | Target File(s) | Impact |
| :---: | :--- | :--- | :--- |
| **P0** | Add `"test": "vitest run"` and install `@vitest/coverage-v8` in `package.json`. | `package.json` | Restores fundamental CI/CD test automation. |
| **P0** | Enable SQLite WAL mode and 5000ms busy timeout in `getDatabase()`. | `src/lib/db.ts:27-33` | Eliminates concurrent `SQLITE_BUSY` crashes. |
| **P0** | Wrap batch `ingestEvents()` in a SQLite transaction (`BEGIN/COMMIT`). | `src/lib/db.ts:402-432` | Prevents database corruption on partial ingest failure. |
| **P1** | Replace hand-coded SQL in test fixtures with `initDatabase()`. | `tests/*.test.ts` | Eliminates silent database schema drift. |
| **P1** | Add abort timeouts to Telegram, ElevenLabs, and GitHub HTTP calls. | `src/app/api/cron/...`, `src/lib/tts.ts`, `src/lib/github.ts` | Prevents indefinite server thread hangs. |
| **P1** | Implement error callback and UI notification on Live reconnect failure. | `src/lib/live/session.ts:605-626` | Prevents zombie UI stuck in `'reconnecting'`. |
| **P2** | Fix timezone-dependent assertion in `tests/rollup.test.ts`. | `tests/rollup.test.ts:80` | Prevents cross-platform CI test flakiness. |
| **P2** | Replace millisecond timestamp IDs with monotonic counters or UUIDs. | `src/lib/proactive.ts`, `src/lib/tts.ts` | Prevents primary key collisions under high throughput. |
| **P2** | Add automated integration suite for 20 Next.js API route handlers. | `tests/api/*.test.ts` | Covers critical untested application surface. |

