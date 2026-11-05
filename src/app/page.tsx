'use client';

import React, { useState, useEffect } from 'react';
import { SofiaAvatar } from '@/components/SofiaAvatar';
import { CaptionLine } from '@/components/CaptionLine';
import { ScoreRing } from '@/components/ScoreRing';
import { CategoryBars } from '@/components/CategoryBars';
import { DayScore, DayStats, SofiaExpression } from '@/lib/types';
import {
  Clock,
  Code,
  Flame,
  Zap,
  Play,
  RotateCcw,
  Sparkles,
  AlertCircle,
  MessageSquare,
  Monitor,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const [stats, setStats] = useState<DayStats | null>(null);
  const [scoreData, setScoreData] = useState<DayScore | null>(null);
  const [currentExpression, setCurrentExpression] = useState<SofiaExpression>('focused');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [caption, setCaption] = useState(
    'Desk, now. You have 5 hours of focus to hit and we both know you are not there yet.'
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [resStats, resScore] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/score'),
      ]);

      if (resStats.ok) {
        const dataStats = await resStats.json();
        setStats(dataStats);
      }
      if (resScore.ok) {
        const dataScore = await resScore.json();
        setScoreData(dataScore);
        if (dataScore.verdict?.text) {
          setCaption(dataScore.verdict.text);
        }
        if (dataScore.score >= 8.5) setCurrentExpression('pleased');
        else if (dataScore.score >= 7.0) setCurrentExpression('focused');
        else if (dataScore.score >= 5.0) setCurrentExpression('stern');
        else setCurrentExpression('disappointed');
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Listen to live SSE updates
    const eventSource = new EventSource('/api/stream');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.stats) setStats(data.stats);
        if (data.score) setScoreData(data.score);
      } catch {
        // ignore
      }
    };

    return () => eventSource.close();
  }, []);

  const handleSimulateActivity = async (category: 'work' | 'leisure', app: string, durationMin: number) => {
    try {
      await fetch('/api/ingest/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'activitywatch',
          kind: 'window',
          category,
          app,
          title: `Simulated ${app} session`,
          duration_s: durationMin * 60,
        }),
      });

      // Refresh data
      await fetchDashboardData();

      // Update Sofia's dialogue and mood based on event
      if (category === 'work') {
        setCurrentExpression('pleased');
        setCaption(`Logged ${durationMin}m on ${app}. Steady progress, keep the momentum.`);
      } else {
        setCurrentExpression('stern');
        setCaption(`Caught you on ${app} for ${durationMin}m. Watch your leisure ratio; it drops your score fast.`);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    }
  };

  const speakLineAloud = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(caption);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    // Pick female English voice if available
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Female') || v.name.includes('Jenny') || v.name.includes('Samantha') || v.name.includes('Google UK English Female'))
    );
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const expressionsList: SofiaExpression[] = [
    'neutral',
    'pleased',
    'amused',
    'disappointed',
    'concerned',
    'focused',
    'sleepy',
    'stern',
  ];

  const focusHours = stats ? (stats.work_min / 60).toFixed(1) : '3.8';
  const leisurePct = stats && stats.active_min > 0 ? Math.round((stats.leisure_min / stats.active_min) * 100) : 18;

  return (
    <div className="space-y-8 pb-10">
      {/* Top Banner Alert / Status */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 rounded-2xl glass-panel-subtle border border-rose-500/20 text-xs">
        <div className="flex items-center space-x-2.5 text-rose-200">
          <Sparkles className="w-4 h-4 text-rose-400 animate-spin" />
          <span>
            Sofia Chief of Staff active &middot; Ambient PC Activity Syncing &middot; Hermes API Connected
          </span>
        </div>
        <div className="flex items-center space-x-3 mt-2 sm:mt-0 font-mono">
          <span className="text-emerald-400 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>PC Telemetry 95%</span>
          </span>
          <span className="text-rose-300/60">|</span>
          <span className="text-rose-300">Target Wake: 07:30</span>
        </div>
      </div>

      {/* Main 3-Column Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Key Accountability Stats */}
        <div className="lg:col-span-3 space-y-4 order-2 lg:order-1">
          {/* Stat 1: Focus Hours */}
          <div className="glass-card p-4 rounded-2xl border border-rose-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs text-rose-300/70 font-mono uppercase">
              <span>Focus Hours</span>
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-white glow-text-burgundy">
                {focusHours}h
              </span>
              <span className="text-xs font-mono text-rose-300/60">/ 5.0h target</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-rose-950/60 overflow-hidden">
              <div
                style={{ width: `${Math.min(100, (Number(focusHours) / 5.0) * 100)}%` }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
          </div>

          {/* Stat 2: Code Output & Commits */}
          <div className="glass-card p-4 rounded-2xl border border-rose-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs text-rose-300/70 font-mono uppercase">
              <span>Code Commits</span>
              <Code className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-white glow-text-burgundy">
                {stats?.commits ?? 7}
              </span>
              <span className="text-xs font-mono text-rose-300/60">commits shipped</span>
            </div>
            <div className="text-[11px] text-rose-300/60 font-mono">
              + 3 completed tasks today
            </div>
          </div>

          {/* Stat 3: Wake & Sleep Rhythm */}
          <div className="glass-card p-4 rounded-2xl border border-rose-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs text-rose-300/70 font-mono uppercase">
              <span>Wake Time</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-white">
                {stats?.woke_at || '07:45'}
              </span>
              <span className="text-xs font-mono text-amber-300/80">+15m from goal</span>
            </div>
            <div className="text-[11px] text-rose-300/60 font-mono">
              Bedtime: 23:15 (7.5h sleep logged)
            </div>
          </div>

          {/* Stat 4: Leisure Share */}
          <div className="glass-card p-4 rounded-2xl border border-rose-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs text-rose-300/70 font-mono uppercase">
              <span>Leisure Ratio</span>
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold font-mono text-white">
                {leisurePct}%
              </span>
              <span className="text-xs font-mono text-rose-300/60">&le; 20% limit</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-rose-950/60 overflow-hidden">
              <div
                style={{ width: `${Math.min(100, (leisurePct / 50) * 100)}%` }}
                className={`h-full rounded-full ${leisurePct > 20 ? 'bg-rose-500' : 'bg-emerald-500'}`}
              />
            </div>
          </div>
        </div>

        {/* Center Column: Animated Sofia Avatar + Dialogue Line + Expression Switcher */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-5 order-1 lg:order-2">
          {/* Animated Sofia Character */}
          <div className="py-2">
            <SofiaAvatar
              expression={currentExpression}
              isSpeaking={isSpeaking}
              score={scoreData?.score ?? 7.5}
              size="xl"
              onClick={speakLineAloud}
            />
          </div>

          {/* Dialogue Caption Line with Typewriter & Voice Playback */}
          <CaptionLine
            text={caption}
            isSpeaking={isSpeaking}
            onReplayAudio={speakLineAloud}
          />

          {/* Expression Quick Tester Pills */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-lg pt-1">
            <span className="text-[10px] font-mono text-rose-400/60 uppercase tracking-widest mr-1">
              Expression:
            </span>
            {expressionsList.map((expr) => (
              <button
                key={expr}
                onClick={() => {
                  setCurrentExpression(expr);
                  if (expr === 'stern') setCaption("Score is a 4. 38 percent leisure, one commit. Tomorrow starts at 7:30, not 11.");
                  else if (expr === 'pleased') setCaption("Eight commits and under 20 percent leisure. That's a nine. Well done.");
                  else if (expr === 'amused') setCaption("Did you really think watching three tutorials counts as 2 hours of coding? Nice try.");
                  else if (expr === 'concerned') setCaption("You've been at the desk for 5 straight hours. Water, then 10 minutes away from the screen.");
                  else if (expr === 'focused') setCaption("Since 9: 3 hours in VS Code, 2 commits. Keep this rhythm and we will hit ten.");
                  else if (expr === 'sleepy') setCaption("It is 23:40. Wrap up the last branch and disconnect. Sleep is scored too.");
                  else if (expr === 'disappointed') setCaption("You woke at 12:04. Half the day is gone and we both know it.");
                  else setCaption("6:44. You beat my alarm. Don't let it go to your head. Desk, now.");
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-all ${
                  currentExpression === expr
                    ? 'bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.5)] scale-105'
                    : 'bg-rose-950/40 text-rose-300/70 hover:bg-rose-900/40 hover:text-rose-200 border border-rose-500/20'
                }`}
              >
                {expr}
              </button>
            ))}
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <Link
              href="/chat"
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 text-white font-medium text-sm shadow-[0_0_20px_rgba(225,29,72,0.4)] transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Talk to Sofia</span>
            </Link>

            <Link
              href="/computer-use"
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900/80 text-rose-200 border border-rose-500/30 text-sm font-medium transition-all"
            >
              <Monitor className="w-4 h-4 text-rose-400" />
              <span>Hermes Computer Use</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Activity Classification + Score Ring + Simulators */}
        <div className="lg:col-span-3 space-y-4 order-3">
          {/* Daily Score Ring */}
          <ScoreRing
            score={scoreData?.score ?? 7.5}
            components={scoreData?.components}
            streakDays={scoreData?.verdict?.streak_days ?? 3}
            size={160}
          />

          {/* Activity Classification Bars */}
          <CategoryBars
            workMin={stats?.work_min ?? 228}
            leisureMin={stats?.leisure_min ?? 50}
            neutralMin={stats?.neutral_min ?? 42}
          />

          {/* Quick Simulation Controls for Testing Ingestion */}
          <div className="glass-card p-4 rounded-2xl border border-rose-500/20 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-rose-300/80">
              <span>Telemetry Ingestion</span>
              <span className="text-[10px] text-emerald-400">Agent Live</span>
            </div>
            <p className="text-[11px] text-rose-300/60 leading-normal">
              Test PC agent events locally without waiting for real desktop watcher ticks:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleSimulateActivity('work', 'VS Code', 30)}
                className="flex items-center justify-center space-x-1.5 p-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 text-xs font-mono transition-all"
              >
                <span>+30m Code</span>
              </button>
              <button
                onClick={() => handleSimulateActivity('leisure', 'YouTube', 20)}
                className="flex items-center justify-center space-x-1.5 p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 text-xs font-mono transition-all"
              >
                <span>+20m YouTube</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
