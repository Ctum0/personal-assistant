import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  processSofiaBrainTurn,
  isHermesPrimaryEnabled,
  isLegacyBrainFallbackEnabled,
} from '@/lib/brain';
import * as hermesClientModule from '@/lib/hermes';
import { initDatabase } from '@/lib/db';

describe('Hermes Primary Intelligence & Unified Brain Routing', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    db = new DatabaseSync(':memory:');
    initDatabase(db);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('respects SOFIA_HERMES_PRIMARY and HERMES_ENABLED feature flags', () => {
    process.env.SOFIA_HERMES_PRIMARY = 'false';
    expect(isHermesPrimaryEnabled()).toBe(false);

    process.env.SOFIA_HERMES_PRIMARY = 'true';
    expect(isHermesPrimaryEnabled()).toBe(true);

    delete process.env.SOFIA_HERMES_PRIMARY;
    process.env.HERMES_ENABLED = 'true';
    expect(isHermesPrimaryEnabled()).toBe(true);

    process.env.HERMES_ENABLED = 'false';
    delete process.env.HERMES_API_KEY;
    expect(isHermesPrimaryEnabled()).toBe(false);
  });

  it('dispatches substantive text requests to Hermes as primary intelligence', async () => {
    process.env.SOFIA_HERMES_PRIMARY = 'true';
    process.env.HERMES_ENABLED = 'true';

    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_test_primary_1',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'completed',
      run_id: 'hrun_test_primary_1',
      output: JSON.stringify({
        say: 'I have analyzed the system metrics. Everything is operating nominal.',
        mood: 'focused',
      }),
      usage: { input_tokens: 120, output_tokens: 45, total_tokens: 165 },
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      validateConfig: () => ({ sessionKey: 'test-session-key', baseUrl: 'http://localhost', apiKey: 'k', timeoutMs: 5000 }),
      getSanitizedConfig: () => ({ sessionKey: 'test-session-key', baseUrl: 'http://localhost', timeoutMs: 5000 }),
    } as any);

    const result = await processSofiaBrainTurn(db, 'What is our system load?', [], {
      sessionId: 'conv_voice_chat_1',
    });

    expect(result.isHermes).toBe(true);
    expect(result.runId).toBe('hrun_test_primary_1');
    expect(result.say).toContain('analyzed the system metrics');
    expect(result.mood).toBe('focused');

    // Verify ephemeral instructions were injected
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('You are Sofia'),
        session_id: 'conv_voice_chat_1',
      })
    );

    // Verify run was recorded in local SQLite hermes_runs
    const runRow = db.prepare('SELECT * FROM hermes_runs WHERE hermes_run_id = ?').get('hrun_test_primary_1') as any;
    expect(runRow).toBeDefined();
    expect(runRow.status).toBe('completed');
    expect(runRow.conversation_id).toBe('conv_voice_chat_1');
  });

  it('handles long-running tasks asynchronously with natural progress update and stage pane', async () => {
    process.env.SOFIA_HERMES_PRIMARY = 'true';
    process.env.HERMES_ENABLED = 'true';

    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_long_task_2',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'running',
      run_id: 'hrun_long_task_2',
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      validateConfig: () => ({ sessionKey: 'key', baseUrl: 'http://localhost', apiKey: 'k', timeoutMs: 5000 }),
    } as any);

    const result = await processSofiaBrainTurn(db, 'Run a full codebase refactor audit', [], {
      sessionId: 'conv_long_run',
    });

    expect(result.isHermes).toBe(true);
    expect(result.runId).toBe('hrun_long_task_2');
    expect(result.say).toContain('background');
    expect(result.panes?.length).toBeGreaterThan(0);
    expect(result.panes?.[0].kind).toBe('code');
  });

  it('surfaces human-in-the-loop approval requirement cleanly', async () => {
    process.env.SOFIA_HERMES_PRIMARY = 'true';
    process.env.HERMES_ENABLED = 'true';

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: vi.fn().mockResolvedValue({ run_id: 'hrun_approval_1', status: 'started' }),
      pollRunUntilComplete: vi.fn().mockResolvedValue({ status: 'waiting_approval', run_id: 'hrun_approval_1' }),
      validateConfig: () => ({ sessionKey: 'key', baseUrl: 'http://localhost', apiKey: 'k', timeoutMs: 5000 }),
    } as any);

    const result = await processSofiaBrainTurn(db, 'Delete temporary build caches', []);
    expect(result.isHermes).toBe(true);
    expect(result.say).toContain('needs your approval');
    expect(result.mood).toBe('stern');
  });

  it('reports degraded mode honestly when Hermes is unavailable and fallback is disabled', async () => {
    process.env.SOFIA_HERMES_PRIMARY = 'true';
    process.env.SOFIA_LEGACY_BRAIN_FALLBACK = 'false';

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: vi.fn().mockRejectedValue(new Error('Connection refused to hermes.ctum.org:443')),
      validateConfig: () => ({ sessionKey: 'key', baseUrl: 'http://localhost', apiKey: 'k', timeoutMs: 5000 }),
    } as any);

    const result = await processSofiaBrainTurn(db, 'Check memory status', []);
    expect(result.degraded).toBe(true);
    expect(result.say).toContain('cannot connect to the Hermes execution engine');
    expect(result.mood).toBe('concerned');
  });

  it('executes legacy brain with degraded disclaimer when fallback is explicitly enabled', async () => {
    process.env.SOFIA_HERMES_PRIMARY = 'true';
    process.env.SOFIA_LEGACY_BRAIN_FALLBACK = 'true';

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: vi.fn().mockRejectedValue(new Error('Network timeout')),
      validateConfig: () => ({ sessionKey: 'key', baseUrl: 'http://localhost', apiKey: 'k', timeoutMs: 5000 }),
    } as any);

    const result = await processSofiaBrainTurn(db, 'Status check', []);
    expect(result.degraded).toBe(true);
    expect(result.text).toContain('[Operating in degraded mode: Hermes agent unreachable]');
  });
});
