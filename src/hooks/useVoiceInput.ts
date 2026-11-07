'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { stopSpeaking, isSpeakingNow } from '@/lib/voice';

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
  silenceTimeoutMs?: number; // default 1100ms
  continuous?: boolean;
  isSofiaSpeaking?: boolean;
  onBargeIn?: () => void;
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
  const { onFinalTranscript, onStateChange, silenceTimeoutMs = 1100 } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [voiceState, setVoiceStateInternal] = useState<VoiceInputState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState(0);

  const stateRef = useRef<VoiceInputState>('idle');
  const listeningRef = useRef(false);
  const transcriptRef = useRef('');
  const lastCommittedTextRef = useRef('');
  const lastCommittedTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const selectedMimeTypeRef = useRef<string>('audio/webm');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastSpokenTimeRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);
  const isStoppingRef = useRef(false);

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

  const sendAudioForTranscription = useCallback(
    async (chunks: Blob[], mimeType: string) => {
      if (chunks.length === 0) {
        if (listeningRef.current) {
          updateState('listening');
        } else {
          updateState('idle');
        }
        return;
      }

      updateState('transcribing');
      setInterimTranscript('Transcribing audio...');

      try {
        const audioBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'speech.webm');

        const res = await fetch('/api/stt', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const recognizedText = typeof data.text === 'string' ? data.text.trim() : '';

        if (recognizedText) {
          setTranscript(recognizedText);
          setInterimTranscript('');
          commitTranscript(recognizedText);
        } else {
          setInterimTranscript('');
          if (listeningRef.current) {
            updateState('listening');
          } else {
            updateState('idle');
          }
        }
      } catch (err: any) {
        console.warn('STT transcription error:', err);
        setError('Voice transcription failed. You can also type your message.');
        setInterimTranscript('');
        if (listeningRef.current) {
          updateState('listening');
        } else {
          updateState('idle');
        }
      }
    },
    [commitTranscript, updateState]
  );

  const stopListening = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    listeningRef.current = false;

    cleanupAudio();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Failed to stop MediaRecorder:', err);
      }
    } else {
      updateState('idle');
    }

    setTimeout(() => {
      isStoppingRef.current = false;
    }, 300);
  }, [cleanupAudio, updateState]);

  const startListening = useCallback(async () => {
    setError(null);
    stopListening();
    updateState('requesting');
    audioChunksRef.current = [];
    hasSpokenRef.current = false;
    lastSpokenTimeRef.current = Date.now();
    setTranscript('');
    setInterimTranscript('Listening...');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Audio recording is not supported in this browser');
        updateState('error');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Audio analysis for RMS volume and silence detection
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      // Determine best supported MIME type
      let selectedMimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];
        for (const mt of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mt)) {
            selectedMimeType = mt;
            break;
          }
        }
      }
      selectedMimeTypeRef.current = selectedMimeType;

      const recorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];
        if (hasSpokenRef.current && chunks.length > 0) {
          sendAudioForTranscription(chunks, selectedMimeType);
        } else {
          setInterimTranscript('');
          updateState('idle');
        }
      };

      recorder.start(200); // Collect in 200ms slices for agile endpointing
      listeningRef.current = true;
      updateState('listening');

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
          const SPEECH_THRESHOLD = 0.022;

          // Barge-in detection while Sofia is speaking
          const isSofiaSpeaking = optionsRef.current.isSofiaSpeaking || isSpeakingNow();
          if (rms > SPEECH_THRESHOLD && isSofiaSpeaking) {
            stopSpeaking();
            optionsRef.current.onBargeIn?.();
            lastSpokenTimeRef.current = now;
            hasSpokenRef.current = true;
            setInterimTranscript('Recording speech...');
            setSilenceCountdown(0);
            updateState('listening');
          } else if (rms > SPEECH_THRESHOLD) {
            lastSpokenTimeRef.current = now;
            hasSpokenRef.current = true;
            setInterimTranscript('Recording speech...');
            setSilenceCountdown(0);
          } else if (hasSpokenRef.current) {
            const elapsedSilence = now - lastSpokenTimeRef.current;
            const ratio = Math.min(1, elapsedSilence / silenceTimeoutMs);
            setSilenceCountdown(ratio);

            if (elapsedSilence >= silenceTimeoutMs) {
              if (optionsRef.current.continuous !== false) {
                // Sliced utterance capture in continuous mode
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                  try {
                    mediaRecorderRef.current.requestData();
                  } catch {}
                }
                setTimeout(() => {
                  const chunks = [...audioChunksRef.current];
                  audioChunksRef.current = [];
                  hasSpokenRef.current = false;
                  setSilenceCountdown(0);
                  if (chunks.length > 0) {
                    sendAudioForTranscription(chunks, selectedMimeTypeRef.current);
                  }
                }, 40);
              } else {
                stopListening();
                return;
              }
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
  }, [cleanupAudio, sendAudioForTranscription, silenceTimeoutMs, stopListening, updateState]);

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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
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
