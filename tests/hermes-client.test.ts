import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HermesClient } from '../src/lib/hermes/client';
import { getHermesConfig } from '../src/lib/hermes/config';

describe('HermesClient & Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves production default URL when NODE_ENV is production', () => {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.HERMES_API_URL;
    delete process.env.HERMES_URL;
    const config = getHermesConfig();
    expect(config.baseUrl).toBe('https://hermes.ctum.org');
  });

  it('throws descriptive error when API key is missing', async () => {
    delete process.env.HERMES_API_KEY;
    delete process.env.API_SERVER_KEY;
    delete process.env.LAPTOP_HERMES_KEY;
    const client = new HermesClient({ baseUrl: 'https://test.hermes.org', apiKey: '' });
    await expect(client.createRun({ input: 'test' })).rejects.toThrow(
      'Hermes API key is not configured'
    );
  });

  it('throws descriptive error when HERMES_ENABLED is false', async () => {
    const client = new HermesClient({
      baseUrl: 'https://test.hermes.org',
      apiKey: 'test-key',
      enabled: false,
    });
    await expect(client.createRun({ input: 'test' })).rejects.toThrow(
      'Hermes integration is disabled'
    );
  });

  it('redacts sensitive bearer tokens from error messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden: Bearer sk-sensitive-secret-token-123456 denied',
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HermesClient({
      baseUrl: 'https://test.hermes.org',
      apiKey: 'test-key',
    });

    await expect(client.createRun({ input: 'test' })).rejects.toThrow(
      'Bearer [REDACTED]'
    );
  });

  it('creates run via POST /v1/runs with session key and idempotency headers', async () => {
    const mockResponse = { run_id: 'test-run-123', status: 'started' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => mockResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HermesClient({
      baseUrl: 'https://test.hermes.org',
      apiKey: 'test-key',
      sessionKey: 'test-session',
    });

    const res = await client.createRun({
      input: 'Test task',
      idempotency_key: 'idemp-1',
    });

    expect(res.run_id).toBe('test-run-123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.hermes.org/v1/runs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'X-Hermes-Session-Key': 'test-session',
          'Idempotency-Key': 'idemp-1',
        }),
      })
    );
  });

  it('polls run status until completed', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          object: 'hermes.run',
          run_id: 'run-abc',
          status: callCount >= 2 ? 'completed' : 'running',
          output: callCount >= 2 ? 'Finished successfully' : undefined,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new HermesClient({ baseUrl: 'https://test.hermes.org', apiKey: 'test-key' });
    const finalStatus = await client.pollRunUntilComplete('run-abc', {
      intervalMs: 10,
      maxWaitMs: 1000,
    });

    expect(finalStatus.status).toBe('completed');
    expect(finalStatus.output).toBe('Finished successfully');
    expect(callCount).toBe(2);
  });

  it('parses Server-Sent Events stream correctly', async () => {
    const sseChunks = [
      'event: tool.started\ndata: {"tool":"web_search","preview":"searching..."}\n\n',
      'event: run.completed\ndata: {"output":"Done!"}\n\n',
    ];

    let chunkIndex = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < sseChunks.length) {
          controller.enqueue(new TextEncoder().encode(sseChunks[chunkIndex++]));
        } else {
          controller.close();
        }
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });
    vi.stubGlobal('fetch', fetchMock);

    const events: any[] = [];
    const client = new HermesClient({ baseUrl: 'https://test.hermes.org', apiKey: 'test-key' });
    await client.streamRunEvents('run-xyz', (ev) => {
      events.push(ev);
    });

    expect(events.length).toBe(2);
    expect(events[0].event).toBe('tool.started');
    expect(events[0].data.tool).toBe('web_search');
    expect(events[1].event).toBe('run.completed');
    expect(events[1].data.output).toBe('Done!');
  });
});
