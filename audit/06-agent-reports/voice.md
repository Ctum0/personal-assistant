# AUDIT REPORT 06: VOICE & REAL-TIME INTERACTION ENGINE
**Auditor**: AGENT 6 — Voice & Real-Time Interaction Engine Auditor  
**Repository**: `ctum0/sofia-v6` (`agitated-archimedes`)  
**Scope Target**: `audit/06-agent-reports/voice.md`  
**Date**: November 7, 2026  
**Status**: COMPLETE — Rigorous Verification & Codebase Audit  

---

## 1. VOICE ARCHITECTURE OVERVIEW (WebSocket Live vs HTTP TTS/STT)

The Sofia system operates two parallel, distinct voice architectures:

```
                      ┌──────────────────────────────────────────────┐
                      │              CLIENT BROWSER (UI)             │
                      │                                              │
                      │  [ Talk / Hang Up ]       [ Text Prompt ]    │
                      └───────┬──────────────────────────┬───────────┘
                              │                          │
        ┌─────────────────────┴────────────┐             │
        │ STREAMING WEBSOCKET PIPELINE     │             │ HTTP REQUEST-RESPONSE
        │ (SofiaLiveSession)               │             │ PIPELINE (speakSofia)
        ▼                                  ▼             ▼
┌──────────────────┐             ┌──────────────────┐   ┌──────────────────┐
│ AudioWorklet     │             │ WebSocket Client │   │ POST /api/chat   │
│ (pcm-16k.js)     │             │ (bidi live ws)   │   │ (LLM Turn)       │
└────────┬─────────┘             └────────┬─────────┘   └────────┬─────────┘
         │ 16kHz PCM (Base64)             │                      │
         └────────────────────────────────┤                      ▼
                                          │             ┌──────────────────┐
                                          │             │ POST /api/tts    │
                                          │             │ (Edge / 11Labs)  │
                                          ▼                      └────────┬─────────┘
                       ┌────────────────────────────┐                     │ MP3 Blob
                       │ Google Gemini Live API     │                     ▼
                       │ BidiGenerateContent...     │           ┌──────────────────┐
                       │ (24kHz PCM Audio Stream)   │           │ HTMLAudioElement │
                       └────────────────────────────┘           └──────────────────┘
```

