'use client';

import React from 'react';
import { SofiaAvatar, LiveState } from './SofiaAvatar';
import { PaneRail } from './PaneRail';
import { Pane as PaneType } from '@/lib/stage';
import { SofiaExpression } from '@/lib/types';
import { Volume2, Sparkles } from 'lucide-react';

interface StageProps {
  expression: SofiaExpression;
  isSpeaking: boolean;
  score: number;
  captionText: string;
  userCaption?: string;
  liveState?: LiveState;
  mouthOpen?: number;
  micLevel?: number;
  panes: PaneType[];
  onDismissPane: (id: string) => void;
  onPinPane: (id: string) => void;
}

export const Stage: React.FC<StageProps> = ({
  expression,
  isSpeaking,
  score,
  captionText,
  userCaption,
  liveState = 'off',
  mouthOpen = 0,
  micLevel = 0,
  panes,
  onDismissPane,
  onPinPane,
}) => {
  const paneCount = panes.length;
  const hasBrowserPane = panes.some((p) => p.kind === 'browser');
  const hasLargeWorkspace = hasBrowserPane || panes.some((p) => p.kind === 'code' || p.kind === 'table');

  // Compute CSS custom property targets for dynamic Stage layout
  let sofiaScale = 1;
  let sofiaShift = '0%';

  if (hasLargeWorkspace) {
    // Keep Sofia prominent (0.88x scale) anchored gracefully on the left
    sofiaScale = 0.88;
    sofiaShift = '-36%';
  } else if (paneCount === 1) {
    sofiaScale = 0.90;
    sofiaShift = '-22%';
  } else if (paneCount >= 2) {
    sofiaScale = 0.82;
    sofiaShift = '-30%';
  }

  return (
    <div
      className="stage relative w-full flex-1 flex flex-col md:flex-row items-center justify-center px-4 py-2 overflow-hidden"
      style={
        {
          '--sofia-scale': sofiaScale,
          '--sofia-shift': sofiaShift,
        } as React.CSSProperties
      }
    >
      {/* Dynamic Centre Stage: Sofia Avatar + Dual Spoken Captions */}
      <div className="stage-centre flex flex-col items-center justify-center transition-all duration-500 ease-out z-10 my-auto">
        {/* User live speech transcription faint above avatar */}
        {userCaption && (
          <div className="mb-4 max-w-lg text-center px-4 py-1.5 rounded-full bg-rose-950/40 border border-rose-800/30 text-xs font-mono text-rose-300/80 animate-fadeIn">
            <span className="text-rose-400 font-semibold mr-1.5">You:</span>
            <span>{userCaption}</span>
          </div>
        )}

        {/* Breathing / Speaking Avatar */}
        <div className="relative group cursor-pointer transition-transform duration-500">
          <SofiaAvatar
            expression={expression}
            isSpeaking={isSpeaking}
            score={score}
            liveState={liveState}
            mouthOpen={mouthOpen}
            micLevel={micLevel}
            size="xl"
          />

          {/* Luminous Horizon Laser Line directly below her torso */}
          <div
            className={`w-[380px] h-[1px] mx-auto -mt-6 transition-all duration-300 pointer-events-none ${
              isSpeaking
                ? 'bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_18px_rgba(244,63,94,0.9)] scale-105'
                : 'bg-gradient-to-r from-transparent via-rose-500/50 to-transparent shadow-[0_0_8px_rgba(225,29,72,0.4)]'
            }`}
          />
        </div>

        {/* Spoken Caption (Floating beneath her) */}
        {(captionText || liveState === 'thinking') && (
          <div className="mt-6 max-w-xl w-full px-6 py-3.5 rounded-2xl backdrop-blur-xl bg-[#14030a]/75 border border-burgundy-800/40 shadow-[0_8px_32px_rgba(20,3,10,0.6)] text-center transition-all duration-300 animate-fadeIn">
            <div className="flex items-center justify-center space-x-2 mb-1 text-[11px] font-mono text-rose-400/80">
              {isSpeaking && (
                <span className="flex items-center space-x-1.5 text-rose-300">
                  <Volume2 className="w-3.5 h-3.5 animate-pulse text-rose-400" />
                  <span>Sofia is speaking</span>
                </span>
              )}
              {liveState === 'thinking' && !isSpeaking && (
                <span className="flex items-center space-x-1.5 text-rose-300">
                  <Sparkles className="w-3.5 h-3.5 animate-spin text-rose-400" />
                  <span>Sofia is thinking...</span>
                </span>
              )}
            </div>

            {liveState === 'thinking' && !captionText ? (
              <div className="flex justify-center space-x-1.5 py-2">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              <p className="text-base font-medium leading-relaxed tracking-wide text-[#fbf5f7] select-text">
                {captionText}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Side Rail for Dynamic Jarvis Panes */}
      {paneCount > 0 && (
        <div className="mt-6 md:mt-0 md:absolute md:right-8 lg:right-16 md:top-1/2 md:-translate-y-1/2 flex justify-center z-20 transition-all duration-500 animate-slideIn">
          <PaneRail
            panes={panes}
            onDismiss={onDismissPane}
            onPin={onPinPane}
          />
        </div>
      )}
    </div>
  );
};
