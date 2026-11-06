'use client';

import React, { useState, useEffect } from 'react';
import { SofiaExpression } from '@/lib/types';
import { EXPRESSION_IMAGES } from '@/lib/expressions';

interface SofiaAvatarProps {
  expression?: SofiaExpression;
  isSpeaking?: boolean;
  score?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

export const SofiaAvatar: React.FC<SofiaAvatarProps> = ({
  expression = 'neutral',
  isSpeaking = false,
  score = 75,
  size = 'lg',
  className = '',
  onClick,
}) => {
  const [currentExp, setCurrentExp] = useState<SofiaExpression>(expression);
  const [prevExp, setPrevExp] = useState<SofiaExpression | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);

  useEffect(() => {
    if (expression !== currentExp) {
      setPrevExp(currentExp);
      setCurrentExp(expression);
      setIsCrossfading(true);
      const timer = setTimeout(() => {
        setIsCrossfading(false);
        setPrevExp(null);
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [expression, currentExp]);

  const sizeClasses = {
    sm: 'w-28 h-28',
    md: 'w-48 h-48',
    lg: 'w-72 h-72 md:w-80 md:h-80',
    xl: 'w-96 h-96 md:w-[28rem] md:h-[28rem]',
  }[size];

  const getGlowGradient = () => {
    if (currentExp === 'stern' || score < 50) {
      return 'from-rose-600/35 via-red-950/40 to-transparent';
    }
    if (currentExp === 'pleased' || score >= 80) {
      return 'from-rose-500/40 via-amber-900/30 to-transparent';
    }
    if (currentExp === 'focused') {
      return 'from-fuchsia-600/35 via-rose-950/40 to-transparent';
    }
    return 'from-rose-600/30 via-burgundy-950/30 to-transparent';
  };

  const getSrc = (exp: SofiaExpression) => {
    return EXPRESSION_IMAGES[exp] || '/sofia/expressions/neutral.png';
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={onClick ? `${currentExp.toUpperCase()} - Sofia avatar. Click to interact.` : `${currentExp.toUpperCase()} - Sofia avatar`}
      className={`relative flex items-center justify-center select-none group ${onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-full' : ''} ${className}`}
    >
      {/* Ambient Pulsating Blurry Aura behind avatar */}
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-tr ${getGlowGradient()} blur-2xl animate-pulse-slow pointer-events-none scale-125`}
      />

      {/* Jarvis Subtle Frequency Orbit Rings */}
      <div className={`absolute ${sizeClasses} scale-110 pointer-events-none flex items-center justify-center`}>
        <div
          className={`absolute inset-0 rounded-full border border-dashed border-rose-500/20 animate-spin-slow ${
            isSpeaking ? 'border-rose-400/50 shadow-[0_0_25px_rgba(244,63,94,0.3)] animate-jarvis-pulse' : ''
          }`}
        />
        <div className="absolute inset-3 rounded-full border border-rose-400/10 animate-spin-reverse-slow" />
        {isSpeaking && (
          <div className="absolute -inset-4 rounded-full border border-rose-500/30 animate-ping opacity-50" />
        )}
      </div>

      {/* PNGTuber Avatar Container with 3.8s Idle Breathing Bob */}
      <div
        className={`relative ${sizeClasses} flex items-center justify-center overflow-visible animate-sofia-bob`}
      >
        {/* Previous expression during 180ms crossfade */}
        {prevExp && isCrossfading && (
          <img
            src={getSrc(prevExp)}
            alt={`Sofia ${prevExp}`}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)] transition-opacity duration-180 opacity-0"
            onError={(e) => {
              // Graceful fallback to neutral
              (e.target as HTMLImageElement).src = '/sofia/expressions/neutral.png';
            }}
          />
        )}

        {/* Current expression image with 180ms crossfade */}
        <img
          src={getSrc(currentExp)}
          alt={`Sofia ${currentExp}`}
          className={`relative w-full h-full object-contain pointer-events-none drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)] transition-opacity duration-180 ${
            isCrossfading ? 'opacity-100' : 'opacity-100'
          }`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/sofia/expressions/neutral.png';
          }}
        />

        {/* Audio-reactive mouth animation overlay when speaking */}
        {isSpeaking && (
          <div
            aria-hidden="true"
            className="absolute bottom-[36%] left-[48%] w-5 h-2.5 bg-rose-950/80 rounded-full border border-rose-400/50 animate-mouth shadow-[0_0_8px_rgba(244,63,94,0.4)] pointer-events-none"
          />
        )}

        {/* Subtle holographic laser horizon datum line */}
        <div className="absolute -bottom-2 w-4/5 h-[1px] bg-gradient-to-r from-transparent via-rose-500/40 to-transparent pointer-events-none" />
      </div>

      {/* Status chip if speaking */}
      {isSpeaking && (
        <div className="absolute -bottom-6 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 backdrop-blur-md animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          <span className="text-[10px] uppercase font-mono tracking-widest text-rose-200">speaking</span>
        </div>
      )}
    </div>
  );
};
