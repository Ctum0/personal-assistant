import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '@/lib/db';
import * as dbModule from '@/lib/db';
import { verifyApiAuth } from '@/lib/auth';
import { getOrCreateBrowserSession } from '@/lib/browser/session';
import { speakSofia, stopSpeaking, isSpeakingNow } from '@/lib/voice';
import { NextRequest } from 'next/server';

describe('Phase 4.6 Live Voice Experience, Browser Stage Rendering & Dynamic Layout Suite', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-token-4-6';
    db = new DatabaseSync(':memory:');
    initDatabase(db);
    vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Central Audio Controller & Single Voice Guarantees', () => {
    it('stopSpeaking() immediately cancels active audio playback and turns off isSpeakingNow()', () => {
      stopSpeaking();
      expect(isSpeakingNow()).toBe(false);
    });

    it('speakSofia() splits multi-sentence speech into natural conversational sentences', async () => {
      // Mock fetch for /api/tts
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['fake-audio'], { type: 'audio/mpeg' }),
      });
      global.fetch = mockFetch;

      const onTTFACalled = vi.fn();
      const onEndCalled = vi.fn();

      // Mock Audio element
      class MockAudio {
        src = '';
        paused = false;
        ended = false;
        onplay: any = null;
        onended: any = null;
        play() {
          if (this.onplay) this.onplay();
          setTimeout(() => {
            this.ended = true;
            if (this.onended) this.onended();
          }, 10);
          return Promise.resolve();
        }
        pause() {
          this.paused = true;
        }
      }
      (global as any).Audio = MockAudio;
      (global as any).URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-audio');
      (global as any).URL.revokeObjectURL = vi.fn();

      await speakSofia(
        'Hello there! This is the first conversational sentence from Sofia explaining the current system status in great detail. And here is the second sentence providing follow-up instructions for the task at hand.',
        {
          onTTFA: onTTFACalled,
          onEnd: onEndCalled,
        }
      );

      // Fetched each sentence concurrently
      expect(mockFetch).toHaveBeenCalled();
      const calls = mockFetch.mock.calls.filter((c: any) => c[0] === '/api/tts');
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(onEndCalled).toHaveBeenCalled();
    });

    it('turn cancellation invalidates earlier in-flight playback when a new utterance starts', async () => {
      const mockFetch = vi.fn().mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
          });
        }, 100);
      }));
      global.fetch = mockFetch;

      const end1 = vi.fn();
      const end2 = vi.fn();

      // Launch Turn 1
      const promise1 = speakSofia('Long turn one speech that will be interrupted.', { onEnd: end1 });

      // Immediate Turn 2 (Barge-in or rapid user turn)
      stopSpeaking();
      const promise2 = speakSofia('Turn two quick reply.', { onEnd: end2 });

      await Promise.all([promise1, promise2]);

      // Turn 1's onEnd should NOT be called because it was superseded
      expect(end1).not.toHaveBeenCalled();
    });
  });

  describe('2. EventSource Stream Authentication Support', () => {
    it('authorizes requests with query parameter token when headers are omitted (SSE compatibility)', () => {
      const req = new NextRequest('http://localhost:3000/api/browser/sessions/bsess_123/stream?token=test-token-4-6');
      const auth = verifyApiAuth(req);

      expect(auth.authorized).toBe(true);
    });

    it('rejects SSE requests with invalid query parameter token', () => {
      const req = new NextRequest('http://localhost:3000/api/browser/sessions/bsess_123/stream?token=invalid-secret');
      const auth = verifyApiAuth(req);

      expect(auth.authorized).toBe(false);
      expect(auth.response?.status).toBe(401);
    });
  });

  describe('3. Browser Workspace Session Management & Stage Pane Resolution', () => {
    it('creates and tracks active browser sessions in SQLite with lease holder HUMAN', () => {
      const session = getOrCreateBrowserSession(db, 'conv_main', 'owner', 'https://github.com', 'GitHub');

      expect(session.id).toBeDefined();
      expect(session.current_url).toBe('https://github.com');
      expect(session.status).toBe('active');
      expect(session.lease_holder).toBe('HUMAN');
    });

    it('reuses existing active browser session for the same conversation without duplicate creation', () => {
      const s1 = getOrCreateBrowserSession(db, 'conv_main', 'owner', 'https://github.com', 'GitHub');
      const s2 = getOrCreateBrowserSession(db, 'conv_main', 'owner', 'https://github.com', 'GitHub');

      expect(s1.id).toBe(s2.id);
    });
  });
});
