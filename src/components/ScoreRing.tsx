'use client';

import React from 'react';
import { ScoreComponents } from '@/lib/types';
import { Flame, ShieldCheck, AlertTriangle } from 'lucide-react';

interface ScoreRingProps {
  score: number;
  components?: ScoreComponents;
  streakDays?: number;
  size?: number;
  className?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  components,
  streakDays = 0,
  size = 180,
  className = '',
}) => {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.max(0, Math.min(10, score));
  const progress = normalizedScore / 10;
  const strokeDashoffset = circumference * (1 - progress);

  const getScoreColor = () => {
    if (score >= 8.5) return '#f43f5e'; // vibrant ruby
    if (score >= 7.0) return '#e11d48'; // crimson wine
    if (score >= 5.0) return '#be123c'; // deep rose
    return '#881337'; // dark warning wine
  };

  return (
    <div className={`glass-card p-5 rounded-2xl flex flex-col items-center justify-center text-center relative ${className}`}>
      <div className="text-xs font-mono tracking-widest text-rose-300/70 uppercase mb-2">
        Daily Accountability Score
      </div>

      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(136, 19, 55, 0.25)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Animated Glowing Progress Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getScoreColor()}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            className="transition-all duration-1000 ease-out"
            style={{
              filter: `drop-shadow(0 0 10px ${getScoreColor()})`,
            }}
          />
        </svg>

        {/* Center Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold font-mono tracking-tight text-white glow-text-burgundy">
            {score.toFixed(1)}
          </span>
          <span className="text-[11px] font-mono uppercase text-rose-300/60 mt-0.5">out of 10</span>
        </div>
      </div>

      {/* Streak Badge */}
      <div className="mt-3 flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-950/60 border border-rose-500/30 text-xs font-mono text-rose-200">
        <Flame className="w-3.5 h-3.5 text-rose-400 fill-rose-500/50" />
        <span>{streakDays} Day Streak</span>
      </div>

      {/* Component Breakdown Tooltip / Mini Cards */}
      {components && (
        <div className="grid grid-cols-5 gap-1.5 w-full mt-4 pt-3 border-t border-rose-500/15 text-[10px] font-mono">
          <div className="flex flex-col items-center p-1 rounded bg-rose-950/30">
            <span className="text-rose-400/80">WAKE</span>
            <span className="text-white font-bold">{Math.round(components.wake * 100)}%</span>
          </div>
          <div className="flex flex-col items-center p-1 rounded bg-rose-950/30">
            <span className="text-rose-400/80">FOCUS</span>
            <span className="text-white font-bold">{Math.round(components.focus * 100)}%</span>
          </div>
          <div className="flex flex-col items-center p-1 rounded bg-rose-950/30">
            <span className="text-rose-400/80">OUTPUT</span>
            <span className="text-white font-bold">{Math.round(components.output * 100)}%</span>
          </div>
          <div className="flex flex-col items-center p-1 rounded bg-rose-950/30">
            <span className="text-rose-400/80">LEISURE</span>
            <span className="text-white font-bold">{Math.round(components.leisure * 100)}%</span>
          </div>
          <div className="flex flex-col items-center p-1 rounded bg-rose-950/30">
            <span className="text-rose-400/80">SLEEP</span>
            <span className="text-white font-bold">{Math.round(components.sleep * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
