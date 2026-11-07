'use client';

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let audioContext: AudioContext | null = null;
let isAudioUnlocked = false;
let activeAbortController: AbortController | null = null;
let currentPlaybackTurnId = 0;
let isPlaybackActive = false;

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
 * Resolves client authentication headers for API requests.
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
 * Audio Unlocker: Initializes and resumes AudioContext on user interaction
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
 * Centralized Voice Cancellation:
 * Instantly halts any active Edge TTS audio, queued sentence buffers,
 * in-flight network requests, and browser speech synthesis.
 */
export function stopSpeaking(): void {
  currentPlaybackTurnId++;
  isPlaybackActive = false;

  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {}
    activeAbortController = null;
  }

  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.src = '';
    } catch {}
    activeAudio = null;
  }

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    activeUtterance = null;
  }
}

/**
 * Returns whether Sofia is currently outputting audible speech.
 */
export function isSpeakingNow(): boolean {
  if (isPlaybackActive) return true;
  if (activeAudio && !activeAudio.paused && !activeAudio.ended) return true;
  if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
    return true;
  }
  return false;
}

/**
 * Splits text into natural conversational sentence chunks for rapid streaming delivery.
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
      provider: options.provider || 'edge',
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
 * Central Sofia Audio Controller:
 * - Exactly ONE voice stream active at a time (Edge TTS as canonical voice).
 * - Immediate Time to First Audio (TTFA < 1.5s) via sentence-1 streaming.
 * - Concurrently prefetches sentence queue in background.
 * - Strictly prevents dual-playback or overlapping speech synthesis.
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
  stopSpeaking(); // Halts any prior playback and increments turn ID

  const turnId = currentPlaybackTurnId;
  const abortController = new AbortController();
  activeAbortController = abortController;

  const sentences = splitIntoSentences(cleanText);
  if (sentences.length === 0) {
    options.onEnd?.();
    return;
  }

  const startTime = Date.now();
  let firstAudioTriggered = false;
  isPlaybackActive = true;

  try {
    // Pipeline: fetch audio promises for all sentences in parallel
    const audioPromises: Promise<string | null>[] = sentences.map((sentence) =>
      fetchTtsAudio(sentence, options, abortController.signal).catch(() => null)
    );

    for (let i = 0; i < audioPromises.length; i++) {
      if (currentPlaybackTurnId !== turnId) return;

      const audioUrl = await audioPromises[i];
      if (currentPlaybackTurnId !== turnId) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        return;
      }

      if (!audioUrl) {
        // Only if sentence 0 completely failed and no audio has played yet, invoke controlled fallback
        if (i === 0 && !firstAudioTriggered) {
          fallbackBrowserSpeech(cleanText, options, turnId);
          return;
        }
        continue;
      }

      await new Promise<void>((resolve) => {
        if (currentPlaybackTurnId !== turnId) {
          URL.revokeObjectURL(audioUrl);
          resolve();
          return;
        }

        const audio = new Audio();
        audio.src = audioUrl;
        activeAudio = audio;

        audio.onplay = () => {
          if (!firstAudioTriggered && currentPlaybackTurnId === turnId) {
            firstAudioTriggered = true;
            const ttfa = Date.now() - startTime;
            options.onTTFA?.(ttfa);
            options.onStart?.();
          }
        };

        const finish = () => {
          if (activeAudio === audio) {
            activeAudio = null;
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

    if (currentPlaybackTurnId === turnId) {
      isPlaybackActive = false;
      options.onEnd?.();
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || currentPlaybackTurnId !== turnId) return;
    console.warn('/api/tts fetch failed, attempting emergency fallback:', err);
    if (!firstAudioTriggered && currentPlaybackTurnId === turnId) {
      fallbackBrowserSpeech(cleanText, options, turnId);
    }
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null;
    }
    if (currentPlaybackTurnId === turnId) {
      isPlaybackActive = false;
    }
  }
}

/**
 * Controlled Emergency Fallback:
 * Executes ONLY when Edge TTS network request fails completely.
 * Never runs concurrently with Audio elements.
 */
function fallbackBrowserSpeech(text: string, options: SpeakOptions = {}, turnId: number) {
  if (typeof window === 'undefined' || !window.speechSynthesis || currentPlaybackTurnId !== turnId) {
    options.onEnd?.();
    return;
  }

  // Ensure all audio elements are completely torn down
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.src = '';
    } catch {}
    activeAudio = null;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance = utterance;
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
        if (currentPlaybackTurnId === turnId) {
          const v = selectVoice();
          if (v) utterance.voice = v;
        }
      };
    }

    utterance.onstart = () => {
      if (currentPlaybackTurnId === turnId) {
        options.onStart?.();
      }
    };

    utterance.onend = () => {
      activeUtterance = null;
      if (currentPlaybackTurnId === turnId) {
        options.onEnd?.();
      }
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      activeUtterance = null;
      if (currentPlaybackTurnId === turnId) {
        options.onError?.(e);
        options.onEnd?.();
      }
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    activeUtterance = null;
    options.onError?.(err);
    options.onEnd?.();
  }
}
