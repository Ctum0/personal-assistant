'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseVoiceInputOptions {
  onFinalTranscript?: (transcript: string) => void;
  silenceTimeoutMs?: number; // default 1600ms
}

export interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  silenceCountdown: number; // 0 to 1 ratio or countdown ms
  startListening: () => Promise<void>;
  stopListening: () => void;
  toggleListening: () => Promise<void>;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onFinalTranscript, silenceTimeoutMs = 1600 } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState(0);

  const listeningRef = useRef(false);
  const transcriptRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpokenTimeRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);

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
      streamRef.current.getTracks().forEach((t) => t.stop());
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
    setIsListening(false);
    cleanupAudio();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    // Flush any pending transcript if available
    const pending = transcriptRef.current.trim();
    if (pending && hasSpokenRef.current) {
      onFinalTranscript?.(pending);
    }
    transcriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    hasSpokenRef.current = false;
  }, [cleanupAudio, onFinalTranscript]);

  const initRecognition = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setError('Speech recognition not supported in this browser');
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
      }

      if (interimStr) {
        setInterimTranscript(interimStr);
        hasSpokenRef.current = true;
        lastSpokenTimeRef.current = Date.now();
      } else {
        setInterimTranscript('');
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        // Silently ignore normal speech pauses and aborts
        return;
      }
      if (e.error === 'not-allowed') {
        setError('Microphone permission denied');
        stopListening();
        return;
      }
      console.warn('SpeechRecognition error:', e.error);
    };

    recognition.onend = () => {
      // Auto-restart if user has not explicitly stopped
      if (listeningRef.current) {
        setTimeout(() => {
          if (listeningRef.current) {
            try {
              recognition.start();
            } catch (err) {
              console.debug('Recognition restart notice:', err);
            }
          }
        }, 150);
      }
    };

    return recognition;
  }, [stopListening]);

  const startListening = useCallback(async () => {
    setError(null);
    stopListening();

    try {
      // Preflight microphone access
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Audio recording not supported');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio analysis for silence detection
      const AudioCtx =
        window.AudioContext ||
        (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recognition = initRecognition();
      if (!recognition) {
        cleanupAudio();
        return;
      }

      recognitionRef.current = recognition;
      listeningRef.current = true;
      setIsListening(true);
      transcriptRef.current = '';
      setTranscript('');
      setInterimTranscript('');
      hasSpokenRef.current = false;
      lastSpokenTimeRef.current = Date.now();

      recognition.start();

      // RMS volume analysis loop
      const buffer = new Uint8Array(analyser.frequencyBinCount);
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
        } else if (hasSpokenRef.current && (transcriptRef.current || interimTranscript)) {
          const elapsedSilence = now - lastSpokenTimeRef.current;
          const ratio = Math.min(1, elapsedSilence / silenceTimeoutMs);
          setSilenceCountdown(ratio);

          if (elapsedSilence >= silenceTimeoutMs) {
            // Silence period exceeded: commit final speech
            const committed = (transcriptRef.current + ' ' + interimTranscript).trim();
            if (committed) {
              onFinalTranscript?.(committed);
            }
            transcriptRef.current = '';
            setTranscript('');
            setInterimTranscript('');
            hasSpokenRef.current = false;
            setSilenceCountdown(0);
          }
        }

        animFrameRef.current = requestAnimationFrame(monitorAudio);
      };

      monitorAudio();
    } catch (err: any) {
      console.error('Failed to start microphone:', err);
      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied');
      } else {
        setError('Could not access microphone');
      }
      stopListening();
    }
  }, [stopListening, initRecognition, silenceTimeoutMs, onFinalTranscript, interimTranscript, cleanupAudio]);

  const toggleListening = useCallback(async () => {
    if (listeningRef.current) {
      stopListening();
    } else {
      await startListening();
    }
  }, [startListening, stopListening]);

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
    isListening,
    transcript,
    interimTranscript,
    error,
    silenceCountdown,
    startListening,
    stopListening,
    toggleListening,
  };
}
