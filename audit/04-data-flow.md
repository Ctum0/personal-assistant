# Phase 0 — Data Flow & Request Lifecycles

## 1. Text Interaction Lifecycle (Pipeline A)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as Browser Client (Stage)
    participant Proxy as Next.js Proxy (src/proxy.ts)
    participant ChatRoute as /api/chat (POST)
    participant Brain as Brain (src/lib/brain.ts)
    participant SQLite as SQLite (data/sofia.db)
    participant LLM as Gemini / LiteLLM API
    participant Tools as Tool Executor (src/lib/tools.ts)
    participant TTS as /api/tts (Edge/ElevenLabs)

    User->>Browser: Types message & presses Enter / Send
    Browser->>Proxy: POST /api/chat with Bearer Token & { message, history }
    Proxy->>Proxy: Validate token in Authorization header or Cookie
    Proxy->>ChatRoute: Forward authenticated request
    ChatRoute->>SQLite: INSERT INTO messages (role: user, content)
    ChatRoute->>Brain: processSofiaChatTurn(db, userMessage, history)
    
    Brain->>SQLite: Query day_stats, day_score, open tasks, pinned memory
    Brain->>Brain: Assemble system instruction & live context block
    
    alt LiteLLM Key Configured
        Brain->>LLM: POST /chat/completions (tools: buildOpenAITools())
    else Gemini API Key Configured (Default)
        Brain->>LLM: POST /v1beta/models/gemini-3.5-flash-lite:generateContent
    end

    opt Model Calls Tool
        LLM-->>Brain: Returns functionCall(name, args)
        Brain->>Tools: executeTool(db, name, args, settings)
        Tools->>SQLite: Query or execute action (bash/screenshot/task)
        Tools-->>Brain: ToolExecutionResult { result, pane, mood }
        Brain->>LLM: Feed tool result back to model for final synthesis
        LLM-->>Brain: Final text response & mood tag
    end

    Brain-->>ChatRoute: SofiaTurn { say, mood, panes, toolCalls }
    ChatRoute->>SQLite: INSERT INTO messages (role: assistant, content, mood, tool_calls)
    ChatRoute-->>Browser: JSON { text, say, mood, panes, toolCalls }
    
    Browser->>Browser: Update Stage (render sliding panes, set avatar expression)
    Browser->>TTS: POST /api/tts { text: data.text }
    TTS-->>Browser: MP3 Audio Stream
    Browser->>User: Play voice response through speakers
```

---

## 2. Gemini Live WebSocket Lifecycle (Pipeline B)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as Browser Audio Context
    participant Worklet as AudioWorklet (pcm-16k.js)
    participant TokenAPI as /api/live/token
    participant GeminiLive as Gemini Live WebSocket (wss://generativelanguage...)
    participant ToolAPI as /api/live/tool
    participant ToolExec as Tool Executor (src/lib/tools.ts)

    User->>Browser: Clicks Voice Button (Hold-to-talk / Toggle)
    Browser->>Browser: Initialize AudioContext (resume suspended state)
    Browser->>Worklet: Load /worklets/pcm-16k.js (or inlined Blob fallback)
    Browser->>TokenAPI: POST /api/live/token (Mint ephemeral access token)
    TokenAPI-->>Browser: { token, model: 'gemini-3.8-live', voice: 'Aoede', functionDeclarations }

    Browser->>GeminiLive: Connect WSS with access_token
    GeminiLive-->>Browser: WebSocket Open
    Browser->>GeminiLive: Send setup frame { model, responseModalities: ['AUDIO'], tools }
    GeminiLive-->>Browser: { setupComplete: {} }

    loop Audio Streaming (Microphone Capture)
        User->>Browser: Speaks into microphone
        Browser->>Worklet: Raw mic buffer
        Worklet->>Worklet: Downsample to 16,000Hz 16-bit PCM
        Worklet->>Browser: Base64 PCM chunk
        Browser->>GeminiLive: { realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm', data }] } }
    end

    loop Audio Streaming (Sofia Speaking)
        GeminiLive-->>Browser: { serverContent: { modelTurn: { parts: [{ inlineData: 24kHz PCM }] } } }
        Browser->>Browser: Enqueue to AudioBufferSourceNode playhead
        Browser->>Browser: Calculate RMS -> animate mouthOpen ratio
        Browser->>User: Output 24kHz audio in real time
    end

    opt Live Tool Call Emitted
        GeminiLive-->>Browser: { toolCall: { functionCalls: [{ name, args, id }] } }
        Browser->>ToolAPI: POST /api/live/tool { name, args }
        ToolAPI->>ToolExec: executeTool(db, name, args, settings)
        ToolExec-->>ToolAPI: ToolExecutionResult { result, pane, mood }
        ToolAPI-->>Browser: Result JSON
        Browser->>Browser: Render sliding pane on Stage
        Browser->>GeminiLive: { toolResponse: { functionResponses: [{ id, response }] } }
    end

    opt User Barge-In (Interruption)
        User->>Browser: Speaks while Sofia is answering
        GeminiLive-->>Browser: { serverContent: { interrupted: true } }
        Browser->>Browser: flushAudio() (instantly stop active sources, reset playhead)
    end
```

---

## 3. Telemetry Ingestion & Scoring Lifecycle

```
[Agent PC / ActivityWatch / OS Window]
       │
       │ HTTP POST (X-Device-Token) every 60s
       ▼
[/api/ingest/events]
       │
       ▼
[SQLite: events table]
       │
       │ Nightly Cron / Periodic Worker (scripts/rollup.ts or /api/cron/evening_verdict)
       ▼
[lib/scoring.ts -> calculateDayScore()]
       ├── Work min vs Leisure min ratio
       ├── Commit count from GitHub API
       ├── Focus blocks & distraction count
       └── Telemetry coverage ratio
       │
       ▼
[SQLite: day_stats & day_scores tables]
       │
       ▼
[Surfaced to Stage Live Debug & Brain Prompt Context]
```
