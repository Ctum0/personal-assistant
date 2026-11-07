import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '@/lib/db';
import * as dbModule from '@/lib/db';
import { GET as getRunRoute } from '@/app/api/hermes/runs/[id]/route';
import { POST as postChat } from '@/app/api/chat/route';
import { registerRun, updateRunRecord } from '@/lib/hermes/registry';
import * as hermesClientModule from '@/lib/hermes';
import { NextRequest } from 'next/server';

describe('Asynchronous Hermes Task Lifecycle & Stage Reconciliation', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-token-async';
    db = new DatabaseSync(':memory:');
    initDatabase(db);
    vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('reconciles active background run from running to completed via GET /api/hermes/runs/[id]', async () => {
    const sofiaRunId = 'srun_async_test_1';
    const hermesRunId = 'hrun_async_hermes_1';
    const conversationId = 'conv_async_reconciliation';

    // 1. Initial background registration (status: running)
    registerRun(db, {
      id: sofiaRunId,
      hermesRunId,
      conversationId,
      sessionKeyRef: 'session-key-ref-1',
      userId: 'owner',
      status: 'running',
      prompt: 'Execute extensive system diagnostics',
    });

    // 2. Mock Hermes client live poll returning completed status
    const mockGetRun = vi.fn().mockResolvedValue({
      run_id: hermesRunId,
      status: 'completed',
      output: 'All 42 diagnostic checks passed. System nominal.',
      last_event: 'evt_done_99',
      usage: { input_tokens: 150, output_tokens: 60, total_tokens: 210 },
    });

    vi.spyOn(hermesClientModule, 'getHermesClient').mockReturnValue({
      getRun: mockGetRun,
      getSanitizedConfig: () => ({ sessionKey: 'test-key', baseUrl: 'http://localhost', timeoutMs: 5000 }),
    } as any);

    // 3. Frontend Stage poll calls GET /api/hermes/runs/[id]
    const pollReq = new NextRequest(`http://localhost:3000/api/hermes/runs/${sofiaRunId}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token-async',
      },
    });

    const routeContext = { params: Promise.resolve({ id: sofiaRunId }) };
    const res = await getRunRoute(pollReq, routeContext);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.output).toContain('All 42 diagnostic checks passed');

    // 4. Verify SQLite registry was updated to completed
    const row = db.prepare('SELECT * FROM hermes_runs WHERE id = ?').get(sofiaRunId) as any;
    expect(row.status).toBe('completed');
    expect(row.output).toContain('All 42 diagnostic checks passed');
  });

  it('persists background task completion to conversation history without duplicating user turn', async () => {
    const conversationId = 'conv_async_persist';
    const hermesRunId = 'hrun_completed_delivery_2';

    const persistReq = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-async',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        persistOnly: true,
        channel: 'system',
        sessionId: conversationId,
        assistantMessage: "I've completed that task on Hermes. The result is on your Stage.\n\nResult:\nBuild succeeded.",
        mood: 'pleased',
        runId: hermesRunId,
      }),
    });

    const res = await postChat(persistReq);
    expect(res.status).toBe(200);

    // Verify message row is stored with channel 'system' and runId
    const rows = db.prepare('SELECT * FROM messages WHERE session_id = ?').all(conversationId) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('assistant');
    expect(rows[0].channel).toBe('system');
    expect(rows[0].run_id).toBe(hermesRunId);
    expect(rows[0].content).toContain('Build succeeded');
  });

  it('rejects unauthorized access or cross-owner queries with 404', async () => {
    const sofiaRunId = 'srun_owner_private';
    registerRun(db, {
      id: sofiaRunId,
      hermesRunId: 'hrun_private_1',
      conversationId: 'conv_private',
      sessionKeyRef: 'key-ref',
      userId: 'other_user', // Not 'owner'
      status: 'running',
      prompt: 'Top secret command',
    });

    const pollReq = new NextRequest(`http://localhost:3000/api/hermes/runs/${sofiaRunId}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token-async',
      },
    });

    const routeContext = { params: Promise.resolve({ id: sofiaRunId }) };
    const res = await getRunRoute(pollReq, routeContext);
    expect(res.status).toBe(404);
  });
});
