'use client';

import React, { useState, useEffect } from 'react';
import { Pane as PaneType } from '@/lib/stage';
import { Pane } from './Pane';
import { Layers } from 'lucide-react';

interface PaneRailProps {
  panes: PaneType[];
  onDismiss: (id: string) => void;
  onPin: (id: string) => void;
  inactivityTimeoutMs?: number; // default 4 minutes (240000ms)
}

export const PaneRail: React.FC<PaneRailProps> = ({
  panes,
  onDismiss,
  onPin,
  inactivityTimeoutMs = 240000,
}) => {
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // Auto-dismiss unpinned panes after 4 minutes of inactivity
  useEffect(() => {
    if (!panes || panes.length === 0) return;

    const timer = setTimeout(() => {
      panes.forEach((p) => {
        if (!p.pinned) {
          onDismiss(p.id);
        }
      });
    }, inactivityTimeoutMs);

    return () => clearTimeout(timer);
  }, [panes, onDismiss, inactivityTimeoutMs]);

  if (!panes || panes.length === 0) {
    return null;
  }

  // Desktop shows up to 2 panes. If > 2, stack 2nd+ with tab selector
  const MAX_VISIBLE_DESKTOP = 2;
  const isStacked = panes.length > MAX_VISIBLE_DESKTOP;

  let displayPanes: PaneType[] = [];
  if (isStacked) {
    displayPanes = [
      panes[0],
      panes[Math.min(activeTabIdx + 1, panes.length - 1)] || panes[1],
    ];
  } else {
    displayPanes = panes;
  }

  const hasLargeWorkspace = panes.some((p) => p.kind === 'browser' || p.kind === 'code' || p.kind === 'table');

  return (
    <aside
      className={`pane-host flex flex-col gap-4 w-full transition-all duration-500 ease-out z-20 ${
        hasLargeWorkspace
          ? 'md:w-[680px] lg:w-[860px] xl:w-[980px] max-w-[calc(100vw-2rem)]'
          : 'md:w-[380px] lg:w-[420px]'
      }`}
      aria-label="Companion Dynamic Panes"
    >
      {/* Tab switcher when > 2 panes exist */}
      {isStacked && (
        <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-burgundy-950/70 border border-burgundy-800/40 text-xs font-mono">
          <Layers className="w-3.5 h-3.5 text-rose-400 ml-1.5 shrink-0" />
          <span className="text-[11px] text-rose-400/80 mr-1">{panes.length} Panes:</span>
          <div className="flex space-x-1 overflow-x-auto custom-scrollbar flex-1">
            {panes.slice(1).map((p, idx) => {
              const isActive = activeTabIdx === idx;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveTabIdx(idx)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors truncate max-w-[110px] ${
                    isActive
                      ? 'bg-rose-900/70 text-rose-100 font-bold border border-rose-500/40'
                      : 'text-rose-300 hover:text-white hover:bg-rose-950/50'
                  }`}
                >
                  {p.title || p.kind}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Visible Panes */}
      <div className="flex flex-col gap-4">
        {displayPanes.map((p) => (
          <Pane key={p.id} pane={p} onDismiss={onDismiss} onPin={onPin} />
        ))}
      </div>
    </aside>
  );
};
