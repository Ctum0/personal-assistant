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
    <div className="relative w-full h-screen max-h-screen flex flex-col justify-between items-center overflow-hidden select-none bg-[#050104] bg-[radial-gradient(circle_at_50%_40%,rgba(32,4,18,0.72)_0%,rgba(16,2,10,0.85)_45%,rgba(5,1,4,1.0)_85%)]">
      {/* 0. Ambient Nocturne Cosmic Nebula Atmosphere (Luxury Obsidian & Rose-Quartz Bloom) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        {/* Soft Nocturnal Wine/Rose-Quartz Radial Bloom centered directly behind character's upper silhouette */}
        <div className="absolute top-[32%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] rounded-full bg-[radial-gradient(circle,rgba(40,6,24,0.45)_0%,rgba(20,3,12,0.22)_48%,transparent_75%)] blur-[85px] animate-pulse-slow" />

        {/* Nebula Cloud 1: Deep Wine Aurora */}
        <div className="absolute top-[10%] left-[15%] w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle,rgba(90,10,38,0.25)_0%,rgba(50,5,22,0.12)_45%,transparent_70%)] blur-[100px] animate-nebula-1" />
        
        {/* Nebula Cloud 2: Cosmic Midnight Aurora */}
        <div className="absolute bottom-[8%] right-[12%] w-[680px] h-[680px] rounded-full bg-[radial-gradient(circle,rgba(45,6,50,0.22)_0%,rgba(22,3,28,0.10)_50%,transparent_70%)] blur-[110px] animate-nebula-2" />
      </div>

      {/* 1. Top Minimal Luxury Header */}
      <div role="region" aria-label="Console Navigation Header" className="relative z-20 w-full flex items-center justify-between px-6 py-3.5 shrink-0">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-sans tracking-[0.25em] font-light text-rose-100/90 uppercase">
            Sofia
          </span>
          <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/40 border border-rose-500/20 text-[10px] font-mono text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span>Hermes Active</span>
          </span>
        </div>

        {/* Console Drawer Trigger */}
        <button
          onClick={() => setDrawerOpen(true)}
          title="Open Command Console (⌘K)"
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full backdrop-blur-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-rose-500/15 hover:border-rose-400/30 text-rose-200/80 hover:text-white transition-all text-xs font-mono shadow-lg"
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
            className={`w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] lg:w-[520px] lg:h-[520px] xl:w-[540px] xl:h-[540px] rounded-full relative overflow-hidden flex items-center justify-center transition-all duration-500 backdrop-blur-2xl bg-gradient-to-b from-[#14030d]/80 via-[#050104]/90 to-[#14030d]/80 ${
              isSpeaking
                ? 'border border-rose-400/35 shadow-[0_0_80px_rgba(244,63,94,0.28)]'
                : 'border border-rose-500/20 shadow-[0_0_60px_rgba(225,29,72,0.15)]'
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
            className={`text-sm sm:text-base font-sans tracking-[0.03em] leading-relaxed transition-all duration-500 ${
              isSpeaking
                ? 'text-white font-normal drop-shadow-[0_0_15px_rgba(255,220,235,0.7)]'
                : 'text-[#f5e6eb]/90 font-light group-hover:text-white'
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

        {/* Sleek Minimalist Glass Command Dock */}
        <div className="w-full backdrop-blur-3xl bg-rose-950/20 border border-rose-500/30 rounded-full px-3.5 sm:px-4 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,200,225,0.15)] flex items-center gap-2.5 transition-all focus-within:border-rose-400/50 focus-within:bg-rose-950/30">
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
