import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { buildLiveContextBlock, extractMood, executeSofiaTool, SOFIA_TOOLS } from '../src/lib/brain';
import { defaultSettings } from '../src/lib/types';

describe('Brain Subsystem', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        category TEXT NOT NULL,
        app TEXT NOT NULL,
        title TEXT,
        duration_s INTEGER NOT NULL,
        meta TEXT
      );

      CREATE TABLE day_stats (
        date TEXT PRIMARY KEY,
        active_min INTEGER NOT NULL,
        work_min INTEGER NOT NULL,
        leisure_min INTEGER NOT NULL,
        neutral_min INTEGER NOT NULL,
        commits INTEGER NOT NULL,
        woke_at TEXT,
        bed_at TEXT,
        coverage REAL NOT NULL
      );

      CREATE TABLE day_scores (
        date TEXT PRIMARY KEY,
        score REAL NOT NULL,
        components TEXT NOT NULL,
        verdict_json TEXT NOT NULL,
        intensity INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE memory_notes (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        due TEXT,
        status TEXT NOT NULL,
        est_min INTEGER NOT NULL,
        done_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE focus_sessions (
        id TEXT PRIMARY KEY,
        start TEXT NOT NULL,
        end TEXT,
        goal_min INTEGER NOT NULL,
        result TEXT NOT NULL,
        distraction_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron TEXT NOT NULL,
        action TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        next_run TEXT
      );

      CREATE TABLE proactive_log (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        job TEXT NOT NULL,
        text TEXT NOT NULL,
        channel TEXT NOT NULL,
        suppressed_reason TEXT
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Seed test day_stats
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO day_stats (date, active_min, work_min, leisure_min, neutral_min, commits, woke_at, bed_at, coverage)
      VALUES (?, 300, 240, 60, 0, 8, '07:30', '23:30', 0.95)
    `).run(today);
  });

  it('builds live context block with required fact-based structure', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ctx = buildLiveContextBlock(db, today);

    expect(ctx.today.commits).toBe(8);
    expect(ctx.today.focus_min).toBe(240);
    expect(ctx.today.leisure_pct).toBe(20);
    expect(ctx.today.coverage).toBe(0.95);
    expect(ctx.today.woke_at).toBe('07:30');
  });

  it('extracts mood tags cleanly from LLM response text', () => {
    const res1 = extractMood('Eight commits and 19 percent leisure. Score nine. [MOOD:pleased]');
    expect(res1.mood).toBe('pleased');
    expect(res1.text).toBe('Eight commits and 19 percent leisure. Score nine.');

    const res2 = extractMood('You woke at 12:04. Target was 07:30. Desk. [MOOD:stern]');
    expect(res2.mood).toBe('stern');
    expect(res2.text).toBe('You woke at 12:04. Target was 07:30. Desk.');

    const res3 = extractMood('Plain line without mood tag.');
    expect(res3.mood).toBe('neutral');
    expect(res3.text).toBe('Plain line without mood tag.');
  });

  it('has all 9 typed tools defined in SOFIA_TOOLS', () => {
    const toolNames = SOFIA_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain('get_stats');
    expect(toolNames).toContain('get_timeline');
    expect(toolNames).toContain('search_memory');
    expect(toolNames).toContain('list_tasks');
    expect(toolNames).toContain('create_task');
    expect(toolNames).toContain('complete_task');
    expect(toolNames).toContain('start_focus_session');
    expect(toolNames).toContain('set_reminder');
    expect(toolNames).toContain('request_consequence');
  });

  it('executes get_stats tool cleanly', () => {
    const res = executeSofiaTool(db, 'get_stats', { range: 'day' }, defaultSettings);
    expect(res.error).toBeUndefined();
    expect(res.result).toBeDefined();
    expect(res.result.stats.commits).toBe(8);
  });
});
