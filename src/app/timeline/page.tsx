'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Plus, Layers, Tv, Briefcase, RefreshCw } from 'lucide-react';

export default function TimelinePage() {
  const [timeline, setTimeline] = useState<Array<{ hour: number; work: number; leisure: number; neutral: number; apps: Record<string, number> }>>([]);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form for manual event
  const [appInput, setAppInput] = useState('');
  const [catInput, setCatInput] = useState<'work' | 'leisure' | 'neutral'>('work');
  const [durationInput, setDurationInput] = useState(30);

  const fetchTimeline = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/timeline');
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, []);

  const handleAddManualEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appInput.trim()) return;

    try {
      await fetch('/api/ingest/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          kind: 'manual',
          category: catInput,
          app: appInput.trim(),
          title: `Manual log: ${appInput}`,
          duration_s: durationInput * 60,
        }),
      });

      setAppInput('');
      await fetchTimeline();
    } catch (err) {
      console.error('Failed to add manual event:', err);
    }
  };

  const selectedData = selectedHour !== null ? timeline.find((t) => t.hour === selectedHour) : null;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <Clock className="w-6 h-6 text-rose-400" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              Activity Timeline
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-300/70">
            Hour-by-Hour Activity Breakdown &middot; Application Tracking &middot; Telemetry Audit
          </p>
        </div>

        <button
          onClick={fetchTimeline}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-rose-200 text-xs font-mono transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 24-Hour Stacked Bar Grid */}
      <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-4">
        <div className="flex items-center justify-between border-b border-rose-500/15 pb-3">
          <div className="flex items-center space-x-4 text-xs font-mono">
            <span className="flex items-center space-x-1.5 text-emerald-300">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
              <span>Work</span>
            </span>
            <span className="flex items-center space-x-1.5 text-rose-300">
              <span className="w-2.5 h-2.5 rounded bg-rose-500" />
              <span>Leisure</span>
            </span>
            <span className="flex items-center space-x-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded bg-slate-400" />
              <span>Neutral</span>
            </span>
          </div>
          <span className="text-xs font-mono text-rose-400/60">Click any hour bar to inspect apps</span>
        </div>

        {/* 24 Hour Bars */}
        <div className="grid grid-cols-12 md:grid-cols-24 gap-1.5 items-end h-48 pt-4">
          {timeline.map((item) => {
            const total = item.work + item.leisure + item.neutral;
            const heightPct = Math.min(100, Math.round((total / 60) * 100));
            const isSelected = selectedHour === item.hour;

            return (
              <div
                key={item.hour}
                onClick={() => setSelectedHour(item.hour)}
                className={`flex flex-col items-center justify-end h-full cursor-pointer group transition-all ${
                  isSelected ? 'scale-105' : ''
                }`}
              >
                {/* Stacked bar container */}
                <div
                  className={`w-full max-w-[20px] rounded-t-md overflow-hidden flex flex-col justify-end transition-all ${
                    isSelected ? 'ring-2 ring-rose-400' : 'hover:brightness-125'
                  }`}
                  style={{ height: `${Math.max(6, heightPct)}%` }}
                >
                  {/* Neutral segment */}
                  {item.neutral > 0 && (
                    <div
                      style={{ height: `${(item.neutral / (total || 1)) * 100}%` }}
                      className="w-full bg-slate-500"
                      title={`Neutral: ${item.neutral}m`}
                    />
                  )}
                  {/* Leisure segment */}
                  {item.leisure > 0 && (
                    <div
                      style={{ height: `${(item.leisure / (total || 1)) * 100}%` }}
                      className="w-full bg-rose-500"
                      title={`Leisure: ${item.leisure}m`}
                    />
                  )}
                  {/* Work segment */}
                  {item.work > 0 && (
                    <div
                      style={{ height: `${(item.work / (total || 1)) * 100}%` }}
                      className="w-full bg-emerald-500"
                      title={`Work: ${item.work}m`}
                    />
                  )}
                </div>

                {/* Hour Label */}
                <span className="text-[10px] font-mono text-rose-400/60 mt-1.5">
                  {String(item.hour).padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Hour Inspection Details */}
      {selectedData && (
        <div className="glass-panel p-6 rounded-3xl border border-rose-500/20 space-y-4">
          <div className="flex items-center justify-between border-b border-rose-500/15 pb-2.5">
            <h3 className="text-sm font-mono font-bold text-rose-100 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>
                Hour {String(selectedData.hour).padStart(2, '0')}:00 &ndash; {String(selectedData.hour).padStart(2, '0')}:59 Breakdown
              </span>
            </h3>
            <span className="text-xs font-mono text-rose-300">
              Total Active: {selectedData.work + selectedData.leisure + selectedData.neutral}m
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/20">
              <div className="text-xs font-mono text-emerald-400 uppercase">Work Time</div>
              <div className="text-2xl font-bold font-mono text-white mt-1">{selectedData.work}m</div>
            </div>
            <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-500/20">
              <div className="text-xs font-mono text-rose-400 uppercase">Leisure Time</div>
              <div className="text-2xl font-bold font-mono text-white mt-1">{selectedData.leisure}m</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900/40 border border-slate-500/20">
              <div className="text-xs font-mono text-slate-400 uppercase">Neutral Time</div>
              <div className="text-2xl font-bold font-mono text-white mt-1">{selectedData.neutral}m</div>
            </div>
          </div>

          {/* Apps Table */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-rose-300/80">
              Applications & Windows in this Hour
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(selectedData.apps).map(([app, min]) => (
                <div key={app} className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/15 text-xs font-mono">
                  <span className="text-rose-100 truncate mr-2">{app}</span>
                  <span className="text-rose-400 font-bold">{min}m</span>
                </div>
              ))}
              {Object.keys(selectedData.apps).length === 0 && (
                <p className="text-xs text-rose-300/50 italic col-span-3">No specific apps recorded in this hour.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Event Ingest Form */}
      <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-4">
        <h3 className="text-sm font-mono font-bold text-rose-100 flex items-center space-x-2">
          <Plus className="w-4 h-4 text-rose-400" />
          <span>Manual Event / Offline Activity Entry</span>
        </h3>
        <form onSubmit={handleAddManualEvent} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            value={appInput}
            onChange={(e) => setAppInput(e.target.value)}
            placeholder="App name (e.g. VS Code, Books, Workout)..."
            className="sm:col-span-2 glass-input px-3.5 py-2 rounded-xl text-xs"
            required
          />
          <select
            value={catInput}
            onChange={(e) => setCatInput(e.target.value as any)}
            className="glass-input px-3 py-2 rounded-xl text-xs bg-[#1a040e]"
          >
            <option value="work">Work</option>
            <option value="leisure">Leisure</option>
            <option value="neutral">Neutral</option>
          </select>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min={5}
              max={180}
              value={durationInput}
              onChange={(e) => setDurationInput(Number(e.target.value))}
              className="w-20 glass-input px-2.5 py-2 rounded-xl text-xs font-mono text-center"
            />
            <span className="text-xs font-mono text-rose-300/60">min</span>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-mono text-xs transition-all font-bold"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
