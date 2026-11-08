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
  maxResumeAttempts: 2,
  resumeBackoffMs: [1000, 2000],
  turnWallClockMs: 25_000,
};

export class SofiaLiveSession {
  private state: LiveConnState = 'off';
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
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

  // Connection & telemetry
  private resumptionHandle: string | null = null;
  private reconnectCount = 0;
  private dropCount = 0;
  private sessionStartTime = 0;
  private connStartTime = 0;
  private metricsTimer: NodeJS.Timeout | null = null;
  private hardCapTimer: NodeJS.Timeout | null = null;
  private turnTimeoutTimer: NodeJS.Timeout | null = null;
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
      // 1. Initialize AudioContext and AudioWorklet
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      try {
        await this.audioCtx.audioWorklet.addModule('/worklets/pcm-16k.js');
      } catch (workletErr) {
        console.warn('Network worklet load failed, using inlined worklet Blob fallback:', workletErr);
        const workletCode = `
          class PCM16K extends AudioWorkletProcessor {
            constructor() {
              super();
              this.ratio = sampleRate / 16000;
              this.acc = 0;
              this.n = 0;
              this.out = [];
            }
            process(inputs) {
              const ch = inputs[0]?.[0];
              if (!ch) return true;
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
              while (this.out.length >= 640) {
                const pcm = new Int16Array(this.out.splice(0, 640));
                const b = new Uint8Array(pcm.buffer);
                let s = '';
                for (let i = 0; i < b.length; i++) {
                  s += String.fromCharCode(b[i]);
                }
                this.port.postMessage(btoa(s));
              }
              return true;
            }
          }
          registerProcessor('pcm-16k', PCM16K);
        `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        await this.audioCtx.audioWorklet.addModule(blobUrl);
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
          contextWindowCompression: {
            slidingWindow: {},
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

      if (this.resumptionHandle) {
        setupMsg.setup.sessionResumption = { handle: this.resumptionHandle };
      }

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

    // 2. Resumption update handle
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
    }

    // 6. Tool Call Execution
    if (msg.toolCall?.functionCalls) {
      this.handleToolCalls(msg.toolCall.functionCalls);
    }

    // 7. GoAway signal before disconnect
    if (msg.goAway) {
      console.log('Received goAway from Gemini Live, preparing hand-over');
      setTimeout(() => {
        this.attemptReconnect();
      }, LIMITS.goAwayGraceMs - 5000);
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
    if (!this.audioCtx || !this.micStream) return;

    try {
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      const worklet = new AudioWorkletNode(this.audioCtx, 'pcm-16k');
      this.workletNode = worklet;

      worklet.port.onmessage = (e) => {
        const b64 = e.data;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Send 16kHz PCM audio
          this.ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: b64,
                  mimeType: 'audio/pcm;rate=16000',
                },
              },
            })
          );
        }

        // Local VAD computation for barge-in
        this.analyzeLocalMicChunk(b64);
      };

      source.connect(worklet);
      this.setState('listening');
    } catch (err) {
      console.warn('Failed to start audio worklet mic capture:', err);
    }
  }

  private analyzeLocalMicChunk(b64: string) {
    try {
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);

      let sumSq = 0;
      for (let i = 0; i < pcm16.length; i++) {
        const norm = pcm16[i] / 32768;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / pcm16.length);

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
      if (this.ws) {
        this.ws.close();
      }
      this.resumptionHandle = null;
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
   * Injects background task completion context or system notification into Gemini Live
   */
  public injectContextUpdate(text: string) {
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
    if (this.mouthAnimFrame) {
      cancelAnimationFrame(this.mouthAnimFrame);
      this.mouthAnimFrame = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
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
