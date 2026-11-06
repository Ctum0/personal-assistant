'use client';

import React, { useState, useEffect } from 'react';
import Sofia3DCanvas from './Sofia3DCanvas';
import { SofiaExpression } from '@/lib/types';
import { 
  Mic, 
  MicOff, 
  Radio, 
  Send, 
  Volume2, 
  SlidersHorizontal, 
  X, 
  Monitor, 
  Terminal, 
  Flame, 
  Layers, 
  Clock, 
  TrendingUp, 
  Settings as SettingsIcon, 
  ShieldAlert, 
  Key,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';

interface Sofia3DStageProps {
  expression?: SofiaExpression;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  dialogue: string;
  lastUserSpeech: string;
  jarvisMode: boolean;
  onToggleJarvis: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onSpeak: (text: string) => void;
  onInterrupt: () => void;
  onSendPrompt: (prompt: string) => void;
  onOpenVoiceModal: () => void;
  voiceProvider: string;
}

interface GlobalParticleFieldProps {
  isSpeaking: boolean;
}

const GlobalParticleField: React.FC<GlobalParticleFieldProps> = ({ isSpeaking }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle pool: 50 bokeh motes
    // Colors: deep ruby (139, 21, 56), rose champagne (232, 197, 208), faint gold (245, 208, 169)
    const colors = [
      { r: 139, g: 21, b: 56 },   // deep ruby
      { r: 232, g: 197, b: 208 }, // rose champagne
      { r: 245, g: 208, b: 169 }, // faint gold
    ];

    const particles = Array.from({ length: 50 }, () => {
      const col = colors[Math.floor(Math.random() * colors.length)];
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.2 + 1.2,
        baseSpeedY: Math.random() * 0.45 + 0.2,
        phase: Math.random() * Math.PI * 2,
        freq: Math.random() * 0.015 + 0.008,
        amplitude: Math.random() * 1.5 + 0.8,
        color: col,
        baseAlpha: Math.random() * 0.25 + 0.2, // 0.2 to 0.45
      };
    });

    let prevTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min((time - prevTime) / 1000, 0.1);
      prevTime = time;

      ctx.clearRect(0, 0, width, height);

      const speedMultiplier = isSpeaking ? 1.45 : 1.0;
      const alphaBoost = isSpeaking ? 0.12 : 0.0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.phase += p.freq;
        p.x += Math.sin(p.phase) * p.amplitude;
        p.y -= p.baseSpeedY * speedMultiplier * (dt * 60);

        // Wrap around smoothly
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;

        const currentAlpha = Math.min(0.65, p.baseAlpha + alphaBoost);

        // Draw soft glowing bokeh circle
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
        grad.addColorStop(0, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${currentAlpha})`);
        grad.addColorStop(0.5, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${currentAlpha * 0.5})`);
        grad.addColorStop(1, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [isSpeaking]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
};

