'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Stage } from '@/components/Stage';
import { LiveState } from '@/components/SofiaAvatar';
import { LiveDebugOverlay, DebugMetrics } from '@/components/LiveDebugOverlay';
import { Pane } from '@/lib/stage';
import { SofiaExpression } from '@/lib/types';
import { getExpressionFromMood } from '@/lib/expressions';
import { speakSofia, stopSpeaking, unlockAudio, getAudioOwner, setAudioOwner } from '@/lib/voice';
import { SofiaLiveSession, LiveConnState } from '@/lib/live/session';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import {
  Mic,
  PhoneOff,
  Send,
  Moon,
  Volume2,
  VolumeX,
  MoreHorizontal,
  MessageSquare,
  Clock,
  TrendingUp,
  CheckSquare,
  BookOpen,
  Settings,
  Sparkles,
  Bot,
  Activity,
  Headphones,
} from 'lucide-react';

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('sofia_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SofiaStageHome() {
  const [expression, setExpression] = useState<SofiaExpression>('focused');
  const [moodLabel, setMoodLabel] = useState('Focused');
  const [captionText, setCaptionText] = useState(
    'I am Sofia. What are we getting done today?'
  );
  const [userCaption, setUserCaption] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationId, setConversationId] = useState<string>('conv_main');
  const [liveState, setLiveState] = useState<LiveState>('off');
  const [mouthOpen, setMouthOpen] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [score, setScore] = useState(85);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isRestDay, setIsRestDay] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Initialize or restore canonical conversation identity from localStorage and server SQLite
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let stored = localStorage.getItem('sofia_conversation_id');
      if (!stored) {
        stored = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        localStorage.setItem('sofia_conversation_id', stored);
      }
      setConversationId(stored);

      // 1. Rehydrate conversation messages to restore latest Sofia caption and turn context
      fetch(`/api/chat${stored ? `?sessionId=${encodeURIComponent(stored)}` : ''}`, {
        headers: getAuthHeaders(),
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((messages) => {
          if (Array.isArray(messages) && messages.length > 0) {
            const lastSession = messages[messages.length - 1].session_id;
            if (lastSession && lastSession !== 'default' && !stored) {
              setConversationId(lastSession);
              localStorage.setItem('sofia_conversation_id', lastSession);
            }
            const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
            const lastUser = [...messages].reverse().find((m) => m.role === 'user');
            if (lastAssistant?.content) {
              setCaptionText(lastAssistant.content);
              if (lastAssistant.mood) {
                setExpression(getExpressionFromMood(lastAssistant.mood));
                setMoodLabel(lastAssistant.mood.charAt(0).toUpperCase() + lastAssistant.mood.slice(1));
              }
            }
            if (lastUser?.content) {
              setUserCaption(lastUser.content);
            }
          }
        })
        .catch(() => {});

      // 2. Rehydrate active browser session for this conversation or active workspace
      fetch(`/api/browser/sessions`, {
        headers: getAuthHeaders(),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.sessions && Array.isArray(data.sessions)) {
            const activeSess = data.sessions.find(
              (s: any) =>
                s.status === 'active' &&
                s.conversation_id === stored &&
                Date.now() - new Date(s.updated_at).getTime() < 15 * 60 * 1000
            );
            if (activeSess) {
              setPanes((prev) => {
                if (prev.some((p) => p.kind === 'browser')) return prev;
                return [
                  {
                    id: `pane-browser-${activeSess.id}`,
                    title: activeSess.title,
                    kind: 'browser',
                    session_id: activeSess.id,
                    url: activeSess.current_url,
                    lease_holder: activeSess.lease_holder,
                    status: activeSess.status,
                  },
                  ...prev,
                ];
              });
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Single-Brain Voice Input (Transcription-First -> Hermes -> Edge TTS)
  const {
    isListening: isVoiceListening,
    voiceState,
    interimTranscript: voiceInterim,
    error: voiceError,
    startListening: startVoiceInput,
    stopListening: stopVoiceInput,
    injectTranscript: injectVoiceTranscript,
    setVoiceState,
  } = useVoiceInput({
    onFinalTranscript: (transcript) => {
      if (transcript.trim()) {
        handleSendMessage(transcript.trim(), 'voice');
      }
    },
    silenceTimeoutMs: 1100,
    continuous: true,
    isSofiaSpeaking: isSpeaking,
    onBargeIn: () => {
      setIsSpeaking(false);
    },
  });

  // Expose test harness on window for automated browser voice testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__sofiaVoiceHarness = {
        injectTranscript: injectVoiceTranscript,
        startVoiceInput,
        stopVoiceInput,
        voiceState,
        isVoiceListening,
        speakSofia,
        stopSpeaking,
      };
    }
  }, [injectVoiceTranscript, startVoiceInput, stopVoiceInput, voiceState, isVoiceListening]);

  // Handle voice error notification
  useEffect(() => {
    if (voiceError) {
      setCaptionText(voiceError);
      setExpression('concerned');
    }
  }, [voiceError]);

  // Reflect interim voice transcription in the user caption
  useEffect(() => {
    if (isVoiceListening && voiceInterim) {
      setUserCaption(voiceInterim);
    }
  }, [isVoiceListening, voiceInterim]);

  // Synchronize avatar liveState with voice & speaking activity
  useEffect(() => {
    if (isSpeaking) {
      setLiveState('speaking');
    } else if (isSending) {
      setLiveState('thinking');
    } else if (isVoiceListening) {
      setLiveState('listening');
    } else if (liveSessionRef.current) {
      // Kept by duplex session callbacks if active
    } else {
      setLiveState('off');
    }
  }, [isSpeaking, isSending, isVoiceListening]);

  // Rehydrate active Hermes tasks on load or conversation restore
  useEffect(() => {
    if (!conversationId) return;

    fetch(`/api/hermes/runs?conversation_id=${encodeURIComponent(conversationId)}&limit=10`, {
      headers: getAuthHeaders(),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.runs)) {
          const activeRuns = data.runs.filter((r: any) =>
            ['running', 'started', 'queued'].includes(r.status)
          );
          // Only ACTIVE runs rehydrate. Seeding completed runs as panes is why
          // two stale "Task Completed" cards reappeared on every refresh — the
          // conversation history already holds those results.
          const runsToShow = activeRuns;
          if (runsToShow.length > 0) {
            setPanes((prev) => {
              const existingRunIds = new Set(prev.map((p) => p.run_id));
              const newPanes: Pane[] = runsToShow
                .filter((r: any) => !existingRunIds.has(r.hermes_run_id))
                .map((r: any) => ({
                  id: `pane-rehydrated-${r.hermes_run_id}`,
                  title: `Hermes: ${r.status === 'completed' ? 'Task Completed' : 'Active Task'}`,
                  kind: 'code' as const,
                  language: 'markdown',
                  run_id: r.hermes_run_id,
                  status: r.status,
                  code: r.output || `Task in progress on Hermes (Run ID: ${r.hermes_run_id})\nPrompt: ${r.prompt.slice(0, 80)}`,
                }));
              return [...prev, ...newPanes];
            });
          }
        }
      })
      .catch((err) => console.warn('Failed to rehydrate active runs:', err));

    // Rehydrate pending approvals on load or conversation restore
    fetch(`/api/hermes/approvals?conversation_id=${encodeURIComponent(conversationId)}&status=pending`, {
      headers: getAuthHeaders(),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.approvals)) {
          const pending = data.approvals;
          if (pending.length > 0) {
            setPanes((prev) => {
              const existingApprIds = new Set(
                prev.filter((p) => p.kind === 'approval').map((p) => (p as any).approval_id)
              );
              const newPanes: Pane[] = pending
                .filter((a: any) => !existingApprIds.has(a.id))
                .map((a: any) => ({
                  id: `pane-approval-${a.id}`,
                  title: `Approval Required: ${a.tool_name}`,
                  kind: 'approval' as const,
                  approval_id: a.id,
                  run_id: a.run_id,
                  tool_name: a.tool_name,
                  risk_level: a.risk_level,
                  target: a.arguments?.path || a.arguments?.command || a.arguments?.url || a.tool_name,
                  preview: a.preview_json,
                  action_hash: a.action_hash,
                  reason: a.reason || `Approval requested for ${a.tool_name}`,
                  expires_at: a.expires_at,
                  status: a.status,
                }));
              return [...prev, ...newPanes];
            });
          }
        }
      })
      .catch((err) => console.warn('Failed to rehydrate pending approvals:', err));
  }, [conversationId]);

  // Debug metrics
  const [debugMetrics, setDebugMetrics] = useState<DebugMetrics>({
    ttfa: null,
    ttft: null,
    connectionDuration: 0,
    sessionDuration: 0,
    reconnectCount: 0,
    dropCount: 0,
    model: 'hermes-3-llama-3.1',
    voice: 'AvaNeural (Edge TTS)',
    state: 'off',
    micRms: 0,
  });

  const liveSessionRef = useRef<SofiaLiveSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const usageTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check ?debug=1 in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === '1') {
        setShowDebug(true);
      }
    }
  }, []);

  // Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial status and score
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [settingsRes, scoreRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/score'),
        ]);

        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setIsRestDay(s.proactivity?.rest_day ?? false);
          if (s.voice?.auto_speak === false) {
            setIsMuted(true);
          }
        }

        if (scoreRes.ok) {
          const sc = await scoreRes.json();
          if (typeof sc.score === 'number') {
            setScore(sc.score);
          }
        }
      } catch (err) {
        console.warn('Initial state fetch error:', err);
      }
    };
    loadInitialState();
  }, []);

  // Close secondary menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Report live usage to SQLite every 30 seconds while connected
  useEffect(() => {
    if (liveState !== 'off') {
      usageTimerRef.current = setInterval(() => {
        fetch('/api/live/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: 30 }),
        }).catch(() => {});
      }, 30000);
    } else {
      if (usageTimerRef.current) {
        clearInterval(usageTimerRef.current);
        usageTimerRef.current = null;
      }
    }

    return () => {
      if (usageTimerRef.current) {
        clearInterval(usageTimerRef.current);
      }
    };
  }, [liveState]);

  // ONE voice lane. The mic button and the headphones both drive the duplex
  // Live session; Whisper survives only as an automatic fallback when Live
  // fails to come up. Two live input pipelines is exactly what produced
  // overlapping voices and a half-transcribed sentence per utterance.
  const startLiveSession = useCallback(async () => {
    unlockAudio();
    stopSpeaking();
    setAudioOwner(isMuted ? 'MUTED' : 'LIVE_GEMINI');
    setLiveState('connecting');

    // Diagnostic: if the user ever hears two voices, the console shows whether
    // it is two Live sessions (this counter) or Live + TTS fighting.
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __sofiaLiveSessions?: number };
      w.__sofiaLiveSessions = (w.__sofiaLiveSessions || 0) + 1;
      console.info(`[sofia] live session #${w.__sofiaLiveSessions} starting`);
    }

    const session = new SofiaLiveSession({
      onStateChange: (st: LiveConnState) => {
        if (st === 'off' || st === 'closing') {
          setLiveState('off');
          setIsSpeaking(false);
        } else if (
          st === 'minting' ||
          st === 'connecting' ||
          st === 'reconnecting' ||
          st === 'migrating'
        ) {
          setLiveState('connecting');
        } else if (st === 'speaking') {
          setLiveState('speaking');
          setIsSpeaking(true);
        } else if (st === 'listening' || st === 'live') {
          setLiveState('listening');
          setIsSpeaking(false);
        } else if (st === 'failed') {
          setLiveState('error');
          setIsSpeaking(false);
        }

        setDebugMetrics((prev) => ({ ...prev, state: st }));
      },
      onCaption: (u, m) => {
        if (u) setUserCaption(u);
        if (m) setCaptionText(m);
      },
      onMouthOpen: (openRatio) => {
        setMouthOpen(openRatio);
      },
      onPane: (pane) => {
        setPanes((prev) => {
          const pinned = prev.filter((p) => p.pinned);
          const withoutExisting = prev.filter((p) => p.id !== pane.id);
          return [...withoutExisting, pane];
        });
      },
      onMood: (mood) => {
        setMoodLabel(mood.charAt(0).toUpperCase() + mood.slice(1));
        setExpression(getExpressionFromMood(mood));
      },
      onMetrics: (m) => {
        setDebugMetrics((prev) => ({
          ...prev,
          ttfa: m.ttfa,
          ttft: m.ttft,
          connectionDuration: m.connDurationSec,
          sessionDuration: m.sessionDurationSec,
          reconnectCount: m.reconnects,
          dropCount: m.drops,
          voice: m.voice,
          model: m.model,
        }));
      },
      onError: (err) => {
        console.warn('Live session error:', err);
        setCaptionText(
          'Mic or connection issue — check browser permissions or try again.'
        );
        setLiveState('error');
      },
    }, conversationId);

    liveSessionRef.current = session;
    await session.start();

    // Fall back only on a genuine failure, never on "not connected yet".
    if (session.getState() === 'failed') {
      liveSessionRef.current = null;
      console.warn('Live session failed; falling back to the transcription lane');
      setAudioOwner(isMuted ? 'MUTED' : 'FALLBACK_TTS');
      setLiveState('off');
      await startVoiceInput();
    }
  }, [conversationId, isMuted, startVoiceInput]);

  const stopLiveSession = useCallback(() => {
    if (!liveSessionRef.current) return;
    liveSessionRef.current.stop();
    liveSessionRef.current = null;
    setAudioOwner(isMuted ? 'MUTED' : 'FALLBACK_TTS');
    setLiveState('off');
    setIsSpeaking(false);
    setMouthOpen(0);
    setMicLevel(0);
  }, [isMuted]);

  const toggleVoiceMode = useCallback(async () => {
    if (liveSessionRef.current) {
      stopLiveSession();
      return;
    }
    if (isVoiceListening) {
      stopVoiceInput();
      return;
    }
    await startLiveSession();
  }, [isVoiceListening, startLiveSession, stopLiveSession, stopVoiceInput]);

  const toggleLiveVoice = useCallback(async () => {
    if (liveSessionRef.current) {
      stopLiveSession();
      return;
    }
    await startLiveSession();
  }, [startLiveSession, stopLiveSession]);

  // The dock button reflects the LIVE session (the only voice lane now), not the
  // legacy Whisper hook, or it sits on "Talk" while she is actually connected.
  const liveActive = liveState !== 'off' && liveState !== 'error';

  const handleSendMessage = async (textToSend?: string, channel: 'chat' | 'voice' = 'chat') => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setInputText('');
    setShowSuggestions(false);
    setUserCaption(text);
    unlockAudio();

    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ message: text, sessionId: conversationId, channel }),
      });

      if (!res.ok) {
        throw new Error(`Chat API error (${res.status})`);
      }

      const data = await res.json();
      let turnSay = '';
      let turnText = '';
      let turnMood = 'neutral';
      let turnPanes: Pane[] = [];

      if (data && typeof data === 'object') {
        if (data.say) {
          turnSay = data.say;
          turnText = data.text || '';
          turnMood = data.mood || 'neutral';
          if (Array.isArray(data.panes)) turnPanes = data.panes;
        } else if (data.reply || data.response || data.content) {
          const raw = data.reply || data.response || data.content;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.say) {
              turnSay = parsed.say;
              turnText = parsed.text || '';
              turnMood = parsed.mood || 'neutral';
              if (Array.isArray(parsed.panes)) turnPanes = parsed.panes;
            } else {
              turnSay = raw;
            }
          } catch {
            turnSay = raw;
          }
          if (data.mood) turnMood = data.mood;
        }
      }

      if (!turnSay) turnSay = "I've processed your update.";

      // If full text contains extra information beyond spoken caption, project detailed pane
      // But NEVER displace a rich browser, code, or stat pane with a generic notes pane
      if (
        turnText &&
        turnText.length > turnSay.length + 40 &&
        !turnPanes.some((p) => p.kind === 'text' || p.kind === 'code' || p.kind === 'browser')
      ) {
        turnPanes.push({
          id: `pane-notes-${Date.now()}`,
          title: 'Notes & Details',
          kind: 'text',
          text: turnText,
        });
      }

      const newExpression = getExpressionFromMood(turnMood);
      setExpression(newExpression);
      setMoodLabel(turnMood.charAt(0).toUpperCase() + turnMood.slice(1));
      setCaptionText(turnSay);

      if (turnPanes && turnPanes.length > 0) {
        setPanes((prev) => {
          const pinned = prev.filter((p) => p.pinned);
          const hasNewBrowser = turnPanes.some((p) => p.kind === 'browser');
          const unpinnedPrev = prev.filter((p) => !p.pinned && (!hasNewBrowser || p.kind !== 'browser'));
          const newUnpinned = turnPanes.filter(
            (np) => !pinned.some((p) => p.id === np.id) && !unpinnedPrev.some((p) => p.id === np.id)
          );
          return [...pinned, ...newUnpinned, ...unpinnedPrev].slice(0, 4);
        });
      }

      if (!isMuted && getAudioOwner() === 'FALLBACK_TTS' && !liveSessionRef.current?.isActive()) {
        setIsSpeaking(true);
        await speakSofia(turnSay, {
          onStart: () => setIsSpeaking(true),
          onEnd: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
          onTTFA: (ttfa) => {
            setDebugMetrics((prev) => ({ ...prev, ttfa }));
          },
        });
      }
    } catch (err: any) {
      console.error('Failed to communicate with Sofia:', err);
      setCaptionText("I encountered an issue processing that. Let's try again.");
      setExpression('concerned');
    } finally {
      setIsSending(false);
    }
  };

  // Active Hermes task streaming & polling effect
  useEffect(() => {
    const activePanes = panes.filter(
      (p) => p.run_id && (p.status === 'running' || p.status === 'started' || p.status === 'queued')
    );
    if (activePanes.length === 0) return;

    let isMounted = true;
    const abortControllers = new Map<string, AbortController>();

    // Subscribe to real-time SSE run events (tool started, subagent start, message deltas)
    for (const p of activePanes) {
      if (!p.run_id || abortControllers.has(p.run_id)) continue;
      const controller = new AbortController();
      abortControllers.set(p.run_id, controller);

      (async () => {
        try {
          const res = await fetch(`/api/hermes/runs/${encodeURIComponent(p.run_id!)}/events`, {
            headers: getAuthHeaders(),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) return;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (isMounted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            let currentEvent = 'message';
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('event:')) {
                currentEvent = trimmed.slice(6).trim();
              } else if (trimmed.startsWith('data:')) {
                const dataRaw = trimmed.slice(5).trim();
                let parsedData: any = dataRaw;
                try {
                  parsedData = JSON.parse(dataRaw);
                } catch {}

                if (currentEvent === 'tool.started') {
                  const toolName = parsedData?.name || parsedData?.tool || 'tool';
                  setPanes((prev) =>
                    prev.map((item) =>
                      item.run_id === p.run_id
                        ? ({ ...item, status: 'running', title: `Hermes: Running ${toolName}...` } as Pane)
                        : item
                    )
                  );
                } else if (currentEvent === 'subagent.start') {
                  const subRole = parsedData?.role || parsedData?.name || 'Subagent';
                  setPanes((prev) =>
                    prev.map((item) =>
                      item.run_id === p.run_id
                        ? ({ ...item, status: 'running', title: `Hermes: Delegating to ${subRole}...` } as Pane)
                        : item
                    )
                  );
                } else if (currentEvent === 'message.delta' || currentEvent === 'message.interim') {
                  const delta = typeof parsedData === 'string' ? parsedData : parsedData?.content || parsedData?.delta || '';
                  if (delta) {
                    setPanes((prev) =>
                      prev.map((item) => {
                        if (item.run_id === p.run_id) {
                          const currentCode = (item as any).code || '';
                          return {
                            ...item,
                            kind: 'code' as const,
                            language: (item as any).language || 'markdown',
                            code: currentCode.endsWith(delta) ? currentCode : currentCode + delta,
                          } as Pane;
                        }
                        return item;
                      })
                    );
                  }
                } else if (['run.completed', 'run.failed', 'run.interrupted'].includes(currentEvent)) {
                  const status = currentEvent === 'run.completed' ? 'completed' : currentEvent === 'run.interrupted' ? 'waiting_approval' : 'failed';
                  const output = parsedData?.output || parsedData?.error || '';
                  setPanes((prev) =>
                    prev.map((item) =>
                      item.run_id === p.run_id
                        ? ({
                            ...item,
                            kind: 'code' as const,
                            language: (item as any).language || 'markdown',
                            status,
                            title: `Hermes: ${status === 'completed' ? 'Task Completed' : status === 'waiting_approval' ? 'Waiting Approval' : 'Task Failed'}`,
                            code: output || (item as any).code || '',
                          } as Pane)
                        : item
                    )
                  );

                  if (currentEvent === 'run.completed' && liveSessionRef.current) {
                    liveSessionRef.current.injectContextUpdate(`Hermes task (Run ID ${p.run_id}) finished with output:\n${output}`);
                  }

                  if (currentEvent === 'run.interrupted') {
                    fetch(`/api/hermes/approvals?conversation_id=${encodeURIComponent(conversationId)}&status=pending`, {
                      headers: getAuthHeaders(),
                    })
                      .then((res) => (res.ok ? res.json() : null))
                      .then((apprData) => {
                        if (apprData && Array.isArray(apprData.approvals)) {
                          const pending = apprData.approvals;
                          if (pending.length > 0) {
                            setPanes((prev) => {
                              const existingApprIds = new Set(
                                prev.filter((it) => it.kind === 'approval').map((it) => (it as any).approval_id)
                              );
                              const newApprPanes: Pane[] = pending
                                .filter((a: any) => !existingApprIds.has(a.id))
                                .map((a: any) => ({
                                  id: `pane-approval-${a.id}`,
                                  title: `Approval Required: ${a.tool_name}`,
                                  kind: 'approval' as const,
                                  approval_id: a.id,
                                  run_id: a.run_id,
                                  tool_name: a.tool_name,
                                  risk_level: a.risk_level,
                                  target: a.arguments?.path || a.arguments?.command || a.arguments?.url || a.tool_name,
                                  preview: a.preview_json,
                                  action_hash: a.action_hash,
                                  reason: a.reason || `Approval requested for ${a.tool_name}`,
                                  expires_at: a.expires_at,
                                  status: a.status,
                                }));
                              return [...prev, ...newApprPanes];
                            });
                          }
                        }
                      })
                      .catch(() => {});
                  }
                }
              }
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.debug('Run SSE stream notice:', err);
          }
        }
      })();
    }

    // Polling fallback loop ensures completion even if SSE connection drops
    const pollInterval = setInterval(async () => {
      for (const p of activePanes) {
        if (!p.run_id) continue;
        try {
          const res = await fetch(`/api/hermes/runs/${encodeURIComponent(p.run_id)}`, {
            headers: getAuthHeaders(),
          });
          if (!res.ok) continue;
          const runData = await res.json();
          if (!isMounted) break;

          if (['completed', 'failed', 'stopped'].includes(runData.status)) {
            // Update matching pane in state
            setPanes((prev) =>
              prev.map((existing) => {
                if (existing.id === p.id || existing.run_id === p.run_id) {
                  const finalOutput = runData.output || runData.error || `Status: ${runData.status}`;
                  return {
                    ...existing,
                    status: runData.status,
                    title: `Hermes: ${runData.status === 'completed' ? 'Task Completed' : 'Task ' + runData.status}`,
                    code: finalOutput,
                  } as Pane;
                }
                return existing;
              })
            );

            // Announce completion to user through caption and persist to conversation messages
            if (runData.status === 'completed') {
              const sayText = "I've completed that task on Hermes. The result is on your Stage.";
              setCaptionText(sayText);
              setExpression('pleased');
              if (liveSessionRef.current) {
                liveSessionRef.current.injectContextUpdate(
                  `Hermes task (Run ID ${p.run_id}) finished with output:\n${runData.output || ''}`
                );
              }
              fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                  persistOnly: true,
                  channel: 'system',
                  sessionId: conversationId,
                  assistantMessage: `${sayText}\n\n${runData.output || ''}`,
                  mood: 'pleased',
                  runId: p.run_id,
                }),
              }).catch(() => {});
            } else if (runData.status === 'failed') {
              const sayText = `That task encountered an error: ${runData.error || 'Execution failed'}`;
              setCaptionText(sayText);
              setExpression('concerned');
            }
          }
        } catch (err) {
          console.warn('Run polling error:', err);
        }
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      for (const ctrl of abortControllers.values()) {
        ctrl.abort();
      }
    };
  }, [panes, conversationId]);

  // Global keyboard shortcuts (Esc flushes audio, Cmd+K focuses input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (liveSessionRef.current) {
          liveSessionRef.current.flushAudio();
        }
        stopSpeaking();
        setIsSpeaking(false);
        // Dismiss unpinned panes
        setPanes((prev) => prev.filter((p) => p.pinned));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDismissPane = (id: string) => {
    setPanes((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePinPane = (id: string) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p))
    );
  };

  const toggleRestDay = async () => {
    const nextVal = !isRestDay;
    setIsRestDay(nextVal);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proactivity: { rest_day: nextVal } }),
      });
      setCaptionText(
        nextVal
          ? "Rest day logged. Go recharge, I won't nag you about focus blocks today."
          : 'Back on the grind. Let us hit your targets.'
      );
      setExpression(nextVal ? 'sleepy' : 'pleased');
    } catch {
      setIsRestDay(!nextVal);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        setAudioOwner('MUTED');
        stopSpeaking();
        if (liveSessionRef.current) {
          liveSessionRef.current.flushAudio();
        }
        setIsSpeaking(false);
      } else {
        setAudioOwner(liveSessionRef.current?.isActive() ? 'LIVE_GEMINI' : 'FALLBACK_TTS');
      }
      return next;
    });
  };

  const suggestions = [
    { label: '/stats', prompt: 'Give me a summary of my stats and output today' },
    { label: '/screenshot', prompt: 'Take a screenshot of my laptop screen' },
    { label: '/tasks', prompt: 'What tasks are on my list today?' },
    { label: '/wazuh', prompt: 'Run the wazuh log tail action' },
    { label: '/focus', prompt: 'Start a 45-minute focus session' },
  ];

  return (
    <div className="relative min-h-screen w-full bg-[#080205] text-rose-50 flex flex-col justify-between overflow-x-hidden selection:bg-rose-600/30">
      {/* Telemetry Debug Overlay */}
      <LiveDebugOverlay
        metrics={debugMetrics}
        visible={showDebug}
        onClose={() => setShowDebug(false)}
      />

      {/* Cosmic Backdrop Lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-radial from-rose-950/25 via-burgundy-950/15 to-transparent blur-3xl opacity-70" />
        <div className="absolute bottom-10 right-10 w-[450px] h-[450px] rounded-full bg-radial from-burgundy-900/15 to-transparent blur-3xl opacity-50" />
      </div>

      {/* TOP STATUS BAR */}
      <header className="relative z-30 w-full max-w-7xl mx-auto px-6 pt-5 pb-2 flex items-center justify-between">
        {/* Left: Clock & Mood Pill */}
        <div className="flex items-center space-x-3">
          <span className="text-sm font-mono tracking-wider font-semibold text-rose-200">
            {currentTime || '12:00'}
          </span>
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-burgundy-950/70 border border-burgundy-800/40 shadow-sm text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                liveState === 'speaking'
                  ? 'bg-rose-400 animate-ping'
                  : liveState === 'listening'
                  ? 'bg-emerald-400 animate-pulse'
                  : liveState === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-400'
              }`}
            />
            <span className="text-rose-200 font-medium">{moodLabel}</span>
            <span className="text-rose-400/40">|</span>
            <span className="text-rose-300 font-bold">{score} pts</span>
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Debug telemetry toggle */}
          <button
            onClick={() => setShowDebug(!showDebug)}
            title="Toggle live telemetry overlay"
            className={`p-2 rounded-xl text-xs font-mono border transition-all ${
              showDebug
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                : 'bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border-burgundy-800/40'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
          </button>

          {/* Voice Audition Route shortcut */}
          <Link
            href="/audition"
            title="Voice Audition (Aoede, Leda, Achernar)"
            className="p-2 rounded-xl text-xs font-mono border bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border-burgundy-800/40 transition-all"
          >
            <Headphones className="w-3.5 h-3.5" />
          </Link>

          {/* Rest Day Toggle */}
          <button
            onClick={toggleRestDay}
            title={isRestDay ? 'Rest day active (click to resume)' : 'Set Rest Day'}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border transition-all ${
              isRestDay
                ? 'bg-rose-900/70 text-rose-100 border-rose-400/50 shadow-[0_0_15px_rgba(225,29,72,0.4)]'
                : 'bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border-burgundy-800/40'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isRestDay ? 'Resting' : 'Rest'}</span>
          </button>

          {/* Mute Voice Toggle */}
          <button
            onClick={toggleMute}
            title={isMuted ? 'Unmute voice output' : 'Mute voice output'}
            className={`p-2 rounded-xl text-xs font-mono border transition-all ${
              isMuted
                ? 'bg-amber-950/60 text-amber-300 border-amber-700/50'
                : 'bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border-burgundy-800/40'
            }`}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Secondary Navigation Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              title="More views & settings"
              aria-label="Navigation menu"
              className="p-2 rounded-xl bg-burgundy-950/60 hover:bg-burgundy-900/50 text-rose-300 border border-burgundy-800/40 transition-all"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl glass-panel border border-burgundy-700/50 shadow-2xl p-2 z-50 flex flex-col space-y-1 animate-fadeIn">
                <Link
                  href="/chat"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-rose-400" />
                  <span>Chat Stream</span>
                </Link>
                <Link
                  href="/timeline"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <Clock className="w-4 h-4 text-rose-400" />
                  <span>Timeline</span>
                </Link>
                <Link
                  href="/tasks"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <CheckSquare className="w-4 h-4 text-rose-400" />
                  <span>Tasks</span>
                </Link>
                <Link
                  href="/history"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <TrendingUp className="w-4 h-4 text-rose-400" />
                  <span>Day History</span>
                </Link>
                <Link
                  href="/memory"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-rose-400" />
                  <span>Long-term Memory</span>
                </Link>
                <div className="h-[1px] bg-rose-900/40 my-1" />
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-200 hover:text-white hover:bg-rose-900/50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-rose-400" />
                  <span>Preferences</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* CENTER DYNAMIC STAGE */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center">
        <Stage
          expression={expression}
          isSpeaking={isSpeaking}
          score={score}
          captionText={captionText}
          userCaption={userCaption}
          liveState={liveState}
          mouthOpen={mouthOpen}
          micLevel={micLevel}
          panes={panes}
          onDismissPane={handleDismissPane}
          onPinPane={handlePinPane}
        />
      </main>

      {/* BOTTOM UNIFIED DOCK (Talk / Hang up + Text Input) */}
      <footer className="relative z-30 w-full max-w-3xl mx-auto px-6 pb-6 pt-2 flex flex-col space-y-2.5">
        {/* Quick Suggestion Pills */}
        {showSuggestions && (
          <div className="flex items-center space-x-2 overflow-x-auto py-1 px-1 custom-scrollbar animate-fadeIn">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(s.prompt)}
                className="whitespace-nowrap px-3 py-1.5 rounded-full bg-burgundy-950/80 hover:bg-burgundy-900/80 border border-burgundy-800/40 text-xs font-mono text-rose-200 hover:text-white transition-all shadow-sm"
              >
                <span className="text-rose-400 font-semibold mr-1">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Unified Input Dock Bar */}
        <div className="relative flex items-center space-x-2 p-1.5 rounded-2xl glass-panel border border-burgundy-700/50 shadow-[0_8px_32px_rgba(20,3,10,0.8)]">
          {/* Single-Brain Hermes Voice Talk / Stop Button */}
          <button
            onClick={toggleVoiceMode}
            aria-label={liveActive ? 'Stop voice conversation' : 'Start voice conversation'}
            title={
              liveActive
                ? 'Hang up the live voice session'
                : 'Talk to Sofia (live duplex voice)'
            }
            className={`px-4 py-3 rounded-xl transition-all flex items-center justify-center space-x-2 shrink-0 min-w-[105px] min-h-[44px] ${
              liveActive
                ? 'bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-white shadow-[0_0_20px_rgba(225,29,72,0.6)] animate-pulse'
                : 'bg-gradient-to-r from-rose-600 to-crimson-600 hover:from-rose-500 hover:to-crimson-500 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)]'
            }`}
          >
            {liveState === 'speaking' ? (
              <>
                <Volume2 className="w-4 h-4 text-rose-200 animate-pulse" />
                <span className="text-xs font-bold font-mono tracking-wider">Speaking</span>
              </>
            ) : liveState === 'connecting' ? (
              <>
                <Sparkles className="w-4 h-4 text-amber-200 animate-spin" />
                <span className="text-xs font-bold font-mono tracking-wider">Connecting…</span>
              </>
            ) : liveState === 'listening' ? (
              <>
                <PhoneOff className="w-4 h-4 text-rose-200" />
                <span className="text-xs font-bold font-mono tracking-wider">Listening</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-rose-100" />
                <span className="text-xs font-bold font-mono tracking-wider">Talk</span>
              </>
            )}
          </button>

          {/* Unified Text Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex-1 flex items-center space-x-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setShowSuggestions(e.target.value.startsWith('/'));
              }}
              onFocus={() => {
                if (inputText.startsWith('/')) setShowSuggestions(true);
              }}
              placeholder={
                liveState !== 'off'
                  ? 'Type to Sofia (pauses voice stream)...'
                  : 'Ask Sofia or type / for commands (Cmd+K)'
              }
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-rose-50 placeholder:text-rose-400/50 focus:outline-none min-h-[44px]"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              aria-label="Send message"
              className="p-3 rounded-xl bg-burgundy-950/80 hover:bg-rose-900/60 border border-burgundy-800/40 disabled:opacity-30 text-rose-200 transition-all shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              {isSending ? (
                <Bot className="w-4 h-4 animate-spin text-rose-300" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="flex justify-between items-center text-[10px] font-mono text-rose-400/60 px-2">
          <span>Esc: flush audio / dismiss panes</span>
          <span>Cmd+K: focus input · ?debug=1 for telemetry</span>
        </div>
      </footer>
    </div>
  );
}
