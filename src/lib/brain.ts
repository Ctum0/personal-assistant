import { DatabaseSync } from 'node:sqlite';
import { buildPersonaPrompt } from './persona';
import { getDayScore, getDayStats, getSettings } from './db';
import { SofiaExpression, SofiaSettings } from './types';
import { evaluateConsequenceRequest } from './policy';

export interface BrainTurnContext {
  now: string;
  today: {
    woke_at: string | null;
    focus_min: number;
    leisure_pct: number;
    commits: number;
    tasks_done: number;
    score: number;
    coverage: number;
  };
  streak_days: number;
  current_app: {
    category: string;
    app: string;
    since_min: number;
  } | null;
  open_tasks: string[];
  next_event: string | null;
  last_proactive: {
    job: string;
    at: string;
  } | null;
}

export function buildLiveContextBlock(db: DatabaseSync, dateStr: string): BrainTurnContext {
  const stats = getDayStats(db, dateStr);
  const scoreData = getDayScore(db, dateStr);

  const openTasks = db
    .prepare("SELECT title FROM tasks WHERE status IN ('pending', 'in_progress') ORDER BY created_at ASC LIMIT 5")
    .all() as Array<{ title: string }>;

  // Query latest event to find current app
  const latestEvent = db
    .prepare("SELECT app, category, ts, duration_s FROM events ORDER BY ts DESC LIMIT 1")
    .get() as { app: string; category: string; ts: string; duration_s: number } | undefined;

  let currentApp: BrainTurnContext['current_app'] = null;
  if (latestEvent) {
    const elapsedMinutes = Math.max(1, Math.round((Date.now() - new Date(latestEvent.ts).getTime()) / 60000));
    currentApp = {
      category: latestEvent.category,
      app: latestEvent.app,
      since_min: elapsedMinutes,
    };
  }

  // Last proactive message
  let lastProactive: BrainTurnContext['last_proactive'] = null;
  try {
    const lastP = db
      .prepare("SELECT job, ts FROM proactive_log ORDER BY ts DESC LIMIT 1")
      .get() as { job: string; ts: string } | undefined;
    if (lastP) {
      lastProactive = {
        job: lastP.job,
        at: lastP.ts.slice(11, 16),
      };
    }
  } catch {
    // table may not exist yet in legacy db
  }

  // Next schedule
  let nextEvent: string | null = null;
  try {
    const nextSched = db
      .prepare("SELECT name, next_run FROM schedules WHERE enabled = 1 AND next_run IS NOT NULL ORDER BY next_run ASC LIMIT 1")
      .get() as { name: string; next_run: string } | undefined;
    if (nextSched) {
      nextEvent = `${nextSched.name} at ${nextSched.next_run}`;
    }
  } catch {
    // silent
  }

  const leisurePct = stats.active_min > 0 ? Math.round((stats.leisure_min / stats.active_min) * 100) : 0;
  const tasksDoneCount = (stats as any).tasks_done ?? 0;

  return {
    now: new Date().toISOString(),
    today: {
      woke_at: stats.woke_at,
      focus_min: stats.work_min,
      leisure_pct: leisurePct,
      commits: stats.commits,
      tasks_done: tasksDoneCount,
      score: scoreData.score,
      coverage: stats.coverage,
    },
    streak_days: 2, // will be computed dynamically
    current_app: currentApp,
    open_tasks: openTasks.map((t) => t.title),
    next_event: nextEvent,
    last_proactive: lastProactive,
  };
}

export function extractMood(response: string): { text: string; mood: SofiaExpression } {
  const match = response.match(/\[MOOD:(neutral|pleased|amused|disappointed|concerned|focused|sleepy|stern)\]/i);
  if (match) {
    const mood = match[1].toLowerCase() as SofiaExpression;
    const cleanText = response.replace(match[0], '').trim();
    return { text: cleanText, mood };
  }
  return { text: response.trim(), mood: 'neutral' };
}

// Tool definitions for OpenAI-compatible function calling
export const SOFIA_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_stats',
      description: 'Get activity minutes, commits, and scores for day, week, or month',
      parameters: {
        type: 'object',
        properties: {
          range: { type: 'string', enum: ['day', 'week', 'month'], description: 'Time range to query' },
        },
        required: ['range'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_timeline',
      description: 'Get hour-by-hour breakdown of activities for a given date',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD date string' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_memory',
      description: 'Search memory notes and summaries by keyword',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_tasks',
      description: 'List user tasks by status',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['all', 'pending', 'in_progress', 'completed'] },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task item',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          est_min: { type: 'number', description: 'Estimated minutes' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'complete_task',
      description: 'Mark a task as completed',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'ID of the task' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_focus_session',
      description: 'Start a timed focus session with strict distraction monitoring',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'number', description: 'Target session length in minutes' },
        },
        required: ['minutes'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_reminder',
      description: 'Set a future reminder or scheduled check-in',
      parameters: {
        type: 'object',
        properties: {
          at: { type: 'string', description: 'ISO timestamp or cron string' },
          text: { type: 'string', description: 'Reminder text' },
        },
        required: ['at', 'text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_consequence',
      description: 'Request an accountability consequence rung. Policy module decides whether to approve, clamp, or reject.',
      parameters: {
        type: 'object',
        properties: {
          rung: { type: 'string', enum: ['words', 'friction', 'alarm', 'stakes', 'haptic', 'stimulus'] },
          intensity: { type: 'number', description: 'Requested intensity 1-100' },
          reason: { type: 'string', description: 'Fact-based justification' },
        },
        required: ['rung', 'intensity', 'reason'],
      },
    },
  },
];

