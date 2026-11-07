import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { UNIFIED_TOOLS, executeTool } from '../src/lib/tools';
import { getLiveConfig } from '../src/lib/live/config';
import { initDatabase, createBrowserStreamTicket, consumeBrowserStreamTicket } from '../src/lib/db';
import { defaultSettings } from '../src/lib/types';

describe('SOFIA PHASE 4.7 — Gemini Live, Hermes Coordination & Browser Tickets', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initDatabase(db);
  });

  describe('1. Controlled Hermes Delegation Tool (sofia_delegate_to_hermes)', () => {
    it('registers sofia_delegate_to_hermes in UNIFIED_TOOLS with valid schema', () => {
      const tool = UNIFIED_TOOLS.find((t) => t.name === 'sofia_delegate_to_hermes');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Hermes');
      expect(tool?.geminiParameters.properties).toHaveProperty('task');
      expect(tool?.geminiParameters.properties).toHaveProperty('category');
      expect(tool?.geminiParameters.required).toContain('task');
    });

    it('delegates task to Hermes asynchronously without throwing', async () => {
      // Mock environment so getHermesClient has dummy config
      const originalPrimary = process.env.SOFIA_HERMES_PRIMARY;
      const originalUrl = process.env.HERMES_URL;
      process.env.SOFIA_HERMES_PRIMARY = 'true';
      process.env.HERMES_URL = 'http://127.0.0.1:8645';

      try {
        const res = await executeTool(
          db,
          'sofia_delegate_to_hermes',
          { task: 'Research quantum computing developments', category: 'research' },
          defaultSettings
        );

        // Should return a result or error cleanly (gateway not running in unit test)
        expect(res).toBeDefined();
        expect(typeof res).toBe('object');
      } finally {
        process.env.SOFIA_HERMES_PRIMARY = originalPrimary;
        process.env.HERMES_URL = originalUrl;
      }
    });
  });

  describe('2. Gemini Live Config & Voice Audition Overrides', () => {
    it('defaults model to gemini-3.8-live and voice to Aoede', () => {
      const originalModel = process.env.SOFIA_LIVE_MODEL;
      const originalVoice = process.env.SOFIA_LIVE_VOICE;
      delete process.env.SOFIA_LIVE_MODEL;
      delete process.env.SOFIA_LIVE_VOICE;

      try {
        const cfg = getLiveConfig(db);
        expect(cfg.model).toBe('gemini-3.8-live');
        expect(cfg.voice).toBe('Aoede');
      } finally {
        if (originalModel) process.env.SOFIA_LIVE_MODEL = originalModel;
        if (originalVoice) process.env.SOFIA_LIVE_VOICE = originalVoice;
      }
    });

    it('respects audition overrides for candidate voices without silent remapping', () => {
      const cfgLeda = getLiveConfig(db, 'default', { voice: 'Leda' });
      expect(cfgLeda.voice).toBe('Leda');

      const cfgAchernar = getLiveConfig(db, 'default', { voice: 'Achernar' });
      expect(cfgAchernar.voice).toBe('Achernar');
    });
  });

  describe('3. Browser Screencast Single-Use Ticket Security', () => {
    it('creates a ticket and verifies successful one-time consumption', () => {
      const sessionId = 'test-session-1';
      const ticket = createBrowserStreamTicket(db, sessionId, 60_000);

      expect(ticket).toMatch(/^bst_/);

      // First consumption must succeed
      const firstUse = consumeBrowserStreamTicket(db, ticket, sessionId);
      expect(firstUse).toBe(true);

      // Second consumption must be rejected (single-use)
      const secondUse = consumeBrowserStreamTicket(db, ticket, sessionId);
      expect(secondUse).toBe(false);
    });

    it('rejects ticket consumption for mismatched session ID', () => {
      const ticket = createBrowserStreamTicket(db, 'session-correct', 60_000);
      const consumed = consumeBrowserStreamTicket(db, ticket, 'session-wrong');
      expect(consumed).toBe(false);
    });

    it('rejects expired tickets', () => {
      const sessionId = 'test-session-expired';
      // Create ticket that expired 10 seconds ago
      const ticket = createBrowserStreamTicket(db, sessionId, -10_000);
      const consumed = consumeBrowserStreamTicket(db, ticket, sessionId);
      expect(consumed).toBe(false);
    });
  });
});
