'use client';

import React, { useState, useEffect } from 'react';
import { SofiaAvatar } from '@/components/SofiaAvatar';
import { VoiceDock } from '@/components/VoiceDock';
import { SofiaPanel } from '@/components/SofiaPanel';
import { SofiaExpression, TaskItem, DayStats } from '@/lib/types';
import { getExpressionFromMood } from '@/lib/expressions';
import { speakSofia, stopSpeaking, unlockAudio } from '@/lib/voice';
import { Send, Moon, BellOff, Flame, BarChart3, Database, CheckCircle2, Clock, GitCommit } from 'lucide-react';

export default function SofiaDynamicJarvisStage() {
  const [stats, setStats] = useState<DayStats | null>(null);
  const [score, setScore] = useState<number>(85);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [mood, setMood] = useState<string>('ATTENTIVE');
  const [expression, setExpression] = useState<SofiaExpression>('focused');
  const [dialogue, setDialogue] = useState<string>(
    "I am Sofia. Hermes AI engine online, voice link active. Speak to me or dispatch an action."
  );
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [restDay, setRestDay] = useState<boolean>(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);

  // Dynamic Side Panels (empty by default)
  const [leftPanel, setLeftPanel] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const [rightPanel, setRightPanel] = useState<{ title: string; content: React.ReactNode } | null>(null);

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

  // Unlock audio context on first interaction
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

  // Render Tool Call Results in Sliding Side Panels
  const handleToolResults = (toolCalls: any[]) => {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return;

    for (const call of toolCalls) {
      const { name, result } = call;

      // Telemetry / stats / timeline tools trigger LEFT panel
      if (name === 'get_stats' || name === 'get_timeline') {
        setLeftPanel({
          title: name === 'get_stats' ? 'TELEMETRY STATS' : 'TIMELINE LOG',
          content: (
            <div className="space-y-4">
              <div className="glass-panel-subtle p-4 rounded-xl border border-rose-500/20 space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-rose-300">Work Logged</span>
                  <span className="text-base font-mono font-bold text-white">
                    {result?.stats?.work_min ?? stats?.work_min ?? 0}m
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-rose-300">Leisure</span>
                  <span className="text-base font-mono font-bold text-rose-300">
                    {result?.stats?.leisure_min ?? stats?.leisure_min ?? 0}m
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-rose-300">Commits</span>
                  <span className="text-base font-mono font-bold text-white">
                    {result?.stats?.commits ?? stats?.commits ?? 0}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-rose-300">Wake Time</span>
                  <span className="text-sm font-mono text-rose-200">
                    {result?.stats?.woke_at ?? stats?.woke_at ?? '07:30'}
                  </span>
                </div>
              </div>
              {result?.timeline && (
                <div className="space-y-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-rose-400">Events</span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs font-mono">
                    {result.timeline.slice(0, 5).map((e: any, idx: number) => (
                      <div key={idx} className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/10 flex justify-between">
                        <span className="truncate max-w-[180px] text-white">{e.title || e.app}</span>
                        <span className="text-rose-400/80">{Math.round(e.duration_s / 60)}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
        });
      }

      // Memory, tasks, and web browsing tools trigger RIGHT panel
      if (name === 'search_memory' || name === 'list_tasks' || name === 'browse_web' || name === 'create_task') {
        setRightPanel({
          title: name === 'search_memory' ? 'MEMORY NOTES' : 'TASK QUEUE',
          content: (
            <div className="space-y-3">
              {name === 'search_memory' && Array.isArray(result?.notes) && (
                <div className="space-y-2">
                  {result.notes.map((n: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/20 text-xs">
                      <p className="text-white font-medium mb-1">&ldquo;{n.text}&rdquo;</p>
                      {n.tags && <span className="text-[10px] font-mono text-rose-400">{n.tags}</span>}
                    </div>
                  ))}
                </div>
              )}

              {(name === 'list_tasks' || name === 'create_task') && (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/20 flex items-center justify-between text-xs">
                      <span className={`truncate max-w-[200px] ${t.status === 'completed' ? 'line-through text-rose-400/50' : 'text-white'}`}>
                        {t.title}
                      </span>
                      <span className="text-[10px] font-mono text-rose-300/70">{t.est_min}m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        });
      }
    }
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
        setMood(data.mood.toUpperCase());
        setExpression(getExpressionFromMood(data.mood));
      }

      if (data.toolCalls) {
        handleToolResults(data.toolCalls);
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

  // Manual panel inspection triggers
  const toggleStatsPanel = () => {
    if (leftPanel) {
      setLeftPanel(null);
    } else {
      setLeftPanel({
        title: 'TELEMETRY & STATS',
        content: (
          <div className="space-y-4">
            <div className="glass-panel-subtle p-4 rounded-xl border border-rose-500/20 space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-rose-300">Focus Hours Logged</span>
                <span className="text-base font-mono font-bold text-white">
                  {stats ? `${Math.floor(stats.work_min / 60)}h ${stats.work_min % 60}m` : '3h 45m'}
                </span>
              </div>
              <div className="w-full bg-rose-950/60 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-rose-600 to-rose-400 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, Math.round(((stats?.work_min || 225) / 300) * 100))}%` }}
                />
              </div>
              <div className="text-[11px] font-mono text-rose-400/80 flex justify-between">
                <span>Target: 5h 00m</span>
                <span>Leisure: {stats?.leisure_min || 42}m</span>
              </div>
            </div>

            <div className="glass-panel-subtle p-4 rounded-xl border border-rose-500/20 space-y-1">
              <span className="text-xs text-rose-300">GitHub Commits</span>
              <p className="text-base font-mono font-bold text-white">{stats?.commits || 4} pushed today</p>
              <p className="text-[11px] font-mono text-rose-400/70">12 days continuous streak</p>
            </div>
          </div>
        ),
      });
    }
  };

  const toggleMemoryPanel = () => {
    if (rightPanel) {
      setRightPanel(null);
    } else {
      setRightPanel({
        title: 'TASKS & AGENDA',
        content: (
          <div className="space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-rose-400 block">Active Tasks</span>
            <div className="space-y-2">
              {tasks.slice(0, 5).map((t) => (
                <div key={t.id} className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/20 flex items-center justify-between text-xs">
                  <span className={`truncate max-w-[200px] ${t.status === 'completed' ? 'line-through text-rose-400/50' : 'text-white'}`}>
                    {t.title}
                  </span>
                  <span className="text-[10px] font-mono text-rose-300/70">{t.est_min}m</span>
                </div>
              ))}
            </div>
          </div>
        ),
      });
    }
  };

  const hasPanelsOpen = leftPanel !== null || rightPanel !== null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#070105] text-[#fff1f2] flex flex-col justify-between selection:bg-rose-500/30 selection:text-white">
      {/* Ambient Dark Burgundy Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#1c0412_0%,#090106_65%,#050004_100%)] pointer-events-none" />

      {/* TOP STATUS BAR */}
      <header className="relative z-20 flex items-center justify-between px-8 py-3.5 border-b border-rose-500/15 backdrop-blur-md bg-[#0a0207]/40">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_#f43f5e]" />
          <span className="font-mono text-sm tracking-[0.25em] font-bold text-rose-100">SOFIA</span>
          <span className="text-[11px] font-mono tracking-widest text-rose-400/60 uppercase">JARVIS ENGINE</span>
        </div>

        <div className="flex items-center gap-5">
          <button
            onClick={toggleStatsPanel}
            aria-label="Toggle telemetry panel"
            className="flex items-center gap-1.5 text-xs font-mono text-rose-300/80 hover:text-white px-2.5 py-1 rounded-lg hover:bg-rose-950/40 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-rose-400" />
            <span>Telemetry</span>
          </button>

          <button
            onClick={toggleMemoryPanel}
            aria-label="Toggle tasks panel"
            className="flex items-center gap-1.5 text-xs font-mono text-rose-300/80 hover:text-white px-2.5 py-1 rounded-lg hover:bg-rose-950/40 transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-rose-400" />
            <span>Tasks</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono text-rose-200/80">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Streak: <strong className="text-white">14d</strong></span>
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

      {/* DYNAMIC VIEWPORT STAGE */}
      <div className="relative z-10 flex-1 flex items-center justify-between px-8 py-2 overflow-hidden gap-6">
        
        {/* Dynamic Sliding LEFT Panel */}
        {leftPanel && (
          <SofiaPanel
            side="left"
            title={leftPanel.title}
            onClose={() => setLeftPanel(null)}
            content={leftPanel.content}
          />
        )}

        {/* CENTER STAGE: SOFIA PRESENCE */}
        <div
          className={`flex-1 flex flex-col items-center justify-center my-auto transition-all duration-500 ease-out text-center ${
            hasPanelsOpen ? 'scale-90 max-w-xl' : 'scale-100 max-w-2xl'
          }`}
        >
          {/* Mood Word Pill */}
          <div className="mb-2">
            <span className="text-xs font-mono tracking-[0.35em] uppercase text-rose-400/90 font-bold bg-rose-950/50 px-4 py-1 rounded-full border border-rose-500/25 backdrop-blur-md">
              {mood}
            </span>
          </div>

          {/* Large Sofia Avatar in Center */}
          <div className="my-1">
            <SofiaAvatar
              expression={expression}
              isSpeaking={isSpeaking}
              score={score}
              size="xl"
              onClick={() => triggerSpeak(dialogue)}
            />
          </div>

          {/* Spoken Caption Line */}
          <div className="w-full max-w-xl mt-2">
            <div className="glass-panel rounded-2xl px-6 py-3.5 border border-rose-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
              <p className="text-base text-[#fbf5f7] font-medium leading-relaxed tracking-wide">
                &ldquo;{dialogue}&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Sliding RIGHT Panel */}
        {rightPanel && (
          <SofiaPanel
            side="right"
            title={rightPanel.title}
            onClose={() => setRightPanel(null)}
            content={rightPanel.content}
          />
        )}
      </div>

      {/* BOTTOM UNIFIED DOCK: VOICEDOCK + TEXT INPUT */}
      <footer className="relative z-20 px-8 pb-5 pt-1 max-w-3xl w-full mx-auto flex flex-col gap-2.5">
        {/* Unified VoiceDock */}
        <VoiceDock
          onTranscript={(text) => handleSendPrompt(text)}
          isSpeaking={isSpeaking}
          onStopSpeaking={handleInterrupt}
        />

        {/* Unified Text Input Pill */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendPrompt();
          }}
          className="w-full flex items-center gap-2 glass-panel rounded-full px-4 py-1.5 border border-rose-500/30 focus-within:border-rose-400 shadow-md backdrop-blur-md"
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
            aria-label="Send command"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>
    </main>
  );
}
