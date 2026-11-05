'use client';

import React from 'react';
import { SofiaExpression } from '@/lib/types';

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
  score = 7.5,
  size = 'lg',
  className = '',
  onClick,
}) => {
  // Glow color depending on mood and score
  const getGlowGradient = () => {
    if (expression === 'stern' || score < 5.0) {
      return 'from-rose-600/35 via-red-950/40 to-transparent';
    }
    if (expression === 'pleased' || score >= 8.5) {
      return 'from-rose-500/40 via-amber-900/30 to-transparent';
    }
    if (expression === 'focused') {
      return 'from-fuchsia-600/35 via-rose-950/40 to-transparent';
    }
    return 'from-rose-600/30 via-burgundy-950/30 to-transparent';
  };

  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-44 h-44',
    lg: 'w-64 h-64 md:w-72 md:h-72',
    xl: 'w-80 h-80 md:w-96 md:h-96 xl:w-[26rem] xl:h-[26rem]',
  }[size];

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
      aria-label={onClick ? `${expression.toUpperCase()} - Sofia avatar. Click to speak.` : `${expression.toUpperCase()} - Sofia avatar`}
      className={`relative flex items-center justify-center select-none group ${onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-full' : ''} ${className}`}
    >
      {/* Ambient Pulsating Blurry Glow Ring behind avatar */}
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-tr ${getGlowGradient()} blur-2xl animate-pulse-slow pointer-events-none scale-125`}
      />

      {/* Jarvis Holographic Frequency Rings */}
      <div className={`absolute ${sizeClasses} scale-110 pointer-events-none flex items-center justify-center`}>
        {/* Outer dashed spinning ring */}
        <div
          className={`absolute inset-0 rounded-full border border-dashed border-rose-500/25 animate-spin-slow ${
            isSpeaking ? 'border-rose-400/60 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-jarvis-pulse' : ''
          }`}
        />
        {/* Reverse rotating tick ring */}
        <div className="absolute inset-2 rounded-full border border-rose-400/15 animate-spin-reverse-slow" />
        {/* Pulse ripple ring when speaking */}
        {isSpeaking && (
          <div className="absolute -inset-4 rounded-full border-2 border-rose-500/40 animate-ping opacity-60" />
        )}
      </div>

      {/* Glassy circular frame border */}
      <div
        className={`relative ${sizeClasses} rounded-full p-2.5 backdrop-blur-xl bg-gradient-to-b from-rose-950/40 to-[#0e0207]/80 border border-rose-500/30 shadow-[0_0_40px_rgba(225,29,72,0.25)] flex items-center justify-center overflow-hidden animate-float`}
      >
        {/* Subtle holographic scanline reflection */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-rose-950/20 pointer-events-none rounded-full" />

        {/* Vector Anime Girl: Sofia */}
        <svg
          viewBox="0 0 320 320"
          className="w-full h-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Hair Gradient: Dark plum wine to rich burgundy */}
            <linearGradient id="sofiaHairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#250918" />
              <stop offset="50%" stopColor="#3d0e28" />
              <stop offset="100%" stopColor="#1a0410" />
            </linearGradient>

            {/* Hair Highlight */}
            <linearGradient id="sofiaHairHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#be185d" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0" />
            </linearGradient>

            {/* Skin Gradient: Soft pale warm anime tone */}
            <linearGradient id="sofiaSkin" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fff5f5" />
              <stop offset="100%" stopColor="#fae4e8" />
            </linearGradient>

            {/* Eyes Gradient: Deep radiant violet-wine */}
            <linearGradient id="sofiaEyeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4c0519" />
              <stop offset="45%" stopColor="#9f1239" />
              <stop offset="85%" stopColor="#e11d48" />
              <stop offset="100%" stopColor="#fda4af" />
            </linearGradient>

            {/* Glasses Lens Glassmorphism Reflection */}
            <linearGradient id="glassesGlass" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="35%" stopColor="#fda4af" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
            </linearGradient>

            {/* Outfit Collar Gradient */}
            <linearGradient id="outfitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#240715" />
              <stop offset="100%" stopColor="#12020a" />
            </linearGradient>
          </defs>

          {/* Living Anime Breathing Wrapper */}
          <g className="animate-breathe origin-center">

          {/* 1. Background Hair (Back layer of cute short bob) */}
          <path
            d="M85 130 C75 180, 80 230, 95 255 C110 240, 115 220, 115 210 L205 210 C205 220, 210 240, 225 255 C240 230, 245 180, 235 130 Z"
            fill="url(#sofiaHairGrad)"
          />

          {/* 2. Neck & Collar / Dark Outfit */}
          <path d="M140 205 L140 235 L180 235 L180 205 Z" fill="#f8d7dc" />
          {/* Subtle Neck shadow */}
          <path d="M140 205 C155 215, 165 215, 180 205 L180 215 C165 222, 155 222, 140 215 Z" fill="#e9bec6" />

          {/* Chic Dark Burgundy Outfit & Collar */}
          <path
            d="M100 280 C110 245, 135 235, 160 238 C185 235, 210 245, 220 280 L230 320 L90 320 Z"
            fill="url(#outfitGrad)"
          />
          {/* Collar Lapel with Crimson Accent Line */}
          <path d="M135 236 L160 270 L185 236 L175 235 L160 258 L145 235 Z" fill="#881337" />
          <line x1="160" y1="270" x2="160" y2="320" stroke="#f43f5e" strokeWidth="2" strokeDasharray="3 3" />
          <circle cx="160" cy="285" r="3" fill="#fda4af" />
          <circle cx="160" cy="305" r="3" fill="#fda4af" />

          {/* 3. Anime Head & Face Shape */}
          <path
            d="M100 135 C95 190, 120 230, 160 235 C200 230, 225 190, 220 135 C220 95, 200 80, 160 80 C120 80, 100 95, 100 135 Z"
            fill="url(#sofiaSkin)"
          />

          {/* Cute Anime Ears */}
          <path d="M96 150 C90 148, 86 160, 92 170 C96 175, 100 172, 101 165 Z" fill="#fae4e8" />
          <path d="M224 150 C230 148, 234 160, 228 170 C224 175, 220 172, 219 165 Z" fill="#fae4e8" />

          {/* Cute Soft Cheek Blush */}
          <ellipse cx="120" cy="178" rx="14" ry="7" fill="#f43f5e" opacity={expression === 'pleased' ? '0.45' : '0.28'} />
          <ellipse cx="200" cy="178" rx="14" ry="7" fill="#f43f5e" opacity={expression === 'pleased' ? '0.45' : '0.28'} />
          {/* Subtle blush slashes */}
          <line x1="115" y1="177" x2="125" y2="175" stroke="#be123c" strokeWidth="1" opacity="0.3" />
          <line x1="195" y1="177" x2="205" y2="175" stroke="#be123c" strokeWidth="1" opacity="0.3" />

          {/* 4. Eyes & Eyebrows (Dynamic by expression) */}
          <g className="animate-blink">
            {/* Eyebrows */}
            {expression === 'stern' ? (
              <>
                <path d="M112 142 Q130 148 142 144" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M208 142 Q190 148 178 144" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
              </>
            ) : expression === 'concerned' ? (
              <>
                <path d="M112 143 Q128 138 142 143" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M208 143 Q192 138 178 143" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
              </>
            ) : expression === 'amused' ? (
              <>
                <path d="M112 140 Q128 135 142 142" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M178 144 Q192 142 208 141" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M114 142 Q130 139 144 143" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M176 143 Q190 139 206 142" stroke="#250918" strokeWidth="2.5" strokeLinecap="round" />
              </>
            )}

            {/* Eyes: Happy curved arcs if 'pleased' */}
            {expression === 'pleased' ? (
              <>
                <path d="M115 166 Q130 152 145 166" stroke="#250918" strokeWidth="3.5" fill="none" strokeLinecap="round" />
                <path d="M175 166 Q190 152 205 166" stroke="#250918" strokeWidth="3.5" fill="none" strokeLinecap="round" />
              </>
            ) : expression === 'sleepy' ? (
              <>
                {/* Half-closed sleepy anime eyes */}
                <ellipse cx="130" cy="168" rx="14" ry="7" fill="url(#sofiaEyeGrad)" />
                <path d="M114 163 Q130 167 146 163" stroke="#1c0512" strokeWidth="3.5" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                {/* Upper Eyelashes / Eye Line */}
                <path d="M114 156 Q130 148 146 156" stroke="#1c0512" strokeWidth="3.5" fill="none" strokeLinecap="round" />
                <path d="M174 156 Q190 148 206 156" stroke="#1c0512" strokeWidth="3.5" fill="none" strokeLinecap="round" />
                {/* Side wing lash */}
                <line x1="145" y1="155" x2="148" y2="152" stroke="#1c0512" strokeWidth="2" strokeLinecap="round" />
                <line x1="205" y1="155" x2="208" y2="152" stroke="#1c0512" strokeWidth="2" strokeLinecap="round" />

                {/* Sclera & Iris */}
                <ellipse cx="130" cy="166" rx="13" ry="15" fill="#ffffff" />
                <ellipse cx="190" cy="166" rx="13" ry="15" fill="#ffffff" />

                <ellipse cx="130" cy="167" rx="10" ry="13" fill="url(#sofiaEyeGrad)" />
                <ellipse cx="190" cy="167" rx="10" ry="13" fill="url(#sofiaEyeGrad)" />

                {/* Deep Pupil */}
                <circle cx="130" cy="168" r="5" fill="#18020b" />
                <circle cx="190" cy="168" r="5" fill="#18020b" />

                {/* Radiant Anime Eye Highlights (Large Glint + Small sparkle) */}
                <circle cx="127" cy="162" r="3.5" fill="#ffffff" />
                <circle cx="187" cy="162" r="3.5" fill="#ffffff" />
                <circle cx="134" cy="172" r="1.8" fill="#ffffff" opacity="0.8" />
                <circle cx="194" cy="172" r="1.8" fill="#ffffff" opacity="0.8" />
              </>
            )}
          </g>

          {/* 5. Cute Tiny Anime Nose */}
          <path d="M160 178 L158 184 L161 184" stroke="#d49da7" strokeWidth="1.5" strokeLinecap="round" fill="none" />

          {/* 6. Animated Mouth (Dynamic by speaking state and expression) */}
          {isSpeaking ? (
            <ellipse cx="160" cy="200" rx="7" ry="6" fill="#881337" className="animate-mouth">
              <path d="M155 198 Q160 196 165 198" stroke="#ffffff" strokeWidth="1.5" />
            </ellipse>
          ) : expression === 'pleased' ? (
            <path d="M152 198 Q160 207 168 198" stroke="#9f1239" strokeWidth="2.5" fill="#be123c" strokeLinecap="round" />
          ) : expression === 'amused' ? (
            <path d="M154 200 Q162 201 168 196" stroke="#9f1239" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          ) : expression === 'disappointed' || expression === 'stern' ? (
            <path d="M153 203 Q160 198 167 203" stroke="#9f1239" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          ) : expression === 'concerned' ? (
            <ellipse cx="160" cy="201" rx="4" ry="3" stroke="#9f1239" strokeWidth="2" fill="#be123c" />
          ) : (
            /* Neutral calm smile */
            <path d="M154 200 Q160 203 166 200" stroke="#9f1239" strokeWidth="2" fill="none" strokeLinecap="round" />
          )}

          {/* 7. Cute Anime Glasses (Chic dark-rimmed with glossy reflection) */}
          <g>
            {/* Left Frame */}
            <rect
              x="110"
              y="148"
              width="40"
              height="32"
              rx="9"
              fill="url(#glassesGlass)"
              stroke="#200512"
              strokeWidth="2.8"
            />
            {/* Right Frame */}
            <rect
              x="170"
              y="148"
              width="40"
              height="32"
              rx="9"
              fill="url(#glassesGlass)"
              stroke="#200512"
              strokeWidth="2.8"
            />
            {/* Bridge */}
            <path d="M150 159 Q160 156 170 159" stroke="#200512" strokeWidth="2.5" fill="none" />
            {/* Temples (Glasses Arms) */}
            <line x1="110" y1="158" x2="98" y2="155" stroke="#200512" strokeWidth="2.5" />
            <line x1="210" y1="158" x2="222" y2="155" stroke="#200512" strokeWidth="2.5" />

            {/* Chic Glass Diagonal Reflection Lines */}
            <path d="M116 153 L135 153 L122 176 L116 176 Z" fill="#ffffff" opacity="0.32" />
            <path d="M176 153 L195 153 L182 176 L176 176 Z" fill="#ffffff" opacity="0.32" />
            {/* Extra glint point if focused */}
            {expression === 'focused' && (
              <circle cx="140" cy="154" r="3.5" fill="#ffffff" className="animate-ping" />
            )}
          </g>

          {/* 8. Front Layer: Cute Short Anime Hair (Stylish Bob / Pixie with soft bangs) */}
          <g>
            {/* Main Short Hair Crown */}
            <path
              d="M88 135 C82 85, 120 50, 160 50 C200 50, 238 85, 232 135 C235 155, 230 185, 218 205 C212 185, 215 150, 215 130 C205 110, 190 90, 160 90 C130 90, 115 110, 105 130 C105 150, 108 185, 102 205 C90 185, 85 155, 88 135 Z"
              fill="url(#sofiaHairGrad)"
            />

            {/* Hair Highlight Band across the top */}
            <path
              d="M108 100 C125 88, 195 88, 212 100 C195 95, 125 95, 108 100 Z"
              fill="url(#sofiaHairHighlight)"
            />

            {/* Cute Front Bangs / Strands with Anime Styling */}
            {/* Center-left strand */}
            <path d="M145 75 Q152 110 148 135 Q140 105 135 85 Z" fill="url(#sofiaHairGrad)" />
            {/* Center-right strand */}
            <path d="M152 75 Q164 112 168 132 Q158 108 150 85 Z" fill="url(#sofiaHairGrad)" />
            {/* Left side bang */}
            <path d="M110 95 Q125 125 122 152 Q112 125 105 105 Z" fill="url(#sofiaHairGrad)" />
            {/* Right side bang */}
            <path d="M210 95 Q195 125 198 152 Q208 125 215 105 Z" fill="url(#sofiaHairGrad)" />
            {/* Fluffy side volume tufts for cute short silhouette */}
            <path d="M88 140 C80 160, 85 180, 94 195 C90 178, 92 158, 96 145 Z" fill="#2d0a1d" />
            <path d="M232 140 C240 160, 235 180, 226 195 C230 178, 228 158, 224 145 Z" fill="#2d0a1d" />
          </g>
          </g>
        </svg>

        {/* Small Active Speaking indicator badge in corner */}
        {isSpeaking && (
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/60 backdrop-blur-md flex items-center space-x-1 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            <span className="text-[10px] uppercase font-mono tracking-wider text-rose-200">speaking</span>
          </div>
        )}
      </div>

      {/* Mood chip tag below avatar */}
      <div className="absolute -bottom-2.5 px-3 py-0.5 rounded-full bg-rose-950/90 border border-rose-500/40 text-[11px] font-mono tracking-wider uppercase text-rose-200 shadow-md backdrop-blur-md">
        {expression}
      </div>
    </div>
  );
};
