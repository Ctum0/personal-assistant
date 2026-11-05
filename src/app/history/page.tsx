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
      {/* Header with H1 */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <TrendingUp className="w-6 h-6 text-rose-400" aria-hidden="true" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              Trends & History
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-200">
            Accountability Trends &middot; Daily Scores &middot; Multi-Day Consistency Matrix
          </p>
        </div>

        <div className="flex items-center space-x-4 font-mono text-xs">
          <div className="px-3.5 py-2 rounded-xl bg-rose-950/70 border border-rose-500/30 text-rose-200 min-h-[44px] flex items-center">
            <span>Average:&nbsp;</span>
            <span className="font-bold text-white text-sm">{averageScore} / 10</span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-rose-950/70 border border-rose-500/30 text-rose-200 flex items-center space-x-1.5 min-h-[44px]">
            <Flame className="w-4 h-4 text-rose-400 fill-rose-500/50" aria-hidden="true" />
            <span className="font-bold text-rose-100">3 Day Streak</span>
          </div>
        </div>
      </div>

      {/* Score Trend Bars / Graph */}
      <section aria-labelledby="trajectory-heading" className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-4">
        <h2 id="trajectory-heading" className="text-sm font-mono uppercase tracking-wider text-rose-200 flex items-center space-x-2 font-semibold">
          <Award className="w-4 h-4 text-rose-400" aria-hidden="true" />
          <span>Daily Score Trajectory (Past 14 Days)</span>
        </h2>

        <div className="h-60 w-full flex items-end justify-between gap-2 pt-6 pb-2 border-b border-rose-500/20" role="region" aria-label="14-day daily score chart">
          {history.map((day) => {
            const heightPct = Math.round((day.score / 10) * 100);
            const isHigh = day.score >= 8.0;
            const isMid = day.score >= 6.0 && day.score < 8.0;

            return (
              <div
                key={day.date}
                className="flex-1 flex flex-col items-center justify-end h-full group"
                role="img"
                aria-label={`Date: ${day.date}, Score: ${day.score.toFixed(1)} out of 10`}
              >
                {/* Score Number tooltip */}
                <span className="text-xs font-mono font-bold text-rose-100 opacity-0 group-hover:opacity-100 transition-opacity mb-1" aria-hidden="true">
                  {day.score.toFixed(1)}
                </span>
                {/* Bar */}
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full max-w-[56px] rounded-t-lg transition-all duration-500 ${
                    isHigh
                      ? 'bg-gradient-to-t from-rose-700 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                      : isMid
                      ? 'bg-gradient-to-t from-rose-900 to-rose-600'
                      : 'bg-gradient-to-t from-red-950 to-red-800'
                  }`}
                />
                {/* Date label */}
                <span className="text-[10px] font-mono text-rose-300 mt-2 truncate w-full text-center font-medium">
                  {day.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-mono text-rose-200 pt-1 gap-2">
          <span>Target baseline: 8.0/10 for consequence waiver</span>
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-rose-400" aria-hidden="true" />
              <span>&ge; 8.0 Great</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-rose-600" aria-hidden="true" />
              <span>6.0 - 7.9 Normal</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-red-800" aria-hidden="true" />
              <span>&lt; 6.0 Strict</span>
            </span>
          </div>
        </div>
      </section>

      {/* Daily Score Breakdown Cards */}
      <section aria-labelledby="history-logs-heading" className="space-y-4">
        <h2 id="history-logs-heading" className="text-sm font-mono uppercase tracking-wider text-rose-200 flex items-center space-x-2 font-semibold">
          <Calendar className="w-4 h-4 text-rose-400" aria-hidden="true" />
          <span>Daily Verdicts & Accountability Logs</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {history.map((day) => (
            <div
              key={day.date}
              className="glass-card p-5 rounded-2xl border border-rose-500/25 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-rose-500/20 pb-2">
                <span className="text-xs font-mono text-rose-300 font-bold">{day.date}</span>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-full font-bold ${
                    day.score >= 8.0
                      ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300'
                      : day.score >= 6.0
                      ? 'bg-amber-950/70 border border-amber-500/40 text-amber-300'
                      : 'bg-red-950/70 border border-red-500/40 text-red-300'
                  }`}
                >
                  Score: {day.score.toFixed(1)} / 10
                </span>
              </div>

              <p className="text-xs text-rose-100 font-sans italic leading-relaxed">
                &ldquo;{day.verdict?.text || 'Day evaluated by Sofia.'}&rdquo;
              </p>

              {day.verdict && (
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono pt-1 text-rose-300">
                  <div>Focus: {(day.verdict.focus_hours ?? 0).toFixed(1)}h</div>
                  <div>Commits: {day.verdict.commits ?? 0}</div>
                  <div>Wake: {day.verdict.woke_at || '07:30'}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
