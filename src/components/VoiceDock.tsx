'use client';

import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Square, Volume2, VolumeX, Sparkles } from 'lucide-react';

interface VoiceDockProps {
  onTranscript?: (transcript: string) => void;
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
  className?: string;
}

export const VoiceDock: React.FC<VoiceDockProps> = ({
  onTranscript,
  isSpeaking = false,
  onStopSpeaking,
  className = '',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  const startListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use text chat.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText('Listening...');
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setInterimText(transcript);
        if (event.results[0].isFinal) {
          setIsListening(false);
          setInterimText('');
          if (onTranscript && transcript.trim()) {
            onTranscript(transcript.trim());
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
        setInterimText('');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Error starting recognition:', err);
      setIsListening(false);
    }
  };

  return (
    <div
      className={`glass-panel p-3.5 rounded-2xl flex items-center justify-between border border-rose-500/25 shadow-lg ${className}`}
    >
      {/* Left status info */}
      <div className="flex items-center space-x-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isListening
              ? 'bg-rose-500 animate-ping'
              : isSpeaking
              ? 'bg-amber-400 animate-pulse'
              : 'bg-emerald-500/80'
          }`}
        />
        <div className="flex flex-col">
          <span className="text-xs font-mono uppercase tracking-wider text-rose-200">
            {isListening ? 'Listening...' : isSpeaking ? 'Sofia Speaking' : 'Voice Link Ready'}
          </span>
          <span className="text-[11px] font-sans text-rose-300/60 truncate max-w-xs">
            {interimText || (isListening ? 'Speak your thought...' : 'Hold or click to talk')}
          </span>
        </div>
      </div>

      {/* Center audio wave indicator when active */}
      {(isListening || isSpeaking) && (
        <div className="flex items-center space-x-1 px-3">
          <span className="w-1 h-3 bg-rose-400 rounded-full animate-[bounce_0.5s_infinite_100ms]" />
          <span className="w-1 h-5 bg-rose-500 rounded-full animate-[bounce_0.5s_infinite_200ms]" />
          <span className="w-1 h-6 bg-rose-300 rounded-full animate-[bounce_0.5s_infinite_300ms]" />
          <span className="w-1 h-4 bg-rose-500 rounded-full animate-[bounce_0.5s_infinite_150ms]" />
          <span className="w-1 h-2 bg-rose-400 rounded-full animate-[bounce_0.5s_infinite_250ms]" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center space-x-2">
        {/* Stop Speaking / Barge-In Button */}
        {isSpeaking && (
          <button
            onClick={onStopSpeaking}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/50 text-red-200 text-xs font-mono transition-all"
            title="Interrupt Sofia (Barge-in)"
          >
            <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" />
            <span>Stop</span>
          </button>
        )}

        {/* Push-to-Talk Mic Button */}
        <button
          onClick={startListening}
          disabled={isListening}
          className={`relative p-3 rounded-xl flex items-center justify-center transition-all ${
            isListening
              ? 'bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.6)] scale-105'
              : 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border border-rose-500/30'
          }`}
          title="Push to talk"
        >
          {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};
