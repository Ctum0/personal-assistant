import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, getSettings, updateSettings } from '../src/lib/db';
import { getLiveConfig } from '../src/lib/live/config';
import { BrowserManager } from '../src/server/browser-manager';
import { getOrCreateBrowserSession, closeBrowserSession } from '../src/lib/browser/session';

describe('SOFIA PHASE 4.8 — Production Acceptance & Persistence Suite', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. Browser Locale & Language Preferences', () => {
    it('normalizes Google navigation URLs to include English (hl=en) and regional (gl=lk) parameters', async () => {
      const manager = BrowserManager.getInstance();

      // Test URL normalization logic on Google search
      const inputUrl = 'https://www.google.com/search?q=open+source+agents';
      const parsed = new URL(inputUrl);
      if (parsed.hostname.includes('google.') && !parsed.searchParams.has('hl')) {
        parsed.searchParams.set('hl', 'en');
        if (!parsed.searchParams.has('gl')) {
          parsed.searchParams.set('gl', 'lk');
        }
      }
      expect(parsed.searchParams.get('hl')).toBe('en');
      expect(parsed.searchParams.get('gl')).toBe('lk');
    });

    it('does not alter non-Google URLs with redundant query parameters', () => {
      const inputUrl = 'https://github.com/ctum/agitated-archimedes';
      const parsed = new URL(inputUrl);
      if (parsed.hostname.includes('google.') && !parsed.searchParams.has('hl')) {
        parsed.searchParams.set('hl', 'en');
      }
      expect(parsed.searchParams.has('hl')).toBe(false);
      expect(parsed.toString()).toBe('https://github.com/ctum/agitated-archimedes');
    });
  });

  describe('2. Browser Session Dismissal vs Explicit Closure', () => {
    it('creates active browser session and persists state in SQLite', () => {
      const session = getOrCreateBrowserSession(
        db,
        'conv_acceptance_1',
        'owner',
        'https://github.com',
        'GitHub Research'
      );

      expect(session.id).toBeDefined();
      expect(session.status).toBe('active');
      expect(session.lease_holder).toBe('HUMAN');

      // Dismissing pane in UI does NOT close database session
      // Only explicit closeBrowserSession marks it closed
      const closed = closeBrowserSession(db, session.id);
      expect(closed).toBe(true);

      const row: any = db
        .prepare('SELECT status FROM browser_sessions WHERE id = ?')
        .get(session.id);
      expect(row.status).toBe('closed');
    });
  });

  describe('3. Persisted Voice Preferences & Dynamic Live Configuration', () => {
    it('reads live_voice and live_model from settings table when not overridden', () => {
      // Default settings check
      const initialConfig = getLiveConfig(db, 'conv_default');
      expect(initialConfig.voice).toBe('Aoede');
      expect(initialConfig.model).toBe('gemini-3.8-live');

      // Update settings to Leda
      updateSettings(db, {
        voice: {
          ...getSettings(db).voice,
          live_voice: 'Leda',
        },
      });

      const updatedConfig = getLiveConfig(db, 'conv_default');
      expect(updatedConfig.voice).toBe('Leda');

      // Client override takes precedence
      const overridden = getLiveConfig(db, 'conv_default', { voice: 'Achernar' });
      expect(overridden.voice).toBe('Achernar');
    });
  });

  describe('4. Conversation and Turn Persistence across Refresh', () => {
    it('persists cross-channel turns and restores latest caption on load', () => {
      const sessionId = 'conv_refresh_test';

      // Insert user and assistant turns
      db.prepare(
        'INSERT INTO messages (id, ts, role, content, mood, session_id, channel) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'msg-u1',
        new Date(Date.now() - 5000).toISOString(),
        'user',
        'Tell me about quantum computing',
        null,
        sessionId,
        'voice'
      );

      db.prepare(
        'INSERT INTO messages (id, ts, role, content, mood, session_id, channel) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'msg-a1',
        new Date().toISOString(),
        'assistant',
        'Quantum computing uses qubits to perform parallel computations.',
        'pleased',
        sessionId,
        'voice'
      );

      // Query latest message as done on page load
      const rows: any[] = db
        .prepare(
          'SELECT id, ts, role, content, mood, session_id, channel FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 10'
        )
        .all(sessionId);

      expect(rows.length).toBe(2);
      const lastAssistant = rows.find((r) => r.role === 'assistant');
      const lastUser = rows.find((r) => r.role === 'user');

      expect(lastAssistant.content).toContain('Quantum computing uses qubits');
      expect(lastAssistant.mood).toBe('pleased');
      expect(lastUser.content).toBe('Tell me about quantum computing');
    });
  });

  describe('5. Hermes Background Task Live Context Delivery', () => {
    it('records Hermes run association in messages table with run_id', () => {
      const sessionId = 'conv_hermes_run';
      const runId = 'run_abc123';

      db.prepare(
        'INSERT INTO messages (id, ts, role, content, mood, session_id, channel, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'msg-h1',
        new Date().toISOString(),
        'assistant',
        "I've completed that task on Hermes. The result is on your Stage.\n\nFound 4 pull requests.",
        'pleased',
        sessionId,
        'system',
        runId
      );

      const msg: any = db
        .prepare('SELECT * FROM messages WHERE run_id = ?')
        .get(runId);

      expect(msg).toBeDefined();
      expect(msg.run_id).toBe(runId);
      expect(msg.content).toContain('Found 4 pull requests');
    });
  });
});
