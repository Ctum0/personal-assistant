import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { canSendProactive, executeProactiveJob } from '../src/lib/proactive';

describe('Proactivity & Guardrails Engine', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE proactive_log (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        job TEXT NOT NULL,
        text TEXT NOT NULL,
        channel TEXT NOT NULL,
        suppressed_reason TEXT
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        mood TEXT,
        tool_calls TEXT
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

      CREATE TABLE day_scores (
        date TEXT PRIMARY KEY,
        score REAL NOT NULL,
        components TEXT NOT NULL,
        verdict_json TEXT NOT NULL,
        intensity INTEGER NOT NULL,
        status TEXT NOT NULL
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
    `);
  });

  it('blocks during quiet hours (e.g. 02:00)', () => {
    const quietTime = new Date('2026-11-06T02:00:00');
    const result = canSendProactive(db, 'midday_check', quietTime);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('quiet_hours');
  });

  it('blocks when emergency mute is active', () => {
    const activeTime = new Date('2026-11-06T14:00:00');
    const mutedUntil = new Date('2026-11-06T15:00:00').toISOString();

    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      'global',
      JSON.stringify({
        proactivity: {
          muted_until: mutedUntil,
          rest_day: false,
          daily_cap: 8,
          quiet_hours_start: '23:00',
          quiet_hours_end: '07:00',
        },
      })
    );

    const result = canSendProactive(db, 'midday_check', activeTime);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('muted_until');
  });

  it('blocks midday_check on rest days', () => {
    const activeTime = new Date('2026-11-06T13:00:00');

    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      'global',
      JSON.stringify({
        proactivity: {
          muted_until: null,
          rest_day: true,
          daily_cap: 8,
          quiet_hours_start: '23:00',
          quiet_hours_end: '07:00',
        },
      })
    );

    const result = canSendProactive(db, 'midday_check', activeTime);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('rest_day_active');
  });

  it('blocks when 8 messages per day cap is reached', () => {
    const activeTime = new Date('2026-11-06T14:00:00');
    const insertLog = db.prepare(
      'INSERT INTO proactive_log (id, ts, job, text, channel, suppressed_reason) VALUES (?, ?, ?, ?, ?, NULL)'
    );

    for (let i = 0; i < 8; i++) {
      insertLog.run(`log-${i}`, new Date('2026-11-06T08:00:00').toISOString(), 'midday_check', 'ping', 'screen');
    }

    const result = canSendProactive(db, 'midday_check', activeTime);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('daily_cap_exceeded');
  });

  it('blocks if last proactive message was sent less than 30 minutes ago', () => {
    const activeTime = new Date('2026-11-06T14:20:00');
    const recentTs = new Date('2026-11-06T14:05:00').toISOString(); // 15 min ago

    db.prepare(
      'INSERT INTO proactive_log (id, ts, job, text, channel, suppressed_reason) VALUES (?, ?, ?, ?, ?, NULL)'
    ).run('log-recent', recentTs, 'wake_report', 'ping', 'screen');

    const result = canSendProactive(db, 'midday_check', activeTime);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('min_gap_active');
  });

  it('executes wake_report and logs to proactive_log and messages with facts', async () => {
    const res = await executeProactiveJob(db, 'wake_report', { force: true });
    expect(res.sent).toBe(true);
    expect(res.text).toMatch(/\d/); // Contains digits/facts

    const msg = db.prepare('SELECT * FROM messages WHERE role = ?').get('assistant') as { content: string };
    expect(msg.content).toBe(res.text);

    const log = db.prepare('SELECT * FROM proactive_log WHERE job = ?').get('wake_report') as { job: string };
    expect(log.job).toBe('wake_report');
  });
});
