'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SofiaAvatar } from '@/components/SofiaAvatar';
import { SofiaExpression, TaskItem, DayStats } from '@/lib/types';
import { getExpressionFromMood } from '@/lib/expressions';
import { speakSofia, stopSpeaking, unlockAudio } from '@/lib/voice';
import { Mic, MicOff, Send, Moon, BellOff, CheckCircle2, Circle, Flame, GitCommit, ListTodo } from 'lucide-react';

export default function SofiaCompanionStage() {
  const [stats, setStats] = useState<DayStats | null>(null);
  const [score, setScore] = useState<number>(82);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [mood, setMood] = useState<string>('ATTENTIVE');
  const [expression, setExpression] = useState<SofiaExpression>('focused');
  const [dialogue, setDialogue] = useState<string>(
    "I am Sofia. Hermes AI engine online, voice link active. Speak to me or dispatch an action."
  );
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [restDay, setRestDay] = useState<boolean>(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  // Load initial data
  const loadData = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [statsRes, scoreRes, tasksRes, settingsRes] = await Promise.all([
        fetch(`/api/stats?date=${today}`),
        fetch(`/api/score?date=${today}`),
        fetch('/api/tasks'),
        fetch('/api/settings'),
      ]);

      if (statsRes.ok) {
        const s = await statsRes.json();
        setStats(s);
      }
      if (scoreRes.ok) {
        const sc = await scoreRes.json();
        if (sc?.score !== undefined) setScore(Math.round(sc.score));
      }
      if (tasksRes.ok) {
        const t = await tasksRes.json();
        setTasks(t);
      }
      if (settingsRes.ok) {
        const set = await settingsRes.json();
        if (set.proactivity?.rest_day !== undefined) setRestDay(set.proactivity.rest_day);
        if (set.proactivity?.muted_until) setMutedUntil(set.proactivity.muted_until);
      }
    } catch (err) {
      console.warn('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Unlock audio on first click or keypress
  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  const triggerSpeak = (text: string) => {
    stopSpeaking();
    speakSofia(text, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleInterrupt = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  const handleSendPrompt = async (promptToSend?: string) => {
    const text = (promptToSend ?? inputText).trim();
    if (!text || isThinking) return;

    setInputText('');
    setIsThinking(true);
    handleInterrupt();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error('API failed');

      const data = await res.json();
      const reply = data.text || 'Command processed.';
      setDialogue(reply);

      if (data.mood) {
        const cleanMood = data.mood.toUpperCase();
        setMood(cleanMood);
        setExpression(getExpressionFromMood(data.mood));
      }

      triggerSpeak(reply);
      loadData();
    } catch (err) {
      console.error('Chat failed:', err);
      setDialogue("Failed to communicate with Hermes AI backend. Please verify proxy connectivity.");
    } finally {
      setIsThinking(false);
    }
  };

  // Toggle voice recognition
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    handleInterrupt();
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your message.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      handleSendPrompt(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  // Toggle Rest Day
  const handleToggleRestDay = async () => {
    const nextState = !restDay;
    setRestDay(nextState);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proactivity: {
            rest_day: nextState,
          },
        }),
      });
      const msg = nextState
        ? "Rest day active. Midday checks suppressed; take your recovery seriously."
        : "Rest day concluded. Returning to standard operational accountability.";
      setDialogue(msg);
      setMood(nextState ? 'CONCERNED' : 'FOCUSED');
      setExpression(nextState ? 'concerned' : 'focused');
      triggerSpeak(msg);
    } catch (e) {
      console.warn('Failed to toggle rest day:', e);
    }
  };

  // Mute 2h
  const handleMute2h = async () => {
    const until = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    setMutedUntil(until);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proactivity: {
            muted_until: until,
          },
        }),
      });
      const msg = "Proactive voice alerts muted for the next 2 hours.";
      setDialogue(msg);
      triggerSpeak(msg);
    } catch (e) {
      console.warn('Failed to mute:', e);
    }
  };

  // Complete a task
  const handleCompleteTask = async (taskId: string) => {
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: 'completed' }),
      });
      loadData();
    } catch (e) {
      console.warn('Failed to complete task:', e);
    }
  };

  // Computed metrics
  const workHours = stats ? Math.floor(stats.work_min / 60) : 3;
  const workMinutes = stats ? stats.work_min % 60 : 45;
  const leisureMin = stats ? stats.leisure_min : 42;
  const totalActive = stats ? stats.active_min : 267;
  const leisurePct = totalActive > 0 ? Math.round((leisureMin / totalActive) * 100) : 11;
  const commitsCount = stats?.commits ?? 4;
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const recentWin = completedTasks.length > 0 ? completedTasks[0].title : 'Complete Sofia visual and persona build';
  const totalOutputs = commitsCount + completedTasks.length;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#070105] text-[#fff1f2] flex flex-col justify-between selection:bg-rose-500/30 selection:text-white">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#1c0412_0%,#090106_65%,#050004_100%)] pointer-events-none" />

      {/* TOP BAR */}
      <header className="relative z-20 flex items-center justify-between px-8 py-4 border-b border-rose-500/15 backdrop-blur-md bg-[#0a0207]/40">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_#f43f5e]" />
          <span className="font-mono text-sm tracking-[0.25em] font-bold text-rose-100">SOFIA</span>
          <span className="text-[11px] font-mono tracking-widest text-rose-400/60 uppercase">v2.0 CONSOLE</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs font-mono text-rose-200/80">
            <Flame className="w-4 h-4 text-rose-400" />
            <span>Streak: <strong className="text-white">14d</strong></span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-rose-300/70">
            <BellOff className="w-3.5 h-3.5" />
            <span>Muted: {mutedUntil && new Date(mutedUntil) > new Date() ? 'Active (2h)' : 'Off'}</span>
          </div>

          <button
            onClick={handleToggleRestDay}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-all flex items-center gap-1.5 border ${
              restDay
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                : 'bg-rose-950/30 border-rose-500/25 text-rose-300 hover:border-rose-400/50'
            }`}
          >
            <Moon className="w-3 h-3" />
            <span>Rest: {restDay ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </header>

      {/* 3-COLUMN SCREEN ECONOMY */}
      <div className="relative z-10 flex-1 flex items-stretch justify-between px-8 py-4 gap-6 overflow-hidden">
        
        {/* LEFT RAIL: THE BODY */}
        <aside className="w-72 lg:w-80 flex flex-col justify-between py-2 pointer-events-auto">
          <div className="space-y-6">
            <div>
              <p className="text-[10px] uppercase font-mono tracking-[0.25em] text-rose-400/70 mb-1">THE BODY</p>
              <h2 className="text-sm font-semibold tracking-wide text-rose-100">Biometric & Focus Inputs</h2>
            </div>

            {/* Sleep Last Night */}
            <div className="glass-panel-subtle rounded-xl p-4 space-y-2 border border-rose-500/20">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-rose-300/80">Sleep Last Night</span>
                <span className="text-base font-mono font-bold text-white">9h 34m</span>
              </div>
              <div className="text-[11px] font-mono text-rose-400/70 space-y-0.5">
                <p>7d avg: 8h 12m</p>
                <p>Deep: 1h 45m • REM: 2h 10m</p>
                <p>Wake: {stats?.woke_at || '08:34'}</p>
              </div>
            </div>

            {/* Focus Time */}
            <div className="glass-panel-subtle rounded-xl p-4 space-y-2.5 border border-rose-500/20">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-rose-300/80">Focus Time</span>
                <span className="text-base font-mono font-bold text-white">{workHours}h {workMinutes}m</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-rose-950/60 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-rose-600 to-rose-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round(((workHours * 60 + workMinutes) / 300) * 100))}%` }}
                />
              </div>
              <div className="text-[11px] font-mono text-rose-400/70 flex justify-between">
                <span>Target: 5h 00m</span>
                <span>Leisure: {leisureMin}m ({leisurePct}%)</span>
              </div>
            </div>

            {/* Next Consequence */}
            <div className="glass-panel-subtle rounded-xl p-4 space-y-1 border border-rose-500/20">
              <span className="text-xs text-rose-300/80">Next Consequence Tier</span>
              <p className="text-sm font-mono font-semibold text-rose-200">Rung 2: Friction</p>
              <p className="text-[11px] font-mono text-rose-400/60">Threshold: 4h idle / off-target</p>
            </div>
          </div>

          {/* Bottom Left: Day Score Numeral */}
          <div className="pt-4">
            <span className="text-[10px] uppercase font-mono tracking-[0.25em] text-rose-400/70 block">DAY SCORE</span>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-mono font-bold tracking-tight text-white glow-text-burgundy">
                {score}
              </span>
              <span className="text-xs font-mono text-rose-400/60">/ 100</span>
            </div>
          </div>
        </aside>

        {/* CENTER STAGE: THE PRESENCE */}
        <section className="flex-1 max-w-2xl flex flex-col items-center justify-between py-2 text-center">
          {/* Mood Word */}
          <div className="animate-fade-in">
            <span className="text-xs font-mono tracking-[0.35em] uppercase text-rose-400/90 font-bold bg-rose-950/40 px-4 py-1 rounded-full border border-rose-500/20">
              {mood}
            </span>
          </div>

          {/* Large Sofia PNGTuber Avatar */}
          <div className="my-auto py-2">
            <SofiaAvatar
              expression={expression}
              isSpeaking={isSpeaking}
              score={score}
              size="xl"
              onClick={() => triggerSpeak(dialogue)}
            />
          </div>

          {/* Spoken Caption Line */}
          <div className="w-full max-w-xl my-3">
            <div className="glass-panel rounded-2xl px-6 py-4 border border-rose-500/25 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              <p className="text-base text-[#fbf5f7] font-medium leading-relaxed tracking-wide">
                &ldquo;{dialogue}&rdquo;
              </p>
            </div>
          </div>

          {/* Manual Controls & Input Dock */}
          <div className="w-full max-w-xl flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleListening}
                aria-label={isListening ? 'Stop listening' : 'Start voice input'}
                className={`px-5 py-2 rounded-full font-mono text-xs flex items-center gap-2 transition-all ${
                  isListening
                    ? 'bg-rose-600 text-white shadow-[0_0_20px_#e11d48] animate-pulse'
                    : 'glass-panel border border-rose-500/30 text-rose-100 hover:border-rose-400'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-rose-400" />}
                <span>{isListening ? 'LISTENING...' : 'MIC'}</span>
              </button>

              <button
                onClick={handleToggleRestDay}
                className="glass-panel px-4 py-2 rounded-full font-mono text-xs text-rose-200 border border-rose-500/30 hover:border-rose-400 transition-all"
              >
                Rest day
              </button>

              <button
                onClick={handleMute2h}
                className="glass-panel px-4 py-2 rounded-full font-mono text-xs text-rose-200 border border-rose-500/30 hover:border-rose-400 transition-all"
              >
                Mute 2h
              </button>
            </div>

            {/* Inline Ask Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt();
              }}
              className="w-full flex items-center gap-2 glass-panel rounded-full px-4 py-1.5 border border-rose-500/30 focus-within:border-rose-400 shadow-md"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask Sofia or dispatch command..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-rose-300/40 focus:outline-none font-sans"
              />
              <button
                type="submit"
                disabled={isThinking || !inputText.trim()}
                className="p-1.5 rounded-full text-rose-400 hover:text-white disabled:opacity-40 transition-colors"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </section>

        {/* RIGHT RAIL: THE OUTPUT */}
        <aside className="w-72 lg:w-80 flex flex-col justify-between py-2 pointer-events-auto text-right">
          <div className="space-y-6">
            <div>
              <p className="text-[10px] uppercase font-mono tracking-[0.25em] text-rose-400/70 mb-1">THE OUTPUT</p>
              <h2 className="text-sm font-semibold tracking-wide text-rose-100">Achievements & Debts</h2>
            </div>

            {/* GitHub Commits */}
            <div className="glass-panel-subtle rounded-xl p-4 space-y-1.5 border border-rose-500/20 text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs text-rose-300/80">
                <span>GitHub Commits</span>
                <GitCommit className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <p className="text-base font-mono font-bold text-white">{commitsCount} pushed today</p>
              <p className="text-[11px] font-mono text-rose-400/70">Streak: 12 days continuous</p>
            </div>

            {/* Tasks Completed */}
            <div className="glass-panel-subtle rounded-xl p-4 space-y-1.5 border border-rose-500/20 text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs text-rose-300/80">
                <span>Tasks Completed</span>
                <ListTodo className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <p className="text-base font-mono font-bold text-white">
                {completedTasks.length} of {tasks.length || 7} planned
              </p>
              <div className="w-full bg-rose-950/60 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-l from-rose-600 to-rose-400 h-1.5 rounded-full transition-all duration-500 ml-auto"
                  style={{ width: `${tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 70}%` }}
                />
              </div>
            </div>

            {/* Recent Win */}
            <div className="glass-panel-subtle rounded-xl p-4 space-y-1 border border-rose-500/20 text-right">
              <span className="text-xs text-rose-300/80">Recent Win</span>
              <p className="text-xs font-mono font-medium text-rose-200 line-clamp-2">
                &ldquo;{recentWin}&rdquo;
              </p>
            </div>

            {/* Pending Due Today */}
            <div className="glass-panel-subtle rounded-xl p-4 space-y-2 border border-rose-500/20 text-right">
              <span className="text-xs text-rose-300/80 block">Pending Due Today</span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {pendingTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleCompleteTask(task.id)}
                    className="w-full flex items-center justify-end gap-2 text-xs font-sans text-rose-300/90 hover:text-white transition-colors group"
                  >
                    <span className="truncate">{task.title}</span>
                    <Circle className="w-3.5 h-3.5 text-rose-500/60 group-hover:text-rose-400 shrink-0" />
                  </button>
                ))}
                {pendingTasks.length === 0 && (
                  <p className="text-[11px] font-mono text-rose-400/60">All queued tasks cleared</p>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Right: Outputs Count Numeral */}
          <div className="pt-4 text-right">
            <span className="text-[10px] uppercase font-mono tracking-[0.25em] text-rose-400/70 block">OUTPUTS TODAY</span>
            <div className="flex items-baseline justify-end gap-2">
              <span className="text-6xl font-mono font-bold tracking-tight text-white glow-text-burgundy">
                {totalOutputs}
              </span>
              <span className="text-xs font-mono text-rose-400/60">units</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
