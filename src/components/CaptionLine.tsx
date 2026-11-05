'use client';

import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface CaptionLineProps {
  text: string;
  isSpeaking?: boolean;
  onReplayAudio?: () => void;
  className?: string;
}

export const CaptionLine: React.FC<CaptionLineProps> = ({
  text,
  isSpeaking = false,
  onReplayAudio,
  className = '',
}) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let index = 0;
    setDisplayedText('');
    const timer = setInterval(() => {
      index++;
      setDisplayedText(text.slice(0, index));
      if (index >= text.length) {
        clearInterval(timer);
      }
    }, 22);

    return () => clearInterval(timer);
  }, [text]);

  return (
    <div
      className={`relative max-w-2xl w-full mx-auto p-4 rounded-2xl glass-panel text-center flex flex-col items-center justify-center space-y-2.5 transition-all duration-300 ${className}`}
    >
      <div className="flex items-center space-x-2 text-rose-300/80 text-xs font-mono tracking-widest uppercase">
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        <span>Sofia Dialogue</span>
        {isSpeaking && (
          <span className="flex items-center space-x-0.5 ml-2">
            <span className="w-1 h-3 bg-rose-400 animate-[bounce_0.6s_infinite_100ms] rounded-full" />
            <span className="w-1 h-4 bg-rose-400 animate-[bounce_0.6s_infinite_200ms] rounded-full" />
            <span className="w-1 h-2 bg-rose-400 animate-[bounce_0.6s_infinite_300ms] rounded-full" />
          </span>
        )}
      </div>

      <p className="text-base md:text-lg text-rose-50 font-medium leading-relaxed tracking-wide min-h-[3.25rem] flex items-center justify-center px-4">
        &ldquo;{displayedText}&rdquo;
      </p>

      {onReplayAudio && (
        <button
          onClick={onReplayAudio}
          className="flex items-center space-x-1.5 text-xs text-rose-300/70 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/20 px-3 py-1 rounded-full transition-colors"
          title="Speak line aloud"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Speak</span>
        </button>
      )}
    </div>
  );
};
