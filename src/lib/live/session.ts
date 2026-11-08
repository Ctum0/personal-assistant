'use client';

import { Pane } from '../stage';
import { setAudioOwner, stopSpeaking } from '../voice';

export type LiveConnState =
  | 'off'
  | 'minting'
  | 'connecting'
  | 'live'
  | 'listening'
  | 'speaking'
  | 'reconnecting'
  | 'migrating'
  | 'closing'
  | 'failed';

export interface LiveMetrics {
  ttfa: number | null; // ms from user speech end to first audio byte played
  ttft: number | null; // ms from user speech end to first server turn message
  connDurationSec: number;
  sessionDurationSec: number;
  reconnects: number;
  drops: number;
  voice: string;
  model: string;
}

export interface LiveSessionCallbacks {
  onStateChange?: (state: LiveConnState) => void;
  onCaption?: (userText: string, modelText: string) => void;
  onMouthOpen?: (openRatio: number) => void;
  onPane?: (pane: Pane) => void;
  onMood?: (mood: string) => void;
  onMetrics?: (metrics: LiveMetrics) => void;
  onError?: (err: string) => void;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('sofia_token') || localStorage.getItem('sofia_api_token');
    if (token) {
      headers['x-sofia-token'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

export const LIMITS = {
  hardCapMs: 40 * 60_000,
  goAwayGraceMs: 45_000,
  goAwaySafetyMs: 3_000,
  maxResumeAttempts: 2,
  resumeBackoffMs: [1000, 2000],
  turnWallClockMs: 25_000,
};

/**
 * Capture runs on its OWN AudioContext, pinned to 16 kHz, so the browser's
 * spec-defined resampler does the conversion instead of hand-rolled
 * decimation inside the worklet (a box filter that aliases everything above
 * 8 kHz straight back into the speech band).
 *
 * Playback keeps its own context at the device rate: the model streams 24 kHz
 * PCM, and a 16 kHz context would downsample every reply.
 */
const CAPTURE_RATE_HZ = 16_000;
const CAPTURE_FRAME_MS = 40;

/**
 * `goAway.timeLeft` is a google.protobuf.Duration. Proto3 JSON maps that to a
 * decimal string with an "s" suffix ("45s"), which is what the WebSocket sends;
 * the object/number branches are defensive only (gRPC-native shapes). Never
 * assume the 45 s default — the server is allowed to grant less, and handing
 * over late means a hard drop.
 */
function parseGoAwayTimeLeft(timeLeft: unknown): number {
  if (typeof timeLeft === 'string') {
    const match = /^([0-9.]+)s$/.exec(timeLeft.trim());
    if (match) return Math.round(parseFloat(match[1]) * 1000);
    const asNumber = Number(timeLeft);
    if (Number.isFinite(asNumber)) return Math.round(asNumber * 1000);
  } else if (typeof timeLeft === 'number' && Number.isFinite(timeLeft)) {
    return Math.round(timeLeft * 1000);
  } else if (timeLeft && typeof timeLeft === 'object') {
    const secs = Number((timeLeft as { seconds?: number }).seconds ?? 0);
    const nanos = Number((timeLeft as { nanos?: number }).nanos ?? 0);
    if (Number.isFinite(secs) && Number.isFinite(nanos)) {
      return Math.round(secs * 1000 + nanos / 1e6);
    }
  }
  return LIMITS.goAwayGraceMs;
}

export class SofiaLiveSession {
  private state: LiveConnState = 'off';
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null; // playback only
  private captureCtx: AudioContext | null = null; // microphone only
  private captureRate = CAPTURE_RATE_HZ;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  // Playback queue & audio scheduling
  private playHead = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private currentRms = 0;
  private mouthAnimFrame: number | null = null;
  private lastMouthOpen = 0;
  private mouthHangoverTimer: NodeJS.Timeout | null = null;

  // Barge-in & VAD tracking
  private isUserSpeaking = false;
  private userSpeechStartTime = 0;
  private userSpeechEndTime = 0;
  private lastUserVoiceTime = 0;
  private sessionId = `live-${Date.now()}`;
  private turnStartTime = 0;
  private isModelSpeaking = false;
  private textSpokenSoFar = '';
  private userCaption = '';
  private modelCaption = '';
  private lastRunId: string | null = null;
  private pendingContextUpdates: string[] = [];

  // Connection & telemetry
  private resumptionHandle: string | null = null;
  private reconnectCount = 0;
  private dropCount = 0;
  private sessionStartTime = 0;
  private connStartTime = 0;
  private metricsTimer: NodeJS.Timeout | null = null;
  private hardCapTimer: NodeJS.Timeout | null = null;
  private turnTimeoutTimer: NodeJS.Timeout | null = null;
  private idleDrainTimer: NodeJS.Timeout | null = null;
  private goAwayTimer: NodeJS.Timeout | null = null;
  private activeModel = 'gemini-2.0-flash-exp';
  private activeVoice = 'Aoede';

  // Metrics
  private lastTtfa: number | null = null;
  private lastTtft: number | null = null;

  private callbacks: LiveSessionCallbacks = {};
  private conversationId: string = 'default';

  constructor(callbacks: LiveSessionCallbacks = {}, conversationId?: string) {
    this.callbacks = callbacks;
    if (conversationId) {
      this.sessionId = conversationId;
      this.conversationId = conversationId;
    }
  }

  public getState(): LiveConnState {
    return this.state;
  }

  public isActive(): boolean {
    return this.state !== 'off' && this.state !== 'failed' && this.state !== 'closing';
  }

  private setState(newState: LiveConnState) {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  private emitMetrics() {
    const now = Date.now();
    const connDurationSec = this.connStartTime > 0 ? Math.round((now - this.connStartTime) / 1000) : 0;
    const sessionDurationSec = this.sessionStartTime > 0 ? Math.round((now - this.sessionStartTime) / 1000) : 0;

    this.callbacks.onMetrics?.({
      ttfa: this.lastTtfa,
      ttft: this.lastTtft,
      connDurationSec,
      sessionDurationSec,
      reconnects: this.reconnectCount,
      drops: this.dropCount,
      voice: this.activeVoice,
      model: this.activeModel,
    });
  }

  /**
   * Starts a live session: acquires mic, mints token, connects WebSocket
   */
  public async start(): Promise<void> {
    if (this.state !== 'off' && this.state !== 'failed') return;

    this.sessionStartTime = Date.now();
    setAudioOwner('LIVE_GEMINI');
    stopSpeaking();
    this.setState('minting');

    try {
      // 1. Two contexts: capture (16 kHz) and playback (device rate).
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Playback stays at the device rate — 24 kHz model audio is resampled by
      // the browser, but a 16 kHz graph would downsample every reply.
      this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      // Capture asks for 16 kHz so the browser's own resampler does the work.
      // A browser that ignores the hint still works: we read the real rate back
      // and declare THAT upstream, and the Live API resamples any rate.
      let captureCtx: AudioContext;
      try {
        captureCtx = new AudioCtx({ sampleRate: CAPTURE_RATE_HZ });
      } catch (ctxErr) {
        console.warn('16 kHz capture context unsupported; falling back to device rate:', ctxErr);
        captureCtx = new AudioCtx();
      }
      if (captureCtx.state === 'suspended') {
        await captureCtx.resume();
      }
      this.captureCtx = captureCtx;
      this.captureRate = Math.round(captureCtx.sampleRate) || CAPTURE_RATE_HZ;

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // ?v=2 busts a CDN/service-worker cached copy of the pre-fix worklet,
      // which posts a different message shape entirely.
      try {
        await captureCtx.audioWorklet.addModule('/worklets/pcm-16k.js?v=2');
      } catch (workletErr) {
        throw new Error(
          `Voice capture module failed to load (${workletErr instanceof Error ? workletErr.message : 'unknown error'})`
        );
      }

      // 2. Mint ephemeral token & fetch live connect configuration
      const tokenRes = await fetch('/api/live/token', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ conversationId: this.conversationId }),
      });
      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Token mint failed (${tokenRes.status})`);
      }
      const tokenData = await tokenRes.json();
      this.activeModel = tokenData.model || 'gemini-3.8-live';
      this.activeVoice = tokenData.voice || 'Aoede';

      // 3. Connect to WebSocket
      await this.connectSocket(tokenData);

      // Start periodic metrics loop
      this.metricsTimer = setInterval(() => this.emitMetrics(), 1000);

      // Scheduled 40-minute migration timer
      this.hardCapTimer = setTimeout(() => {
        this.migrateSession();
      }, LIMITS.hardCapMs);

      // Start mouth animation loop
      this.startMouthAnimation();
    } catch (err: any) {
      console.error('Failed to start Live session:', err);
      this.setState('failed');
      this.callbacks.onError?.(err?.message || 'Could not connect live audio session');
      this.stop();
    }
  }

  private async connectSocket(configData: any, isReconnect = false): Promise<void> {
    this.setState(isReconnect ? 'reconnecting' : 'connecting');
    this.connStartTime = Date.now();

    const tokenVal = configData.token;
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${tokenVal}`;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      // Send initial setup message with systemInstruction and tools
      const setupMsg: any = {
        setup: {
          model: `models/${configData.model || 'gemini-3.8-live'}`,
          generationConfig: {
            responseModalities: configData.modalities || ['AUDIO'],
            speechConfig: configData.modalities?.includes('AUDIO') !== false
              ? {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: configData.voice || 'Aoede',
                    },
                  },
                }
              : undefined,
          },
          systemInstruction: {
            parts: [{ text: configData.systemPrompt || 'You are Sofia.' }],
          },
          // Live only emits transcript events when the setup asks for them, so
          // without these two the UI never knows what the user said and has no
          // text for her spoken reply (AUDIO modality returns no text parts).
          inputAudioTranscription: configData.inputAudioTranscription ?? {},
          outputAudioTranscription: configData.outputAudioTranscription ?? {},
          contextWindowCompression: configData.contextWindowCompression || {
            slidingWindow: { targetTokens: 8192 },
            triggerTokens: 16384,
          },
          tools: configData.functionDeclarations
            ? [{ functionDeclarations: configData.functionDeclarations }]
            : undefined,
        },
      };

      if (!this.resumptionHandle && typeof window !== 'undefined') {
        const savedHandle = localStorage.getItem(`sofia_live_handle_${this.conversationId}`);
        if (savedHandle) {
          this.resumptionHandle = savedHandle;
        }
      }

      // ALWAYS request resumption. Updates only arrive when the setup asked for
      // them, so gating this behind an existing handle means a fresh
      // conversation never receives one and every reconnect silently starts a
      // brand-new session. An empty config is the documented bootstrap form.
      setupMsg.setup.sessionResumption = this.resumptionHandle
        ? { handle: this.resumptionHandle }
        : {};

      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = async (event) => {
      try {
        let text = '';
        if (typeof event.data === 'string') {
          text = event.data;
        } else if (event.data instanceof Blob) {
          text = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(event.data);
        }

        const msg = JSON.parse(text);
        this.handleServerMessage(msg);
      } catch (err) {
        console.warn('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (e) => {
      console.warn('WebSocket error:', e);
      this.dropCount++;
    };

    ws.onclose = (e) => {
      console.log('WebSocket closed:', e.code, e.reason);
      if (this.state !== 'off' && this.state !== 'closing') {
        this.dropCount++;
        this.attemptReconnect();
      }
    };
  }

  private handleServerMessage(msg: any) {
    // 1. Setup complete -> session is live!
    if (msg.setupComplete) {
      this.setState('live');
      this.startMicStreaming();
      return;
    }

    // 2. Live transcription. Input transcription is the ONLY source of the
    //    user's words on the audio lane; output transcription is the only
    //    source of her words, because AUDIO modality returns no text parts.
    const inputTr = msg.serverContent?.inputTranscription?.text;
    if (inputTr) {
      this.userCaption += inputTr;
      this.callbacks.onCaption?.(this.userCaption, this.modelCaption);
    }

    const outputTr = msg.serverContent?.outputTranscription?.text;
    if (outputTr) {
      this.modelCaption += outputTr;
      this.callbacks.onCaption?.(this.userCaption, this.modelCaption);
    }

    // 3. Resumption update handle
    if (msg.sessionResumptionUpdate?.newHandle) {
      const handle = String(msg.sessionResumptionUpdate.newHandle);
      this.resumptionHandle = handle;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`sofia_live_handle_${this.conversationId}`, handle);
        } catch {}
      }
    }

