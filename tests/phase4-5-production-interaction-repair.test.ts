import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '@/lib/db';
import * as dbModule from '@/lib/db';
import { diagnoseBrainError, parseTurn, extractSpokenSummary } from '@/lib/brain';
import { POST as postStt } from '@/app/api/stt/route';
import { NextRequest } from 'next/server';

describe('Phase 4.5 Production Interaction Repair Suite', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-token-4-5';
    db = new DatabaseSync(':memory:');
    initDatabase(db);
    vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Error Categorization & Diagnostics', () => {
    it('categorizes gateway unreachable accurately with correlation ID', () => {
      const err = new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:8645');
      const diag = diagnoseBrainError(err, 'srun_test_123', undefined, 1200);

      expect(diag.category).toBe('gateway_unreachable');
      expect(diag.code).toBe('ERR_HERMES_GATEWAY_UNREACHABLE');
      expect(diag.say).toContain('cannot connect to the Hermes execution engine');
      expect(diag.text).toContain('srun_test_123');
    });

    it('categorizes browser worker unavailability', () => {
      const err = new Error('Browser isolation failure: connect ECONNREFUSED http://sofia-browser-worker:9222');
      const diag = diagnoseBrainError(err, 'srun_browser_err', undefined, 500);

      expect(diag.category).toBe('browser_worker_unavailable');
      expect(diag.code).toBe('ERR_BROWSER_WORKER_UNAVAILABLE');
      expect(diag.say).toContain('browser workspace worker is currently unreachable');
    });

    it('categorizes authentication failure', () => {
      const err = new Error('Hermes gateway returned HTTP 401 Unauthorized');
      const diag = diagnoseBrainError(err, 'srun_auth_err', undefined, 200);

      expect(diag.category).toBe('auth_failure');
      expect(diag.code).toBe('ERR_HERMES_AUTH_FAILED');
      expect(diag.say).toContain('Hermes authentication failed');
    });

    it('categorizes execution run timeout with duration metrics', () => {
      const err = new Error('Hermes run execution timed out after 30000ms');
      const diag = diagnoseBrainError(err, 'srun_timeout_err', 'hrun_999', 30200);

      expect(diag.category).toBe('run_timeout');
      expect(diag.code).toBe('ERR_HERMES_RUN_TIMEOUT');
      expect(diag.text).toContain('30s');
      expect(diag.text).toContain('hrun_999');
    });
  });

  describe('Spoken Delivery vs Detailed Text Separation', () => {
    it('extracts concise spoken summary from lengthy markdown', () => {
      const lengthy = `I have completed the vulnerability scan across your target assets.

Here is the breakdown of findings:
- Critical: 0 findings
- High: 2 findings related to SSL cipher suites
- Medium: 4 findings in web headers
- Low: 12 informational notes

Let me know if you would like me to generate a mitigation remediation plan.`;

      const spoken = extractSpokenSummary(lengthy);
      expect(spoken.length).toBeLessThanOrEqual(260);
      expect(spoken).not.toContain('Here is the breakdown of findings:');
      expect(spoken).not.toContain('- Critical: 0 findings');
      expect(spoken).toContain('vulnerability scan');
    });

    it('parses turn with separate say and text fields', () => {
      const rawJson = JSON.stringify({
        say: 'I have verified the GitHub repositories and opened the workspace.',
        text: '### Repositories Inspected\n\n1. `ctum/sofia` - Clean\n2. `ctum/hermes` - Synced',
        mood: 'pleased',
      });

      const turn = parseTurn(rawJson);
      expect(turn.say).toBe('I have verified the GitHub repositories and opened the workspace.');
      expect(turn.text).toContain('### Repositories Inspected');
      expect(turn.mood).toBe('pleased');
    });
  });

  describe('Server-Side STT Endpoint (/api/stt)', () => {
    it('rejects unauthorized requests in production', async () => {
      (process.env as any).NODE_ENV = 'production';
      const req = new NextRequest('http://localhost:3000/api/stt', {
        method: 'POST',
      });
      const res = await postStt(req);
      expect(res.status).toBe(401);
    });

    it('forwards audio to Whisper service and returns transcript', async () => {
      process.env.WHISPER_URL = 'http://whisper-mock:9000';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: 'Open GitHub and inspect pull requests',
          language: 'en',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const formData = new FormData();
      const dummyBlob = new Blob(['RIFF....WAVEfmt '], { type: 'audio/webm' });
      formData.append('audio_file', dummyBlob, 'test.webm');

      const req = new NextRequest('http://localhost:3000/api/stt', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token-4-5',
        },
        body: formData,
      });

      const res = await postStt(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.text).toBe('Open GitHub and inspect pull requests');
      expect(data.language).toBe('en');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://whisper-mock:9000/asr?encode=true&task=transcribe&output=json'),
        expect.any(Object)
      );
    });
  });
});
