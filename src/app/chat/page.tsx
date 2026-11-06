'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SofiaAvatar } from '@/components/SofiaAvatar';
import { ChatMessage, SofiaExpression } from '@/lib/types';
import { speakSofia, stopSpeaking as haltSpeaking } from '@/lib/voice';
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
        tool_calls: data.tool_calls,
      };

      setMessages((prev) => [...prev, sofiaMsg]);
      if (data.mood) setCurrentMood(data.mood as SofiaExpression);

      // Auto-speak Sofia response if user spoke via VoiceDock
      if (textToSend) {
        speakText(data.text);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-err`,
          ts: new Date().toISOString(),
          role: 'assistant',
          content: 'Hermes gateway link timeout. Please check that hermes-gateway is active on port 8642.',
          mood: 'concerned',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const speakText = (text: string) => {
    speakSofia(text, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const stopSpeaking = () => {
    haltSpeaking();
    setIsSpeaking(false);
  };

  const suggestions = [
    'How much did I code today?',
    'Start a 45m focus block',
    'What is my current score breakdown?',
    'Check my recent tasks',
  ];

  return (
    <div className="space-y-4">
      {/* Page Title Landmark */}
      <h1 className="sr-only">Sofia Companion Chat & Command Terminal</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-9.5rem)]">
        {/* Left Column: Sofia Presence & Ambient Status */}
        <section aria-label="Companion Presence" className="hidden lg:flex lg:col-span-4 flex-col items-center justify-between glass-card p-6 rounded-3xl border border-rose-500/25">
          <div className="flex flex-col items-center space-y-4 text-center w-full">
            <div className="w-full flex items-center justify-center py-2">
              <SofiaAvatar
                expression={currentMood}
                isSpeaking={isSpeaking}
                score={7.5}
                size="xl"
                onClick={() => speakText("I'm right here. Keep your focus.")}
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
                SOFIA
              </h2>
              <p className="text-xs font-mono text-rose-300">
                Chief of Staff &middot; Hermes AI Engine
              </p>
            </div>
          </div>

          {/* Live System Specs */}
          <div className="w-full space-y-3 pt-4 border-t border-rose-500/20 text-xs font-mono">
            <div className="flex items-center justify-between text-rose-200">
              <span className="flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                <span>Hermes Model</span>
              </span>
              <span className="text-emerald-400 font-bold">copilot/gpt-4o</span>
            </div>
            <div className="flex items-center justify-between text-rose-200">
              <span className="flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                <span>CUA Driver</span>
              </span>
              <span className="text-emerald-400 font-bold">Background 0.21.0</span>
            </div>
            <div className="flex items-center justify-between text-rose-200">
              <span className="flex items-center space-x-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>Strictness Dial</span>
              </span>
              <span className="text-amber-300 font-bold">7 / 10</span>
            </div>
          </div>
        </section>

        {/* Right Column: Chat History & Voice Dock */}
        <section aria-label="Conversation Stream" className="lg:col-span-8 flex flex-col glass-card rounded-3xl border border-rose-500/25 overflow-hidden h-full">
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4" role="log" aria-live="polite">
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
                        ? 'bg-rose-900/70 border-rose-500/50 text-rose-100'
                        : 'bg-[#220715] border-rose-400/50 text-rose-200'
                    }`}
                    aria-hidden="true"
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-rose-300" />}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 space-y-1.5 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-rose-950/80 text-white border border-rose-500/40 rounded-tr-none'
                        : 'glass-panel text-rose-50 border border-rose-500/25 rounded-tl-none'
                    }`}
                  >
                    <p>{msg.content}</p>

                    {/* Tool Call Chips if Sofia invoked tools */}
                    {msg.tool_calls && msg.tool_calls.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.tool_calls.map((tc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-950/90 border border-rose-500/40 text-[10px] font-mono text-rose-200"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                            <span>Tool: {tc.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer with timestamp and speak button */}
                    <div className="flex items-center justify-between pt-1 text-xs font-mono text-rose-300">
                      <span>{new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {!isUser && (
                        <button
                          onClick={() => speakText(msg.content)}
                          aria-label={`Replay Sofia voice message from ${new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          className="hover:text-white ml-2 p-1 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"
                          title="Replay voice"
                        >
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-center space-x-3" role="status">
                <div className="w-8 h-8 rounded-full bg-[#220715] border border-rose-400/50 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-rose-400 animate-spin" aria-hidden="true" />
                </div>
                <div className="glass-panel px-4 py-2.5 rounded-2xl rounded-tl-none text-xs font-mono text-rose-200 flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
                  <span>Sofia is analyzing telemetry and crafting response...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Pills */}
          <div className="px-4 py-2 border-t border-rose-500/15 flex items-center space-x-2 overflow-x-auto" aria-label="Quick Prompt Suggestions">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(s)}
                aria-label={`Send suggested prompt: ${s}`}
                className="whitespace-nowrap px-3.5 py-1.5 rounded-full bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-xs font-mono text-rose-200 hover:text-white transition-all min-h-[36px]"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t border-rose-500/25 space-y-3 bg-[#110209]/85 backdrop-blur-xl">

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center space-x-2"
            >
              <label htmlFor="chat-message-input" className="sr-only">
                Message to Sofia
              </label>
              <input
                id="chat-message-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask Sofia or issue /focus, /stats, /tasks..."
                className="flex-1 glass-input px-4 py-2.5 rounded-xl text-sm placeholder:text-rose-300 text-rose-50 min-h-[44px]"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                aria-label="Send message"
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 disabled:opacity-40 text-white font-medium text-sm transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] flex items-center justify-center min-h-[44px] min-w-[44px]"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
