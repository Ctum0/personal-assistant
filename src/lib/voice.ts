'use client';

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let audioContext: AudioContext | null = null;
let isAudioUnlocked = false;
let activeAbortController: AbortController | null = null;
let playbackGeneration = 0;

export interface SpeakOptions {
  provider?: string;
  voiceId?: string;
  token?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
  onTTFA?: (ttfaMs: number) => void;
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
  playbackGeneration++;
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
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
 * Splits text into natural sentence chunks for rapid streaming delivery.
 */
function splitIntoSentences(text: string): string[] {
  const rawSentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (rawSentences.length <= 1) return rawSentences;

  const merged: string[] = [];
  let buffer = '';

  for (const s of rawSentences) {
    if (buffer.length === 0) {
      buffer = s;
    } else if (buffer.length + s.length < 80) {
      buffer += ' ' + s;
    } else {
      merged.push(buffer);
      buffer = s;
    }
  }
  if (buffer.length > 0) {
    merged.push(buffer);
  }
  return merged;
}

/**
 * Synthesizes a single chunk via /api/tts.
 */
async function fetchTtsAudio(
  sentence: string,
  options: SpeakOptions,
  signal: AbortSignal
): Promise<string | null> {
  const authHeaders = getClientAuthHeaders(options.token);
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      text: sentence,
      provider: options.provider,
      voiceId: options.voiceId,
    }),
    signal,
  });

  const contentType = res.headers.get('content-type') || '';
  if (res.ok && contentType.includes('audio/mpeg')) {
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
  return null;
}

/**
 * Sentence-Buffered Speech Synthesis:
 * 1. Splits speech into conversational sentences.
 * 2. Fetches Sentence 1 immediately to minimize TTFA (~400-800ms).
 * 3. Prefetches remaining sentences while playing.
 * 4. Gracefully falls back to Web Speech API on failure.
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

  const currentGen = playbackGeneration;
  const abortController = new AbortController();
  activeAbortController = abortController;

  const sentences = splitIntoSentences(cleanText);
  if (sentences.length === 0) {
    options.onEnd?.();
    return;
  }

  const startTime = Date.now();
  let firstAudioTriggered = false;

  try {
    // Pipeline: queue of audio promises
    const audioPromises: Promise<string | null>[] = sentences.map((sentence) =>
      fetchTtsAudio(sentence, options, abortController.signal).catch(() => null)
    );

    // Play each sentence sequentially
    for (let i = 0; i < audioPromises.length; i++) {
      if (playbackGeneration !== currentGen) return;

      const audioUrl = await audioPromises[i];
      if (playbackGeneration !== currentGen) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        return;
      }

      if (!audioUrl) {
        // If TTS API failed on the first sentence, fall back to browser Web Speech
        if (i === 0) {
          fallbackBrowserSpeech(cleanText, options);
          return;
        }
        continue;
      }

      await new Promise<void>((resolve) => {
        if (playbackGeneration !== currentGen) {
          URL.revokeObjectURL(audioUrl);
          resolve();
          return;
        }

        const audio = new Audio();
        audio.src = audioUrl;
        currentAudio = audio;

        audio.onplay = () => {
          if (!firstAudioTriggered) {
            firstAudioTriggered = true;
            const ttfa = Date.now() - startTime;
            options.onTTFA?.(ttfa);
            options.onStart?.();
          }
        };

        const finish = () => {
          if (currentAudio === audio) {
            currentAudio = null;
          }
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onended = finish;
        audio.onerror = () => {
          finish();
        };

        audio.play().catch((playErr: any) => {
          if (playErr.name !== 'AbortError') {
            console.warn('Playback error for sentence chunk:', playErr);
          }
          finish();
        });
      });
    }

    if (playbackGeneration === currentGen) {
      options.onEnd?.();
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    console.warn('/api/tts fetch failed, using browser fallback:', err);
    fallbackBrowserSpeech(cleanText, options);
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null;
    }
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