export function executeSofiaTool(
  db: DatabaseSync,
  name: string,
  args: any,
  settings: SofiaSettings
): { result: any; error?: string } {
  try {
    const today = new Date().toISOString().slice(0, 10);

    switch (name) {
      case 'get_stats': {
        const stats = getDayStats(db, today);
        const score = getDayScore(db, today);
        return { result: { stats, score } };
      }
      case 'get_timeline': {
        const rows = db.prepare('SELECT ts, category, app, title, duration_s FROM events WHERE ts LIKE ? ORDER BY ts ASC').all(`${args.date || today}%`);
        return { result: rows };
      }
      case 'search_memory': {
        const query = `%${args.query || ''}%`;
        const notes = db.prepare('SELECT id, text, tags FROM memory_notes WHERE text LIKE ? ORDER BY pinned DESC LIMIT 5').all(query);
        return { result: notes };
      }
      case 'list_tasks': {
        let sql = 'SELECT id, title, status, est_min FROM tasks';
        if (args.status && args.status !== 'all') {
          sql += ` WHERE status = '${args.status}'`;
        }
        sql += ' ORDER BY created_at DESC LIMIT 10';
        return { result: db.prepare(sql).all() };
      }
      case 'create_task': {
        const id = `task-${Date.now()}`;
        const estMin = args.est_min || 30;
        db.prepare('INSERT INTO tasks (id, title, status, est_min, created_at) VALUES (?, ?, ?, ?, ?)').run(id, args.title, 'pending', estMin, new Date().toISOString());
        return { result: { created: true, id, title: args.title } };
      }
      case 'complete_task': {
        db.prepare("UPDATE tasks SET status = 'completed', done_at = ? WHERE id = ?").run(new Date().toISOString(), args.taskId);
        return { result: { completed: true, id: args.taskId } };
      }
      case 'start_focus_session': {
        const id = `focus-${Date.now()}`;
        const mins = Number(args.minutes) || 25;
        db.prepare('INSERT INTO focus_sessions (id, start, goal_min, result, distraction_count) VALUES (?, ?, ?, ?, 0)').run(id, new Date().toISOString(), mins, 'active');
        return { result: { active: true, id, goal_min: mins } };
      }
      case 'set_reminder': {
        const id = `sched-${Date.now()}`;
        db.prepare('INSERT INTO schedules (id, name, cron, action, enabled, next_run) VALUES (?, ?, ?, ?, 1, ?)').run(id, args.text, args.at, 'reminder', args.at);
        return { result: { scheduled: true, id, at: args.at, text: args.text } };
      }
      case 'request_consequence': {
        const policyResult = evaluateConsequenceRequest(
          {
            rung: args.rung,
            intensity: args.intensity,
            reason: args.reason,
            timestamp: new Date().toISOString(),
          },
          settings,
          0.9,
          'normal',
          false,
          0
        );
        return { result: policyResult };
      }
      default:
        return { result: null, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function processSofiaBrainTurn(
  db: DatabaseSync,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{ text: string; mood: SofiaExpression; toolCalls?: any[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const settings = getSettings(db);

  // 1. Persona system prompt
  const systemPrompt = buildPersonaPrompt(settings);

  // 2. Compact Live Context Block (JSON)
  const contextBlock = buildLiveContextBlock(db, today);

  // 3. Memory: up to 4 pinned notes
  const pinnedNotes = db
    .prepare('SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4')
    .all() as Array<{ text: string }>;

  const contextMessage = `LIVE CONTEXT:
${JSON.stringify(contextBlock, null, 2)}

PINNED MEMORY:
${pinnedNotes.map((n, i) => `${i + 1}. ${n.text}`).join('\n')}`;

  // Assemble full message sequence (system, context, memory history, user turn)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: contextMessage },
  ];

  // Append up to last 8 turns of conversation
  const recentHistory = history.slice(-8);
  for (const h of recentHistory) {
    messages.push({ role: h.role, content: h.content });
  }

  messages.push({ role: 'user', content: userMessage });

  // LiteLLM configuration from env / settings
  const baseUrl = process.env.LITELLM_BASE_URL || settings.hermes?.base_url || 'https://ai-proxy.zenova.services/v1';
  const apiKey = process.env.LITELLM_API_KEY || settings.hermes?.api_key || '';
  const model = process.env.LITELLM_MODEL || settings.hermes?.model || 'deepseek-v4.1-flash';

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 400,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      return extractMood(rawText);
    }
  } catch (err) {
    // LiteLLM unreachable or timeout -> fallback to deterministic factual response
  }

  // Graceful deterministic fact-based fallback (ensures she always cites numbers from day_stats!)
  const stats = getDayStats(db, today);
  const scoreData = getDayScore(db, today);
  const leisurePct = stats.active_min > 0 ? Math.round((stats.leisure_min / stats.active_min) * 100) : 0;

  if (stats.coverage < 0.8) {
    return {
      text: "I only saw part of your day. 4 hours unaccounted. I'm not scoring what I can't see.",
      mood: 'concerned',
    };
  }

  return {
    text: `Score ${scoreData.score.toFixed(0)}. ${stats.commits} commits, ${leisurePct} percent leisure, ${stats.work_min} focus minutes logged. Keep to the pace.`,
    mood: scoreData.score >= 8 ? 'pleased' : scoreData.score < 5 ? 'stern' : 'focused',
  };
}

export const processSofiaChatTurn = processSofiaBrainTurn;
