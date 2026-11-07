import { DatabaseSync } from 'node:sqlite';
import { getDayScore, getDayStats } from './db';
import { evaluateConsequenceRequest } from './policy';
import { Pane } from './stage';
import { SofiaSettings } from './types';
import { HERMES_TOOLS } from './hermes-tools';
import { executeNamedAction } from './actions';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface ToolExecutionResult {
  result: any;
  pane?: Pane;
  mood?: string;
  error?: string;
}

/**
 * Unified Tool Definitions for Gemini Live API and LiteLLM
 */
export const UNIFIED_TOOLS = [
  // Tier 1: Read & Stage Projections
  {
    name: 'get_stats',
    description: "Get today's productivity stats, active minutes, commits, focus time and score.",
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        range: { type: 'STRING', enum: ['day', 'week', 'month'], description: 'Time range' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        range: { type: 'string', enum: ['day', 'week', 'month'] },
      },
    },
  },
  {
    name: 'show_chart',
    description: 'Render a visual SVG chart (bar, line, or donut) directly onto the user Stage.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of chart' },
        chart_type: { type: 'STRING', enum: ['bar', 'line', 'donut'], description: 'Type of chart' },
        series: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING' },
              value: { type: 'NUMBER' },
              color: { type: 'STRING' },
            },
            required: ['label', 'value'],
          },
          description: 'Chart data points',
        },
      },
      required: ['title', 'chart_type', 'series'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        chart_type: { type: 'string', enum: ['bar', 'line', 'donut'] },
        series: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
              color: { type: 'string' },
            },
            required: ['label', 'value'],
          },
        },
      },
      required: ['title', 'chart_type', 'series'],
    },
  },
  {
    name: 'show_timeline',
    description: 'Show recent activity events and work breakdown on a visual timeline pane.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'YYYY-MM-DD date or today' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        date: { type: 'string' },
      },
    },
  },
  {
    name: 'show_stats_today',
    description: "Display today's core telemetry metrics card on the Stage.",
    geminiParameters: {
      type: 'OBJECT',
      properties: {},
    },
    openaiParameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_tasks',
    description: 'List active tasks and projects from the database onto an interactive Stage pane.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING', enum: ['all', 'pending', 'in_progress', 'completed'] },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'pending', 'in_progress', 'completed'] },
      },
    },
  },
  {
    name: 'search_memory',
    description: 'Search long-term memory notes, project summaries, and preferences.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search term or topic' },
      },
      required: ['query'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'show_web',
    description: 'Show a clean web reader summary card on the Stage for an external link (never iframe).',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'Full URL to display' },
      },
      required: ['url'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'show_image',
    description: 'Display an image, diagram, or artifact onto the companion Stage.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'Image URL or path' },
        caption: { type: 'STRING', description: 'Optional label or caption' },
      },
      required: ['url'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        caption: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'set_mood',
    description: 'Explicitly switch Sofia avatar expression and mood tag.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        mood: {
          type: 'STRING',
          enum: ['neutral', 'pleased', 'amused', 'focused', 'stern', 'disappointed', 'concerned', 'sleepy'],
        },
      },
      required: ['mood'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          enum: ['neutral', 'pleased', 'amused', 'focused', 'stern', 'disappointed', 'concerned', 'sleepy'],
        },
      },
      required: ['mood'],
    },
  },
  {
    name: 'remember',
    description: 'Save an important memory, note, preference, or fact into long-term memory.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'The fact or memory note to preserve' },
        tags: { type: 'STRING', description: 'Comma separated tags' },
      },
      required: ['text'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        tags: { type: 'string' },
      },
      required: ['text'],
    },
  },

  // Tier 2: Act (Safe, controlled actions)
  {
    name: 'create_task',
    description: 'Add a new task or todo item to the user list.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Task title' },
        est_min: { type: 'INTEGER', description: 'Estimated minutes (default 30)' },
      },
      required: ['title'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        est_min: { type: 'number' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        taskId: { type: 'STRING', description: 'ID of the task' },
      },
      required: ['taskId'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'start_focus',
    description: 'Initiate a focused sprint block with accountability tracking.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        minutes: { type: 'INTEGER', description: 'Focus length in minutes (default 25)' },
      },
      required: ['minutes'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number' },
      },
      required: ['minutes'],
    },
  },
  {
    name: 'set_reminder',
    description: 'Schedule a future reminder or follow-up check-in.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        at: { type: 'STRING', description: 'Time or ISO timestamp' },
        text: { type: 'STRING', description: 'Reminder message' },
      },
      required: ['at', 'text'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        at: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['at', 'text'],
    },
  },
  {
    name: 'send_telegram',
    description: 'Push a brief alert or message to the user Telegram companion chat.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Message to send' },
      },
      required: ['text'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },

  // Tier 3: Agent Reach (Hermes Delegation)
  {
    name: 'ask_hermes',
    description:
      'Delegate a complex task requiring machine access, terminals, files, workspace operations, or CUA laptop control.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        task: { type: 'STRING', description: 'Specific command or task description for Hermes' },
      },
      required: ['task'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        task: { type: 'string' },
      },
      required: ['task'],
    },
  },
  // Granular Hermes Machine Control & Scheduling tools
  ...HERMES_TOOLS.map((ht) => ({
    name: ht.name,
    description: ht.description,
    geminiParameters: ht.parameters,
    openaiParameters: {
      type: 'object',
      properties: ht.parameters.properties,
      required: ht.parameters.required || [],
    },
  })),
];

