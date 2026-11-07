import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { getHermesConfig, getSanitizedHermesConfig } from '../src/lib/hermes/config';
import { processSofiaBrainTurn, isHermesPrimaryEnabled } from '../src/lib/brain';
import { initDatabase } from '../src/lib/db';
import * as hermesModule from '../src/lib/hermes';
import { GET as getHealth } from '../src/app/api/health/route';

describe('Hermes Connection Reconciliation & Environment Resolution (Phase 4.2)', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    db = new DatabaseSync(':memory:');
    initDatabase(db);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Hermes Configuration Resolution', () => {
    it('resolves HERMES_BRIDGE_URL when HERMES_API_URL is unset', () => {
      delete process.env.HERMES_API_URL;
      delete process.env.HERMES_URL;
      delete process.env.HERMES_BASE_URL;
      process.env.HERMES_BRIDGE_URL = 'http://127.0.0.1:8642/v1';

      const config = getHermesConfig();
      expect(config.baseUrl).toBe('http://127.0.0.1:8642');
    });

    it('prioritizes HERMES_API_URL over HERMES_BRIDGE_URL and strips trailing /v1', () => {
      process.env.HERMES_API_URL = 'https://custom-hermes.internal:8443/v1/';
      process.env.HERMES_BRIDGE_URL = 'http://127.0.0.1:8642/v1';

      const config = getHermesConfig();
      expect(config.baseUrl).toBe('https://custom-hermes.internal:8443');
    });

    it('falls back to API_SERVER_KEY and LAPTOP_HERMES_KEY when HERMES_API_KEY is unset', () => {
      delete process.env.HERMES_API_KEY;
      process.env.API_SERVER_KEY = 'srv-secret-key-1';
      delete process.env.LAPTOP_HERMES_KEY;

      let config = getHermesConfig();
      expect(config.apiKey).toBe('srv-secret-key-1');

      delete process.env.API_SERVER_KEY;
      process.env.LAPTOP_HERMES_KEY = 'laptop-secret-key-2';
      config = getHermesConfig();
      expect(config.apiKey).toBe('laptop-secret-key-2');
    });

    it('defaults to https://hermes.ctum.org in production when no URL is provided', () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.HERMES_API_URL;
      delete process.env.HERMES_URL;
      delete process.env.HERMES_BASE_URL;
      delete process.env.HERMES_BRIDGE_URL;
      delete process.env.LAPTOP_HERMES_URL;

      const config = getHermesConfig();
      expect(config.baseUrl).toBe('https://hermes.ctum.org');
    });

    it('never exposes API keys in getSanitizedHermesConfig()', () => {
      process.env.HERMES_API_KEY = 'super-secret-production-key-999';
      const sanitized = getSanitizedHermesConfig();
      expect((sanitized as any).apiKey).toBeUndefined();
      expect(sanitized.isConfigured).toBe(true);
    });
  });

  describe('isHermesPrimaryEnabled Evaluation', () => {
    it('returns true when API_SERVER_KEY is set even without explicit HERMES_ENABLED flag', () => {
      delete process.env.SOFIA_HERMES_PRIMARY;
      delete process.env.HERMES_ENABLED;
      delete process.env.HERMES_API_KEY;
      process.env.API_SERVER_KEY = 'srv-key-auto';
      process.env.HERMES_API_URL = 'http://127.0.0.1:8642';

      expect(isHermesPrimaryEnabled()).toBe(true);
    });

    it('returns false when SOFIA_HERMES_PRIMARY is explicitly false', () => {
      process.env.SOFIA_HERMES_PRIMARY = 'false';
      process.env.HERMES_ENABLED = 'true';
      process.env.HERMES_API_KEY = 'active-key';

      expect(isHermesPrimaryEnabled()).toBe(false);
    });

    it('returns false when HERMES_ENABLED is explicitly false', () => {
      delete process.env.SOFIA_HERMES_PRIMARY;
      process.env.HERMES_ENABLED = 'false';
      process.env.HERMES_API_KEY = 'active-key';

      expect(isHermesPrimaryEnabled()).toBe(false);
    });

    it('returns false when no API key or URL is present in the environment', () => {
      delete process.env.SOFIA_HERMES_PRIMARY;
      delete process.env.HERMES_ENABLED;
      delete process.env.HERMES_API_KEY;
      delete process.env.API_SERVER_KEY;
      delete process.env.LAPTOP_HERMES_KEY;

      expect(isHermesPrimaryEnabled()).toBe(false);
    });
  });

  describe('Fail-Closed Behavior & Error Handling', () => {
    it('fails closed with explicit connection error report when Hermes primary is unreachable', async () => {
      process.env.SOFIA_HERMES_PRIMARY = 'true';
      delete process.env.SOFIA_LEGACY_BRAIN_FALLBACK;

      vi.spyOn(hermesModule, 'getHermesClient').mockReturnValue({
        createRun: vi.fn().mockRejectedValue(new Error('Connection refused to hermes.ctum.org:443')),
        validateConfig: () => ({ sessionKey: 'test', baseUrl: 'https://hermes.ctum.org', apiKey: 'k', timeoutMs: 5000 }),
      } as any);

      const result = await processSofiaBrainTurn(db, 'hi', [], { sessionId: 'test-fail-closed' });

      expect(result.degraded).toBe(true);
      expect(result.say).toBe('I cannot connect to the Hermes execution engine. Operating in degraded mode.');
      expect(result.mood).toBe('concerned');
    });

    it('returns unconfigured report when Hermes is explicitly disabled and fallback is off', async () => {
      process.env.SOFIA_HERMES_PRIMARY = 'false';
      delete process.env.SOFIA_LEGACY_BRAIN_FALLBACK;

      const result = await processSofiaBrainTurn(db, 'hi', [], { sessionId: 'test-unconfigured' });

      expect(result.degraded).toBe(true);
      expect(result.say).toBe('Hermes primary intelligence is not configured. Sofia is in degraded mode.');
      expect(result.mood).toBe('concerned');
    });
  });

  describe('Multi-Turn Text Conversation via Hermes', () => {
    it('dispatches multi-turn messages with session continuity', async () => {
      process.env.SOFIA_HERMES_PRIMARY = 'true';
      process.env.HERMES_ENABLED = 'true';

      const mockCreateRun = vi
        .fn()
        .mockResolvedValueOnce({ run_id: 'hrun_turn_1', status: 'started' })
        .mockResolvedValueOnce({ run_id: 'hrun_turn_2', status: 'started' });

      const mockPollRun = vi
        .fn()
        .mockResolvedValueOnce({
          status: 'completed',
          run_id: 'hrun_turn_1',
          output: 'Hello. I am Sofia.',
        })
        .mockResolvedValueOnce({
          status: 'completed',
          run_id: 'hrun_turn_2',
          output: 'Your previous message was "hi".',
        });

      vi.spyOn(hermesModule, 'getHermesClient').mockReturnValue({
        createRun: mockCreateRun,
        pollRunUntilComplete: mockPollRun,
        validateConfig: () => ({ sessionKey: 'sofia-primary', baseUrl: 'http://127.0.0.1:8642', apiKey: 'k', timeoutMs: 5000 }),
      } as any);

      // Turn 1
      const turn1 = await processSofiaBrainTurn(db, 'hi', [], { sessionId: 'conv_multi_1' });
      expect(turn1.isHermes).toBe(true);
      expect(turn1.runId).toBe('hrun_turn_1');
      expect(turn1.say).toBe('Hello. I am Sofia.');

      // Turn 2
      const turn2 = await processSofiaBrainTurn(db, 'What did I just say?', [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'Hello. I am Sofia.' },
      ], { sessionId: 'conv_multi_1' });

      expect(turn2.isHermes).toBe(true);
      expect(turn2.runId).toBe('hrun_turn_2');
      expect(turn2.say).toBe('Your previous message was "hi".');

      expect(mockCreateRun).toHaveBeenCalledTimes(2);
      expect(mockCreateRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
        session_id: 'conv_multi_1',
        input: 'hi',
      }));
      expect(mockCreateRun).toHaveBeenNthCalledWith(2, expect.objectContaining({
        session_id: 'conv_multi_1',
        input: 'What did I just say?',
      }));
    });
  });

  describe('Health Route (/api/health) Accuracy', () => {
    it('reports ready and healthy when Hermes capabilities confirm run_submission', async () => {
      process.env.HERMES_ENABLED = 'true';
      process.env.HERMES_API_KEY = 'test-key';
      process.env.HERMES_API_URL = 'http://127.0.0.1:8642';

      vi.spyOn(hermesModule, 'getHermesClient').mockReturnValue({
        getCapabilities: vi.fn().mockResolvedValue({
          object: 'hermes.api_server.capabilities',
          platform: 'hermes-agent',
          features: { run_submission: true },
          endpoints: { runs: { method: 'POST', path: '/v1/runs' } },
        }),
      } as any);

      const res = await getHealth();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.brain).toBe(true);
      expect(data.hermes.configured).toBe(true);
      expect(data.hermes.reachable).toBe(true);
      expect(data.hermes.canSubmitRuns).toBe(true);
      expect(data.hermes.status).toBe('ready');
    });

    it('reports unreachable and ok=false when Hermes gateway connection fails', async () => {
      process.env.HERMES_ENABLED = 'true';
      process.env.HERMES_API_KEY = 'test-key';
      process.env.HERMES_API_URL = 'http://127.0.0.1:8642';

      vi.spyOn(hermesModule, 'getHermesClient').mockReturnValue({
        getCapabilities: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      } as any);

      const res = await getHealth();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.brain).toBe(false);
      expect(data.hermes.configured).toBe(true);
      expect(data.hermes.reachable).toBe(false);
      expect(data.hermes.canSubmitRuns).toBe(false);
      expect(data.hermes.status).toBe('unreachable');
    });
  });
});
