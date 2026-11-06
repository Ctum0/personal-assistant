import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { rebuildDayStats } from '../src/lib/db';

describe('Rollup Engine', () => {
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
        coverage REAL NOT NULL,
        offline_min INTEGER NOT NULL DEFAULT 0,
        tasks_done INTEGER NOT NULL DEFAULT 0
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

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE day_scores (
        date TEXT PRIMARY KEY,
        score REAL NOT NULL,
        components TEXT NOT NULL,
        verdict_json TEXT NOT NULL,
        intensity INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `);
  });

  it('rebuilds day_stats accurately from discrete events', () => {
    const today = '2026-11-06';
    const insert = db.prepare('INSERT INTO events (id, ts, source, kind, category, app, title, duration_s) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    // 120 min work (2h)
    insert.run('evt-1', `${today}T08:00:00Z`, 'activitywatch', 'window', 'work', 'code', 'brain.ts', 3600);
    insert.run('evt-2', `${today}T09:00:00Z`, 'activitywatch', 'window', 'work', 'code', 'scoring.ts', 3600);

    // 30 min leisure
    insert.run('evt-3', `${today}T10:00:00Z`, 'activitywatch', 'web', 'leisure', 'browser', 'youtube.com', 1800);

    const stats = rebuildDayStats(db, today);

    expect(stats.date).toBe(today);
    expect(stats.work_min).toBe(120);
    expect(stats.leisure_min).toBe(30);
    expect(stats.active_min).toBe(150);
    expect(stats.woke_at).toBe(new Date(`${today}T08:00:00Z`).toTimeString().slice(0, 5));
  });

  it('records offline gaps > 15 min and excludes them from leisure and active minutes', () => {
    const today = '2026-11-06';
    const insert = db.prepare('INSERT INTO events (id, ts, source, kind, category, app, title, duration_s) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    // Event 1 at 08:00
    insert.run('evt-1', `${today}T08:00:00Z`, 'activitywatch', 'window', 'work', 'code', 'task.ts', 1800);
    // Gap of 40 minutes (08:30 to 09:10)
    insert.run('evt-2', `${today}T09:10:00Z`, 'activitywatch', 'window', 'work', 'code', 'task.ts', 1800);

    const stats = rebuildDayStats(db, today);

    // active minutes = 30 + 30 = 60
    expect(stats.active_min).toBe(60);
    expect(stats.work_min).toBe(60);
    expect(stats.leisure_min).toBe(0);

    // Query offline_min from db
    const row = db.prepare('SELECT offline_min FROM day_stats WHERE date = ?').get(today) as { offline_min: number };
    expect(row.offline_min).toBeGreaterThanOrEqual(40);
  });
});
