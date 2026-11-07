import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, getDatabase } from '@/lib/db';
import { executeTool } from '@/lib/tools';
import { defaultSettings } from '@/lib/types';
import { executeNamedAction } from '@/lib/actions';
import { processSofiaBrainTurn } from '@/lib/brain';
import * as hermesClientModule from '@/lib/hermes';

// Import route handlers to test auth enforcement directly
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as getStats } from '@/app/api/stats/route';
import { GET as getScore } from '@/app/api/score/route';
import { GET as getTasks, POST as postTasks } from '@/app/api/tasks/route';
import { GET as getMemory, POST as postMemory } from '@/app/api/memory/route';
import { GET as getTimeline } from '@/app/api/timeline/route';
import { POST as postTts } from '@/app/api/tts/route';
import { GET as getStream } from '@/app/api/stream/route';
import { POST as postBrowse } from '@/app/api/browse/route';
import { POST as postFocusStart } from '@/app/api/focus/start/route';
import { POST as postFocusStop } from '@/app/api/focus/stop/route';
import { POST as postIngestEvents } from '@/app/api/ingest/events/route';
import { POST as postIngestHeartbeat } from '@/app/api/ingest/heartbeat/route';
import { POST as postCron } from '@/app/api/cron/[job]/route';

describe('Core Integration Closure & Security Hardening Verification', () => {
  const originalEnv = { ...process.env };
  const TEST_TOKEN = 'secret-test-token-closure-999';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOFIA_AUTH_TOKEN = TEST_TOKEN;
    process.env.SOFIA_API_TOKEN = TEST_TOKEN;
    process.env.DEVICE_TOKEN = 'test-device-token-123';
    process.env.CRON_SECRET = 'test-cron-secret-456';
    (process.env as any).NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Universal Route Authentication Guards', () => {
    const unauthReq = (url: string, method = 'GET', body?: any) =>
      new NextRequest(new URL(url, 'http://localhost'), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

    const authReq = (url: string, method = 'GET', body?: any, token = TEST_TOKEN) =>
      new NextRequest(new URL(url, 'http://localhost'), {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    it('rejects unauthorized requests across all core API endpoints with 401', async () => {
      // /api/settings
      const resSettings = await getSettings(unauthReq('/api/settings'));
      expect(resSettings.status).toBe(401);

      // /api/stats
      const resStats = await getStats(unauthReq('/api/stats'));
      expect(resStats.status).toBe(401);

      // /api/score
      const resScore = await getScore(unauthReq('/api/score'));
      expect(resScore.status).toBe(401);

      // /api/tasks
      const resTasks = await getTasks(unauthReq('/api/tasks'));
      expect(resTasks.status).toBe(401);

      // /api/memory
      const resMemory = await getMemory(unauthReq('/api/memory'));
      expect(resMemory.status).toBe(401);

      // /api/timeline
      const resTimeline = await getTimeline(unauthReq('/api/timeline'));
      expect(resTimeline.status).toBe(401);

      // /api/tts
      const resTts = await postTts(unauthReq('/api/tts', 'POST', { text: 'test' }));
      expect(resTts.status).toBe(401);

      // /api/stream
      const resStream = await getStream(unauthReq('/api/stream'));
      expect(resStream.status).toBe(401);

      // /api/browse
      const resBrowse = await postBrowse(unauthReq('/api/browse', 'POST', { url: 'https://example.com' }));
      expect(resBrowse.status).toBe(401);

      // /api/focus/start & stop
      const resFocusStart = await postFocusStart(unauthReq('/api/focus/start', 'POST', { goal_min: 25 }));
      expect(resFocusStart.status).toBe(401);

      const resFocusStop = await postFocusStop(unauthReq('/api/focus/stop', 'POST', { result: 'done' }));
      expect(resFocusStop.status).toBe(401);

      // /api/ingest/events & heartbeat
      const resIngest = await postIngestEvents(unauthReq('/api/ingest/events', 'POST', { events: [] }));
      expect(resIngest.status).toBe(401);

      const resHeartbeat = await postIngestHeartbeat(unauthReq('/api/ingest/heartbeat', 'POST', { timestamp: 123 }));
      expect(resHeartbeat.status).toBe(401);

      // /api/cron/[job]
      const resCron = await postCron(unauthReq('/api/cron/proactive', 'POST'), {
        params: Promise.resolve({ job: 'proactive' }),
      });
      expect(resCron.status).toBe(401);
    });

    it('permits authorized requests with valid bearer token', async () => {
      const resSettings = await getSettings(authReq('/api/settings'));
      expect(resSettings.status).toBe(200);

      const resStats = await getStats(authReq('/api/stats'));
      expect(resStats.status).toBe(200);

      const resScore = await getScore(authReq('/api/score'));
      expect(resScore.status).toBe(200);
    });
  });

  describe('2. Elimination of Direct Shell Execution in Web Container', () => {
    it('blocks computer_run and returns explicit security error without executing commands', async () => {
      const db = new DatabaseSync(':memory:');
      initDatabase(db);

      const result = await executeTool(
        db,
        'computer_run',
        { command: 'cat /etc/passwd' },
        defaultSettings
      );

      expect(result.error).toContain('Direct shell execution is disabled in the Sofia web application container');
      expect(result.mood).toBe('stern');
    });

    it('safely checks git status without child_process or execSync', async () => {
      const actionResult = await executeNamedAction('git-status');
      expect(actionResult.ok).toBe(true);
      expect(actionResult.output).toContain('Repository verified safely without shell execution');
      expect(actionResult.pane).toBeDefined();
      expect(actionResult.pane?.title).toContain('Git Status');
    });
  });

  describe('3. Dialogue Context History Ownership & Duplication Prevention', () => {
    it('passes single userMessage as input when session_id is supplied to Hermes', async () => {
      process.env.SOFIA_HERMES_PRIMARY = 'true';
      process.env.HERMES_ENABLED = 'true';
      const db = new DatabaseSync(':memory:');
      initDatabase(db);

      const mockCreateRun = vi.fn().mockResolvedValue({
        run_id: 'hrun_dedup_turn_1',
        status: 'started',
      });
      const mockPollRun = vi.fn().mockResolvedValue({
        status: 'completed',
        run_id: 'hrun_dedup_turn_1',
        output: JSON.stringify({ say: 'All telemetry nominal.', mood: 'focused' }),
      });

      vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
        createRun: mockCreateRun,
        pollRunUntilComplete: mockPollRun,
        validateConfig: () => ({ sessionKey: 'test-key', baseUrl: 'http://localhost', apiKey: 'k', timeoutMs: 5000 }),
      } as any);

      // Provide history array
      const history = [
        { role: 'user' as const, content: 'Turn 1: How is the VPS?' },
        { role: 'assistant' as const, content: 'VPS load is 0.14.' },
      ];

      await processSofiaBrainTurn(db, 'Turn 2: What about memory?', history, {
        sessionId: 'session_unique_session_101',
      });

      // Verify that input is ONLY the latest turn string, NOT array of duplicate turns
      expect(mockCreateRun).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'session_unique_session_101',
          input: 'Turn 2: What about memory?',
        })
      );
    });
  });
});
