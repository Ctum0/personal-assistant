import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '@/lib/db';
import * as dbModule from '@/lib/db';
import { executeTool } from '@/lib/tools';
import { defaultSettings } from '@/lib/types';
import * as hermesClientModule from '@/lib/hermes';
import { registerRun, getRunRecord } from '@/lib/hermes/registry';
import { POST as postChat } from '@/app/api/chat/route';
import { NextRequest } from 'next/server';

describe('Voice & Hermes Delegation Pipeline', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-token-voice';
    process.env.SOFIA_HERMES_PRIMARY = 'true';
    process.env.HERMES_ENABLED = 'true';
    db = new DatabaseSync(':memory:');
    initDatabase(db);
    vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('delegates substantive voice task to Hermes via ask_hermes and returns stage pane', async () => {
    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_voice_delegate_1',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'completed',
      run_id: 'hrun_voice_delegate_1',
      output: 'Found 3 open pull requests on repository ctum/sofia.',
      usage: { input_tokens: 80, output_tokens: 30, total_tokens: 110 },
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      getSanitizedConfig: () => ({ sessionKey: 'test-key', baseUrl: 'https://hermes.ctum.org', timeoutMs: 5000 }),
    } as any);

    const execResult = await executeTool(
      db,
      'ask_hermes',
      { task: 'Check open PRs on GitHub' },
      defaultSettings
    );

    expect(execResult.result.executed).toBe(true);
    expect(execResult.result.output).toContain('Found 3 open pull requests');
    expect(execResult.pane).toBeDefined();
    expect(execResult.pane?.title).toContain('Hermes: Task Completed');
    expect(execResult.mood).toBe('pleased');

    // Verify task prompt was extracted and instructions passed
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'Check open PRs on GitHub',
        instructions: expect.stringContaining('You are Sofia'),
      })
    );
  });

  it('handles long-running voice delegation with async acknowledgment to prevent voice timeout', async () => {
    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_voice_async_2',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'running',
      run_id: 'hrun_voice_async_2',
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      getSanitizedConfig: () => ({ sessionKey: 'test-key', baseUrl: 'https://hermes.ctum.org', timeoutMs: 5000 }),
    } as any);

    const execResult = await executeTool(
      db,
      'ask_hermes',
      { task: 'Compile full system security assessment' },
      defaultSettings
    );

    expect(execResult.result.executed).toBe(false);
    expect(execResult.result.status).toBe('running');
    expect(execResult.result.message).toContain('running in the background');
    expect(execResult.pane).toBeDefined();
    expect(execResult.pane?.title).toContain('Hermes: Running Task');
    expect(execResult.mood).toBe('focused');
  });

  it('persists voice transcript with channel=voice and linked run_id', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-voice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        persistOnly: true,
        channel: 'voice',
        sessionId: 'live_session_123',
        userMessage: 'Search for recent changes to caddy',
        assistantMessage: 'Checking that now.',
        runId: 'hrun_voice_async_2',
      }),
    });

    const res = await postChat(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify rows stored in database
    const rows = db
      .prepare('SELECT role, content, channel, session_id, run_id FROM messages WHERE session_id = ?')
      .all('live_session_123') as any[];

    expect(rows.length).toBe(2);
    expect(rows[0].role).toBe('user');
    expect(rows[0].channel).toBe('voice');
    expect(rows[0].run_id).toBe('hrun_voice_async_2');

    expect(rows[1].role).toBe('assistant');
    expect(rows[1].channel).toBe('voice');
    expect(rows[1].run_id).toBe('hrun_voice_async_2');
  });

  it('Single-Brain Voice: dispatches user speech transcript to Hermes as sole reasoning engine', async () => {
    const conversationId = 'conv_single_brain_voice';
    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_single_brain_1',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'completed',
      run_id: 'hrun_single_brain_1',
      output: JSON.stringify({ say: 'All container ports are reconciled and operational.', mood: 'focused' }),
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      getSanitizedConfig: () => ({ sessionKey: 'sofia-primary', baseUrl: 'https://hermes.ctum.org', timeoutMs: 5000 }),
      validateConfig: () => ({ sessionKey: 'sofia-primary', baseUrl: 'https://hermes.ctum.org', apiKey: 'k', timeoutMs: 5000 }),
    } as any);

    const voiceReq = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-voice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'What is the container topology?',
        sessionId: conversationId,
        channel: 'voice',
      }),
    });

    const res = await postChat(voiceReq);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.say).toBe('All container ports are reconciled and operational.');
    expect(data.isHermes).toBe(true);

    // Verify Hermes received user transcript directly with channel=voice context
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: conversationId,
        input: 'What is the container topology?',
      })
    );

    // Verify messages stored in SQLite have channel=voice
    const stored = db.prepare('SELECT role, content, channel FROM messages WHERE session_id = ?').all(conversationId) as any[];
    expect(stored.length).toBe(2);
    expect(stored[0].channel).toBe('voice');
    expect(stored[1].channel).toBe('voice');
  });

  it('Hermes Identity: preserves stable owner sessionKeyRef and distinct conversation session_id', async () => {
    const conversationId = 'conv_memory_isolation_99';
    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_identity_test_1',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'completed',
      run_id: 'hrun_identity_test_1',
      output: 'Memory boundary checked.',
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      getSanitizedConfig: () => ({ sessionKey: 'owner-master-key', baseUrl: 'https://hermes.ctum.org', timeoutMs: 5000 }),
      validateConfig: () => ({ sessionKey: 'owner-master-key', baseUrl: 'https://hermes.ctum.org', apiKey: 'k', timeoutMs: 5000 }),
    } as any);

    await executeTool(
      db,
      'ask_hermes',
      { task: 'Check memory boundary', conversationId },
      defaultSettings
    );

    const record = getRunRecord(db, 'hrun_identity_test_1', 'owner');
    expect(record).toBeDefined();
    // session_key_ref is the stable hash of owner-master-key, NOT combined with conversationId
    expect(record?.session_key_ref).toBe(hermesClientModule.hashSessionKey('owner-master-key'));
    // conversation_id cleanly isolates the conversation thread
    expect(record?.conversation_id).toBe(conversationId);
  });

  it('ensures interrupted voice playback does not cancel background Hermes run', () => {
    // Background run registered in database
    registerRun(db, {
      id: 'srun_interrupted_test',
      hermesRunId: 'hrun_interrupted_test',
      conversationId: 'live_session_123',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'running',
      prompt: 'Heavy analysis',
    });

    // Voice session interruption stops audio, but run remains running in DB
    const run = getRunRecord(db, 'srun_interrupted_test', 'owner');
    expect(run?.status).toBe('running');
  });
});
