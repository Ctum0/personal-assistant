'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SofiaAvatar } from '@/components/SofiaAvatar';
import { VoiceDock } from '@/components/VoiceDock';
import { ChatMessage, SofiaExpression } from '@/lib/types';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Volume2,
  Cpu,
  CheckCircle2,
  Terminal,
  Zap,
} from 'lucide-react';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentMood, setCurrentMood] = useState<SofiaExpression>('focused');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/chat');
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setMessages(data);
          const lastSofia = [...data].reverse().find((m) => m.role === 'assistant');
          if (lastSofia?.mood) {
            setCurrentMood(lastSofia.mood as SofiaExpression);
          }
        } else {
          // Welcome default greeting from Sofia
          setMessages([
            {
              id: 'init-1',
              ts: new Date().toISOString(),
              role: 'assistant',
              content:
                "I am Sofia. I am watching your stats, your commits, and your focus blocks. What are we getting done today?",
              mood: 'neutral',
            },
          ]);
        }
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setInputText('');
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      ts: new Date().toISOString(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) throw new Error('Chat API failed');

      const data = await res.json();
      const sofiaMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        ts: new Date().toISOString(),
        role: 'assistant',
        content: data.text,
        mood: data.mood || 'focused',
        tool_calls: data.toolCalls,
      };

      setMessages((prev) => [...prev, sofiaMsg]);
      if (data.mood) setCurrentMood(data.mood);

      // Auto-speak if enabled
      speakText(data.text);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-err`,
          ts: new Date().toISOString(),
          role: 'assistant',
          content: 'A momentary blip occurred with the brain link. What were you saying?',
          mood: 'concerned',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Female') || v.name.includes('Jenny') || v.name.includes('Samantha'))
    );
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const suggestions = [
    'How much did I code today?',
    'Start a 45m focus block',
    'What is my current score breakdown?',
    'Check my recent tasks',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      {/* Left Column: Sofia Presence & Ambient Status */}
      <div className="hidden lg:flex lg:col-span-4 flex-col items-center justify-between glass-card p-6 rounded-3xl border border-rose-500/20">
        <div className="flex flex-col items-center space-y-4 text-center">
          <SofiaAvatar
            expression={currentMood}
            isSpeaking={isSpeaking}
            score={7.5}
            size="lg"
            onClick={() => speakText("I'm right here. Keep your focus.")}
          />
          <div className="space-y-1">
            <h2 className="text-xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              SOFIA
            </h2>
            <p className="text-xs font-mono text-rose-300/70">
              Chief of Staff &middot; Hermes AI Engine
            </p>
          </div>
        </div>

        {/* Live System Specs */}
        <div className="w-full space-y-3 pt-4 border-t border-rose-500/15 text-xs font-mono">
          <div className="flex items-center justify-between text-rose-300/80">
            <span className="flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-rose-400" />
              <span>Hermes Model</span>
            </span>
            <span className="text-emerald-400">copilot/gpt-4o</span>
          </div>
          <div className="flex items-center justify-between text-rose-300/80">
            <span className="flex items-center space-x-1.5">
              <Terminal className="w-3.5 h-3.5 text-rose-400" />
              <span>CUA Driver</span>
            </span>
            <span className="text-emerald-400">Background 0.21.0</span>
          </div>
          <div className="flex items-center justify-between text-rose-300/80">
            <span className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Strictness Dial</span>
            </span>
            <span className="text-amber-300">7 / 10</span>
          </div>
        </div>
      </div>

      {/* Right Column: Chat History & Voice Dock */}
      <div className="lg:col-span-8 flex flex-col glass-card rounded-3xl border border-rose-500/20 overflow-hidden h-full">
        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                {/* Avatar Icon */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                    isUser
                      ? 'bg-rose-900/60 border-rose-500/40 text-rose-200'
                      : 'bg-[#220715] border-rose-400/50 text-rose-300'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-rose-400" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 space-y-1.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-rose-950/70 text-rose-50 border border-rose-500/30 rounded-tr-none'
                      : 'glass-panel text-rose-100 border border-rose-500/20 rounded-tl-none'
                  }`}
                >
                  <p>{msg.content}</p>

                  {/* Tool Call Chips if Sofia invoked tools */}
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.tool_calls.map((tc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-950/90 border border-rose-500/30 text-[10px] font-mono text-rose-300"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Tool: {tc.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer with timestamp and speak button */}
                  <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-rose-400/50">
                    <span>{new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {!isUser && (
                      <button
                        onClick={() => speakText(msg.content)}
                        className="hover:text-rose-200 ml-2"
                        title="Replay voice"
                      >
                        <Volume2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isSending && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#220715] border border-rose-400/50 flex items-center justify-center">
                <Bot className="w-4 h-4 text-rose-400 animate-spin" />
              </div>
              <div className="glass-panel px-4 py-2.5 rounded-2xl rounded-tl-none text-xs font-mono text-rose-300/80 flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                <span>Sofia is analyzing telemetry and crafting response...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion Pills */}
        <div className="px-4 py-2 border-t border-rose-500/10 flex items-center space-x-2 overflow-x-auto">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(s)}
              className="whitespace-nowrap px-3 py-1 rounded-full bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/20 text-xs font-mono text-rose-300/80 hover:text-rose-100 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Voice Dock & Text Input */}
        <div className="p-4 border-t border-rose-500/20 space-y-3 bg-[#110209]/80 backdrop-blur-xl">
          <VoiceDock
            onTranscript={(t) => handleSendMessage(t)}
            isSpeaking={isSpeaking}
            onStopSpeaking={stopSpeaking}
          />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask Sofia or issue /focus, /stats, /tasks..."
              className="flex-1 glass-input px-4 py-2.5 rounded-xl text-sm placeholder:text-rose-400/40 text-rose-50"
            />
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 disabled:opacity-40 text-white font-medium text-sm transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
