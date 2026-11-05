'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, Award, Flame, CheckCircle2 } from 'lucide-react';
import { DayScore } from '@/lib/types';

export default function HistoryPage() {
  const [history, setHistory] = useState<DayScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/score?history=14');
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const averageScore =
    history.length > 0
      ? (history.reduce((acc, h) => acc + h.score, 0) / history.length).toFixed(1)
      : '7.8';

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <TrendingUp className="w-6 h-6 text-rose-400" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              Trends & History
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-300/70">
            Accountability Trends &middot; Daily Scores &middot; Multi-Day Consistency Matrix
          </p>
        </div>

        <div className="flex items-center space-x-4 font-mono text-xs">
          <div className="px-3.5 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/25 text-rose-200">
            <span>Average: </span>
            <span className="font-bold text-white text-sm">{averageScore} / 10</span>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/25 text-rose-200 flex items-center space-x-1.5">
            <Flame className="w-3.5 h-3.5 text-rose-400 fill-rose-500/50" />
            <span>3 Day Streak</span>
          </div>
        </div>
      </div>

      {/* Score Trend Bars / Graph */}
      <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-rose-200 flex items-center space-x-2">
          <Award className="w-4 h-4 text-rose-400" />
          <span>Daily Score Trajectory (Past 14 Days)</span>
        </h3>

        <div className="h-60 w-full flex items-end justify-between gap-2 pt-6 pb-2 border-b border-rose-500/15">
          {history.map((day) => {
            const heightPct = Math.round((day.score / 10) * 100);
            const isHigh = day.score >= 8.0;
            const isMid = day.score >= 6.0 && day.score < 8.0;

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full group">
                {/* Score Number tooltip */}
                <span className="text-[10px] font-mono font-bold text-rose-200 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                  {day.score.toFixed(1)}
                </span>
                {/* Bar */}
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full max-w-[28px] rounded-t-lg transition-all duration-500 ${
                    isHigh
                      ? 'bg-gradient-to-t from-rose-700 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                      : isMid
                      ? 'bg-gradient-to-t from-rose-900 to-rose-600'
                      : 'bg-gradient-to-t from-red-950 to-red-800'
                  }`}
                />
                {/* Date label */}
                <span className="text-[9px] font-mono text-rose-400/60 mt-2 truncate w-full text-center">
                  {day.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-rose-300/70 pt-1">
          <span>Target baseline: 8.0/10 for consequence waiver</span>
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded bg-rose-400" />
              <span>&ge; 8.0 Great</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded bg-rose-600" />
              <span>6.0 - 7.9 Normal</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded bg-red-900" />
              <span>&lt; 6.0 Warning</span>
            </span>
          </div>
        </div>
      </div>

      {/* Recaps Table */}
      <div className="glass-panel p-6 rounded-3xl border border-rose-500/20 space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-rose-200 flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-rose-400" />
          <span>Daily Verdicts & Facts Log</span>
        </h3>

        <div className="space-y-3">
          {history.map((day) => (
            <div
              key={day.date}
              className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center space-x-2 font-mono">
                  <span className="text-rose-100 font-bold">{day.date}</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-900/60 border border-rose-500/30 text-rose-300 text-[10px]">
                    Score: {day.score.toFixed(1)}/10
                  </span>
                  <span className="text-rose-400/60">&middot; {day.status}</span>
                </div>
                <p className="text-rose-200/90 leading-relaxed font-sans italic">
                  &ldquo;{day.verdict?.text || 'Standard day record.'}&rdquo;
                </p>
              </div>

              <div className="flex items-center space-x-3 font-mono text-[11px] text-rose-300/80 shrink-0">
                <span>Focus: {day.verdict?.focus_hours ?? 3.8}h</span>
                <span>Commits: {day.verdict?.commits ?? 5}</span>
                <span>Leisure: {day.verdict?.leisure_pct ?? 18}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
