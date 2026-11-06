'use client';

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let audioContext: AudioContext | null = null;
let isAudioUnlocked = false;

export interface SpeakOptions {
  provider?: string;
  voiceId?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

/**
 * Audio Unlocker: Initializes and resumes AudioContext on the first user interaction
 * so speech playback is unlocked across mobile and desktop browsers.
 */
export function unlockAudio() {
  if (isAudioUnlocked || typeof window === 'undefined') return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      if (!audioContext) {
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
      isAudioUnlocked = true;
    }
  } catch (e) {
    console.debug('AudioContext unlock failed:', e);
  }
}

/**
 * Barge-in / interruption: Instantly halt any active audio or browser speech playback.
 */
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
 * Robust Speech Synthesis:
 * Calls /api/tts (Edge TTS by default, or ElevenLabs if configured & within budget).
 * Falls back cleanly to high-quality browser speech synthesis on network failure.
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

  unlockAudio();
  stopSpeaking();

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        provider: options.provider,
        voiceId: options.voiceId,
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

    fallbackBrowserSpeech(cleanText, options);
  } catch (err) {
    console.warn('/api/tts fetch failed, using browser fallback:', err);
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
  utterance.pitch = 1.15;

  const selectVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Preferred voices in order
    const priorityNames = [
      'Google UK English Female',
      'Google US English',
      'Samantha',
      'Victoria',
    ];

    for (const name of priorityNames) {
      const matched = voices.find((v) => v.name.includes(name));
      if (matched) return matched;
    }

    const femaleEn = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.toLowerCase().includes('female') ||
          v.name.includes('Jenny') ||
          v.name.includes('Aria') ||
          v.name.includes('Neural'))
    );
    if (femaleEn) return femaleEn;

    return voices.find((v) => v.lang.startsWith('en')) || voices[0];
  };

  const voice = selectVoice();
  if (voice) {
    utterance.voice = voice;
  } else {
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
