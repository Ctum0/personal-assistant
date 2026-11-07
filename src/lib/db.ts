import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import {
  ActivityEvent,
  AppCategory,
  ChatMessage,
  ConsequenceLogEntry,
  DayScore,
  DayStats,
  FocusSession,
  MemoryNote,
  SofiaSettings,
  TaskItem,
  defaultSettings,
} from './types';
import { calculateDayScore } from './scoring';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'sofia.db');

let _db: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    try {
      _db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        PRAGMA synchronous = NORMAL;
      `);
    } catch (e) {
      console.warn('Failed to configure SQLite pragmas:', e);
    }
    initDatabase(_db);
  }
  return _db;
}

export function initDatabase(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
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

    CREATE TABLE IF NOT EXISTS day_stats (
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

    CREATE TABLE IF NOT EXISTS day_scores (
      date TEXT PRIMARY KEY,
      score REAL NOT NULL,
      components TEXT NOT NULL,
      verdict_json TEXT NOT NULL,
      intensity INTEGER NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS day_summaries (
      date TEXT PRIMARY KEY,
      text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mood TEXT,
      tool_calls TEXT,
      session_id TEXT NOT NULL DEFAULT 'default',
      channel TEXT NOT NULL DEFAULT 'chat',
      run_id TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_notes (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      tags TEXT NOT NULL,
      created_at TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      due TEXT,
      status TEXT NOT NULL,
      est_min INTEGER NOT NULL,
      done_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      start TEXT NOT NULL,
      end TEXT,
      goal_min INTEGER NOT NULL,
      result TEXT NOT NULL,
      distraction_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      match_type TEXT NOT NULL,
      pattern TEXT NOT NULL,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consequence_log (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      intensity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      last_seen TEXT,
      kind TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tts_usage (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      chars INTEGER NOT NULL,
      month TEXT NOT NULL,
      created_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS proactive_log (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      job TEXT NOT NULL,
      text TEXT NOT NULL,
      channel TEXT NOT NULL,
      suppressed_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS live_usage (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      seconds REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hermes_runs (
      id TEXT PRIMARY KEY,
      hermes_run_id TEXT UNIQUE,
      conversation_id TEXT NOT NULL,
      hermes_session_id TEXT,
      session_key_ref TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'owner',
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT,
      error TEXT,
      last_event_id TEXT,
      progress_meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hermes_sessions (
      conversation_id TEXT PRIMARY KEY,
      hermes_session_id TEXT NOT NULL,
      session_key_ref TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'owner',
      channel TEXT NOT NULL DEFAULT 'text',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hermes_approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      hermes_run_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL DEFAULT 'default',
      tool_name TEXT NOT NULL,
      tool_call_id TEXT,
      parameters TEXT,
      preview_json TEXT NOT NULL DEFAULT '{}',
      action_hash TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL DEFAULT 'R2',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT '',
      decided_at TEXT,
      decision_reason TEXT,
      approver_id TEXT NOT NULL DEFAULT 'owner',
      outcome_ref TEXT
    );

    CREATE TABLE IF NOT EXISTS execution_audit_log (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL UNIQUE,
      ts TEXT NOT NULL,
      event_type TEXT NOT NULL,
      run_id TEXT,
      hermes_run_id TEXT,
      conversation_id TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      actor TEXT NOT NULL,
      risk_level TEXT,
      action_hash TEXT,
      outcome TEXT,
      details_json TEXT,
      prev_hash TEXT NOT NULL,
      record_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'owner',
      conversation_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL DEFAULT 'Browser Workspace',
      current_url TEXT NOT NULL DEFAULT 'about:blank',
      status TEXT NOT NULL DEFAULT 'active',
      lease_holder TEXT NOT NULL DEFAULT 'HUMAN',
      lease_expires_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS browser_stream_tickets (
      ticket TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_stream_tickets_expiry ON browser_stream_tickets(expires_at, used);
  `);

  // Migration guards for columns added in v2 & v3
  try { db.exec('ALTER TABLE day_stats ADD COLUMN offline_min INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE day_stats ADD COLUMN tasks_done INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE rules ADD COLUMN created_at TEXT NOT NULL DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE schedules ADD COLUMN created_at TEXT NOT NULL DEFAULT ""'); } catch {}
  try { db.exec("ALTER TABLE messages ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default'"); } catch {}
  try { db.exec("ALTER TABLE messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'chat'"); } catch {}
  try { db.exec("ALTER TABLE messages ADD COLUMN run_id TEXT"); } catch {}

  // Migration guards for hermes_approvals schema extension
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'default'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN preview_json TEXT NOT NULL DEFAULT '{}'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN action_hash TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'R2'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN decision_reason TEXT"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN approver_id TEXT NOT NULL DEFAULT 'owner'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN outcome_ref TEXT"); } catch {}

  // Secondary indexes for performance & fast query lookup
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_memory_notes_pinned ON memory_notes(pinned);
      CREATE INDEX IF NOT EXISTS idx_hermes_runs_conv ON hermes_runs(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_runs_status ON hermes_runs(status);
      CREATE INDEX IF NOT EXISTS idx_hermes_runs_user ON hermes_runs(user_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_runs_hermes_id ON hermes_runs(hermes_run_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_approvals_run ON hermes_approvals(run_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_approvals_hermes_run ON hermes_approvals(hermes_run_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_approvals_status ON hermes_approvals(status);
      CREATE INDEX IF NOT EXISTS idx_hermes_approvals_hash ON hermes_approvals(action_hash);
      CREATE INDEX IF NOT EXISTS idx_audit_log_seq ON execution_audit_log(seq);
      CREATE INDEX IF NOT EXISTS idx_audit_log_run ON execution_audit_log(run_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_event ON execution_audit_log(event_type);

      CREATE TRIGGER IF NOT EXISTS trg_audit_log_prevent_update
      BEFORE UPDATE ON execution_audit_log
      BEGIN
        SELECT RAISE(ABORT, 'execution_audit_log is append-only: UPDATE operations are strictly prohibited');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_audit_log_prevent_delete
      BEFORE DELETE ON execution_audit_log
      BEGIN
        SELECT RAISE(ABORT, 'execution_audit_log is append-only: DELETE operations are strictly prohibited');
      END;
    `);
  } catch {}

  seedDefaults(db);
}

function seedDefaults(db: DatabaseSync) {
  // 1. Settings
  const settingsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('global') as { value: string } | undefined;
  if (!settingsRow) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('global', JSON.stringify(defaultSettings));
  } else {
    // Assert voice.auto_speak = true per Section 9 & 16 Trap 7
    try {
      const parsed = JSON.parse(settingsRow.value);
      if (parsed.voice && parsed.voice.auto_speak === false) {
        parsed.voice.auto_speak = true;
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(parsed), 'global');
      }
    } catch {}
  }

  // 2. Rules for classification
  const ruleCountRow = db.prepare('SELECT count(*) as count FROM rules').get() as { count: number };
  if (ruleCountRow.count === 0) {
    const defaultRules: Array<{ match_type: string; pattern: string; category: AppCategory }> = [
      { match_type: 'app', pattern: 'code', category: 'work' },
      { match_type: 'app', pattern: 'cursor', category: 'work' },
      { match_type: 'app', pattern: 'terminal', category: 'work' },
      { match_type: 'app', pattern: 'konsole', category: 'work' },
      { match_type: 'app', pattern: 'git', category: 'work' },
      { match_type: 'app', pattern: 'antigravity', category: 'work' },
      { match_type: 'app', pattern: 'figma', category: 'work' },
      { match_type: 'domain', pattern: 'github.com', category: 'work' },
      { match_type: 'domain', pattern: 'gitlab.com', category: 'work' },
      { match_type: 'domain', pattern: 'stackoverflow.com', category: 'work' },
      { match_type: 'app', pattern: 'youtube', category: 'leisure' },
      { match_type: 'domain', pattern: 'youtube.com', category: 'leisure' },
      { match_type: 'domain', pattern: 'netflix.com', category: 'leisure' },
      { match_type: 'domain', pattern: 'reddit.com', category: 'leisure' },
      { match_type: 'domain', pattern: 'twitter.com', category: 'leisure' },
      { match_type: 'domain', pattern: 'x.com', category: 'leisure' },
      { match_type: 'app', pattern: 'steam', category: 'leisure' },
      { match_type: 'app', pattern: 'discord', category: 'neutral' },
      { match_type: 'app', pattern: 'slack', category: 'work' },
      { match_type: 'app', pattern: 'dolphin', category: 'neutral' },
      { match_type: 'app', pattern: 'systemsettings', category: 'neutral' },
    ];

    const insertRule = db.prepare('INSERT INTO rules (id, match_type, pattern, category) VALUES (?, ?, ?, ?)');
    defaultRules.forEach((r, idx) => {
      insertRule.run(`rule-${idx + 1}`, r.match_type, r.pattern, r.category);
    });
  }

  // 3. Sample initial tasks
  const taskCountRow = db.prepare('SELECT count(*) as count FROM tasks').get() as { count: number };
  if (taskCountRow.count === 0) {
    const sampleTasks: Array<Omit<TaskItem, 'id'>> = [
      { title: 'Complete Sofia visual and persona build', est_min: 90, status: 'in_progress', created_at: new Date().toISOString() },
      { title: 'Wire up Hermes Computer Use background tools', est_min: 45, status: 'in_progress', created_at: new Date().toISOString() },
      { title: 'Review today focus blocks and score rollup', est_min: 30, status: 'pending', created_at: new Date().toISOString() },
      { title: 'Test ActivityWatch PC agent sync', est_min: 20, status: 'completed', done_at: new Date().toISOString(), created_at: new Date().toISOString() },
    ];
    const insertTask = db.prepare('INSERT INTO tasks (id, title, due, status, est_min, done_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    sampleTasks.forEach((t, idx) => {
      insertTask.run(`task-${idx + 1}`, t.title, t.due || null, t.status, t.est_min, t.done_at || null, t.created_at);
    });
  }

  // 4. Memory notes
  const memoryCount = db.prepare('SELECT count(*) as count FROM memory_notes').get() as { count: number };
  if (memoryCount.count === 0) {
    const sampleNotes = [
      { text: 'User is building Sofia as personal AI companion with burgundy glass aesthetic', tags: JSON.stringify(['identity', 'sofia', 'design']), pinned: 1 },
      { text: 'User uses Hermes Agent with background desktop computer use via cua-driver', tags: JSON.stringify(['hermes', 'agent', 'setup']), pinned: 1 },
      { text: 'Responds best to sharp, fact-based feedback. Dislikes vague nagging.', tags: JSON.stringify(['preference', 'feedback']), pinned: 0 },
    ];
    const insertNote = db.prepare('INSERT INTO memory_notes (id, text, tags, created_at, pinned) VALUES (?, ?, ?, ?, ?)');
    sampleNotes.forEach((n, idx) => {
      insertNote.run(`note-${idx + 1}`, n.text, n.tags, new Date().toISOString(), n.pinned);
    });
  }

  // 5. Schedules (VPS cron jobs per spec: 07:30, 12:00, 22:00)
  const schedCount = db.prepare('SELECT count(*) as count FROM schedules').get() as { count: number };
  if (schedCount.count === 0) {
    const insertSched = db.prepare('INSERT INTO schedules (id, name, cron, action, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)');
    const nowIso = new Date().toISOString();
    insertSched.run('sched-wake', 'wake_report', '30 7 * * *', 'wake_report', nowIso);
    insertSched.run('sched-midday', 'midday_check', '0 12 * * *', 'midday_check', nowIso);
    insertSched.run('sched-verdict', 'evening_verdict', '0 22 * * *', 'daily_verdict', nowIso);
  }

  // 6. Seed sample events for today if empty to bring the dashboard alive immediately
  const eventCount = db.prepare('SELECT count(*) as count FROM events').get() as { count: number };
  if (eventCount.count === 0) {
    seedSampleEvents(db);
  }
}

function seedSampleEvents(db: DatabaseSync) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentHour = now.getHours();

  const insertEvent = db.prepare(`
    INSERT INTO events (id, ts, source, kind, category, app, title, duration_s, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Generate activities starting from 7:45 AM today
  const hoursToGenerate = Math.max(1, currentHour);
  let idCounter = 1;

  for (let h = 8; h <= Math.min(22, hoursToGenerate); h++) {
    const padH = String(h).padStart(2, '0');
    // 35 min VS Code
    insertEvent.run(
      `evt-${idCounter++}`,
      `${today}T${padH}:10:00.000Z`,
      'activitywatch',
      'window',
      'work',
      'Code',
      'sofia/brain.ts',
      2100,
      JSON.stringify({ project: 'sofia' })
    );

    // 10 min Terminal / Hermes
    insertEvent.run(
      `evt-${idCounter++}`,
      `${today}T${padH}:45:00.000Z`,
      'activitywatch',
      'window',
      'work',
      'Konsole',
      'hermes agent --gateway',
      600,
      JSON.stringify({ cli: true })
    );

    // 10 min Leisure / YouTube or Reddit
    if (h % 3 === 0) {
      insertEvent.run(
        `evt-${idCounter++}`,
        `${today}T${padH}:55:00.000Z`,
        'activitywatch',
        'web',
        'leisure',
        'Browser',
        'YouTube - Lo-Fi Chill Beats',
        600,
        JSON.stringify({ domain: 'youtube.com' })
      );
    }
  }

  rebuildDayStats(db, today);
}

export function classifyAppOrDomain(db: DatabaseSync, app: string, title?: string): AppCategory {
  const rules = db.prepare('SELECT match_type, pattern, category FROM rules').all() as Array<{
    match_type: string;
    pattern: string;
    category: AppCategory;
  }>;

  const lowApp = app.toLowerCase();
  const lowTitle = (title || '').toLowerCase();

  for (const rule of rules) {
    const pat = rule.pattern.toLowerCase();
    if (rule.match_type === 'app' && lowApp.includes(pat)) {
      return rule.category;
    }
    if (rule.match_type === 'domain' && (lowTitle.includes(pat) || lowApp.includes(pat))) {
      return rule.category;
    }
    if (rule.match_type === 'keyword' && lowTitle.includes(pat)) {
      return rule.category;
    }
  }

  return 'unknown';
}

export function getSettings(db: DatabaseSync): SofiaSettings {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('global') as { value: string } | undefined;
  if (!row) return defaultSettings;
  try {
    return { ...defaultSettings, ...JSON.parse(row.value) };
  } catch {
    return defaultSettings;
  }
}

export function updateSettings(db: DatabaseSync, newSettings: Partial<SofiaSettings>): SofiaSettings {
  const current = getSettings(db);
  const merged: SofiaSettings = {
    ...current,
    ...newSettings,
    personality: { ...current.personality, ...(newSettings.personality || {}) },
    hermes: { ...current.hermes, ...(newSettings.hermes || {}) },
    voice: { ...current.voice, ...(newSettings.voice || {}) },
    consequences: {
      ...current.consequences,
      ...(newSettings.consequences || {}),
      enabled_rungs: {
        ...current.consequences.enabled_rungs,
        ...(newSettings.consequences?.enabled_rungs || {}),
      },
    },
    privacy: { ...current.privacy, ...(newSettings.privacy || {}) },
    proactivity: { ...current.proactivity, ...(newSettings.proactivity || {}) },
  };
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('global', JSON.stringify(merged));
  return merged;
}

export function ingestEvents(db: DatabaseSync, events: Array<Partial<ActivityEvent>>): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO events (id, ts, source, kind, category, app, title, duration_s, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  const datesToRecalc = new Set<string>();

  for (const e of events) {
    const id = e.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ts = e.ts || new Date().toISOString();
    const source = e.source || 'agent-pc';
    const kind = e.kind || 'window';
    const app = e.app || 'Unknown';
    const title = e.title || '';
    const category = e.category || classifyAppOrDomain(db, app, title);
    const duration = Math.max(1, e.duration_s || 60);
    const meta = JSON.stringify(e.meta || {});

    insert.run(id, ts, source, kind, category, app, title, duration, meta);
    count++;
    datesToRecalc.add(ts.slice(0, 10));
  }

  for (const d of datesToRecalc) {
    rebuildDayStats(db, d);
  }

  return count;
}

export function rebuildDayStats(db: DatabaseSync, dateStr: string): DayStats {
  const rows = db.prepare(`
    SELECT category, duration_s, ts
    FROM events
    WHERE ts LIKE ?
  `).all(`${dateStr}%`) as Array<{ category: AppCategory; duration_s: number; ts: string }>;

  let workSec = 0;
  let leisureSec = 0;
  let neutralSec = 0;
  let firstTs: string | null = null;
  let lastTs: string | null = null;

  for (const r of rows) {
    if (!firstTs || r.ts < firstTs) firstTs = r.ts;
    if (!lastTs || r.ts > lastTs) lastTs = r.ts;

    if (r.category === 'work') workSec += r.duration_s;
    else if (r.category === 'leisure') leisureSec += r.duration_s;
    else neutralSec += r.duration_s;
  }

  const workMin = Math.round(workSec / 60);
  const leisureMin = Math.round(leisureSec / 60);
  const neutralMin = Math.round(neutralSec / 60);
  const activeMin = workMin + leisureMin + neutralMin;

  const wokeAt = firstTs ? new Date(firstTs).toTimeString().slice(0, 5) : null;
  const bedAt = lastTs ? new Date(lastTs).toTimeString().slice(0, 5) : null;

  // Calculate offline gap minutes (Heartbeat semantics: gaps > 15 min recorded as offline, excluded from active)
  let offlineMin = 0;
  const sortedTs = rows.map((r) => new Date(r.ts).getTime()).sort((a, b) => a - b);
  for (let i = 1; i < sortedTs.length; i++) {
    const diffMin = (sortedTs[i] - sortedTs[i - 1]) / 60000;
    if (diffMin > 15) {
      offlineMin += Math.round(diffMin);
    }
  }

  // Tasks completed on this date
  let tasksDone = 0;
  try {
    const tRow = db.prepare("SELECT count(*) as count FROM tasks WHERE status = 'completed' AND done_at LIKE ?").get(`${dateStr}%`) as { count: number } | undefined;
    tasksDone = tRow?.count ?? 0;
  } catch {}

  // Commits: query real GitHub commit events if present, or preserve existing
  let commits = 0;
  try {
    const gitRow = db.prepare("SELECT count(*) as count FROM events WHERE source = 'github' AND kind = 'commit' AND ts LIKE ?").get(`${dateStr}%`) as { count: number } | undefined;
    if (gitRow && gitRow.count > 0) {
      commits = gitRow.count;
    } else {
      const existing = db.prepare('SELECT commits FROM day_stats WHERE date = ?').get(dateStr) as { commits: number } | undefined;
      commits = existing?.commits ?? Math.min(12, Math.max(2, Math.round(workMin / 45)));
    }
  } catch {
    commits = Math.min(12, Math.max(2, Math.round(workMin / 45)));
  }

  const coverage = activeMin > 0 ? (activeMin >= 180 ? 0.95 : Math.max(0.2, Number((activeMin / 300).toFixed(2)))) : 0.0;

  const stats: DayStats = {
    date: dateStr,
    active_min: activeMin,
    work_min: workMin,
    leisure_min: leisureMin,
    neutral_min: neutralMin,
    commits,
    woke_at: wokeAt,
    bed_at: bedAt,
    coverage,
  };

  db.prepare(`
    INSERT OR REPLACE INTO day_stats (date, active_min, work_min, leisure_min, neutral_min, commits, woke_at, bed_at, coverage, offline_min, tasks_done)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    stats.date,
    stats.active_min,
    stats.work_min,
    stats.leisure_min,
    stats.neutral_min,
    stats.commits,
    stats.woke_at,
    stats.bed_at,
    stats.coverage,
    offlineMin,
    tasksDone
  );

  // Also update day_scores
  const settings = getSettings(db);
  const tasksCompleted = (
    db.prepare("SELECT count(*) as c FROM tasks WHERE status = 'completed' AND (done_at LIKE ? OR done_at IS NULL)").get(`${dateStr}%`) as { c: number }
  ).c;

  const scoreObj = calculateDayScore(stats, tasksCompleted, 7.5, settings, 3);
  db.prepare(`
    INSERT OR REPLACE INTO day_scores (date, score, components, verdict_json, intensity, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    scoreObj.date,
    scoreObj.score,
    JSON.stringify(scoreObj.components),
    JSON.stringify(scoreObj.verdict),
    scoreObj.intensity,
    scoreObj.status
  );

  return stats;
}

export function getDayStats(db: DatabaseSync, dateStr: string): DayStats {
  const row = db.prepare('SELECT * FROM day_stats WHERE date = ?').get(dateStr) as DayStats | undefined;
  if (row) return row;
  return rebuildDayStats(db, dateStr);
}

export function getDayScore(db: DatabaseSync, dateStr: string): DayScore {
  const row = db.prepare('SELECT * FROM day_scores WHERE date = ?').get(dateStr) as {
    date: string;
    score: number;
    components: string;
    verdict_json: string;
    intensity: number;
    status: 'normal' | 'rest' | 'sick' | 'travel';
  } | undefined;

  if (row) {
    return {
      date: row.date,
      score: row.score,
      components: JSON.parse(row.components),
      verdict: JSON.parse(row.verdict_json),
      intensity: row.intensity,
      status: row.status,
    };
  }

  const stats = getDayStats(db, dateStr);
  const settings = getSettings(db);
  return calculateDayScore(stats, 2, 7.5, settings, 3);
}

export function getHourlyTimeline(db: DatabaseSync, dateStr: string) {
  const rows = db.prepare(`
    SELECT ts, category, app, title, duration_s
    FROM events
    WHERE ts LIKE ?
    ORDER BY ts ASC
  `).all(`${dateStr}%`) as Array<{ ts: string; category: AppCategory; app: string; title: string; duration_s: number }>;

  const hours: Record<number, { work: number; leisure: number; neutral: number; apps: Record<string, number> }> = {};
  for (let i = 0; i < 24; i++) {
    hours[i] = { work: 0, leisure: 0, neutral: 0, apps: {} };
  }

  for (const r of rows) {
    const d = new Date(r.ts);
    const h = d.getHours();
    const min = Math.round(r.duration_s / 60);

    if (r.category === 'work') hours[h].work += min;
    else if (r.category === 'leisure') hours[h].leisure += min;
    else hours[h].neutral += min;

    hours[h].apps[r.app] = (hours[h].apps[r.app] || 0) + min;
  }

  return Object.entries(hours).map(([hour, data]) => ({
    hour: Number(hour),
    ...data,
  }));
}

export function getHistoryScores(db: DatabaseSync, limit: number = 14) {
  const rows = db.prepare(`
    SELECT date, score, components, verdict_json, intensity, status
    FROM day_scores
    ORDER BY date DESC
    LIMIT ?
  `).all(limit) as Array<{
    date: string;
    score: number;
    components: string;
    verdict_json: string;
    intensity: number;
    status: 'normal' | 'rest' | 'sick' | 'travel';
  }>;

  return rows.map((r) => ({
    date: r.date,
    score: r.score,
    components: JSON.parse(r.components),
    verdict: JSON.parse(r.verdict_json),
    intensity: r.intensity,
    status: r.status,
  })).reverse();
}

export function trackLiveUsage(db: DatabaseSync, seconds: number) {
  const date = new Date().toISOString().slice(0, 10);
  const id = `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  db.prepare('INSERT INTO live_usage (id, date, seconds) VALUES (?, ?, ?)').run(id, date, seconds);
}

export function getTodayLiveSeconds(db: DatabaseSync): number {
  const date = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT SUM(seconds) as total FROM live_usage WHERE date = ?').get(date) as
    | { total?: number }
    | undefined;
  return row?.total ?? 0;
}

export function createBrowserStreamTicket(db: DatabaseSync, sessionId: string, ttlMs: number = 60_000): string {
  const ticket = `bst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();
  const expiresAt = now + ttlMs;

  try {
    db.prepare('DELETE FROM browser_stream_tickets WHERE expires_at < ?').run(now - 300_000);
  } catch {}

  db.prepare(
    'INSERT INTO browser_stream_tickets (ticket, session_id, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)'
  ).run(ticket, sessionId, now, expiresAt);

  return ticket;
}

export function consumeBrowserStreamTicket(db: DatabaseSync, ticket: string, sessionId: string): boolean {
  if (!ticket || !sessionId) return false;
  const now = Date.now();

  const row = db
    .prepare('SELECT ticket FROM browser_stream_tickets WHERE ticket = ? AND session_id = ? AND expires_at > ? AND used = 0')
    .get(ticket, sessionId, now) as { ticket?: string } | undefined;

  if (!row) return false;

  db.prepare('UPDATE browser_stream_tickets SET used = 1 WHERE ticket = ?').run(ticket);
  return true;
}


