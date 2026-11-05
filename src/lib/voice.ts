'use client';

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;

export interface SpeakOptions {
  voiceId?: string;
  apiKey?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

/**
 * Robust Speech Synthesis: Tries ElevenLabs via /api/tts first,
 * seamlessly falls back to highest-quality browser neural speech synthesis.
 */
export async function speakSofia(
  text: string,
  options: SpeakOptions = {}
): Promise<void> {
  const cleanText = text
    .replace(/\[MOOD:[^\]]+\]/gi, '')
    .replace(/[`*_#]/g, '')
    .trim();

  if (!cleanText) return;

  stopSpeaking();

  try {
    // 1. Try ElevenLabs API endpoint
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('sofia_elevenlabs_key') : null;
    const storedVoice = typeof window !== 'undefined' ? localStorage.getItem('sofia_elevenlabs_voice_id') : null;

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        voiceId: options.voiceId || storedVoice || undefined,
        apiKey: options.apiKey || storedKey || undefined,
      }),
    });

    const contentType = res.headers.get('content-type') || '';

    if (res.ok && contentType.includes('audio/mpeg')) {
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;

      audio.onplay = () => options.onStart?.();
      audio.onended = () => {
        currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        options.onEnd?.();
      };
      audio.onerror = (e) => {
        console.warn('Audio element error, falling back to Web Speech:', e);
        fallbackBrowserSpeech(cleanText, options);
      };

      await audio.play();
      return;
    }

    // If server responded with JSON fallback
    fallbackBrowserSpeech(cleanText, options);
  } catch (err) {
    console.warn('ElevenLabs fetch failed, using browser fallback:', err);
    fallbackBrowserSpeech(cleanText, options);
  }
}

function fallbackBrowserSpeech(text: string, options: SpeakOptions = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    options.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  utterance.rate = 1.02;
  utterance.pitch = 1.05;

  const selectVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Prioritize natural / neural female English voices
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Neural') ||
          v.name.includes('Natural') ||
          v.name.includes('Jenny') ||
          v.name.includes('Samantha') ||
          v.name.includes('Victoria') ||
          v.name.includes('Google UK English Female') ||
          v.name.includes('Female'))
    );

    return preferred || voices.find((v) => v.lang.startsWith('en')) || voices[0];
  };

  const voice = selectVoice();
  if (voice) {
    utterance.voice = voice;
  } else {
    // If voices haven't loaded yet in Chromium
    window.speechSynthesis.onvoiceschanged = () => {
      const v = selectVoice();
      if (v) utterance.voice = v;
    };
  }

  utterance.onstart = () => {
    options.onStart?.();
  };

  utterance.onend = () => {
    currentUtterance = null;
    options.onEnd?.();
  };

  utterance.onerror = (e) => {
    console.warn('SpeechSynthesis error:', e);
    currentUtterance = null;
    options.onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}