export const Sofia3DStage: React.FC<Sofia3DStageProps> = ({
  expression = 'focused',
  isSpeaking,
  isListening,
  isThinking,
  dialogue,
  lastUserSpeech,
  jarvisMode,
  onToggleJarvis,
  onStartListening,
  onStopListening,
  onSpeak,
  onInterrupt,
  onSendPrompt,
  onOpenVoiceModal,
  voiceProvider,
}) => {
  const [textInput, setTextInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [killSwitch, setKillSwitch] = useState(false);

  // Keyboard shortcut: Cmd+K or Ctrl+K toggles the executive drawer, Esc closes it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setDrawerOpen((prev) => !prev);
      } else if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  // Fetch initial kill switch status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setKillSwitch(data.consequences?.kill_switch_active ?? false);
        }
      } catch {
        // silent
      }
    };
    fetchStatus();
  }, []);

  const toggleKillSwitch = async () => {
    const nextVal = !killSwitch;
    setKillSwitch(nextVal);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consequences: { kill_switch_active: nextVal },
        }),
      });
    } catch {
      setKillSwitch(!nextVal);
    }
  };

  return (
    <div className="relative w-full h-screen max-h-screen flex flex-col justify-between items-center overflow-hidden select-none bg-[#040103] bg-[radial-gradient(circle_at_50%_38%,rgba(61,3,20,0.65)_0%,rgba(21,1,7,0.45)_45%,rgba(4,1,3,1.0)_85%)]">
      {/* 0. Full-Screen Global Bokeh Particle Field */}
      <GlobalParticleField isSpeaking={isSpeaking} />

      {/* 0. Ambient Nocturne Velvet Burgundy Aurora & Breathing Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        {/* Full-screen Velvet Cabernet breathing aurora centered behind Sofia */}
        <div className="absolute top-[38%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[750px] h-[750px] sm:w-[900px] sm:h-[900px] rounded-full bg-[radial-gradient(circle,rgba(61,3,20,0.55)_0%,rgba(21,1,7,0.35)_45%,transparent_75%)] blur-[90px] animate-breathing-aurora" />

        {/* Nebula Cloud 1: Deep Wine Aurora */}
        <div className="absolute top-[10%] left-[12%] w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle,rgba(90,10,38,0.20)_0%,rgba(50,5,22,0.10)_45%,transparent_70%)] blur-[100px] animate-nebula-1" />
        
        {/* Nebula Cloud 2: Cosmic Midnight Aurora */}
        <div className="absolute bottom-[8%] right-[10%] w-[680px] h-[680px] rounded-full bg-[radial-gradient(circle,rgba(45,6,50,0.18)_0%,rgba(22,3,28,0.08)_50%,transparent_70%)] blur-[110px] animate-nebula-2" />
      </div>

      {/* 1. Top Minimal Luxury Header */}
      <div role="region" aria-label="Console Navigation Header" className="relative z-20 w-full flex items-center justify-between px-6 py-3.5 shrink-0">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-sans tracking-[0.25em] font-light text-rose-100/90 uppercase">
            Sofia
          </span>
          <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/40 border border-[#8b1538]/30 text-[10px] font-mono text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span>Hermes Active</span>
          </span>
        </div>

        {/* Console Drawer Trigger */}
        <button
          onClick={() => setDrawerOpen(true)}
          title="Open Command Console (⌘K)"
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full backdrop-blur-2xl bg-[#0d0207]/40 hover:bg-white/[0.07] border border-[#8b1538]/25 hover:border-rose-400/40 text-rose-200/90 hover:text-white transition-all text-xs font-mono shadow-[0_8px_32px_0_rgba(0,0,0,0.6)]"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-rose-300" aria-hidden="true" />
          <span className="hidden sm:inline">Console</span>
          <kbd className="hidden sm:inline text-[9px] px-1 py-0.2 rounded bg-white/5 border border-white/5 text-rose-300/60 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* 2. Center Stage: Circular Holographic Dais / Ethereal Glass Portal */}
      <section aria-label="Sofia Companion Dais" className="relative z-10 flex-1 flex flex-col items-center justify-center w-full px-4 min-h-0 py-1">
        <div className="relative flex items-center justify-center">
          {/* Ambient Glowing Backlight Halo (Softly pulses with vocal energy) */}
          <div 
            className={`absolute -inset-8 rounded-full blur-2xl transition-all duration-700 pointer-events-none ${
              isSpeaking
                ? 'bg-rose-500/22 scale-105 shadow-[0_0_110px_rgba(244,63,94,0.30)]'
                : isListening
                ? 'bg-cyan-500/18 scale-102 shadow-[0_0_90px_rgba(6,182,212,0.22)]'
                : 'bg-rose-950/35 scale-100 shadow-[0_0_70px_rgba(225,29,72,0.12)]'
            }`}
          />

          {/* Holographic Circular Portal Dais */}
          <div 
            className={`w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] lg:w-[520px] lg:h-[520px] xl:w-[540px] xl:h-[540px] rounded-full relative overflow-hidden flex items-center justify-center transition-all duration-500 backdrop-blur-2xl bg-[#0d0207]/40 shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] ${
              isSpeaking
                ? 'border border-rose-400/40 shadow-[0_0_80px_rgba(244,63,94,0.30)]'
                : 'border border-[#8b1538]/25 shadow-[0_8px_32px_0_rgba(0,0,0,0.6),0_0_50px_rgba(139,21,56,0.15)]'
            }`}
          >
            {/* Luminous Eclipse Aura & Deep Velvet Gradient BEHIND Sofia (z-0) */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_44%,rgba(38,6,22,0.85)_0%,rgba(16,2,10,0.92)_65%,rgba(5,1,4,0.98)_100%)] z-0" />
            
            {/* Soft Luminous Rose-Gold Horizon Aura BEHIND the 3D model */}
            <div className={`pointer-events-none absolute -inset-2 rounded-full transition-all duration-700 blur-xl z-0 ${
              isSpeaking 
                ? 'bg-gradient-to-tr from-rose-900/30 via-rose-500/20 to-amber-200/15 opacity-100 scale-105' 
                : 'bg-gradient-to-tr from-rose-950/20 via-rose-600/10 to-transparent opacity-70 scale-100'
            }`} />

            {/* 3D VRM Canvas (Camera focused at bust-up/waist-up elevation; completely clean & unobstructed at z-10!) */}
            <div className="w-full h-full relative z-10">
              <Sofia3DCanvas
                expression={expression}
                isSpeaking={isSpeaking}
                dialogue={dialogue}
                onOpenVoiceModal={onOpenVoiceModal}
              />
            </div>

            {/* Subtle Ethereal Glass Glare Highlight */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/[0.025] to-transparent z-20" />
          </div>
        </div>
      </section>

      {/* 3. Bottom Subtitle Dialogue Line & Minimal Glassy Command Dock */}
      <section aria-label="Spoken Dialogue and Command Dock" className="relative z-20 w-full max-w-2xl px-4 pb-5 sm:pb-6 flex flex-col items-center space-y-2.5 sm:space-y-3 shrink-0">
        {/* Real-time Subtitle Dialogue Line */}
        <div 
          onClick={isSpeaking ? onInterrupt : () => onSpeak(dialogue)}
          title={isSpeaking ? "Click to interrupt" : "Click to replay audio"}
          className="text-center max-w-xl min-h-[48px] flex flex-col items-center justify-center px-4 cursor-pointer group"
        >
          <p 
            className={`text-sm sm:text-base font-sans tracking-[0.04em] leading-relaxed transition-all duration-500 ${
              isSpeaking
                ? 'text-white font-normal drop-shadow-[0_0_15px_rgba(255,220,235,0.7)]'
                : 'text-[#f5e6eb] font-light group-hover:text-white'
            }`}
          >
            &ldquo;{dialogue}&rdquo;
          </p>

          {/* Micro Audio Equalizer Frequency Bars */}
          <div className="flex items-center space-x-1 h-3 mt-1.5" aria-hidden="true">
            {[4, 12, 18, 14, 8, 16, 20, 10, 6, 14, 18, 6].map((h, i) => (
              <span
                key={i}
                style={{
                  height: isSpeaking || isListening ? `${h * 0.55}px` : '2px',
                  transition: 'height 0.15s ease',
                }}
                className={`w-0.5 rounded-full ${
                  isSpeaking ? 'bg-rose-400' : isListening ? 'bg-cyan-400' : 'bg-rose-950/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Sleek Minimalist Ultra-Clean Frosted Dark Glass Command Dock */}
        <div className="w-full backdrop-blur-2xl bg-[#0d0207]/40 border border-[#8b1538]/30 rounded-full px-3.5 sm:px-4 py-2 shadow-[0_8px_32px_0_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,200,225,0.12)] flex items-center gap-2.5 transition-all focus-within:border-rose-400/50 focus-within:bg-[#12030a]/60">
          {/* Voice Talk Microphone Button */}
          <button
            onClick={isListening ? onStopListening : onStartListening}
            aria-label={isListening ? "Stop listening" : "Talk to Sofia"}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg ${
              isListening
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.7)] animate-pulse'
                : isSpeaking
                ? 'bg-gradient-to-r from-amber-600 to-rose-700 text-white shadow-[0_0_18px_rgba(245,158,11,0.6)]'
                : isThinking
                ? 'bg-zinc-800 text-zinc-400'
                : 'bg-gradient-to-tr from-rose-800 via-crimson-600 to-rose-700 hover:from-rose-700 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)]'
            }`}
          >
            {isListening ? (
              <MicOff className="w-4 h-4 text-white" aria-hidden="true" />
            ) : (
              <Mic className="w-4 h-4 text-white" aria-hidden="true" />
            )}
          </button>

          {/* Hands-Free Jarvis Mode Toggle */}
          <button
            onClick={onToggleJarvis}
            aria-pressed={jarvisMode}
            title={jarvisMode ? "Hands-Free Voice Active" : "Enable Hands-Free Voice"}
            className={`px-2.5 py-1.5 rounded-full border text-[11px] font-mono flex items-center space-x-1.5 transition-all shrink-0 ${
              jarvisMode
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                : 'bg-white/[0.04] border-white/10 text-rose-300/70 hover:text-rose-100 hover:border-rose-500/30'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${jarvisMode ? 'animate-pulse text-emerald-400' : 'text-rose-400/70'}`} aria-hidden="true" />
            <span className="hidden sm:inline">{jarvisMode ? 'Hands-Free' : 'Auto'}</span>
          </button>

          {/* Silent Text Command Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textInput.trim()) {
                onSendPrompt(textInput);
                setTextInput('');
              }
            }}
            className="flex-1 flex items-center"
          >
            <label htmlFor="jarvis-command-input" className="sr-only">
              Talk or type to Sofia
            </label>
            <input
              id="jarvis-command-input"
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={isListening ? "Listening to your voice..." : "Talk or whisper to Sofia..."}
              className="w-full bg-transparent text-xs sm:text-sm text-rose-100 placeholder:text-rose-300/50 focus:outline-none px-2 font-sans"
            />
            <button
              type="submit"
              disabled={isThinking || !textInput.trim()}
              aria-label="Send query"
              className="w-8 h-8 rounded-full bg-rose-900/40 hover:bg-rose-700/80 text-rose-200 hover:text-white disabled:opacity-20 border border-rose-500/20 flex items-center justify-center transition-all shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>

      {/* 4. Slide-Out Executive Command Drawer (Out-of-the-way tools & telemetry) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop overlay */}
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <aside
            role="dialog"
            aria-label="Executive Command Console"
            className="relative w-full max-w-sm sm:max-w-md h-full bg-[#0a0207]/95 backdrop-blur-3xl border-l border-rose-500/20 p-6 flex flex-col justify-between shadow-2xl z-10 overflow-y-auto"
          >
            {/* Drawer Header */}
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-rose-500/20 mb-6">
                <div className="flex items-center space-x-2.5">
                  <Sparkles className="w-4 h-4 text-rose-400" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-mono font-bold tracking-wider text-rose-100 uppercase">
                      Executive Console
                    </h2>
                    <p className="text-[11px] font-mono text-rose-300/60">
                      System Telemetry &amp; Navigation
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close drawer"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-rose-300 text-xs font-mono transition-all"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* System Daemon Status */}
              <div className="mb-6 space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-rose-400/80 font-bold">
                  System Health
                </p>
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Hermes AI Gateway:</span>
                    <span className="text-emerald-400 flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>127.0.0.1:8642</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Voice Synthesis:</span>
                    <span className="text-rose-300">
                      {voiceProvider === 'elevenlabs' ? 'ElevenLabs Studio' : 'Neural Speech'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">VRM Gestures:</span>
                    <span className="text-rose-200">Procedural Slerp</span>
                  </div>
                </div>
              </div>

              {/* Navigation Links */}
              <div className="space-y-2 mb-6">
                <p className="text-[10px] font-mono uppercase tracking-widest text-rose-400/80 font-bold">
                  Workspace Apps
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <Link
                    href="/computer-use"
                    onClick={() => setDrawerOpen(false)}
                    className="p-3 rounded-xl bg-white/[0.02] hover:bg-rose-950/40 border border-white/5 hover:border-rose-500/30 text-rose-200 flex flex-col space-y-1 transition-all"
                  >
                    <Monitor className="w-4 h-4 text-rose-400 mb-1" aria-hidden="true" />
                    <span className="font-bold">Computer Use</span>
                    <span className="text-[10px] text-zinc-400">CUA Driver</span>
                  </Link>

                  <Link
                    href="/chat"
                    onClick={() => setDrawerOpen(false)}
                    className="p-3 rounded-xl bg-white/[0.02] hover:bg-rose-950/40 border border-white/5 hover:border-rose-500/30 text-rose-200 flex flex-col space-y-1 transition-all"
                  >
                    <Terminal className="w-4 h-4 text-rose-400 mb-1" aria-hidden="true" />
                    <span className="font-bold">Terminal &amp; Chat</span>
                    <span className="text-[10px] text-zinc-400">Hermes Console</span>
                  </Link>

                  <Link
                    href="/tasks"
                    onClick={() => setDrawerOpen(false)}
                    className="p-3 rounded-xl bg-white/[0.02] hover:bg-rose-950/40 border border-white/5 hover:border-rose-500/30 text-rose-200 flex flex-col space-y-1 transition-all"
                  >
                    <Flame className="w-4 h-4 text-rose-400 mb-1" aria-hidden="true" />
                    <span className="font-bold">Focus Session</span>
                    <span className="text-[10px] text-zinc-400">Tasks &amp; Goals</span>
                  </Link>

                  <Link
                    href="/memory"
                    onClick={() => setDrawerOpen(false)}
                    className="p-3 rounded-xl bg-white/[0.02] hover:bg-rose-950/40 border border-white/5 hover:border-rose-500/30 text-rose-200 flex flex-col space-y-1 transition-all"
                  >
                    <Layers className="w-4 h-4 text-rose-400 mb-1" aria-hidden="true" />
                    <span className="font-bold">Memory Vault</span>
                    <span className="text-[10px] text-zinc-400">Knowledge Notes</span>
                  </Link>

                  <Link
                    href="/timeline"
                    onClick={() => setDrawerOpen(false)}
                    className="p-3 rounded-xl bg-white/[0.02] hover:bg-rose-950/40 border border-white/5 hover:border-rose-500/30 text-rose-200 flex flex-col space-y-1 transition-all"
                  >
                    <Clock className="w-4 h-4 text-rose-400 mb-1" aria-hidden="true" />
                    <span className="font-bold">Timeline</span>
                    <span className="text-[10px] text-zinc-400">Activity Telemetry</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setDrawerOpen(false)}
                    className="p-3 rounded-xl bg-white/[0.02] hover:bg-rose-950/40 border border-white/5 hover:border-rose-500/30 text-rose-200 flex flex-col space-y-1 transition-all"
                  >
                    <SettingsIcon className="w-4 h-4 text-rose-400 mb-1" aria-hidden="true" />
                    <span className="font-bold">Settings</span>
                    <span className="text-[10px] text-zinc-400">Persona Dials</span>
                  </Link>
                </div>
              </div>

              {/* Voice Configuration Trigger */}
              <div className="mb-6">
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenVoiceModal();
                  }}
                  className="w-full p-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-200 flex items-center justify-between text-xs font-mono transition-all"
                >
                  <div className="flex items-center space-x-2">
                    <Key className="w-4 h-4 text-rose-400" aria-hidden="true" />
                    <span className="font-bold">Voice Engine Configuration</span>
                  </div>
                  <span className="text-[10px] text-rose-300 uppercase">Edit Key</span>
                </button>
              </div>
            </div>

            {/* Bottom Safety: Kill Switch */}
            <div className="pt-4 border-t border-rose-500/20">
              <button
                onClick={toggleKillSwitch}
                aria-pressed={killSwitch}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-mono border transition-all flex items-center justify-center space-x-2 ${
                  killSwitch
                    ? 'bg-red-600 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-pulse font-bold'
                    : 'bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border-rose-500/30'
                }`}
              >
                <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                <span>{killSwitch ? 'KILL SWITCH ACTIVE' : 'Emergency Kill Switch'}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
