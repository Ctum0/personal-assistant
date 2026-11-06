import { DatabaseSync } from 'node:sqlite';
import { getSettings, rebuildDayStats } from './db';
import { DayStats } from './types';
import { syncGitHubActivity } from './github';

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export function canSendProactive(
  db: DatabaseSync,
  job: string,
  now: Date = new Date()
): GuardrailResult {
  const settings = getSettings(db);
  const proactivity = settings.proactivity;

  // 1. Emergency mute check
  if (proactivity?.muted_until) {
    const mutedUntil = new Date(proactivity.muted_until);
    if (now < mutedUntil) {
      return { allowed: false, reason: `muted_until_${proactivity.muted_until}` };
    }
  }

  // 2. Rest day check (midday_check suppressed)
  if (proactivity?.rest_day && job === 'midday_check') {
    return { allowed: false, reason: 'rest_day_active' };
  }

  // 3. Quiet hours check (23:00 - 07:00 local)
  const currentHour = now.getHours();
  const quietStart = parseInt((proactivity?.quiet_hours_start || '23:00').split(':')[0], 10);
  const quietEnd = parseInt((proactivity?.quiet_hours_end || '07:00').split(':')[0], 10);

  if (quietStart > quietEnd) {
    // e.g. 23:00 to 07:00
    if (currentHour >= quietStart || currentHour < quietEnd) {
      return { allowed: false, reason: 'quiet_hours' };
    }
  } else {
    // e.g. 01:00 to 06:00
    if (currentHour >= quietStart && currentHour < quietEnd) {
      return { allowed: false, reason: 'quiet_hours' };
    }
  }

  // 4. Daily cap check (max 8 per 24 hours)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const countRow = db.prepare(
      'SELECT count(*) as count FROM proactive_log WHERE ts >= ? AND suppressed_reason IS NULL'
    ).get(oneDayAgo) as { count: number } | undefined;

    const dailyCap = proactivity?.daily_cap ?? 8;
    if (countRow && countRow.count >= dailyCap) {
      return { allowed: false, reason: `daily_cap_exceeded_${countRow.count}/${dailyCap}` };
    }
  } catch {}

  // 5. Minimum 30 min gap between proactive messages
  try {
    const lastRow = db.prepare(
      'SELECT ts FROM proactive_log WHERE suppressed_reason IS NULL ORDER BY ts DESC LIMIT 1'
    ).get() as { ts: string } | undefined;

    if (lastRow) {
      const lastTs = new Date(lastRow.ts).getTime();
      const diffMin = (now.getTime() - lastTs) / 60000;
      if (diffMin < 30) {
        return { allowed: false, reason: `min_gap_active_${Math.round(diffMin)}m_ago` };
      }
    }
  } catch {}

  return { allowed: true };
}

export async function executeProactiveJob(
  db: DatabaseSync,
  job: string,
  options: { force?: boolean } = {}
): Promise<{ sent: boolean; job: string; text?: string; reason?: string }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStr = nowIso.slice(0, 10);

  // Background sync bypasses quiet hour guardrails
  if (job === 'github_sync') {
    const result = await syncGitHubActivity(db);
    return {
      sent: true,
      job,
      text: `GitHub sync complete. ${result.count} new events. Status: ${result.status}`,
    };
  }

  if (!options.force) {
    const guardrail = canSendProactive(db, job, now);
    if (!guardrail.allowed) {
      // Record suppressed log
      try {
        db.prepare(`
          INSERT INTO proactive_log (id, ts, job, text, channel, suppressed_reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`log-${Date.now()}`, nowIso, job, '', 'screen', guardrail.reason || 'suppressed');
      } catch {}

      return { sent: false, job, reason: guardrail.reason };
    }
  }

  let text = '';
  let mood = 'neutral';

  if (job === 'wake_report') {
    // Yesterday's date
    const yDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let yScore = 80;
    try {
      const scoreRow = db.prepare('SELECT score FROM day_scores WHERE date = ?').get(yDate) as { score: number } | undefined;
      if (scoreRow) yScore = Math.round(scoreRow.score);
    } catch {}

    // Top pending tasks
    let topTasks: string[] = [];
    try {
      const tasks = db.prepare("SELECT title FROM tasks WHERE status = 'pending' ORDER BY est_min DESC LIMIT 3").all() as Array<{ title: string }>;
      topTasks = tasks.map(t => t.title);
    } catch {}

    const stats = rebuildDayStats(db, todayStr);
    const wakeStr = stats.woke_at || now.toTimeString().slice(0, 5);
    const taskSummary = topTasks.length > 0 ? topTasks.join(', ') : 'No urgent tasks queued';
    
    text = `Awake at ${wakeStr}. Yesterday's score was ${yScore}/100. Top priorities for today: ${taskSummary}. Let's begin.`;
    mood = 'focused';
  } else if (job === 'midday_check') {
    const stats = rebuildDayStats(db, todayStr);
    const settings = getSettings(db);
    const targetMin = (settings.daily_focus_hours || 5) * 60;
    const workMin = stats.work_min;
    const leisureMin = stats.leisure_min;

    let tasksDone = 0;
    let pendingCount = 0;
    try {
      const dRow = db.prepare("SELECT count(*) as c FROM tasks WHERE status = 'completed' AND done_at LIKE ?").get(`${todayStr}%`) as { c: number };
      tasksDone = dRow?.c ?? 0;
      const pRow = db.prepare("SELECT count(*) as c FROM tasks WHERE status = 'pending'").get() as { c: number };
      pendingCount = pRow?.c ?? 0;
    } catch {}

    if (workMin < targetMin * 0.4) {
      text = `13:00 check. You have logged only ${workMin}m of work against your ${targetMin}m target, with ${leisureMin}m of leisure. ${tasksDone} tasks done, ${pendingCount} pending. Focus up.`;
      mood = 'stern';
    } else {
      text = `13:00 check. ${workMin}m of work logged, ${leisureMin}m of leisure. ${tasksDone} tasks done. Keep the cadence steady.`;
      mood = 'pleased';
    }
  } else if (job === 'daily_verdict') {
    const stats = rebuildDayStats(db, todayStr);
    let finalScore = 75;
    let verdictStmt = 'Solid operational day.';

    try {
      const sRow = db.prepare('SELECT score, verdict_json FROM day_scores WHERE date = ?').get(todayStr) as { score: number; verdict_json: string } | undefined;
      if (sRow) {
        finalScore = Math.round(sRow.score);
        try {
          const parsed = JSON.parse(sRow.verdict_json);
          if (parsed.statement) verdictStmt = parsed.statement;
        } catch {}
      }
    } catch {}

    text = `Daily verdict: ${finalScore}/100. ${verdictStmt} Tomorrow's target wake is 07:30.`;
    mood = finalScore >= 80 ? 'pleased' : (finalScore >= 60 ? 'neutral' : 'stern');
  } else {
    text = `Scheduled check ${job} triggered.`;
  }

  // Record in proactive_log
  try {
    db.prepare(`
      INSERT INTO proactive_log (id, ts, job, text, channel, suppressed_reason)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(`log-${Date.now()}`, nowIso, job, text, 'screen');
  } catch {}

  // Record in messages table
  try {
    db.prepare(`
      INSERT INTO messages (id, ts, role, content, mood)
      VALUES (?, ?, 'assistant', ?, ?)
    `).run(`msg-proactive-${Date.now()}`, nowIso, text, mood);
  } catch {}

  return {
    sent: true,
    job,
    text,
  };
}
