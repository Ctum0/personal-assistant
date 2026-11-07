import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getStatus } from '../src/app/api/hermes/status/route';
import { POST as postRun, GET as getRuns } from '../src/app/api/hermes/runs/route';
import { GET as getRunById } from '../src/app/api/hermes/runs/[id]/route';
import { POST as postStop } from '../src/app/api/hermes/runs/[id]/stop/route';
import { POST as postApproval } from '../src/app/api/hermes/runs/[id]/approval/route';
import { POST as postSteer } from '../src/app/api/hermes/runs/[id]/steer/route';
import { getDatabase } from '../src/lib/db';
import { registerRun } from '../src/lib/hermes/registry';

describe('Hermes Server-Side API Bridge Routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-token';
    process.env.HERMES_API_KEY = 'mock-hermes-key';
    process.env.HERMES_API_URL = 'https://mock.hermes.org';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createAuthedRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', 'Bearer test-token');
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      ...(init as any),
      headers,
    });
  }

  function createUnauthedRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), init as any);
  }

  it('rejects unauthorized requests with 401', async () => {
    const req = createUnauthedRequest('http://localhost:3000/api/hermes/status');
    const res = await getStatus(req);
    expect(res.status).toBe(401);
  });

  it('returns healthy status when Hermes gateway is reachable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'hermes.api_server.capabilities',
        platform: 'hermes-agent',
        model: 'deepseek-v4.1-flash',
        auth: { required: true },
        runtime: { mode: 'server_agent' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = createAuthedRequest('http://localhost:3000/api/hermes/status');
    const res = await getStatus(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.online).toBe(true);
    expect(data.platform).toBe('hermes-agent');
    expect(data.config.apiKey).toBeUndefined(); // Verify credential is never exposed
  });

  it('handles run creation and registration via POST /api/hermes/runs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ run_id: 'hrun_created_1', status: 'started' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = createAuthedRequest('http://localhost:3000/api/hermes/runs', {
      method: 'POST',
      body: JSON.stringify({
        input: 'Audit system performance',
        conversation_id: 'conv_test_1',
      }),
    });

    const res = await postRun(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.sofia_run_id).toBeDefined();
    expect(data.hermes_run_id).toBe('hrun_created_1');
    expect(data.status).toBe('started');
    expect(data.conversation_id).toBe('conv_test_1');
  });

  it('validates input for run creation', async () => {
    const req = createAuthedRequest('http://localhost:3000/api/hermes/runs', {
      method: 'POST',
      body: JSON.stringify({ input: '' }),
    });

    const res = await postRun(req);
    expect(res.status).toBe(400);
  });

  it('retrieves and reconciles run state via GET /api/hermes/runs/[id]', async () => {
    const db = getDatabase();
    registerRun(db, {
      id: 'srun_reconcile_test',
      hermesRunId: 'hrun_reconcile_test',
      conversationId: 'conv_1',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'running',
      prompt: 'Check logs',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'hermes.run',
        run_id: 'hrun_reconcile_test',
        status: 'completed',
        output: 'All logs normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = createAuthedRequest('http://localhost:3000/api/hermes/runs/srun_reconcile_test');
    const res = await getRunById(req, { params: Promise.resolve({ id: 'srun_reconcile_test' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('completed');
    expect(data.output).toBe('All logs normal');
  });

  it('handles run cancellation via POST /api/hermes/runs/[id]/stop', async () => {
    const db = getDatabase();
    registerRun(db, {
      id: 'srun_stop_test',
      hermesRunId: 'hrun_stop_test',
      conversationId: 'conv_1',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'running',
      prompt: 'Infinite loop task',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stopped: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = createAuthedRequest('http://localhost:3000/api/hermes/runs/srun_stop_test/stop', {
      method: 'POST',
    });
    const res = await postStop(req, { params: Promise.resolve({ id: 'srun_stop_test' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe('stopped');
  });

  it('handles tool approval via POST /api/hermes/runs/[id]/approval', async () => {
    const db = getDatabase();
    registerRun(db, {
      id: 'srun_approval_test',
      hermesRunId: 'hrun_approval_test',
      conversationId: 'conv_1',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'waiting_approval',
      prompt: 'Delete temp files',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ approved: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = createAuthedRequest('http://localhost:3000/api/hermes/runs/srun_approval_test/approval', {
      method: 'POST',
      body: JSON.stringify({ action: 'approve', tool_call_id: 'call_123' }),
    });
    const res = await postApproval(req, { params: Promise.resolve({ id: 'srun_approval_test' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.action).toBe('approve');
  });

  it('handles steer guidance via POST /api/hermes/runs/[id]/steer', async () => {
    const db = getDatabase();
    registerRun(db, {
      id: 'srun_steer_test',
      hermesRunId: 'hrun_steer_test',
      conversationId: 'conv_1',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'running',
      prompt: 'Write report',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ steered: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = createAuthedRequest('http://localhost:3000/api/hermes/runs/srun_steer_test/steer', {
      method: 'POST',
      body: JSON.stringify({ message: 'Focus on performance metrics only' }),
    });
    const res = await postSteer(req, { params: Promise.resolve({ id: 'srun_steer_test' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
