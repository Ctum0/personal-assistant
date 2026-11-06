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
    <div className="relative w-full h-screen max-h-screen flex flex-col justify-between items-center overflow-hidden select-none bg-[#070105] bg-[radial-gradient(circle_at_50%_38%,rgba(45,8,28,0.7)_0%,rgba(20,4,14,0.85)_45%,rgba(7,1,5,1.0)_80%)]">
      {/* 0. Ambient Cosmic Nebula Waves & Twinkling Star Dust (Outside Circle Animations) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        {/* Nebula Cloud 1: Deep Nocturnal Wine/Crimson Aurora */}
        <div className="absolute top-[12%] left-[16%] w-[680px] h-[680px] rounded-full bg-[radial-gradient(circle,rgba(110,12,48,0.36)_0%,rgba(65,6,30,0.18)_45%,transparent_70%)] blur-[95px] animate-nebula-1" />
        
        {/* Nebula Cloud 2: Velvet Obsidian / Cosmic Indigo Aurora */}
        <div className="absolute bottom-[10%] right-[14%] w-[720px] h-[720px] rounded-full bg-[radial-gradient(circle,rgba(50,8,60,0.30)_0%,rgba(28,4,36,0.16)_50%,transparent_70%)] blur-[100px] animate-nebula-2" />
        
        {/* Nebula Cloud 3: Warm Rose-Gold Core Glow behind Stage */}
        <div className="absolute top-[34%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full bg-[radial-gradient(circle,rgba(225,29,72,0.16)_0%,rgba(159,18,57,0.06)_50%,transparent_75%)] blur-[75px] animate-pulse-slow" />

        {/* Twinkling Starlet Dust Field */}
        <div className="absolute top-[16%] left-[22%] w-1.5 h-1.5 rounded-full bg-rose-200/60 shadow-[0_0_8px_rgba(255,200,225,0.8)] animate-star-1" />
        <div className="absolute top-[26%] right-[24%] w-1 h-1 rounded-full bg-rose-300/50 shadow-[0_0_6px_rgba(255,200,225,0.7)] animate-star-2" />
        <div className="absolute bottom-[24%] left-[26%] w-1.5 h-1.5 rounded-full bg-rose-100/70 shadow-[0_0_10px_rgba(255,220,240,0.9)] animate-star-3" />
        <div className="absolute top-[48%] left-[10%] w-1 h-1 rounded-full bg-pink-300/40 shadow-[0_0_6px_rgba(244,63,94,0.6)] animate-star-2" />
        <div className="absolute top-[50%] right-[12%] w-1.5 h-1.5 rounded-full bg-rose-200/50 shadow-[0_0_8px_rgba(255,200,225,0.7)] animate-star-1" />
        <div className="absolute bottom-[34%] right-[20%] w-1 h-1 rounded-full bg-rose-400/40 shadow-[0_0_6px_rgba(244,63,94,0.5)] animate-star-3" />
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
          {/* Expanding Holographic Acoustic Resonance Waves (Outside Circle Animation) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <div className={`w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] lg:w-[520px] lg:h-[520px] xl:w-[540px] xl:h-[540px] rounded-full border ${isSpeaking ? 'border-rose-400/35' : 'border-rose-600/15'} animate-acoustic-1`} />
            <div className={`w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] lg:w-[520px] lg:h-[520px] xl:w-[540px] xl:h-[540px] rounded-full border ${isSpeaking ? 'border-rose-400/25' : 'border-rose-700/10'} animate-acoustic-2`} />
            <div className={`w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] lg:w-[520px] lg:h-[520px] xl:w-[540px] xl:h-[540px] rounded-full border ${isSpeaking ? 'border-rose-400/20' : 'border-rose-800/10'} animate-acoustic-3`} />
          </div>

          {/* Ambient Glowing Backlight Halo (Pulses with vocal energy) */}
          <div 
            className={`absolute -inset-6 sm:-inset-8 rounded-full blur-2xl transition-all duration-700 pointer-events-none ${
              isSpeaking
                ? 'bg-rose-500/28 scale-105 shadow-[0_0_120px_rgba(244,63,94,0.35)]'
                : isListening
                ? 'bg-cyan-500/20 scale-102 shadow-[0_0_100px_rgba(6,182,212,0.25)]'
                : 'bg-rose-950/40 scale-100 shadow-[0_0_80px_rgba(225,29,72,0.15)]'
            }`}
          />

          {/* Holographic Circular Portal Dais */}
          <div 
            className={`w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] lg:w-[520px] lg:h-[520px] xl:w-[540px] xl:h-[540px] rounded-full relative overflow-hidden flex items-center justify-center transition-all duration-500 backdrop-blur-2xl bg-gradient-to-b from-rose-950/20 via-[#070105]/85 to-rose-950/30 ${
              isSpeaking
                ? 'border border-rose-400/40 shadow-[0_0_100px_rgba(244,63,94,0.35),inset_0_0_60px_rgba(244,63,94,0.18)]'
                : 'border border-rose-500/25 shadow-[0_0_80px_rgba(225,29,72,0.18),inset_0_0_45px_rgba(244,63,94,0.12)]'
            }`}
          >
            {/* Deep Velvet Internal Vignette (Preserves delicate facial contrast & mysterious aesthetic) */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_46%,rgba(28,4,18,0.15)_0%,rgba(14,2,9,0.72)_72%,rgba(5,1,4,0.96)_100%)] z-0" />

            {/* Rotating Chromatic Edge Refraction Sheen (Inside Circle Animation) */}
            <div className="pointer-events-none absolute -inset-[15%] rounded-full opacity-35 animate-dais-spin bg-[conic-gradient(from_0deg,transparent_0deg,rgba(244,63,94,0.22)_90deg,transparent_180deg,rgba(255,200,225,0.18)_270deg,transparent_360deg)] z-0" />

            {/* 3D VRM Canvas (Camera focused at bust-up/waist-up elevation; zero detached legs!) */}
            <div className="w-full h-full relative z-10">
              <Sofia3DCanvas
                expression={expression}
                isSpeaking={isSpeaking}
                dialogue={dialogue}
                onOpenVoiceModal={onOpenVoiceModal}
              />
            </div>

            {/* Subtle Ethereal Glass Glare Highlight */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent z-20" />
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
            className={`text-sm sm:text-base font-sans tracking-wide leading-relaxed transition-all duration-300 ${
              isSpeaking
                ? 'text-white font-normal drop-shadow-[0_0_15px_rgba(255,210,230,0.7)]'
                : 'text-rose-100/85 font-light group-hover:text-white'
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
                  isSpeaking ? 'bg-rose-400' : isListening ? 'bg-cyan-400' : 'bg-rose-900/40'
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
