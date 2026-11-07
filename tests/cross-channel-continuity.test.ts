import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, getDatabase } from '@/lib/db';
import * as dbModule from '@/lib/db';
import { getLiveConfig } from '@/lib/live/config';
import { POST as postChat } from '@/app/api/chat/route';
import { executeTool } from '@/lib/tools';
import { defaultSettings } from '@/lib/types';
import * as hermesClientModule from '@/lib/hermes';
import { getRunRecord } from '@/lib/hermes/registry';
import { NextRequest } from 'next/server';

describe('Cross-Channel Context Continuity & Voice Correlation', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-token-continuity';
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

  it('Text to Voice: embeds recent text conversation into Gemini Live system prompt', () => {
    const conversationId = 'conv_apollo_11';

    // Insert user and assistant text messages
    db.prepare(
      'INSERT INTO messages (id, ts, role, content, session_id, channel) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('msg-1', '2026-11-07T10:00:00.000Z', 'user', 'We are preparing the lunar landing mission.', conversationId, 'chat');
    db.prepare(
      'INSERT INTO messages (id, ts, role, content, session_id, channel) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('msg-2', '2026-11-07T10:00:05.000Z', 'assistant', 'Eagle is nominal and telemetry looks clean.', conversationId, 'chat');

    // Retrieve live config for this conversation
    const liveConfig = getLiveConfig(db, conversationId);

    // Verify systemPrompt contains the text conversation
    expect(liveConfig.systemPrompt).toContain('recent_conversation');
    expect(liveConfig.systemPrompt).toContain('We are preparing the lunar landing mission.');
    expect(liveConfig.systemPrompt).toContain('Eagle is nominal and telemetry looks clean.');

    // Verify separate conversation is strictly isolated
    const isolatedConfig = getLiveConfig(db, 'conv_gemini_8');
    expect(isolatedConfig.systemPrompt).not.toContain('lunar landing mission');
  });

  it('Voice to Text: feeds previous voice turns from SQLite into Hermes text turn history', async () => {
    const conversationId = 'conv_apollo_12';

    // 1. Simulate voice turn persistence
    const voicePersistReq = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-continuity',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        persistOnly: true,
        channel: 'voice',
        sessionId: conversationId,
        userMessage: 'What is our landing coordinate?',
        assistantMessage: 'Ocean of Storms, coordinates set.',
        runId: 'hrun_voice_coords_1',
      }),
    });
    const persistRes = await postChat(voicePersistReq);
    expect(persistRes.status).toBe(200);

    // 2. Mock Hermes client to inspect the input sent by dispatchToHermesPrimary
    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_text_continuation_2',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'completed',
      run_id: 'hrun_text_continuation_2',
      output: JSON.stringify({ say: 'Continuing approach trajectory.', mood: 'focused' }),
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      validateConfig: () => ({ sessionKey: 'session-master-key', baseUrl: 'http://localhost', apiKey: 'k', timeoutMs: 5000 }),
      getSanitizedConfig: () => ({ sessionKey: 'session-master-key', baseUrl: 'http://localhost', timeoutMs: 5000 }),
    } as any);

    // 3. User sends a follow-up in text WITHOUT providing client history
    const textReq = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-continuity',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Proceed with descent burn.',
        sessionId: conversationId,
      }),
    });

    const textRes = await postChat(textReq);
    expect(textRes.status).toBe(200);

    // 4. Verify Hermes received the single user message with session_id (Hermes owns history context)
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: conversationId,
        input: 'Proceed with descent burn.',
      })
    );

    // 5. Verify local SQLite messages table contains both voice and text turns as presentation mirror
    const db = getDatabase();
    const rows = db
      .prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC')
      .all(conversationId) as any[];
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('Voice Session Correlation: delegateToHermes correlates run with conversationId', async () => {
    const conversationId = 'conv_saturn_v';
    const mockCreateRun = vi.fn().mockResolvedValue({
      run_id: 'hrun_saturn_stage_1',
      status: 'started',
    });
    const mockPollRun = vi.fn().mockResolvedValue({
      status: 'completed',
      run_id: 'hrun_saturn_stage_1',
      output: 'Stage 1 separation confirmed.',
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      createRun: mockCreateRun,
      pollRunUntilComplete: mockPollRun,
      getSanitizedConfig: () => ({ sessionKey: 'master-key', baseUrl: 'http://localhost', timeoutMs: 5000 }),
    } as any);

    const toolResult = await executeTool(
      db,
      'ask_hermes',
      { task: 'Check stage separation', conversationId },
      defaultSettings
    );

    expect(toolResult.result.executed).toBe(true);
    expect(toolResult.pane?.run_id).toBe('hrun_saturn_stage_1');
    expect(toolResult.pane?.status).toBe('completed');

    // Verify createRun received the conversationId
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: conversationId,
        input: 'Check stage separation',
      })
    );

    // Verify run record stored in SQLite matches conversationId
    const storedRun = getRunRecord(db, 'hrun_saturn_stage_1', 'owner');
    expect(storedRun).toBeDefined();
    expect(storedRun?.conversation_id).toBe(conversationId);
  });
});
