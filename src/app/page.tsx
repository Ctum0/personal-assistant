'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Stage } from '@/components/Stage';
import { Pane, SofiaTurn } from '@/lib/stage';
import { SofiaExpression } from '@/lib/types';
import { getExpressionFromMood } from '@/lib/expressions';
import { speakSofia, stopSpeaking, unlockAudio } from '@/lib/voice';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import {
  Mic,
  MicOff,
  Send,
  Moon,
  Volume2,
  VolumeX,
  MoreHorizontal,
  MessageSquare,
  Clock,
  TrendingUp,
  CheckSquare,
  BookOpen,
  Settings,
  Sparkles,
  Bot,
  Zap,
} from 'lucide-react';

export default function SofiaStageHome() {
  const [expression, setExpression] = useState<SofiaExpression>('focused');
  const [moodLabel, setMoodLabel] = useState('Focused');
  const [captionText, setCaptionText] = useState(
    "I am Sofia. I am watching your stats, your focus blocks, and your output. What are we getting done today?"
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [score, setScore] = useState(85);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isRestDay, setIsRestDay] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial status and settings
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [settingsRes, scoreRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/score'),
        ]);

        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setIsRestDay(s.proactivity?.rest_day ?? false);
          if (s.voice?.auto_speak === false) {
            setIsMuted(true);
          }
        }

        if (scoreRes.ok) {
          const sc = await scoreRes.json();
          if (typeof sc.score === 'number') {
            setScore(sc.score);
          }
        }
      } catch (err) {
        console.warn('Initial state fetch error:', err);
      }
    };
    loadInitialState();
  }, []);

  // Close secondary menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setInputText('');
    setShowSuggestions(false);
    setIsSending(true);
    unlockAudio();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        throw new Error(`Chat API error (${res.status})`);
      }

      const data = await res.json();

      // Support structured SofiaTurn { say, mood, panes } or standard text
      let turnSay = '';
      let turnMood = 'neutral';
      let turnPanes: Pane[] = [];

      if (data && typeof data === 'object') {
        if (data.say) {
          turnSay = data.say;
          turnMood = data.mood || 'neutral';
          if (Array.isArray(data.panes)) {
            turnPanes = data.panes;
          }
        } else if (data.reply || data.response || data.content) {
          const raw = data.reply || data.response || data.content;
          // Attempt JSON parse in case raw string is encoded JSON
          try {
            const parsed = JSON.parse(raw);
            if (parsed.say) {
              turnSay = parsed.say;
              turnMood = parsed.mood || 'neutral';
              if (Array.isArray(parsed.panes)) turnPanes = parsed.panes;
            } else {
              turnSay = raw;
            }
          } catch {
            turnSay = raw;
          }
          if (data.mood) turnMood = data.mood;
        }
      }

      if (!turnSay) {
        turnSay = "I've processed your update.";
      }

      // Update Sofia avatar and caption
      const newExpression = getExpressionFromMood(turnMood);
      setExpression(newExpression);
      setMoodLabel(turnMood.charAt(0).toUpperCase() + turnMood.slice(1));
      setCaptionText(turnSay);

      // Mount or merge new panes
      if (turnPanes && turnPanes.length > 0) {
        setPanes((prev) => {
          // Keep existing pinned panes and append new ones
          const pinned = prev.filter((p) => p.pinned);
          const newUnpinned = turnPanes.filter(
            (np) => !pinned.some((p) => p.id === np.id)
          );
          return [...pinned, ...newUnpinned];
        });
      }

      // Auto-speak response if not muted
      if (!isMuted) {
        setIsSpeaking(true);
        await speakSofia(turnSay, {
          onStart: () => setIsSpeaking(true),
          onEnd: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
      }
    } catch (err: any) {
      console.error('Failed to communicate with Sofia:', err);
      setCaptionText("I encountered an issue processing that. Let's try again.");
      setExpression('concerned');
    } finally {
      setIsSending(false);
    }
  };

  // Continuous voice input hook
  const {
    isListening,
    transcript,
    interimTranscript,
    error: voiceError,
    toggleListening,
    stopListening,
  } = useVoiceInput({
    onFinalTranscript: (text) => {
      handleSendMessage(text);
    },
  });

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        stopSpeaking();
        setIsSpeaking(false);
        stopListening();
        // Dismiss unpinned panes
        setPanes((prev) => prev.filter((p) => p.pinned));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stopListening]);

  const handleDismissPane = (id: string) => {
    setPanes((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePinPane = (id: string) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p))
    );
  };

  const toggleRestDay = async () => {
    const nextVal = !isRestDay;
    setIsRestDay(nextVal);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proactivity: { rest_day: nextVal } }),
      });
      setCaptionText(
        nextVal
          ? "Rest day logged. Go recharge, I won't nag you about focus blocks today."
          : 'Back on the grind. Let us hit your targets.'
      );
      setExpression(nextVal ? 'sleepy' : 'pleased');
    } catch {
      setIsRestDay(!nextVal);
    }
  };

  const toggleMute = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    }
    setIsMuted((prev) => !prev);
  };

  const suggestions = [
    { label: '/stats', prompt: 'Give me a summary of my stats and output today' },
    { label: '/focus', prompt: 'Start a 45-minute focus session' },
    { label: '/tasks', prompt: 'What tasks are on my list today?' },
    { label: '/timeline', prompt: 'Show me my activity timeline for today' },
  ];

  return (
    <div className="relative min-h-screen w-full bg-[#080205] text-rose-50 flex flex-col justify-between overflow-x-hidden selection:bg-rose-600/30">
      {/* Subtle Ambient Cosmic Background Lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-radial from-rose-950/25 via-burgundy-950/15 to-transparent blur-3xl opacity-70" />
        <div className="absolute bottom-10 right-10 w-[450px] h-[450px] rounded-full bg-radial from-burgundy-900/15 to-transparent blur-3xl opacity-50" />
      </div>

      {/* TOP MINIMAL STATUS BAR */}
      <header className="relative z-30 w-full max-w-7xl mx-auto px-6 pt-5 pb-2 flex items-center justify-between">
        {/* Left: Clock & Mood Pill */}
        <div className="flex items-center space-x-3">
          <span className="text-sm font-mono tracking-wider font-semibold text-rose-200">
            {currentTime || '12:00'}
          </span>
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-burgundy-950/70 border border-burgundy-800/40 shadow-sm text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            <span className="text-rose-200 font-medium">{moodLabel}</span>
            <span className="text-rose-400/40">|</span>
            <span className="text-rose-300 font-bold">{score} pts</span>
          </div>
        </div>

        {/* Right: Quick Action Controls + Secondary Menu */}
        <div className="flex items-center space-x-2">
          {/* Rest Day Toggle */}
          <button
            onClick={toggleRestDay}
            title={isRestDay ? 'Rest day active (click to resume normal schedule)' : 'Set Rest Day'}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border transition-all ${
              isRestDay
                ? 'bg-rose-900/70 text-rose-100 border-rose-400/50 shadow-[0_0_15px_rgba(225,29,72,0.4)]'
                : 'bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border-burgundy-800/40'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isRestDay ? 'Resting' : 'Rest'}</span>
          </button>

          {/* Mute Voice Toggle */}
          <button
            onClick={toggleMute}
            title={isMuted ? 'Unmute voice output' : 'Mute voice output'}
            className={`p-2 rounded-xl text-xs font-mono border transition-all ${
              isMuted
                ? 'bg-amber-950/60 text-amber-300 border-amber-700/50'
                : 'bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border-burgundy-800/40'
            }`}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Secondary Navigation Dropdown (⋯) */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              title="More views & settings"
              aria-label="Navigation menu"
              className="p-2 rounded-xl bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border border-burgundy-800/40 transition-all"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl glass-panel border border-burgundy-700/50 shadow-2xl p-2 z-50 flex flex-col space-y-1 animate-fadeIn">
                <Link
                  href="/chat"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-rose-400" />
                  <span>Chat Stream</span>
                </Link>
                <Link
                  href="/timeline"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <Clock className="w-4 h-4 text-rose-400" />
                  <span>Timeline</span>
                </Link>
                <Link
                  href="/tasks"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <CheckSquare className="w-4 h-4 text-rose-400" />
                  <span>Tasks</span>
                </Link>
                <Link
                  href="/history"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <TrendingUp className="w-4 h-4 text-rose-400" />
                  <span>Day History</span>
                </Link>
                <Link
                  href="/memory"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-rose-400" />
                  <span>Long-term Memory</span>
                </Link>
                <div className="h-[1px] bg-rose-900/40 my-1" />
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-rose-400" />
                  <span>Preferences</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* CENTER DYNAMIC STAGE */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center">
        <Stage
          expression={expression}
          isSpeaking={isSpeaking}
          score={score}
          captionText={captionText}
          panes={panes}
          onDismissPane={handleDismissPane}
          onPinPane={handlePinPane}
        />
      </main>

      {/* BOTTOM UNIFIED DOCK (Mic + Input Bar + Shortcuts) */}
      <footer className="relative z-30 w-full max-w-3xl mx-auto px-6 pb-6 pt-2 flex flex-col space-y-2.5">
        {/* Quick Suggestion Pills */}
        {showSuggestions && (
          <div className="flex items-center space-x-2 overflow-x-auto py-1 px-1 custom-scrollbar animate-fadeIn">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(s.prompt)}
                className="whitespace-nowrap px-3 py-1.5 rounded-full bg-burgundy-950/80 hover:bg-burgundy-900/80 border border-burgundy-800/40 text-xs font-mono text-rose-200 hover:text-white transition-all shadow-sm"
              >
                <span className="text-rose-400 font-semibold mr-1">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Live Speech Interim Preview */}
        {(transcript || interimTranscript) && (
          <div className="px-4 py-2 rounded-xl bg-rose-950/70 border border-rose-500/30 text-xs font-mono text-rose-200 flex items-center space-x-2 animate-fadeIn">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping shrink-0" />
            <span className="truncate">
              {transcript} <span className="text-rose-400/70 italic">{interimTranscript}</span>
            </span>
          </div>
        )}

        {/* Unified Input Dock Bar */}
        <div className="relative flex items-center space-x-2 p-1.5 rounded-2xl glass-panel border border-burgundy-700/50 shadow-[0_8px_32px_rgba(20,3,10,0.8)]">
          {/* Continuous Mic Button */}
          <button
            onClick={toggleListening}
            aria-label={isListening ? 'Stop listening' : 'Start voice input'}
            title={isListening ? 'Microphone active (click to stop)' : 'Click to talk (or hold Space)'}
            className={`p-3 rounded-xl transition-all flex items-center justify-center shrink-0 min-w-[44px] min-h-[44px] ${
              isListening
                ? 'bg-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.8)] animate-pulse'
                : 'bg-burgundy-950/70 hover:bg-burgundy-900/60 text-rose-300 hover:text-white border border-burgundy-800/40'
            }`}
          >
            {isListening ? <Mic className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Unified Text Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex-1 flex items-center space-x-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setShowSuggestions(e.target.value.startsWith('/'));
              }}
              onFocus={() => {
                if (inputText.startsWith('/')) setShowSuggestions(true);
              }}
              placeholder="Ask Sofia or type / for commands (Cmd+K)"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-rose-50 placeholder:text-rose-400/50 focus:outline-none min-h-[44px]"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              aria-label="Send message"
              className="p-3 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 disabled:opacity-30 text-white transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              {isSending ? (
                <Bot className="w-4 h-4 animate-spin text-rose-200" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="flex justify-between items-center text-[10px] font-mono text-rose-400/60 px-2">
          <span>Esc: stop audio / dismiss panes</span>
          <span>Cmd+K: focus input</span>
        </div>
      </footer>
    </div>
  );
}
