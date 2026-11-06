'use client';

import React, { useState, useEffect } from 'react';
import { Activity, X, Terminal, Volume2, Wifi } from 'lucide-react';

export interface DebugMetrics {
  ttfa: number | null; // ms: last user phoneme to first audio frame
  ttft: number | null; // ms: turn start to first server message
  connectionDuration: number; // seconds
  sessionDuration: number; // seconds
  reconnectCount: number;
  dropCount: number;
  model: string;
  voice: string;
  state: string;
  micRms: number;
}

interface LiveDebugOverlayProps {
  metrics: DebugMetrics;
  visible?: boolean;
  onClose?: () => void;
}

export const LiveDebugOverlay: React.FC<LiveDebugOverlayProps> = ({
  metrics,
  visible = true,
  onClose,
}) => {
  const [minimized, setMinimized] = useState(false);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-full bg-black/80 border border-rose-500/40 text-[11px] font-mono text-rose-300 backdrop-blur-md shadow-lg flex items-center space-x-1.5 hover:border-rose-400"
      >
        <Activity className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
        <span>LIVE DEBUG ({metrics.ttfa ? `${metrics.ttfa}ms` : '--'})</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Live Telemetry Overlay"
      className="fixed top-4 right-4 z-50 w-72 rounded-2xl bg-black/85 border border-rose-500/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] text-rose-100 p-4 font-mono text-xs select-none animate-fadeIn"
    >
      <div className="flex items-center justify-between border-b border-rose-900/50 pb-2 mb-3">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-rose-400" />
          <span className="font-bold tracking-wider text-rose-200">LIVE TELEMETRY</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1 rounded hover:bg-rose-950/60 text-rose-400 hover:text-white"
            title="Minimize"
          >
            _
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-rose-950/60 text-rose-400 hover:text-white"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {/* Latency Benchmarks */}
        <div className="flex items-center justify-between">
          <span className="text-rose-400/80">TTFA (first audio):</span>
          <span className={`font-bold ${metrics.ttfa && metrics.ttfa < 1300 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {metrics.ttfa !== null ? `${metrics.ttfa} ms` : 'calculating...'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-rose-400/80">TTFT (first token):</span>
          <span className="text-rose-200 font-bold">
            {metrics.ttft !== null ? `${metrics.ttft} ms` : '--'}
          </span>
        </div>

        {/* Connection Timers */}
        <div className="flex items-center justify-between">
          <span className="text-rose-400/80">conn / session:</span>
          <span className="text-rose-300">
            {formatTime(metrics.connectionDuration)} / {formatTime(metrics.sessionDuration)}
          </span>
        </div>

        {/* Reliability stats */}
        <div className="flex items-center justify-between">
          <span className="text-rose-400/80">reconnects / drops:</span>
          <span className="text-rose-300">
            {metrics.reconnectCount} / {metrics.dropCount}
          </span>
        </div>

        {/* Model and Voice */}
        <div className="flex items-center justify-between">
          <span className="text-rose-400/80">voice / model:</span>
          <span className="text-rose-200 truncate max-w-[140px]" title={`${metrics.voice} | ${metrics.model}`}>
            {metrics.voice} · {metrics.model.replace('gemini-', '')}
          </span>
        </div>

        {/* Current State */}
        <div className="flex items-center justify-between pt-1 border-t border-rose-900/40">
          <span className="text-rose-400/80">state:</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-950/80 text-rose-300 border border-rose-700/50 uppercase">
            {metrics.state}
          </span>
        </div>
      </div>
    </aside>
  );
};
