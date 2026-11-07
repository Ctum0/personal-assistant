'use client';

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let audioContext: AudioContext | null = null;
let isAudioUnlocked = false;

export interface SpeakOptions {
  provider?: string;
  voiceId?: string;
  token?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

/**
 * Resolves the client authentication headers for API requests.
 */
function getClientAuthHeaders(explicitToken?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let token = explicitToken;

  if (!token && typeof window !== 'undefined') {
    token =
      localStorage.getItem('sofia_token') ||
      sessionStorage.getItem('sofia_token') ||
      localStorage.getItem('sofia_api_token') ||
      undefined;

    if (!token && document.cookie) {
      const match = document.cookie.match(/(?:^|;\s*)sofia_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-sofia-token'] = token;
  }
  return headers;
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
        audioContext.resume().catch(() => {});
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
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    currentUtterance = null;
  }
}

/**
 * Returns whether Sofia is currently outputting audible speech.
 */
export function isSpeakingNow(): boolean {
  if (currentAudio && !currentAudio.paused && !currentAudio.ended) {
    return true;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
    return true;
  }
  return false;
}

/**
 * Robust Speech Synthesis:
 * Calls /api/tts with authentication headers.
 * Falls back cleanly to browser speech synthesis on server failure.
 */
export async function speakSofia(
  text: string,
  options: SpeakOptions = {}
): Promise<void> {
  const cleanText = text
    .replace(/\[MOOD:[^\]]+\]/gi, '')
    .replace(/[`*_#]/g, '')
    .trim();

  if (!cleanText) {
    options.onEnd?.();
    return;
  }

  unlockAudio();
  stopSpeaking();

  try {
    const authHeaders = getClientAuthHeaders(options.token);
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      credentials: 'same-origin',
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
      const audio = new Audio();
      audio.src = audioUrl;
      currentAudio = audio;

      let started = false;
      const cleanup = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
        URL.revokeObjectURL(audioUrl);
      };

      audio.onplay = () => {
        started = true;
        options.onStart?.();
      };

      audio.onended = () => {
        cleanup();
        options.onEnd?.();
      };

      audio.onerror = (e) => {
        cleanup();
        console.warn('Audio element playback error, falling back to Web Speech:', e);
        fallbackBrowserSpeech(cleanText, options);
      };

      try {
        await audio.play();
        return;
      } catch (playErr: any) {
        if (playErr.name === 'AbortError') {
          // Playback intentionally stopped or superseded
          cleanup();
          return;
        }
        console.warn('audio.play() error:', playErr);
        cleanup();
        fallbackBrowserSpeech(cleanText, options);
        return;
      }
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

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    currentUtterance = utterance;
    utterance.rate = 1.02;
    utterance.pitch = 1.15;

    const selectVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return null;

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
      options.onError?.(e);
      options.onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    currentUtterance = null;
    options.onError?.(err);
    options.onEnd?.();
  }
}
