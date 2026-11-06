'use client';

import React from 'react';
import { SofiaAvatar } from './SofiaAvatar';
import { PaneRail } from './PaneRail';
import { Pane as PaneType, SofiaMood } from '@/lib/stage';
import { SofiaExpression } from '@/lib/types';
import { Volume2 } from 'lucide-react';

interface StageProps {
  expression: SofiaExpression;
  isSpeaking: boolean;
  score: number;
  captionText: string;
  panes: PaneType[];
  onDismissPane: (id: string) => void;
  onPinPane: (id: string) => void;
}

export const Stage: React.FC<StageProps> = ({
  expression,
  isSpeaking,
  score,
  captionText,
  panes,
  onDismissPane,
  onPinPane,
}) => {
  const paneCount = panes.length;

  // Compute CSS custom property targets
  let sofiaScale = 1;
  let sofiaShift = '0%';

  if (paneCount === 1) {
    sofiaScale = 0.72;
    sofiaShift = '-20%';
  } else if (paneCount >= 2) {
    sofiaScale = 0.55;
    sofiaShift = '-28%';
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
      {/* Dynamic Centre Stage: Sofia Avatar + Spoken Caption */}
      <div className="stage-centre flex flex-col items-center justify-center transition-all duration-500 ease-out z-10 my-auto">
        {/* Breathing Avatar */}
        <div className="relative group cursor-pointer transition-transform duration-500">
          <SofiaAvatar
            expression={expression}
            isSpeaking={isSpeaking}
            score={score}
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
        {captionText && (
          <div className="mt-6 max-w-xl w-full px-6 py-3.5 rounded-2xl backdrop-blur-xl bg-[#14030a]/70 border border-burgundy-800/40 shadow-[0_8px_32px_rgba(20,3,10,0.6)] text-center transition-all duration-300 animate-fadeIn">
            <div className="flex items-center justify-center space-x-2 mb-1 text-[11px] font-mono text-rose-400/80">
              {isSpeaking && (
                <span className="flex items-center space-x-1.5 text-rose-300">
                  <Volume2 className="w-3.5 h-3.5 animate-pulse text-rose-400" />
                  <span>Sofia is speaking...</span>
                </span>
              )}
            </div>
            <p className="text-base font-medium leading-relaxed tracking-wide text-[#fbf5f7] select-text">
              {captionText}
            </p>
          </div>
        )}
      </div>

      {/* Side Rail for Dynamic Panes */}
      {paneCount > 0 && (
        <div className="mt-6 md:mt-0 md:absolute md:right-8 lg:right-16 md:top-1/2 md:-translate-y-1/2 flex justify-center z-20">
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