/**
 * Returns Gemini Live function declarations
 */
export function buildGeminiFunctionDeclarations() {
  return UNIFIED_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.geminiParameters,
  }));
}

/**
 * Returns OpenAI / LiteLLM function calling schemas
 */
export function buildOpenAITools() {
  return UNIFIED_TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.openaiParameters,
    },
  }));
}

/**
 * Executes a tool against SQLite / external APIs and generates a Stage Pane
 */
export async function executeTool(
  db: DatabaseSync,
  name: string,
  args: any,
  settings: SofiaSettings
): Promise<ToolExecutionResult> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    switch (name) {
      case 'get_stats':
      case 'show_stats_today': {
        const stats = getDayStats(db, today);
        const score = getDayScore(db, today);
        const leisurePct = stats.active_min > 0 ? Math.round((stats.leisure_min / stats.active_min) * 100) : 0;
        const pane: Pane = {
          id: `pane-stats-${Date.now()}`,
          title: "Today's Telemetry",
          kind: 'stat',
          metrics: [
            { label: 'Score', value: `${score.score.toFixed(0)} pts` },
            { label: 'Commits', value: stats.commits },
            { label: 'Focus Min', value: `${stats.work_min}m` },
            { label: 'Leisure', value: `${leisurePct}%` },
          ],
        };
        return {
          result: { stats, score: score.score, leisurePct },
          pane,
          mood: score.score >= 80 ? 'pleased' : 'focused',
        };
      }

      case 'show_chart': {
        const pane: Pane = {
          id: `pane-chart-${Date.now()}`,
          title: args.title || 'Chart',
          kind: 'chart',
          chart_type: args.chart_type || 'bar',
          data: args.series || [],
        };
        return { result: { displayed: true }, pane, mood: 'focused' };
      }

      case 'show_timeline': {
        const dateStr = args.date || today;
        const rows = db
          .prepare('SELECT ts, category, app, title, duration_s FROM events WHERE ts LIKE ? ORDER BY ts ASC')
          .all(`${dateStr}%`) as Array<{
          ts: string;
          category: string;
          app: string;
          title?: string;
          duration_s: number;
        }>;
        const pane: Pane = {
          id: `pane-timeline-${Date.now()}`,
          title: `Timeline (${dateStr})`,
          kind: 'timeline',
          events: rows.slice(-8).map((r) => ({
            time: r.ts.slice(11, 16),
            title: r.title || r.app,
            category: r.category,
            duration: `${Math.round(r.duration_s / 60)}m`,
          })),
        };
        return { result: { count: rows.length }, pane, mood: 'focused' };
      }

      case 'list_tasks': {
        let sql = 'SELECT id, title, status, est_min FROM tasks';
        const params: any[] = [];
        if (args.status && args.status !== 'all') {
          sql += ' WHERE status = ?';
          params.push(args.status);
        }
        sql += ' ORDER BY created_at DESC LIMIT 10';
        const tasks = db.prepare(sql).all(...params) as Array<{
          id: string;
          title: string;
          status: string;
          est_min: number;
        }>;
        const pane: Pane = {
          id: `pane-tasks-${Date.now()}`,
          title: 'Active Tasks',
          kind: 'todo',
          items: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            done: t.status === 'completed',
          })),
        };
        return { result: { tasks }, pane, mood: 'focused' };
      }

      case 'search_memory': {
        const query = `%${args.query || ''}%`;
        const notes = db
          .prepare('SELECT id, text, tags FROM memory_notes WHERE text LIKE ? ORDER BY pinned DESC LIMIT 5')
          .all(query) as Array<{ id: string; text: string; tags: string }>;

        const pane: Pane = {
          id: `pane-memory-${Date.now()}`,
          title: `Memory: ${args.query}`,
          kind: 'table',
          columns: ['Note', 'Tags'],
          rows: notes.map((n) => [n.text, n.tags]),
        };
        return { result: { count: notes.length, notes }, pane };
      }

      case 'show_web': {
        let snippet = 'Web page requested.';
        let title = args.url;
        try {
          const u = new URL(args.url);
          title = u.hostname;
        } catch {}

        const pane: Pane = {
          id: `pane-web-${Date.now()}`,
          title,
          kind: 'web',
          url: args.url,
          snippet,
        };
        return { result: { displayed: true, url: args.url }, pane };
      }

      case 'show_image': {
        const pane: Pane = {
          id: `pane-img-${Date.now()}`,
          title: args.caption || 'Image Preview',
          kind: 'image',
          url: args.url,
          caption: args.caption,
        };
        return { result: { displayed: true, url: args.url }, pane };
      }

      case 'set_mood': {
        return { result: { mood: args.mood }, mood: args.mood };
      }

      case 'remember': {
        const id = `mem-${Date.now()}`;
        const rawTags = args.tags;
        let tagsJson: string;
        if (Array.isArray(rawTags)) {
          tagsJson = JSON.stringify(rawTags);
        } else if (typeof rawTags === 'string') {
          try {
            const parsed = JSON.parse(rawTags);
            tagsJson = Array.isArray(parsed) ? JSON.stringify(parsed) : JSON.stringify([rawTags]);
          } catch {
            tagsJson = JSON.stringify([rawTags]);
          }
        } else {
          tagsJson = JSON.stringify(['conversation']);
        }

        db.prepare('INSERT INTO memory_notes (id, text, tags, created_at, pinned) VALUES (?, ?, ?, ?, 0)').run(
          id,
          args.text,
          tagsJson,
          new Date().toISOString()
        );
        return { result: { saved: true, id }, mood: 'pleased' };
      }

      case 'create_task': {
        const id = `task-${Date.now()}`;
        const estMin = args.est_min || 30;
        db.prepare(
          'INSERT INTO tasks (id, title, status, est_min, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(id, args.title, 'pending', estMin, new Date().toISOString());

        const pane: Pane = {
          id: `pane-task-${Date.now()}`,
          title: 'New Task Added',
          kind: 'todo',
          items: [{ id, title: args.title, done: false, priority: 1 }],
        };
        return { result: { created: true, id, title: args.title }, pane, mood: 'pleased' };
      }

      case 'complete_task': {
        db.prepare("UPDATE tasks SET status = 'completed', done_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          args.taskId
        );
        return { result: { completed: true, id: args.taskId }, mood: 'pleased' };
      }

      case 'start_focus': {
        const id = `focus-${Date.now()}`;
        const mins = Number(args.minutes) || 25;
        db.prepare(
          'INSERT INTO focus_sessions (id, start, goal_min, result, distraction_count) VALUES (?, ?, ?, ?, 0)'
        ).run(id, new Date().toISOString(), mins, 'active');

        const pane: Pane = {
          id: `pane-focus-${Date.now()}`,
          title: 'Focus Sprint Active',
          kind: 'stat',
          metrics: [
            { label: 'Target Length', value: `${mins} min` },
            { label: 'Status', value: 'Active Monitoring' },
          ],
        };
        return { result: { active: true, id, goal_min: mins }, pane, mood: 'focused' };
      }

      case 'set_reminder': {
        const id = `sched-${Date.now()}`;
        db.prepare(
          'INSERT INTO schedules (id, name, cron, action, enabled, next_run) VALUES (?, ?, ?, ?, 1, ?)'
        ).run(id, args.text, args.at, 'reminder', args.at);
        return { result: { scheduled: true, id, at: args.at, text: args.text }, mood: 'focused' };
      }

      case 'send_telegram': {
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: `🌸 Sofia: ${args.text}`,
              }),
            });
            return { result: { sent: true }, mood: 'pleased' };
          } catch (tErr) {
            return { result: { sent: false, error: String(tErr) } };
          }
        }
        return { result: { sent: false, reason: 'Telegram credentials not set' } };
      }

      case 'open_url': {
        const pane: Pane = {
          id: `pane-web-${Date.now()}`,
          title: args.url,
          kind: 'web',
          url: args.url,
          snippet: `Opened ${args.url}`,
        };
        return { result: { opened: true, url: args.url }, pane, mood: 'focused' };
      }

      case 'run_named_action': {
        try {
          const actionRes = await executeNamedAction(args.actionId || args.id, args.params);
          return {
            result: { ok: actionRes.ok, output: actionRes.output },
            pane: actionRes.pane || {
              id: `pane-action-${Date.now()}`,
              title: `Action: ${args.actionId || args.id}`,
              kind: 'code',
              language: 'bash',
              code: actionRes.output,
            },
            mood: actionRes.ok ? 'pleased' : 'concerned',
          };
        } catch (err: any) {
          return {
            result: { ok: false, error: err.message },
            mood: 'concerned',
          };
        }
      }

      case 'computer_screenshot': {
        try {
          const shotPath = `/tmp/screen_${Date.now()}.png`;
          execSync(`DISPLAY=:0 import -window root ${shotPath} 2>/dev/null`);
          if (fs.existsSync(shotPath)) {
            const buf = fs.readFileSync(shotPath);
            const b64 = buf.toString('base64');
            const dataUrl = `data:image/png;base64,${b64}`;
            try { fs.unlinkSync(shotPath); } catch {}
            return {
              result: { captured: true, sizeBytes: buf.length },
              pane: {
                id: `pane-screenshot-${Date.now()}`,
                title: 'Laptop Screen Capture',
                kind: 'image',
                url: dataUrl,
                caption: `Captured at ${new Date().toLocaleTimeString()} on laptop`,
              },
              mood: 'focused',
            };
          }
        } catch {}
        return await delegateToHermes('computer_screenshot', args);
      }

      case 'computer_run': {
        if (settings?.consequences?.kill_switch_active) {
          return {
            result: { error: 'Command execution blocked: kill switch is active in consequence settings' },
            mood: 'stern',
          };
        }
        const cmd = String(args.command || '').trim();
        const dangerousPatterns = [
          /\brm\s+-[rf]{1,2}\s+(\/|\/\*|~\/|\$HOME)/i,
          /:(){ :\|:& };:/,
          /\bmkfs\b/i,
          /\bdd\s+if=.*of=\/dev\/[sh]d/i,
        ];
        for (const pattern of dangerousPatterns) {
          if (pattern.test(cmd)) {
            return {
              result: { error: `Dangerous command execution blocked by Sofia policy: ${cmd}` },
              mood: 'stern',
            };
          }
        }

        try {
          const timeout = Math.min(Number(args.timeout_ms) || 10000, 30000);
          const stdout = execSync(cmd, { encoding: 'utf8', timeout }).trim();
          return {
            result: { command: cmd, stdout, exit_code: 0 },
            pane: {
              id: `pane-cmd-${Date.now()}`,
              title: `Command: ${cmd.slice(0, 40)}`,
              kind: 'code',
              language: 'bash',
              code: stdout || '(no stdout)',
            },
            mood: 'focused',
          };
        } catch (e: any) {
          return {
            result: { command: cmd, stderr: e.message, exit_code: e.status || 1 },
            pane: {
              id: `pane-cmd-${Date.now()}`,
              title: `Command Error: ${cmd.slice(0, 40)}`,
              kind: 'code',
              language: 'bash',
              code: e.stderr || e.message,
            },
            mood: 'concerned',
          };
        }
      }

      case 'computer_file_read': {
        try {
          const resolvedPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), args.path);
          if (resolvedPath.startsWith('/etc/shadow') || resolvedPath.startsWith('/etc/sudoers')) {
            return { result: { error: 'Access to system secret denied' }, mood: 'stern' };
          }
          const content = fs.readFileSync(resolvedPath, 'utf8');
          const lines = content.split('\n');
          const offset = Number(args.offset) || 0;
          const limit = Number(args.limit) || 200;
          const slice = lines.slice(offset, offset + limit).join('\n');
          return {
            result: { path: resolvedPath, lines: lines.length, content: slice },
            pane: {
              id: `pane-file-${Date.now()}`,
              title: `File: ${args.path}`,
              kind: 'code',
              language: args.path.endsWith('.ts') ? 'typescript' : args.path.endsWith('.json') ? 'json' : 'plaintext',
              code: slice,
            },
            mood: 'focused',
          };
        } catch (e: any) {
          return { result: { error: e.message }, mood: 'concerned' };
        }
      }

      case 'computer_file_write': {
        if (settings?.consequences?.kill_switch_active) {
          return { result: { error: 'File write blocked: kill switch active' }, mood: 'stern' };
        }
        try {
          const resolvedPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), args.path);
          if (resolvedPath.startsWith('/etc/') || resolvedPath.startsWith('/boot/') || resolvedPath.startsWith('/bin/')) {
            return { result: { error: 'Cannot write to system directory' }, mood: 'stern' };
          }
          const dir = path.dirname(resolvedPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(resolvedPath, args.content, 'utf8');
          return {
            result: { path: resolvedPath, writtenBytes: Buffer.byteLength(args.content) },
            pane: {
              id: `pane-write-${Date.now()}`,
              title: `File Written: ${args.path}`,
              kind: 'stat',
              metrics: [
                { label: 'Path', value: args.path },
                { label: 'Size', value: `${Buffer.byteLength(args.content)} bytes` },
                { label: 'Status', value: 'Saved' },
              ],
            },
            mood: 'pleased',
          };
        } catch (e: any) {
          return { result: { error: e.message }, mood: 'concerned' };
        }
      }

      case 'hermes_schedule_create': {
        const id = `sched-${Date.now()}`;
        db.prepare(
          'INSERT INTO schedules (id, name, cron, action, enabled, next_run) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, args.name, args.cron, args.command, args.enabled !== false ? 1 : 0, 'pending');
        return {
          result: { created: true, id, name: args.name, cron: args.cron },
          pane: {
            id: `pane-sched-${Date.now()}`,
            title: `Scheduled: ${args.name}`,
            kind: 'stat',
            metrics: [
              { label: 'Name', value: args.name },
              { label: 'Cron', value: args.cron },
              { label: 'Command', value: args.command },
            ],
          },
          mood: 'focused',
        };
      }

      case 'hermes_schedule_list': {
        const rows = db.prepare('SELECT id, name, cron, action, enabled, last_run, next_run FROM schedules ORDER BY created_at DESC').all() as any[];
        return {
          result: { schedules: rows },
          pane: {
            id: `pane-schedlist-${Date.now()}`,
            title: 'Hermes Schedules',
            kind: 'table',
            columns: ['Name', 'Cron', 'Action', 'Enabled'],
            rows: rows.map(r => [r.name, r.cron, r.action, r.enabled ? 'Yes' : 'No']),
          },
          mood: 'focused',
        };
      }

      case 'hermes_schedule_delete': {
        db.prepare('DELETE FROM schedules WHERE id = ?').run(args.id);
        return { result: { deleted: true, id: args.id }, mood: 'pleased' };
      }

      case 'computer_click':
      case 'computer_type':
      case 'computer_key':
      case 'hermes_task_run':
      case 'hermes_task_status':
      case 'hermes_tool_call':
      case 'ask_hermes': {
        return await delegateToHermes(name, args);
      }

      default:
        return { result: null, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { result: null, error: err?.message || String(err) };
  }
}

async function delegateToHermes(tool: string, args: any): Promise<ToolExecutionResult> {
  const laptopUrl = process.env.LAPTOP_HERMES_URL || 'http://127.0.0.1:8642/v1';
  const bridgeUrl = process.env.HERMES_BRIDGE_URL || 'http://10.0.1.1:8644/v1';
  const apiKey = process.env.LAPTOP_HERMES_KEY || process.env.API_SERVER_KEY || 'hermes-sofia-api';

  for (const baseUrl of [laptopUrl, bridgeUrl]) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'hermes-agent',
          messages: [{ role: 'user', content: `Execute task/tool ${tool} with parameters: ${JSON.stringify(args)}` }],
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const output = data.choices?.[0]?.message?.content || `Executed ${tool}`;
        return {
          result: { executed: true, output },
          pane: {
            id: `pane-hermes-${Date.now()}`,
            title: `Hermes: ${tool}`,
            kind: 'code',
            language: 'bash',
            code: output,
          },
          mood: 'focused',
        };
      }
    } catch {}
  }

  return {
    result: { executed: false, message: `Hermes gateway currently unreachable for ${tool}` },
    mood: 'concerned',
  };
}