    // 3. Server-side interruption (barge-in acknowledgement)
    if (msg.serverContent?.interrupted) {
      this.flushAudio();
      return;
    }

    // 4. Server content turn
    if (msg.serverContent?.modelTurn) {
      const now = Date.now();
      if (!this.lastTtft && this.userSpeechEndTime > 0) {
        this.lastTtft = now - this.userSpeechEndTime;
      }

      const parts = msg.serverContent.modelTurn.parts || [];
      for (const p of parts) {
        // Output text transcription
        if (p.text) {
          this.modelCaption += p.text;
          this.callbacks.onCaption?.(this.userCaption, this.modelCaption);
        }

        // Inline audio chunk (24kHz PCM)
        if (p.inlineData?.data) {
          if (!this.lastTtfa && this.userSpeechEndTime > 0) {
            this.lastTtfa = now - this.userSpeechEndTime;
          }
          this.enqueueAudioChunk(p.inlineData.data);
        }
      }
    }

    // 5. Turn Complete
    if (msg.serverContent?.turnComplete) {
      if (this.turnTimeoutTimer) {
        clearTimeout(this.turnTimeoutTimer);
        this.turnTimeoutTimer = null;
      }
      // Persist the completed turn to messages table so conversation context is never lost
      if (this.modelCaption.trim() || this.userCaption.trim()) {
        const uText = this.userCaption.trim();
        const mText = this.modelCaption.trim();
        const runIdToPersist = this.lastRunId;
        fetch('/api/chat', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            persistOnly: true,
            channel: 'voice',
            sessionId: this.sessionId,
            userMessage: uText || '(Spoken voice input)',
            assistantMessage: mText,
            runId: runIdToPersist,
          }),
        }).catch((err) => console.warn('Failed to persist live voice turn:', err));
        this.lastRunId = null;
      }

      // Her turn just ended — the correct instant to hand over a background
      // result, rather than cutting into the sentence she was mid-way through.
      // Still not while the *user* is talking: turnComplete can fire during a
      // half-duplex gap, and injecting then talks over them.
      if (this.pendingContextUpdates.length > 0) {
        if (this.isUserSpeaking) {
          this.scheduleIdleDrain();
        } else {
          const pendingNow = this.pendingContextUpdates.shift();
          if (pendingNow) this.deliverContextUpdate(pendingNow);
        }
      }
    }

    // 6. Tool Call Execution
    if (msg.toolCall?.functionCalls) {
      this.handleToolCalls(msg.toolCall.functionCalls);
    }

    // 7. GoAway signal before disconnect — it carries the actual remaining
    //    time, so schedule from that instead of the assumed grace period.
    if (msg.goAway) {
      const graceMs = parseGoAwayTimeLeft(msg.goAway.timeLeft);
      const handoverIn = Math.max(1_000, graceMs - LIMITS.goAwaySafetyMs);
      console.log(`goAway from Gemini Live — handing over in ${handoverIn}ms (server allowed ${graceMs}ms)`);
      this.clearGoAwayTimer();
      this.goAwayTimer = setTimeout(() => {
        this.goAwayTimer = null;
        this.attemptReconnect();
      }, handoverIn);
    }
  }

  private clearGoAwayTimer() {
    if (this.goAwayTimer) {
      clearTimeout(this.goAwayTimer);
      this.goAwayTimer = null;
    }
  }

  private async handleToolCalls(functionCalls: Array<{ id: string; name: string; args: any }>) {
    const responses: any[] = [];

    for (const fc of functionCalls) {
      try {
        const res = await fetch('/api/live/tool', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: fc.name,
            args: fc.args,
            conversationId: this.conversationId,
            sessionId: this.sessionId,
            functionCallId: fc.id,
          }),
        });

        const data = await res.json();
        if (data.pane) {
          this.callbacks.onPane?.(data.pane);
        }
        if (data.mood) {
          this.callbacks.onMood?.(data.mood);
        }
        if (data.result?.sofia_run_id || data.result?.run_id) {
          this.lastRunId = data.result.sofia_run_id || data.result.run_id;
        }

        responses.push({
          id: fc.id,
          name: fc.name,
          response: { output: data.result ?? { status: 'completed' } },
        });
      } catch (err: any) {
        responses.push({
          id: fc.id,
          name: fc.name,
          response: { error: err?.message || 'Tool call failed' },
        });
      }
    }

    // Send tool responses back over WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          toolResponse: {
            functionResponses: responses,
          },
        })
      );
    }
  }

  private startMicStreaming() {
    if (!this.captureCtx || !this.micStream) return;

    try {
      // A reconnect re-enters here; tear the previous capture graph down so we
      // never end up with two sources and two live processors posting frames
      // into one socket (the old processor keeps running even with a null port).
      if (this.micSource) {
        try {
          this.micSource.disconnect();
        } catch {}
        this.micSource = null;
      }
      if (this.workletNode) {
        try {
          this.workletNode.port.onmessage = null;
          this.workletNode.port.close();
          this.workletNode.disconnect();
        } catch {}
        this.workletNode = null;
      }

      const source = this.captureCtx.createMediaStreamSource(this.micStream);
      this.micSource = source;
      const worklet = new AudioWorkletNode(this.captureCtx, 'pcm-16k', {
        processorOptions: {
          frameSamples: Math.round(this.captureRate * (CAPTURE_FRAME_MS / 1000)),
        },
      });
      this.workletNode = worklet;

      worklet.port.onmessage = (e: MessageEvent) => {
        // A cached pre-fix worklet posts a bare base64 string. Accept both
        // shapes: without this guard a stale asset means a silently dead
        // microphone with no error anywhere.
        const payload = e.data as { b64?: string; rms?: number } | string;
        const b64 = typeof payload === 'string' ? payload : payload?.b64;
        const rms = typeof payload === 'string' ? 0 : (payload?.rms ?? 0);
        if (!b64) {
          console.warn('Unexpected capture worklet payload; ignoring frame');
          return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Declare the rate we ACTUALLY captured at, not the rate we hoped for.
          // The Live API resamples server-side, so a browser that ignored the
          // 16 kHz hint still produces correctly-timed audio.
          this.ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: b64,
                  mimeType: `audio/pcm;rate=${this.captureRate}`,
                },
              },
            })
          );
        }

        // VAD runs on the RMS computed in the audio thread — no decode here.
        this.analyzeLocalMicChunk(rms);
      };

      source.connect(worklet);
      this.setState('listening');
    } catch (err) {
      console.warn('Failed to start audio worklet mic capture:', err);
    }
  }

  private analyzeLocalMicChunk(rms: number) {
    try {
      const SPEECH_RMS_THRESHOLD = 0.035;
      const now = Date.now();

      if (rms > SPEECH_RMS_THRESHOLD) {
        this.lastUserVoiceTime = now;
        if (!this.isUserSpeaking) {
          this.isUserSpeaking = true;
          this.userSpeechStartTime = now;
          this.lastTtfa = null;
          this.lastTtft = null;
          this.modelCaption = '';
          // Fresh turn: the Live transcription stream appends per word, so it
          // must start empty or the previous sentence bleeds into this one.
          this.userCaption = '';
        }

        // Barge-in check: if user speaks for >= 200ms while model audio is playing, flush!
        if (this.isModelSpeaking && now - this.userSpeechStartTime >= 200) {
          this.flushAudio();
        }
      } else {
        if (this.isUserSpeaking) {
          // Require at least 600ms continuous silence before ending turn
          if (now - this.lastUserVoiceTime >= 600) {
            // User finished speaking turn
            this.isUserSpeaking = false;
            this.userSpeechEndTime = now;

            // Hybrid VAD signal to prompt immediate model response
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
            }

            // Do not inject a background result into the same instant her answer
            // starts — arm the idle drain instead.
            this.scheduleIdleDrain();
          }
        }
      }
    } catch {}
  }

  private enqueueAudioChunk(b64: string) {
    if (!this.audioCtx) return;

    try {
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);

      const f32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        f32[i] = pcm16[i] / 32768;
      }

      // Compute peak RMS for mouth lip-sync
      let maxAbs = 0;
      for (let i = 0; i < f32.length; i++) {
        const val = Math.abs(f32[i]);
        if (val > maxAbs) maxAbs = val;
      }
      this.currentRms = maxAbs;

      // Create 24kHz buffer
      const audioBuffer = this.audioCtx.createBuffer(1, f32.length, 24000);
      audioBuffer.copyToChannel(f32, 0);

      const sourceNode = this.audioCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.audioCtx.destination);

      const at = Math.max(this.playHead, this.audioCtx.currentTime + 0.02);
      sourceNode.start(at);
      this.playHead = at + audioBuffer.duration;
      this.activeSources.push(sourceNode);
      this.isModelSpeaking = true;
      this.setState('speaking');

      sourceNode.onended = () => {
        const idx = this.activeSources.indexOf(sourceNode);
        if (idx >= 0) this.activeSources.splice(idx, 1);
        if (this.activeSources.length === 0) {
          this.isModelSpeaking = false;
          this.currentRms = 0;
          this.setState('listening');
        }
      };

      // Set turn safety timeout
      if (!this.turnTimeoutTimer) {
        this.turnTimeoutTimer = setTimeout(() => {
          this.flushAudio();
        }, LIMITS.turnWallClockMs);
      }
    } catch (err) {
      console.warn('Error enqueuing audio buffer:', err);
    }
  }

  /**
   * Instantly stops all playing audio buffers, resets playHead and mouth state
   */
  public flushAudio() {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.activeSources = [];
    if (this.audioCtx) {
      this.playHead = this.audioCtx.currentTime;
    }
    this.isModelSpeaking = false;
    this.currentRms = 0;
    this.lastMouthOpen = 0;
    this.callbacks.onMouthOpen?.(0);
    this.setState('listening');
  }

  /**
   * Mouth Animation Loop using Sigmoid mapping (Spec §C.3)
   */
  private startMouthAnimation() {
    const updateMouth = () => {
      if (this.state === 'off') return;

      const v = this.currentRms;
      // Sigmoid mouth opening: 1 / (1 + exp(-45 * v + 5))
      const open = 1 / (1 + Math.exp(-45 * v + 5));
      const targetOpen = open < 0.1 ? 0 : Math.min(1, open);

      // Asymmetric smoothing with 160ms hangover
      if (targetOpen > this.lastMouthOpen) {
        this.lastMouthOpen = targetOpen;
      } else {
        this.lastMouthOpen = this.lastMouthOpen * 0.7 + targetOpen * 0.3;
      }

      this.callbacks.onMouthOpen?.(this.lastMouthOpen);
      this.mouthAnimFrame = requestAnimationFrame(updateMouth);
    };

    this.mouthAnimFrame = requestAnimationFrame(updateMouth);
  }

  private async attemptReconnect() {
    if (this.reconnectCount >= LIMITS.maxResumeAttempts) {
      console.warn('Max resume attempts reached; starting fresh session');
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

  private async migrateSession() {
    console.log('40-minute scheduled session migration triggered');
    try {
      this.flushAudio();
      // NOTE: the resumption handle is deliberately KEPT. Dropping it here
      // started a brand-new conversation at the 40-minute mark, throwing away
      // exactly the context that session resumption exists to preserve.

      // Tear the old graph down completely: start() is a no-op unless the state
      // is off/failed, so leaving state at 'live' made this migration silently
      // do nothing at all — the 40-minute promise never actually ran.
      if (this.micSource) {
        try {
          this.micSource.disconnect();
        } catch {}
        this.micSource = null;
      }
      if (this.workletNode) {
        try {
          this.workletNode.port.onmessage = null;
          this.workletNode.port.close();
          this.workletNode.disconnect();
        } catch {}
        this.workletNode = null;
      }
      // Detach the close handler BEFORE closing. Otherwise onclose fires after
      // setState('off') has already flipped us into 'minting' and schedules a
      // second reconnect, minting a second token while the new socket starts.
      if (this.ws) {
        const dying = this.ws;
        this.ws = null;
        dying.onclose = null;
        dying.onerror = null;
        try {
          dying.close();
        } catch {}
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => t.stop());
        this.micStream = null;
      }
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
      if (this.captureCtx && this.captureCtx.state !== 'closed') {
        this.captureCtx.close().catch(() => {});
        this.captureCtx = null;
      }
      if (this.hardCapTimer) {
        clearTimeout(this.hardCapTimer);
        this.hardCapTimer = null;
      }
      if (this.turnTimeoutTimer) {
        clearTimeout(this.turnTimeoutTimer);
        this.turnTimeoutTimer = null;
      }
      if (this.idleDrainTimer) {
        clearTimeout(this.idleDrainTimer);
        this.idleDrainTimer = null;
      }
      this.clearGoAwayTimer();
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = null;
      }
      if (this.mouthAnimFrame) {
        cancelAnimationFrame(this.mouthAnimFrame);
        this.mouthAnimFrame = null;
      }

      this.setState('off');
      await this.start();
    } catch (err) {
      console.warn('Migration error:', err);
    }
  }

  /**
   * Signals end of speech stream from client (hybrid VAD)
   */
  public sendAudioStreamEnd() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }

  /**
   * Sends text prompt to Gemini Live session while connected
   */
  public sendTextMessage(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendAudioStreamEnd();
      this.userCaption = text;
      this.callbacks.onCaption?.(this.userCaption, this.modelCaption);
      this.ws.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true,
          },
        })
      );
    }
  }

  /**
   * Injects background task completion context or system notification into Gemini Live.
   *
   * `clientContent` with `turnComplete: true` unconditionally interrupts the
   * model's current generation, so a Hermes result that lands mid-sentence cuts
   * her off and permanently appends a synthetic user turn to the conversation
   * history. Deliver only when nothing is being spoken (either direction), and
   * fall back to a short idle timer for the case where no turn ever completes.
   */
  public injectContextUpdate(
    text: string,
    options: { scheduling?: 'WHEN_IDLE' | 'SILENT' | 'IMMEDIATE' } = { scheduling: 'WHEN_IDLE' }
  ) {
    if (options.scheduling !== 'IMMEDIATE' && (this.isUserSpeaking || this.isModelSpeaking)) {
      this.pendingContextUpdates.push(text);
      this.scheduleIdleDrain();
      return;
    }
    this.deliverContextUpdate(text);
  }

  private scheduleIdleDrain() {
    if (this.idleDrainTimer || this.pendingContextUpdates.length === 0) return;
    this.idleDrainTimer = setTimeout(() => {
      this.idleDrainTimer = null;
      if (this.pendingContextUpdates.length === 0) return;
      if (this.isUserSpeaking || this.isModelSpeaking) {
        this.scheduleIdleDrain();
        return;
      }
      const next = this.pendingContextUpdates.shift();
      if (next) this.deliverContextUpdate(next);
      if (this.pendingContextUpdates.length > 0) this.scheduleIdleDrain();
    }, 2000);
  }

  private deliverContextUpdate(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: `[SYSTEM UPDATE: Background Hermes task completed]\n${text}\nBriefly inform the user of this result in character.`,
                  },
                ],
              },
            ],
            turnComplete: true,
          },
        })
      );
    }
  }

  /**
   * Gracefully shuts down the live session
   */
  public stop() {
    this.setState('closing');
    this.flushAudio();

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    if (this.hardCapTimer) {
      clearTimeout(this.hardCapTimer);
      this.hardCapTimer = null;
    }
    if (this.turnTimeoutTimer) {
      clearTimeout(this.turnTimeoutTimer);
      this.turnTimeoutTimer = null;
    }
    if (this.idleDrainTimer) {
      clearTimeout(this.idleDrainTimer);
      this.idleDrainTimer = null;
    }
    this.clearGoAwayTimer();
    if (this.mouthAnimFrame) {
      cancelAnimationFrame(this.mouthAnimFrame);
      this.mouthAnimFrame = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}
      this.micSource = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.port.close();
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.captureCtx && this.captureCtx.state !== 'closed') {
      this.captureCtx.close().catch(() => {});
      this.captureCtx = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.setState('off');
    setAudioOwner('FALLBACK_TTS');
  }
}
