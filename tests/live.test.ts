import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { buildGeminiFunctionDeclarations, buildOpenAITools, executeTool } from '../src/lib/tools';
import { HERMES_TOOLS } from '../src/lib/hermes-tools';
import { executeNamedAction, ALLOWED_ACTIONS } from '../src/lib/actions';
import { trackLiveUsage, getTodayLiveSeconds } from '../src/lib/db';
import { defaultSettings } from '../src/lib/types';

describe('Gemini 3.8 Live & Machine Control (Sofia v6)', () => {
  let testDb: DatabaseSync;

  beforeEach(() => {
    testDb = new DatabaseSync(':memory:');
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS live_usage (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        seconds REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron TEXT NOT NULL,
        action TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        next_run TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS day_stats (
        date TEXT PRIMARY KEY,
        active_min INTEGER NOT NULL,
        work_min INTEGER NOT NULL,
        leisure_min INTEGER NOT NULL,
        neutral_min INTEGER NOT NULL,
        commits INTEGER NOT NULL,
        coverage REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        est_min INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  });

  describe('Tools & Hermes Granular Declarations', () => {
    it('declares 13+ granular machine control and scheduling tools', () => {
      expect(HERMES_TOOLS.length).toBeGreaterThanOrEqual(13);
      const names = HERMES_TOOLS.map((t) => t.name);
      expect(names).toContain('computer_screenshot');
      expect(names).toContain('computer_run');
      expect(names).toContain('computer_file_read');
      expect(names).toContain('computer_file_write');
      expect(names).toContain('hermes_schedule_create');
      expect(names).toContain('hermes_schedule_list');
    });

    it('generates valid Gemini Live function declarations', () => {
      const decls = buildGeminiFunctionDeclarations();
      expect(decls.length).toBeGreaterThan(20);
      const screenshotTool = decls.find((d) => d.name === 'computer_screenshot');
      expect(screenshotTool).toBeDefined();
      expect(screenshotTool?.parameters.type).toBe('OBJECT');
    });

    it('generates valid OpenAI format tools', () => {
      const openAiTools = buildOpenAITools();
      expect(openAiTools.length).toBeGreaterThan(20);
      const first = openAiTools[0];
      expect(first.type).toBe('function');
      expect(first.function.name).toBeDefined();
    });
  });

  describe('Pre-written Safe Server Actions (§E.6)', () => {
    it('has all allowlisted actions registered without raw shell interpolation', () => {
      expect(ALLOWED_ACTIONS['backup-sofia-db']).toBeDefined();
      expect(ALLOWED_ACTIONS['system-status']).toBeDefined();
      expect(ALLOWED_ACTIONS['git-status']).toBeDefined();
      expect(ALLOWED_ACTIONS['tail-wazuh-alerts']).toBeDefined();
    });

    it('executes system-status safely and returns metrics pane', async () => {
      const res = await executeNamedAction('system-status');
      expect(res.ok).toBe(true);
      expect(res.output).toContain('System:');
      expect(res.pane?.kind).toBe('stat');
    });

    it('rejects unauthorized action IDs', async () => {
      await expect(executeNamedAction('rm-rf-root')).rejects.toThrow('is not allowlisted');
    });
  });

  describe('Database Live Usage Tracking (§F)', () => {
    it('tracks live voice seconds and aggregates daily usage', () => {
      trackLiveUsage(testDb, 120);
      trackLiveUsage(testDb, 180);
      const total = getTodayLiveSeconds(testDb);
      expect(total).toBe(300);
    });
  });

  describe('Tool Execution & Stage Panes', () => {
    it('executes hermes_schedule_create and produces a stat pane', async () => {
      const res = await executeTool(
        testDb,
        'hermes_schedule_create',
        { name: 'Daily Standup', cron: '0 9 * * *', command: 'echo standup' },
        defaultSettings
      );
      expect(res.result?.created).toBe(true);
      expect(res.pane?.kind).toBe('stat');
      expect(res.pane?.title).toContain('Daily Standup');
    });

    it('executes hermes_schedule_list and returns table pane', async () => {
      testDb.prepare(
        'INSERT INTO schedules (id, name, cron, action, enabled) VALUES (?, ?, ?, ?, 1)'
      ).run('sched-1', 'Morning Backup', '0 3 * * *', 'backup');

      const res = await executeTool(testDb, 'hermes_schedule_list', {}, defaultSettings);
      expect(res.result?.schedules?.length).toBe(1);
      expect(res.pane?.kind).toBe('table');
    });
  });
});
