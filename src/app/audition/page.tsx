'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Play, Volume2, Star, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react';

interface VoiceCandidate {
  id: string;
  name: string;
  catalogueWord: string;
  note: string;
  phrase: string;
}

const CANDIDATES: VoiceCandidate[] = [
  {
    id: 'Aoede',
    name: 'Aoede',
    catalogueWord: 'Breezy',
    note: 'Preferred by independent companion and PA builders. High naturalness and responsiveness.',
    phrase: "Mm. Two commits today. That's less than yesterday — what happened?",
  },
  {
    id: 'Leda',
    name: 'Leda',
    catalogueWord: 'Youthful',
    note: 'Lighter timbre, bright cadence. Potential cute female companion register.',
    phrase: "Mm. Two commits today. That's less than yesterday — what happened?",
  },
  {
    id: 'Achernar',
    name: 'Achernar',
    catalogueWord: 'Soft',
    note: 'Gentle, intimate tone. Lower projection, calm bedroom/companion register.',
    phrase: "Mm. Two commits today. That's less than yesterday — what happened?",
  },
];

export default function AuditionPage() {
  const [activeVoice, setActiveVoice] = useState('Aoede');
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [ratings, setRatings] = useState<
    Record<string, { warmth: number; youth: number; turnEnd: number; nonRobotic: number }>
  >({
    Aoede: { warmth: 5, youth: 4, turnEnd: 5, nonRobotic: 5 },
    Leda: { warmth: 4, youth: 5, turnEnd: 4, nonRobotic: 4 },
    Achernar: { warmth: 4, youth: 3, turnEnd: 4, nonRobotic: 4 },
  });

  const playVoice = async (voiceName: string) => {
    setIsPlaying(voiceName);
    setStatusMsg(`Connecting to Gemini Live with voice ${voiceName}...`);

    try {
      // Mint token with requested voice
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('sofia_token') || localStorage.getItem('sofia_api_token');
        if (token) {
          authHeaders['x-sofia-token'] = token;
          authHeaders['Authorization'] = `Bearer ${token}`;
        }
      }

      const tokenRes = await fetch('/api/live/token', {
        method: 'POST',
        headers: authHeaders,
      });

      if (!tokenRes.ok) {
        throw new Error(`Token mint failed: ${tokenRes.status}`);
      }

      const { token } = await tokenRes.json();
      const rawToken = token.replace(/^auth_tokens\//, '');
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${rawToken}`;
      const ws = new WebSocket(wsUrl);

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let playHead = audioCtx.currentTime;

      ws.onopen = () => {
        setStatusMsg(`Connected. Synthesizing phrase with ${voiceName}...`);
        // Send setup message locking voice
        ws.send(
          JSON.stringify({
            setup: {
              model: 'models/gemini-3.8-live',
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
              },
              systemInstruction: {
                parts: [
                  {
                    text: 'You are Sofia. Speak the exact provided line out loud with natural human inflection.',
                  },
                ],
              },
            },
          })
        );
      };

      ws.onmessage = async (evt) => {
        let data: any = {};
        if (typeof evt.data === 'string') {
          data = JSON.parse(evt.data);
        } else if (evt.data instanceof Blob) {
          data = JSON.parse(await evt.data.text());
        }

        if (data.setupComplete) {
          // Send prompt to speak the test phrase
          ws.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: "Say out loud with feeling: \"Mm. Two commits today. That's less than yesterday — what happened?\"",
                      },
                    ],
                  },
                ],
                turnComplete: true,
              },
            })
          );
        }

        const parts = data.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/pcm')) {
            const b64 = p.inlineData.data;
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const pcm = new Int16Array(bytes.buffer);
            const f32 = new Float32Array(pcm.length);
            for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;

            const buf = audioCtx.createBuffer(1, f32.length, 24000);
            buf.copyToChannel(f32, 0);
            const s = audioCtx.createBufferSource();
            s.buffer = buf;
            s.connect(audioCtx.destination);
            const at = Math.max(playHead, audioCtx.currentTime + 0.02);
            s.start(at);
            playHead = at + buf.duration;
          }
        }

        if (data.serverContent?.turnComplete) {
          setStatusMsg(`Playback complete for ${voiceName}.`);
          setTimeout(() => {
            setIsPlaying(null);
            ws.close();
          }, 1500);
        }
      };

      ws.onerror = (e) => {
        console.error('Audition error', e);
        setStatusMsg(`WebSocket error with ${voiceName}. Falling back to preview...`);
        setIsPlaying(null);
      };
    } catch (err: any) {
      console.error(err);
      setStatusMsg(`Error: ${err.message}`);
      setIsPlaying(null);
    }
  };

  const handleRatingChange = (
    voice: string,
    field: 'warmth' | 'youth' | 'turnEnd' | 'nonRobotic',
    val: number
  ) => {
    setRatings((prev) => ({
      ...prev,
      [voice]: { ...prev[voice], [field]: val },
    }));
  };

  const selectAsDefault = (voice: string) => {
    setActiveVoice(voice);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sofia_active_voice', voice);
    }
    setStatusMsg(`Selected ${voice} as default voice.`);
  };

  return (
    <div className="min-h-screen bg-[#080205] text-rose-50 p-6 max-w-5xl mx-auto flex flex-col space-y-6">
      <div className="flex items-center justify-between border-b border-rose-900/40 pb-4">
        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-burgundy-950/80 hover:bg-burgundy-900 border border-burgundy-800/40 text-rose-300 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
              <span>Sofia Voice Audition</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/40 font-mono">
                Gemini 3.8 Live
              </span>
            </h1>
            <p className="text-xs text-rose-400/80">
              Audition Aoede, Leda, and Achernar against the 3-register baseline phrase (backchannel, number, question).
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono text-rose-400/70">Current Active:</span>
          <p className="text-sm font-bold text-rose-200">{activeVoice}</p>
        </div>
      </div>

      {statusMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-burgundy-950/90 border border-rose-500/30 text-xs font-mono text-rose-200 flex items-center space-x-2 animate-fadeIn">
          <RefreshCw className={`w-3.5 h-3.5 ${isPlaying ? 'animate-spin text-rose-400' : 'text-rose-500'}`} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Voice Candidates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {CANDIDATES.map((c) => {
          const r = ratings[c.id];
          const avgScore = ((r.warmth + r.youth + r.turnEnd + r.nonRobotic) / 4).toFixed(1);
          const isSelected = activeVoice === c.id;

          return (
            <div
              key={c.id}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                isSelected
                  ? 'bg-rose-950/40 border-rose-500/60 shadow-[0_0_25px_rgba(225,29,72,0.2)]'
                  : 'bg-burgundy-950/50 border-burgundy-800/40 hover:border-rose-800/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-white">{c.name}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-burgundy-900/80 text-rose-300 border border-burgundy-700/50">
                    {c.catalogueWord}
                  </span>
                </div>
                <p className="text-xs text-rose-300/80 mb-3">{c.note}</p>

                <div className="p-3 rounded-xl bg-black/40 border border-rose-950 text-xs italic text-rose-200/90 mb-4">
                  &ldquo;{c.phrase}&rdquo;
                </div>

                {/* Rating Sliders (1-5) */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-rose-300/70">Warmth</span>
                    <div className="flex space-x-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => handleRatingChange(c.id, 'warmth', s)}
                          className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] ${
                            s <= r.warmth ? 'bg-rose-600 text-white' : 'bg-burgundy-950 text-rose-500'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-rose-300/70">Youth / Lightness</span>
                    <div className="flex space-x-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => handleRatingChange(c.id, 'youth', s)}
                          className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] ${
                            s <= r.youth ? 'bg-rose-600 text-white' : 'bg-burgundy-950 text-rose-500'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-rose-300/70">Natural Turn-End</span>
                    <div className="flex space-x-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => handleRatingChange(c.id, 'turnEnd', s)}
                          className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] ${
                            s <= r.turnEnd ? 'bg-rose-600 text-white' : 'bg-burgundy-950 text-rose-500'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-rose-300/70">Non-Robotic</span>
                    <div className="flex space-x-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => handleRatingChange(c.id, 'nonRobotic', s)}
                          className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] ${
                            s <= r.nonRobotic ? 'bg-rose-600 text-white' : 'bg-burgundy-950 text-rose-500'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-rose-900/30 flex items-center justify-between">
                <span className="text-xs font-mono text-rose-300">
                  Avg: <strong className="text-white">{avgScore}/5</strong>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => playVoice(c.id)}
                    disabled={isPlaying !== null}
                    className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white shadow-md transition-all flex items-center space-x-1 text-xs"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Audition</span>
                  </button>

                  <button
                    onClick={() => selectAsDefault(c.id)}
                    className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-rose-900/80 border-rose-400 text-rose-100'
                        : 'bg-burgundy-950 hover:bg-burgundy-900 border-burgundy-700 text-rose-300'
                    }`}
                  >
                    {isSelected ? 'Active' : 'Choose'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
