'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sofia3DStage } from '@/components/Sofia3DStage';
import { SofiaExpression } from '@/lib/types';
import { speakSofia, stopSpeaking } from '@/lib/voice';
import { Key } from 'lucide-react';

export default function HomePage() {
  const [currentExpression, setCurrentExpression] = useState<SofiaExpression>('focused');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [jarvisMode, setJarvisMode] = useState(false); // Hands-free continuous listening
  const [isThinking, setIsThinking] = useState(false);

  const [dialogue, setDialogue] = useState(
    "I am Sofia. Hermes AI engine online, voice link active. Speak to me or dispatch an action."
  );
  const [lastUserSpeech, setLastUserSpeech] = useState('');

  // Voice Settings State
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('21m00Tcm4TlvDq8ikWAM'); // Rachel
  const [voiceProvider, setVoiceProvider] = useState<'browser' | 'elevenlabs'>('browser');

  const recognitionRef = useRef<any>(null);

  // Initialize ElevenLabs key from localStorage if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem('sofia_elevenlabs_key') || '';
      const storedVoice = localStorage.getItem('sofia_elevenlabs_voice_id') || '21m00Tcm4TlvDq8ikWAM';
      const storedProvider = (localStorage.getItem('sofia_voice_provider') as any) || (storedKey ? 'elevenlabs' : 'browser');
      setElevenLabsKey(storedKey);
      setSelectedVoice(storedVoice);
      setVoiceProvider(storedProvider);
    }
  }, []);

  const saveVoiceSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('sofia_elevenlabs_key', elevenLabsKey.trim());
      localStorage.setItem('sofia_elevenlabs_voice_id', selectedVoice);
      localStorage.setItem('sofia_voice_provider', elevenLabsKey.trim() ? 'elevenlabs' : 'browser');
      setVoiceProvider(elevenLabsKey.trim() ? 'elevenlabs' : 'browser');
    }
    setShowVoiceModal(false);
    triggerSpeak(
      elevenLabsKey.trim()
        ? 'ElevenLabs voice engine configured. I am ready.'
        : 'Browser high-quality neural voice active.'
    );
  };

  const triggerSpeak = (text: string) => {
    stopSpeaking();
    speakSofia(text, {
      voiceId: selectedVoice,
      apiKey: elevenLabsKey,
      onStart: () => setIsSpeaking(true),
      onEnd: () => {
        setIsSpeaking(false);
        // If Jarvis mode is active, resume listening after speaking
        if (jarvisMode) {
          setTimeout(() => startListening(), 400);
        }
      },
      onError: () => setIsSpeaking(false),
    });
  };

  const handleInterrupt = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  const sendPromptToSofia = async (promptText: string) => {
    const text = promptText.trim();
    if (!text || isThinking) return;

    setLastUserSpeech(text);
    setIsThinking(true);
    handleInterrupt();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error('API failed');

      const data = await res.json();
      const reply = data.text || 'I have processed your command.';
      setDialogue(reply);

      if (data.mood) {
        setCurrentExpression(data.mood as SofiaExpression);
      } else {
        setCurrentExpression('pleased');
      }

      // Speak answer out loud like Jarvis!
      triggerSpeak(reply);
    } catch (err) {
      console.error('Failed to communicate with Sofia:', err);
      const fallbackMsg = "Hermes neural link responded. I am here and ready.";
      setDialogue(fallbackMsg);
      setCurrentExpression('concerned');
      triggerSpeak(fallbackMsg);
    } finally {
      setIsThinking(false);
    }
  };

  // Speech Recognition (Web Speech API)
  const startListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use text commands.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setLastUserSpeech(transcript);

        if (event.results[0].isFinal && transcript.trim()) {
          setIsListening(false);
          sendPromptToSofia(transcript.trim());
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition warning:', e);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Error starting speech recognition:', err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setIsListening(false);
    setJarvisMode(false);
  };

  const toggleJarvisMode = () => {
    if (jarvisMode) {
      stopListening();
    } else {
      setJarvisMode(true);
      startListening();
    }
  };

  return (
    <div className="w-full h-screen max-h-screen overflow-hidden flex flex-col justify-between">
      {/* Accessible Landmark */}
      <h1 className="sr-only">Sofia Personal AI Companion — Luxury Jarvis Voice Console</h1>

      {/* 3D Living Character & Glassy Voice Stage */}
      <div className="flex-1 min-h-0 w-full h-full overflow-hidden">
        <Sofia3DStage
          expression={currentExpression}
          isSpeaking={isSpeaking}
          isListening={isListening}
          isThinking={isThinking}
          dialogue={dialogue}
          lastUserSpeech={lastUserSpeech}
          jarvisMode={jarvisMode}
          onToggleJarvis={toggleJarvisMode}
          onStartListening={startListening}
          onStopListening={stopListening}
          onSpeak={triggerSpeak}
          onInterrupt={handleInterrupt}
          onSendPrompt={sendPromptToSofia}
          onOpenVoiceModal={() => setShowVoiceModal(true)}
          voiceProvider={voiceProvider}
        />
      </div>

      {/* ElevenLabs Voice Setup Modal */}
      {showVoiceModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="voice-modal-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-rose-500/40 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-rose-400" aria-hidden="true" />
                <h2 id="voice-modal-title" className="text-lg font-bold font-mono text-rose-50">
                  ElevenLabs Voice Setup
                </h2>
              </div>
              <button
                onClick={() => setShowVoiceModal(false)}
                className="text-rose-300 hover:text-white p-1 rounded-lg"
                aria-label="Close voice setup modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveVoiceSettings} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="elevenlabs-api-key" className="text-xs font-mono text-rose-200 block">
                  ElevenLabs API Key
                </label>
                <input
                  id="elevenlabs-api-key"
                  type="password"
                  value={elevenLabsKey}
                  onChange={(e) => setElevenLabsKey(e.target.value)}
                  placeholder="Paste your xi-api-key here..."
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-xs font-mono placeholder:text-rose-400 min-h-[44px]"
                />
                <p className="text-[11px] text-rose-300/80 font-sans">
                  If left empty, Sofia seamlessly uses the browser’s high-quality neural voice without needing any API key.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="elevenlabs-voice-id" className="text-xs font-mono text-rose-200 block">
                  Curated ElevenLabs Voice
                </label>
                <select
                  id="elevenlabs-voice-id"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-xs bg-[#1a040e] font-mono min-h-[44px]"
                >
                  <option value="21m00Tcm4TlvDq8ikWAM">Rachel — Composed, Calm &amp; Clear (Recommended)</option>
                  <option value="EXAVITQu4vr4xnSDxMaL">Bella — Warm &amp; Expressive</option>
                  <option value="MF3mGyEYCl7XYWbV9V6O">Elli — Youthful &amp; Energetic</option>
                  <option value="AZnzlk1XvdvUeBnXmlld">Domi — Confident &amp; Strong</option>
                  <option value="ThT5KcBeYPX3keUQqHPh">Dorothy — British &amp; Elegant</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-rose-500/20">
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-200 text-xs font-mono min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 text-white font-mono text-xs font-bold min-h-[44px]"
                >
                  Save &amp; Activate Voice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