### 1.1 Architecture A: Full-Duplex Multimodal Live API (Primary Voice)
* **Client Driver**: `SofiaLiveSession` (`src/lib/live/session.ts`).
* **Endpoint**: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}` (line 239).
* **Authentication**: Ephemeral auth token minted server-side via `POST /api/live/token` (`src/app/api/live/token/route.ts`), hitting Google's `/v1beta/auth_tokens` with `uses: 1`, `expireTime: now + 30m`, `newSessionExpireTime: now + 1m`.
* **Modality**: Bidirectional streaming. Client streams 16kHz mono PCM frames (`audio/pcm;rate=16000`). Google streams back 24kHz mono PCM audio chunks along with incremental transcription parts and tool execution requests.
* **Turn-taking**: Hybrid VAD combining client-side RMS speech activity detection with server-side Gemini activity detection.

### 1.2 Architecture B: Decoupled HTTP TTS/STT (Fallback & UI Prompt Path)
* **Client Driver**: `speakSofia()` (`src/lib/voice.ts`) and legacy `useVoiceInput()` (`src/hooks/useVoiceInput.ts`).
* **Endpoint**: `POST /api/tts` (`src/app/api/tts/route.ts`).
* **TTS Provider Tier**:
  1. *Primary*: Microsoft Edge Neural TTS (`msedge-tts`, default `en-US-AvaNeural`, pitch `+25Hz`, rate `+6%`). Unlimited, zero API cost, 24kHz MP3 (`src/lib/tts.ts` lines 78–112).
  2. *Secondary / Premium*: ElevenLabs (`eleven_turbo_v2_5`, default voice `EXAVITQu4vr4xnSDxMaL`, lines 119–180), gated by `ELEVENLABS_MONTHLY_CAP = 10000` chars tracked in SQLite (`tts_usage` table).
  3. *Client Fallback*: Browser `window.speechSynthesis` (`src/lib/voice.ts` lines 121–190) prioritizing female English voices ('Google UK English Female', 'Samantha', 'Victoria').
* **Audio Unlocker**: `unlockAudio()` (`src/lib/voice.ts` lines 20–44) plays a 1-sample silent buffer on initial user interaction to unblock audio autoplay across mobile/desktop browsers.

---

## 2. AUDIO CAPTURE, WORKLETS & STREAMING INGESTION AUDIT

### 2.1 Audio Hardware Ingestion
* **Mic Stream**: In `SofiaLiveSession.start()` (`src/lib/live/session.ts` lines 149–156):
  ```typescript
  this.micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  ```
* Constraints enforce hardware acoustic echo cancellation (AEC) and noise suppression (essential for preventing speaker audio re-ingestion).

### 2.2 AudioWorklet Downsampling (`pcm-16k.js`)
* **Module Loading**: Loads `/worklets/pcm-16k.js` with an inlined `Blob` fallback in `session.ts` (lines 160–201) to protect against network or proxy resolution failures.
* **The Downsampling Algorithm** (`public/worklets/pcm-16k.js` lines 10–23):
  ```javascript
  this.ratio = sampleRate / 16000;
  // ...
  for (let i = 0; i < ch.length; i++) {
    this.acc += ch[i];
    this.n++;
    if (this.n >= this.ratio) {
      const v = Math.max(-1, Math.min(1, this.acc / this.n));
      this.out.push(v < 0 ? v * 0x8000 : v * 0x7fff);
      this.acc = 0;
      this.n = 0;
    }
  }
  ```

#### Critical Implementation Deficiencies:
1. **Mathematical Sampling Rate Drift on 44.1kHz Inputs (macOS Default)**:
   - On 48,000 Hz hardware: `sampleRate / 16000 = 3.0` (exact integer). `this.n` counts 1, 2, 3 -> decimation is exactly 3:1.
   - On 44,100 Hz hardware: `sampleRate / 16000 = 2.75625`. Because `this.n` is an integer incremented by 1, the condition `if (this.n >= this.ratio)` evaluates to `3 >= 2.75625`. `this.n` is reset to 0 every 3 samples!
   - Result: On 44.1kHz, it **always** accumulates 3 samples. The resulting output sample rate is $44100 / 3 = 14,700 \text{ Hz}$, **NOT** 16,000 Hz!
   - That represents an **8.125% rate deficit**. To Gemini's 16kHz decoder, the audio plays ~8% too fast and pitched up, distorting user phonemes and degrading transcription accuracy.
   - *Fix required*: Maintain a fractional phase accumulator (`this.phase += 16000 / sampleRate`) rather than an integer sample counter.

2. **Aliasing Distortion (No Nyquist Low-Pass Filter)**:
   - The boxcar averager is a rudimentary sinc-like filter with poor stopband attenuation (-13 dB sidelobes). Frequencies above 8kHz fold directly back into the 0–8kHz speech band as aliasing noise.

3. **Audio Thread Garbage Collection & CPU Spikes**:
   - `this.out` is an unbounded `Array` (`[]`). Inside the 128-sample `process()` callback (firing every 2.67ms), `this.out.push()` dynamically reallocates memory.
   - `this.out.splice(0, 1600)` reallocates again.
   - Running base64 encoding (`String.fromCharCode` in a loop followed by `btoa(s)`) inside the real-time audio thread (`AudioWorkletGlobalScope`) creates CPU pauses and audible dropouts.
   - *Fix required*: Allocate a fixed `Int16Array(1600)` ring buffer once in the constructor; post the raw `ArrayBuffer` to the main thread via zero-copy transfer (`this.port.postMessage(pcm.buffer, [pcm.buffer])`).

4. **100ms Packetization Latency**:
   - The worklet buffers 1,600 samples before emitting (`while (this.out.length >= 1600)`).
   - This creates an unavoidable **100ms accumulation latency** before the first byte can even reach the WebSocket pipe.

---

## 3. PLAYBACK QUEUE, BARGE-IN & INTERRUPTION HANDLING

### 3.1 24kHz Audio Playback Graph
* Audio received via `msg.serverContent.modelTurn.parts[].inlineData.data` (`session.ts` line 344) as Base64 24kHz mono PCM.
* Decoded into `Float32Array` (`pcm16[i] / 32768`), copied into a Web Audio `AudioBuffer` at `sampleRate = 24000` (`session.ts` line 526).
* **Scheduling**:
  ```typescript
  const at = Math.max(this.playHead, this.audioCtx.currentTime + 0.02);
  sourceNode.start(at);
  this.playHead = at + audioBuffer.duration;
  this.activeSources.push(sourceNode);
  ```

### 3.2 Jitter Buffer Vulnerability
* The scheduling lead time is fixed at `currentTime + 0.02` (20ms).
* There is **no adaptive jitter buffer**. If any single WebSocket packet experiences network jitter exceeding 20ms:
  - `playHead` falls behind `audioCtx.currentTime`.
  - The next chunk starts with a gap, producing audible stuttering and pops.
* In addition, `this.playHead` is never cross-faded, leading to hard boundary clicks when packets arrive late.

### 3.3 Interruption & Barge-In Logic
Interruption is handled by dual pathways:
1. **Server-Side Interruption**:
   - If Gemini detects user speech, it returns `{ serverContent: { interrupted: true } }` (`session.ts` line 323).
   - Calls `this.flushAudio()`.
2. **Client-Side Local VAD Barge-In**:
   - `analyzeLocalMicChunk` (`session.ts` lines 454–500) computes RMS of the outgoing mic buffer.
   - If `rms > SPEECH_RMS_THRESHOLD (0.035)`:
     ```typescript
     if (this.isModelSpeaking && now - this.userSpeechStartTime >= 200) {
       this.flushAudio();
     }
     ```
   - If user sustains speech for $\ge 200\text{ms}$ while the model is speaking, client instantly flushes audio.

### 3.4 Flaws in Barge-In & Flushing:
1. **Flawed End-of-Speech Silence Check (Premature Turn Termination)**:
   - Line 486–497 in `session.ts`:
     ```typescript
     } else {
       if (this.isUserSpeaking) {
         if (now - this.userSpeechStartTime > 300) {
           this.isUserSpeaking = false;
           this.userSpeechEndTime = now;
           if (this.ws && this.ws.readyState === WebSocket.OPEN) {
             this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
           }
         }
       }
     }
     ```
   - **Severe Defect**: The code checks `now - this.userSpeechStartTime > 300` instead of tracking silent time!
   - If the user has spoken for more than 300ms in total (which is always true for any sentence), **the very first single 100ms chunk where RMS drops below 0.035 immediately terminates the turn** and sends `audioStreamEnd: true`!
   - Natural conversational pauses of 150ms between words cause the user to be cut off mid-sentence.
2. **Stale In-Flight Audio Bleed After Flush**:
   - `flushAudio()` (`session.ts` line 562) stops `this.activeSources` and resets `this.playHead`.
   - However, it does not increment a turn counter or discard pending server content. If Google's TCP pipeline has 2 or 3 packets in flight, they arrive *after* `flushAudio()` and are passed to `enqueueAudioChunk()`, immediately playing residual speech from the interrupted turn.

---

## 4. SYNCHRONIZATION: CAPTIONS, MOUTH ANIMATION & STAGE PANES

### 4.1 Avatar Mouth Animation & Lip-Sync
* In `session.ts` (lines 582–603), a `requestAnimationFrame` loop calculates mouth opening via a Sigmoid transform:
  $$\text{open} = \frac{1}{1 + e^{-45 \cdot v + 5}}$$
  smoothed with an asymmetric hangover ($0.7 \cdot \text{last} + 0.3 \cdot \text{target}$).
* **Severe Defect: The Mouth Never Moves During Live Audio**:
  - In `SofiaLiveSession`, `this.setState('speaking')` and `this.setState('listening')` are **never called**. The session transitions from `'minting'` -> `'connecting'` -> `'live'`, and stays in `'live'` throughout conversations.
  - In `src/app/page.tsx` (lines 180–203):
    `isSpeaking` state is only set to `true` when `st === 'speaking'`.
  - In `src/components/SofiaAvatar.tsx` (lines 172–181):
    ```tsx
    {isSpeaking && (
      <div
        aria-hidden="true"
        style={{ height: `${mouthHeightPx}px`, width: `${mouthWidthPx}px` }}
        className="absolute bottom-[36.5%] left-[48.5%] ..."
      />
    )}
    ```
  - Because `isSpeaking` remains `false` on the live path, the mouth DOM element is completely unmounted! The mouth never moves when Sofia talks over WebSocket.
* **Secondary Desynchronization**:
  - `this.currentRms` is calculated at chunk *arrival* time (`maxAbs` in `enqueueAudioChunk`, line 523) rather than at *playback* time. The mouth reacts to audio scheduled to play 20ms to 400ms in the future.

### 4.2 Stage Panes & Visual Synchronization
* Tools invoked by the live model pass through `handleToolCalls()` (`session.ts` lines 375–418) via `POST /api/live/tool`.
* If a tool execution returns a `pane` (e.g. `stat`, `chart`, `timeline`, `tasks`), `this.callbacks.onPane?.(data.pane)` triggers immediately, rendering the widget in `src/components/Stage.tsx` in lockstep with the spoken audio explanation.
* Escape key handler (`page.tsx` line 346) correctly binds global interruption: flushes live audio and dismisses unpinned panes.

---

## 5. LATENCY ANALYSIS (TTFT, TTFA, NETWORK OVERHEADS)

### 5.1 Measurement Breakdown in Live Session
* **TTFT (Time-to-First-Token)**: Measured from `userSpeechEndTime` to first `modelTurn.parts[].text` (`session.ts` line 332).
* **TTFA (Time-to-First-Audio)**: Measured from `userSpeechEndTime` to first `modelTurn.parts[].inlineData.data` (`session.ts` line 346).

### 5.2 Real-World Latency Budget (Live WebSocket vs HTTP Fallback)

| Stage | WebSocket Live API | HTTP Fallback (Edge/11Labs) |
|---|---|---|
| **Capture & Packetization** | 100 ms (1600-sample worklet buffer) | 1,600 ms (`silenceTimeoutMs` in `useVoiceInput`) |
| **Ingestion Encoding / STT** | 5 ms (base64 JSON) | 350 ms (Web Speech API cloud STT) |
| **Network Ingestion RTT** | 40 ms (direct to Google Bidi WS) | 60 ms (`POST /api/chat`) |
| **Model Generation (TTFT)** | 350 – 550 ms (Gemini streaming audio tokens) | 1,800 – 2,500 ms (LLM full completion) |
| **TTS Synthesis / Audio Return** | 0 ms (Audio generated natively by model) | 600 – 1,200 ms (Edge TTS / ElevenLabs API) |
| **Network Return RTT** | 40 ms (streaming WebSocket frames) | 60 ms (`POST /api/tts` MP3 download) |
| **Client Scheduling / Jitter buffer** | 20 ms (lead time `currentTime + 0.02`) | 50 ms (Blob decode & `Audio.play()`) |
| **Hardware Output Buffer** | 20 ms (browser/OS ALSA/Pulse buffer) | 20 ms |
| **Total Turn Latency (TTFA)** | **575 – 775 ms** | **4,540 – 5,840 ms** |

### 5.3 Inefficiencies in Current Live Pipeline:
1. **JSON Base64 Overhead**: Audio PCM samples are transferred as Base64 strings inside JSON payloads (`{"realtimeInput":{"audio":{"data":b64,"mimeType":"audio/pcm;rate=16000"}}}`). This adds **33% bandwidth overhead** and string allocation overhead compared to binary WebSocket frames.
2. **Missing `realtimeInputConfig` in Setup Message**:
   - `src/lib/live/config.ts` defines:
     ```typescript
     realtimeInputConfig: {
       automaticActivityDetection: {
         prefixPaddingMs: 100,
         silenceDurationMs: Number(process.env.SOFIA_VAD_SILENCE_MS ?? 500),
         startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
         endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
       },
     }
     ```
   - Server returns this in `POST /api/live/token` response (`route.ts` line 56).
   - **Critical Omission**: `SofiaLiveSession.connectSocket()` (`session.ts` lines 246–274) constructs `setupMsg.setup`, but **completely forgets to include `realtimeInputConfig`**!
   - As a result, Gemini defaults to its generic cloud VAD settings (often 1000–1500ms silence wait), negating the tuned 500ms low-latency turn-around.

---

## 6. DEFECTS, EDGE CASES & FAILURE MODES

| ID | Location | Severity | Description & Impact |
|---|---|---|---|
| **DEF-01** | `src/lib/live/session.ts`: 109, 537, 542 | **CRITICAL** | **Missing `setState('speaking')` & `setState('listening')`**: The session never transitions out of `'live'`. `page.tsx`'s `isSpeaking` remains `false`. The avatar mouth overlay is completely unmounted (`SofiaAvatar.tsx`: 172) and never moves during live calls. Status chip stays stuck on `'listening'`. |
| **DEF-02** | `src/lib/live/session.ts`: 487 | **CRITICAL** | **Flawed VAD Silence Logic (Premature Turn Cut-Off)**: Line 487 checks `now - this.userSpeechStartTime > 300` instead of checking how long the mic has been silent. The first 100ms pause after 300ms of speaking immediately cuts off the user and sends `audioStreamEnd: true`. |
| **DEF-03** | `public/worklets/pcm-16k.js`: 4, 17 | **HIGH** | **macOS 44.1kHz Resampling Pitch/Rate Distortion**: `sampleRate / 16000 = 2.75625`. Integer counter `n` always resets at 3, outputting audio at 14.7kHz instead of 16kHz. 8.125% tempo speedup and pitch shift into Gemini's ASR. |
| **DEF-04** | `src/lib/live/session.ts`: 246–268 | **HIGH** | **Dropped `realtimeInputConfig` in WebSocket Setup**: VAD sensitivity and 500ms silence threshold configured in `config.ts` are omitted from the WebSocket handshake message; Gemini falls back to slow cloud defaults. |
| **DEF-05** | `src/lib/live/session.ts`: 323, 562 | **HIGH** | **Stale Audio Bleed on Interruption**: `flushAudio()` clears active sources but does not discard pending in-flight WebSocket packets. Late-arriving chunks from the interrupted turn play out after speech stops. |
| **DEF-06** | `public/worklets/pcm-16k.js`: 7, 25–33 | **MEDIUM** | **Audio Thread GC Pressure & `btoa` Blocking**: Dynamic array `push`/`splice` and synchronous base64 encoding inside `AudioWorkletGlobalScope` risk audio thread underruns and clicks. |
| **DEF-07** | `src/lib/live/session.ts`: 518–524, 586 | **MEDIUM** | **Lip-Sync Out-of-Phase**: `currentRms` is captured on chunk receipt rather than during scheduled playback through Web Audio, causing mouth movement to precede sound. |
| **DEF-08** | `src/lib/live/session.ts`: 533 | **MEDIUM** | **No Adaptive Jitter Buffer**: Fixed 20ms scheduling lookahead without pre-buffering results in audio dropouts whenever WebSocket packet delivery varies by >20ms. |
| **DEF-09** | `src/lib/live/config.ts`: 26, `.env.local`: 3 | **MEDIUM** | **Model Identifier Compatibility**: `gemini-3.8-live` is an unreleased/mock model name. Standard Google endpoints fail with 404 unless routed through an internal gateway or mapped to `gemini-2.0-flash-exp`. |
| **DEF-10** | `src/hooks/useVoiceInput.ts` | **LOW** | **Dead / Orphaned Code**: `useVoiceInput` (Web Speech API STT) with 1600ms silence detection was left unimported in `page.tsx` after the Gemini Live migration. |

---

## 7. RECOMMENDATIONS FOR SUB-300ms CONVERSATIONAL VOICE

To move from current ~650ms TTFA to true sub-300ms real-time conversational voice:

### 7.1 Immediate Code Fixes (Zero Architecture Changes)
1. **Fix `session.ts` State Transitions**:
   - In `enqueueAudioChunk()`, call `this.setState('speaking')` when `this.activeSources.length === 1`.
   - In `sourceNode.onended`, when `this.activeSources.length === 0`, call `this.setState('listening')`.
   - This immediately restores mouth animation, avatar expression pulses, and telemetry chips.
2. **Correct the VAD Silence Duration**:
   - Introduce `lastVoiceActiveTime`: update it while `rms > SPEECH_RMS_THRESHOLD`.
   - When RMS is low, verify `now - lastVoiceActiveTime >= (config.silenceDurationMs || 500)` before sending `audioStreamEnd: true`.
3. **Include `realtimeInputConfig` in Setup Message**:
   - In `session.ts` line 267:
     ```typescript
     setupMsg.setup.realtimeInputConfig = configData.realtimeInputConfig;
     ```
4. **Fix 44.1kHz Fractional Resampling in `pcm-16k.js`**:
   - Use a fractional accumulator:
     ```javascript
     this.phase += 16000 / sampleRate;
     while (this.phase >= 1.0) {
       this.phase -= 1.0;
       // interpolate and emit sample
     }
     ```
5. **Add Generational Turn Guard to Prevent Barge-In Bleed**:
   - Increment `this.currentTurnId` on each user speech start and on `flushAudio()`.
   - Tag incoming chunks with the active turn ID; drop packets if `chunkTurnId < currentTurnId`.

### 7.2 Sub-300ms Engine Optimizations
1. **Reduce Worklet Frame Size to 20ms**:
   - Cut buffer size from 1,600 samples (100ms) to 320 samples (20ms). This cuts **80ms of direct latency** off every speech turn.
2. **Switch to Binary Zero-Copy Transfer**:
   - Post `pcm.buffer` directly to the main thread via Transferable Objects (`[pcm.buffer]`).
   - If using a WebSocket proxy, send raw binary PCM frames instead of Base64-wrapped JSON (saves 33% payload and JSON serialization overhead).
3. **Hardware-Synchronized Web Audio Lip-Sync**:
   - Connect an `AnalyserNode` to `this.audioCtx.destination`.
   - Sample the `AnalyserNode.getByteFrequencyData()` directly in `requestAnimationFrame`. This guarantees 100% frame-accurate mouth synchronization to the sound coming out of the speakers.
4. **Adaptive 40ms Jitter Buffer**:
   - Pre-buffer 40ms (two 20ms chunks) on the very first turn chunk before starting `sourceNode.start()`, then pace subsequent chunks smoothly. Prevents audio underruns on jittery connections.
