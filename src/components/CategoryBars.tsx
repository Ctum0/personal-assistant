'use client';

import React from 'react';
import { Briefcase, Tv, HelpCircle, Layers } from 'lucide-react';

interface CategoryBarsProps {
  workMin: number;
  leisureMin: number;
  neutralMin: number;
  unknownMin?: number;
  className?: string;
}

export const CategoryBars: React.FC<CategoryBarsProps> = ({
  workMin,
  leisureMin,
  neutralMin,
  unknownMin = 0,
  className = '',
}) => {
  const total = Math.max(1, workMin + leisureMin + neutralMin + unknownMin);
  const workPct = Math.round((workMin / total) * 100);
  const leisurePct = Math.round((leisureMin / total) * 100);
  const neutralPct = Math.round((neutralMin / total) * 100);
  const unknownPct = Math.max(0, 100 - workPct - leisurePct - neutralPct);

  const formatHours = (min: number) => {
    const h = (min / 60).toFixed(1);
    return `${h}h (${min}m)`;
  };

  return (
    <div className={`glass-card p-5 rounded-2xl flex flex-col justify-between space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-rose-500/15 pb-2.5">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-rose-400" />
          <span className="text-xs font-mono uppercase tracking-widest text-rose-200">Activity Classification</span>
        </div>
        <span className="text-xs font-mono text-rose-400/80">{Math.round(total / 60)}h total</span>
      </div>

      {/* Stacked Master Bar */}
      <div className="w-full h-3 rounded-full bg-rose-950/60 overflow-hidden flex p-0.5 border border-rose-500/20">
        <div
          style={{ width: `${workPct}%` }}
          className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 rounded-l-full transition-all duration-700"
          title={`Work: ${workPct}%`}
        />
        <div
          style={{ width: `${leisurePct}%` }}
          className="h-full bg-gradient-to-r from-rose-600 to-crimson-500 transition-all duration-700"
          title={`Leisure: ${leisurePct}%`}
        />
        <div
          style={{ width: `${neutralPct}%` }}
          className="h-full bg-gradient-to-r from-slate-600 to-slate-400 transition-all duration-700"
          title={`Neutral: ${neutralPct}%`}
        />
        {unknownPct > 0 && (
          <div
            style={{ width: `${unknownPct}%` }}
            className="h-full bg-amber-500/70 rounded-r-full transition-all duration-700"
            title={`Unknown: ${unknownPct}%`}
          />
        )}
      </div>

      {/* Individual Category Metrics */}
      <div className="space-y-3 pt-1">
        {/* Work */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center space-x-1.5 text-emerald-300 font-medium">
              <Briefcase className="w-3.5 h-3.5" />
              <span>Work & Code</span>
            </span>
            <span className="font-mono text-emerald-200">{formatHours(workMin)} ({workPct}%)</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-rose-950/40 overflow-hidden">
            <div
              style={{ width: `${workPct}%` }}
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            />
          </div>
        </div>

        {/* Leisure */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center space-x-1.5 text-rose-300 font-medium">
              <Tv className="w-3.5 h-3.5" />
              <span>Leisure & Distraction</span>
            </span>
            <span className="font-mono text-rose-200">{formatHours(leisureMin)} ({leisurePct}%)</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-rose-950/40 overflow-hidden">
            <div
              style={{ width: `${leisurePct}%` }}
              className={`h-full rounded-full transition-all duration-500 ${
                leisurePct > 20 ? 'bg-rose-500' : 'bg-rose-400/80'
              }`}
            />
          </div>
        </div>

        {/* Neutral */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
              <Layers className="w-3.5 h-3.5" />
              <span>Neutral & System</span>
            </span>
            <span className="font-mono text-slate-300">{formatHours(neutralMin)} ({neutralPct}%)</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-rose-950/40 overflow-hidden">
            <div
              style={{ width: `${neutralPct}%` }}
              className="h-full bg-slate-400 rounded-full transition-all duration-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
