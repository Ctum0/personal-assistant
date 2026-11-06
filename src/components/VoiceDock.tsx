'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square } from 'lucide-react';

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
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);
  const isHoldRef = useRef(false);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
    setInterimText('');
  };

  const startListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your command.');
      return;
    }

    // If Sofia is speaking, interrupt first
    if (isSpeaking && onStopSpeaking) {
      onStopSpeaking();
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      // continuous = true for hold-to-talk & long phrases without auto-closure
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText('Listening...');
      };

      // Critical fix: do NOT stop on speechend, keep continuous stream until user finishes
      recognition.onspeechend = () => {
        // Deliberately keep listening; do NOT terminate on pauses
      };

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript;
          } else {
            interimChunk += event.results[i][0].transcript;
          }
        }

        const displayText = finalChunk || interimChunk;
        if (displayText) {
          setInterimText(displayText);
        }

        // Only stop on explicit final result or manual release
        if (finalChunk.trim()) {
          const textToSend = finalChunk.trim();
          stopRecognition();
          if (onTranscript) {
            onTranscript(textToSend);
          }
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === 'no-speech') {
          // Do not close during pause
          return;
        }
        console.warn('Speech recognition error:', e);
        stopRecognition();
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

  const handleMicClick = () => {
    if (isListening) {
      stopRecognition();
    } else {
      startListening();
    }
  };

  const handleMouseDown = () => {
    isHoldRef.current = true;
    if (!isListening) {
      startListening();
    }
  };

  const handleMouseUp = () => {
    if (isHoldRef.current && isListening) {
      isHoldRef.current = false;
      // Stop after short delay to capture final phoneme
      setTimeout(() => {
        if (interimText && onTranscript) {
          onTranscript(interimText.trim());
        }
        stopRecognition();
      }, 350);
    }
  };

  return (
    <div
      className={`glass-panel p-3 rounded-2xl flex items-center justify-between border border-rose-500/25 shadow-lg backdrop-blur-xl ${className}`}
    >
      {/* Left status info */}
      <div className="flex items-center space-x-3 min-w-0">
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isListening
              ? 'bg-rose-500 animate-ping shadow-[0_0_12px_#f43f5e]'
              : isSpeaking
              ? 'bg-amber-400 animate-pulse shadow-[0_0_10px_#fbbf24]'
              : 'bg-emerald-500/80 shadow-[0_0_8px_#10b981]'
          }`}
          aria-hidden="true"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-mono uppercase tracking-wider text-rose-100 font-bold">
            {isListening ? 'LISTENING (CONTINUOUS)' : isSpeaking ? 'SOFIA SPEAKING' : 'VOICE READY'}
          </span>
          <span className="text-xs font-sans text-rose-300/80 truncate max-w-sm">
            {interimText || (isListening ? 'Listening without auto-close...' : 'Hold or click to talk')}
          </span>
        </div>
      </div>

      {/* Audio pulse frequency bar */}
      {(isListening || isSpeaking) && (
        <div className="flex items-center space-x-1 px-3" aria-hidden="true">
          <span className="w-1 h-3 bg-rose-400 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
          <span className="w-1 h-5 bg-rose-500 rounded-full animate-[bounce_0.6s_infinite_200ms]" />
          <span className="w-1 h-6 bg-rose-300 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
          <span className="w-1 h-4 bg-rose-500 rounded-full animate-[bounce_0.6s_infinite_150ms]" />
          <span className="w-1 h-2 bg-rose-400 rounded-full animate-[bounce_0.6s_infinite_250ms]" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Barge-in Stop Button */}
        {isSpeaking && (
          <button
            onClick={onStopSpeaking}
            aria-label="Stop Sofia voice (barge-in)"
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 text-xs font-mono transition-all"
            title="Interrupt Sofia"
          >
            <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" />
            <span>Stop</span>
          </button>
        )}

        {/* Hold-to-Talk / Continuous Mic Button */}
        <button
          onClick={handleMicClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          aria-pressed={isListening}
          aria-label={isListening ? 'Stop listening' : 'Start listening (hold or click)'}
          className={`relative px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all font-mono text-xs ${
            isListening
              ? 'bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.7)] scale-105 border border-rose-400'
              : 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border border-rose-500/30'
          }`}
          title="Click to toggle, or press and hold"
        >
          <Mic className={`w-4 h-4 ${isListening ? 'animate-pulse text-white' : 'text-rose-400'}`} />
          <span>{isListening ? 'LISTENING' : 'HOLD / MIC'}</span>
        </button>
      </div>
    </div>
  );
};
