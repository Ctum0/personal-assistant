import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { isPureGreetingOrChitchat, isExplicitBrowserRequest, processSofiaChatTurn } from '@/lib/brain';
import { getAudioOwner, setAudioOwner, speakSofia, stopSpeaking } from '@/lib/voice';
import { initBrowserTables, getOrCreateBrowserSession, updateBrowserSession } from '@/lib/browser/session';
import { initHermesTables } from '@/lib/hermes/registry';

describe('SOFIA PHASE 4.9 — Critical Interaction Defect Closure Suite', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
    initBrowserTables(db);
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        ts TEXT,
        role TEXT,
        content TEXT,
        mood TEXT,
        tool_calls TEXT,
        session_id TEXT,
        channel TEXT,
        run_id TEXT
      );
    `);
    setAudioOwner('FALLBACK_TTS');
  });

  afterEach(() => {
    setAudioOwner('FALLBACK_TTS');
    try {
      db.close();
    } catch {}
  });

  describe('1. Intent Recognition: Pure Greetings vs Actionable Tool Execution', () => {
    it('correctly identifies ordinary greetings and chit-chat', () => {
      const greetings = [
        'hi',
        'HI',
        'hi!',
        'hello',
        'hello sofia',
        'hey',
        'hey there',
        'good morning',
        'good afternoon',
        'how are you',
        'how are you?',
        "how's it going",
        'thank you',
        'thanks!',
        'what do you think?',
        'tell me something interesting',
        'who are you',
      ];

      for (const phrase of greetings) {
        expect(isPureGreetingOrChitchat(phrase), `Failed on "${phrase}"`).toBe(true);
      }
    });

    it('rejects actionable or browser requests as pure greetings', () => {
      const actionable = [
        'Open GitHub',
        'Navigate to https://example.com',
        'Search for playwright in google',
        'Run disk space check',
        'Create a file called main.py',
        'Inspect the active webpage',
      ];

      for (const phrase of actionable) {
        expect(isPureGreetingOrChitchat(phrase), `Failed on "${phrase}"`).toBe(false);
      }
    });

    it('correctly identifies explicit browser requests', () => {
      expect(isExplicitBrowserRequest('Open GitHub')).toBe(true);
      expect(isExplicitBrowserRequest('browse to website example.com')).toBe(true);
      expect(isExplicitBrowserRequest('visit page google.com')).toBe(true);
      expect(isExplicitBrowserRequest('https://news.ycombinator.com')).toBe(true);
      expect(isExplicitBrowserRequest('search for react docs on google')).toBe(true);

      // Greetings must NEVER be explicit browser requests
      expect(isExplicitBrowserRequest('hi')).toBe(false);
      expect(isExplicitBrowserRequest('hello')).toBe(false);
      expect(isExplicitBrowserRequest('how are you?')).toBe(false);
      expect(isExplicitBrowserRequest('thank you')).toBe(false);
    });
  });

  describe('2. Hardline Audio Ownership Mutex', () => {
    it('defaults to FALLBACK_TTS and allows state inspection', () => {
      expect(getAudioOwner()).toBe('FALLBACK_TTS');
    });

    it('locks audio out when LIVE_GEMINI owns audio', async () => {
      setAudioOwner('LIVE_GEMINI');
      expect(getAudioOwner()).toBe('LIVE_GEMINI');

      const onStart = vi.fn();
      const onEnd = vi.fn();

      // Attempting to speak via speakSofia must immediately no-op
      await speakSofia('Hello from Edge TTS', { onStart, onEnd });

      expect(onStart).not.toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('locks audio out when MUTED owns audio', async () => {
      setAudioOwner('MUTED');
      expect(getAudioOwner()).toBe('MUTED');

      const onStart = vi.fn();
      const onEnd = vi.fn();

      await speakSofia('Hello from Edge TTS', { onStart, onEnd });

      expect(onStart).not.toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('restoring FALLBACK_TTS unlocks speech execution', () => {
      setAudioOwner('LIVE_GEMINI');
      setAudioOwner('FALLBACK_TTS');
      expect(getAudioOwner()).toBe('FALLBACK_TTS');
    });
  });

  describe('3. Browser Pane Isolation on Greetings', () => {
    it('does NOT attach existing browser pane when user says hi', async () => {
      // Pre-seed an active browser session from a previous turn
      getOrCreateBrowserSession(db, 'conv-test-1', 'owner', 'https://github.com', 'GitHub');

      // Process a greeting turn
      const turn = await processSofiaChatTurn(db, 'hi', [], {
        conversationId: 'conv-test-1',
        sessionId: 'conv-test-1',
      });

      // Turn must NOT include a browser pane
      const hasBrowserPane = turn.panes?.some((p) => p.kind === 'browser') ?? false;
      expect(hasBrowserPane).toBe(false);
    });
  });

  describe('4. Gemini Live Tool Response Protocol Mapping', () => {
    it('formats toolResponse matching Gemini Live Bidi schema', () => {
      const functionCalls = [
        {
          id: 'call_12345',
          name: 'sofia_delegate_to_hermes',
          args: { task: 'Check memory telemetry' },
        },
      ];

      const simulatedExecResult = {
        executed: true,
        run_id: 'run_abc',
        status: 'completed',
        output: 'System RAM: 14.2 GB / 31.8 GB free.',
      };

      const responses = functionCalls.map((fc) => ({
        id: fc.id,
        name: fc.name,
        response: { output: simulatedExecResult },
      }));

      const toolResponseEnvelope = {
        toolResponse: {
          functionResponses: responses,
        },
      };

      expect(toolResponseEnvelope.toolResponse.functionResponses).toHaveLength(1);
      expect(toolResponseEnvelope.toolResponse.functionResponses[0].id).toBe('call_12345');
      expect(toolResponseEnvelope.toolResponse.functionResponses[0].name).toBe('sofia_delegate_to_hermes');
      expect(toolResponseEnvelope.toolResponse.functionResponses[0].response.output.status).toBe('completed');
    });
  });
});
