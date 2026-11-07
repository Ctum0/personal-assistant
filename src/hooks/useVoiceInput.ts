'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type VoiceInputState =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'transcribing'
  | 'waiting'
  | 'speaking'
  | 'interrupted'
  | 'error';

export interface UseVoiceInputOptions {
  onFinalTranscript?: (transcript: string) => void;
  onStateChange?: (state: VoiceInputState) => void;
  silenceTimeoutMs?: number; // default 1500ms
}

export interface UseVoiceInputReturn {
  isListening: boolean;
  voiceState: VoiceInputState;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  silenceCountdown: number; // 0 to 1 ratio
  startListening: () => Promise<void>;
  stopListening: () => void;
  toggleListening: () => Promise<void>;
  injectTranscript: (text: string) => void;
  setVoiceState: (state: VoiceInputState) => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onFinalTranscript, onStateChange, silenceTimeoutMs = 1500 } = options;

  const [voiceState, setVoiceStateInternal] = useState<VoiceInputState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState(0);

  const stateRef = useRef<VoiceInputState>('idle');
  const listeningRef = useRef(false);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const lastCommittedTextRef = useRef('');
  const lastCommittedTimeRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpokenTimeRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);

  const updateState = useCallback(
    (newState: VoiceInputState) => {
      stateRef.current = newState;
      setVoiceStateInternal(newState);
      onStateChange?.(newState);
    },
    [onStateChange]
  );

  // Debounced commit handler preventing duplicate triggers
  const commitTranscript = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      const now = Date.now();
      // Suppress duplicate submissions of identical text within 2 seconds
      if (text === lastCommittedTextRef.current && now - lastCommittedTimeRef.current < 2000) {
        return;
      }
      lastCommittedTextRef.current = text;
      lastCommittedTimeRef.current = now;
      updateState('waiting');
      onFinalTranscript?.(text);
    },
    [onFinalTranscript, updateState]
  );

  // Stop everything and reset audio nodes
  const cleanupAudio = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setSilenceCountdown(0);
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    cleanupAudio();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    // Flush any pending transcript if user spoke
    const pending = (transcriptRef.current + ' ' + interimTranscriptRef.current).trim();
    if (pending && hasSpokenRef.current) {
      commitTranscript(pending);
    } else {
      updateState('idle');
    }

    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    hasSpokenRef.current = false;
  }, [cleanupAudio, commitTranscript, updateState]);

  const initRecognition = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setError('Speech recognition not supported in this browser');
      updateState('error');
      return null;
    }

    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalStr = '';
      let interimStr = '';

      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) {
          finalStr += item[0].transcript + ' ';
        } else {
          interimStr += item[0].transcript;
        }
      }

      if (finalStr) {
        transcriptRef.current = (transcriptRef.current + ' ' + finalStr).replace(/\s+/g, ' ').trim();
        setTranscript(transcriptRef.current);
        hasSpokenRef.current = true;
        lastSpokenTimeRef.current = Date.now();
        updateState('transcribing');
      }

      if (interimStr) {
        interimTranscriptRef.current = interimStr;
        setInterimTranscript(interimStr);
        hasSpokenRef.current = true;
        lastSpokenTimeRef.current = Date.now();
        updateState('transcribing');
      } else {
        interimTranscriptRef.current = '';
        setInterimTranscript('');
        if (listeningRef.current) {
          updateState('listening');
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        // Silently ignore normal speech pauses and deliberate aborts
        return;
      }
      if (e.error === 'not-allowed') {
        setError('Microphone permission denied');
        updateState('error');
        stopListening();
        return;
      }
      if (e.error === 'network') {
        // Speech service offline / network error: abort loop cleanly
        setError('Speech recognition service offline or unreachable in this browser');
        updateState('error');
        stopListening();
        return;
      }
      console.warn('SpeechRecognition error:', e.error);
      setError(`Speech recognition: ${e.error}`);
      updateState('error');
      stopListening();
    };

    recognition.onend = () => {
      // Auto-restart only if listening and no error occurred
      if (listeningRef.current && stateRef.current !== 'error') {
        setTimeout(() => {
          if (listeningRef.current && stateRef.current !== 'error') {
            try {
              recognition.start();
            } catch (err) {
              console.debug('Recognition restart notice:', err);
            }
          }
        }, 200);
      }
    };

    return recognition;
  }, [stopListening, updateState]);

  const startListening = useCallback(async () => {
    setError(null);
    stopListening();
    updateState('requesting');

    try {
      // Preflight microphone access
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Audio recording not supported in this browser');
        updateState('error');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio analysis for volume / silence detection
      const AudioCtx =
        window.AudioContext ||
        (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      const recognition = initRecognition();
      if (!recognition) {
        cleanupAudio();
        return;
      }

      recognitionRef.current = recognition;
      listeningRef.current = true;
      updateState('listening');
      transcriptRef.current = '';
      interimTranscriptRef.current = '';
      setTranscript('');
      setInterimTranscript('');
      hasSpokenRef.current = false;
      lastSpokenTimeRef.current = Date.now();

      recognition.start();

      // RMS volume analysis loop
      if (analyserRef.current) {
        const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
        const monitorAudio = () => {
          if (!listeningRef.current || !analyserRef.current) return;

          analyserRef.current.getByteTimeDomainData(buffer);
          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i++) {
            const norm = (buffer[i] - 128) / 128;
            sumSquares += norm * norm;
          }
          const rms = Math.sqrt(sumSquares / buffer.length);

          const now = Date.now();
          const SPEECH_THRESHOLD = 0.02;

          if (rms > SPEECH_THRESHOLD) {
            lastSpokenTimeRef.current = now;
            hasSpokenRef.current = true;
            setSilenceCountdown(0);
          } else if (hasSpokenRef.current && (transcriptRef.current || interimTranscriptRef.current)) {
            const elapsedSilence = now - lastSpokenTimeRef.current;
            const ratio = Math.min(1, elapsedSilence / silenceTimeoutMs);
            setSilenceCountdown(ratio);

            if (elapsedSilence >= silenceTimeoutMs) {
              // Silence period exceeded: commit final speech
              const committed = (transcriptRef.current + ' ' + interimTranscriptRef.current).trim();
              if (committed) {
                commitTranscript(committed);
              }
              transcriptRef.current = '';
              interimTranscriptRef.current = '';
              setTranscript('');
              setInterimTranscript('');
              hasSpokenRef.current = false;
              setSilenceCountdown(0);
            }
          }

          animFrameRef.current = requestAnimationFrame(monitorAudio);
        };

        monitorAudio();
      }
    } catch (err: any) {
      console.error('Failed to start microphone:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone permission denied');
      } else {
        setError('Could not access microphone');
      }
      updateState('error');
      stopListening();
    }
  }, [stopListening, initRecognition, silenceTimeoutMs, commitTranscript, cleanupAudio, updateState]);

  const toggleListening = useCallback(async () => {
    if (listeningRef.current) {
      stopListening();
    } else {
      await startListening();
    }
  }, [startListening, stopListening]);

  // Allows test fixtures and external input to inject recognized voice transcript cleanly
  const injectTranscript = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      hasSpokenRef.current = true;
      transcriptRef.current = clean;
      setTranscript(clean);
      updateState('transcribing');
      commitTranscript(clean);
    },
    [commitTranscript, updateState]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      cleanupAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [cleanupAudio]);

  return {
    isListening: voiceState === 'listening' || voiceState === 'transcribing' || voiceState === 'requesting',
    voiceState,
    transcript,
    interimTranscript,
    error,
    silenceCountdown,
    startListening,
    stopListening,
    toggleListening,
    injectTranscript,
    setVoiceState: updateState,
  };
}
