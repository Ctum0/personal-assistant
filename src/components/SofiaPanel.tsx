'use client';

import React from 'react';
import { X } from 'lucide-react';

export interface SofiaPanelProps {
  side: 'left' | 'right';
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  content?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const SofiaPanel: React.FC<SofiaPanelProps> = ({
  side,
  title = 'Data Feed',
  isOpen = true,
  onClose,
  content,
  children,
  className = '',
}) => {
  if (!isOpen) return null;

  return (
    <aside
      aria-label={title}
      className={`relative z-20 w-80 md:w-96 flex flex-col h-[75vh] max-h-[640px] my-auto glass-panel rounded-2xl border border-rose-500/30 shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-2xl transition-all duration-500 ease-out animate-fade-in ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-rose-500/20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]" />
          <span className="text-xs font-mono tracking-widest uppercase font-bold text-rose-100">
            {title}
          </span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            aria-label={`Close ${title} panel`}
            className="p-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-950/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content Body */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4 text-rose-100 text-sm font-sans custom-scrollbar">
        {content || children}
      </div>
    </aside>
  );
};
