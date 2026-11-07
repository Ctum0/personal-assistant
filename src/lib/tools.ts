import { DatabaseSync } from 'node:sqlite';
import { getDayScore, getDayStats } from './db';
import { evaluateConsequenceRequest } from './policy';
import { evaluateToolRisk, computeActionHash } from './policy.risk';
import { Pane, ApprovalPane, BrowserPane } from './stage';
import { SofiaSettings } from './types';
import { executeNamedAction } from './actions';
import { getHermesClient } from './hermes';
import {
  initHermesTables,
  registerRun,
  updateRunRecord,
  hashSessionKey,
  recordApprovalRequest,
  markApprovalExecuted,
} from './hermes/registry';
import { buildHermesEphemeralInstructions } from './persona.unified';
import {
  getOrCreateBrowserSession,
  getBrowserSession,
  updateBrowserSession,
} from './browser/session';
import { getBrowserManager } from '../server/browser-manager';
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
  {
    name: 'sofia_delegate_to_hermes',
    description:
      'Delegate an action, research, long-term memory retrieval, code execution, terminal command, or browser automation task to Hermes. Returns an asynchronous task ID immediately so conversation does not block.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        task: { type: 'STRING', description: 'Clear, detailed description of the task for Hermes to execute' },
        category: {
          type: 'STRING',
          enum: ['action', 'research', 'browser', 'terminal', 'memory'],
          description: 'Type of task being delegated',
        },
        context: { type: 'STRING', description: 'Optional background context or constraints' },
      },
      required: ['task'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Clear, detailed description of the task for Hermes to execute' },
        category: {
          type: 'string',
          enum: ['action', 'research', 'browser', 'terminal', 'memory'],
        },
        context: { type: 'string' },
      },
      required: ['task'],
    },
  },

  // Tier 4: Live Browser Workspace (Interactive Shared Stage Browser)
  {
    name: 'browser_open',
    description: 'Open a real, interactive browser workspace in Sofia Stage for a website, repository, or search query.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'Destination URL (e.g. https://github.com) or search term' },
        title: { type: 'STRING', description: 'Optional title for the workspace tab' },
      },
      required: ['url'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate the active browser workspace to a new URL.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'Destination URL' },
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
      required: ['url'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_back',
    description: 'Navigate back in the active browser history.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_forward',
    description: 'Navigate forward in the active browser history.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_click',
    description: 'Click an interactive element by CSS selector or coordinates.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        selector: { type: 'STRING', description: 'CSS selector (e.g. button.submit, a.repo-link)' },
        x: { type: 'NUMBER', description: 'Optional x pixel coordinate' },
        y: { type: 'NUMBER', description: 'Optional y pixel coordinate' },
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        sessionId: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field or active element in the browser.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Text string to type' },
        selector: { type: 'STRING', description: 'Optional CSS selector of the input element' },
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
      required: ['text'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        selector: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the active browser window up, down, to top, or to bottom.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        direction: { type: 'STRING', enum: ['up', 'down', 'top', 'bottom'], description: 'Scroll direction' },
        amount: { type: 'NUMBER', description: 'Scroll distance in pixels (default: 300)' },
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
      required: ['direction'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] },
        amount: { type: 'number' },
        sessionId: { type: 'string' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key in the active browser (e.g. Enter, Tab, Escape, Backspace).',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        key: { type: 'STRING', description: 'Key name (e.g. Enter, Tab, Escape)' },
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
      required: ['key'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_wait',
    description: 'Wait for a specified duration in milliseconds.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        ms: { type: 'NUMBER', description: 'Milliseconds to wait (100 to 10000)' },
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
      required: ['ms'],
    },
    openaiParameters: {
      type: 'object',
      properties: {
        ms: { type: 'number' },
        sessionId: { type: 'string' },
      },
      required: ['ms'],
    },
  },
  {
    name: 'browser_get_page_info',
    description: 'Get current URL, title, navigation state, and summary text snippet of the active page.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_get_snapshot',
    description: 'Get a clean, structured accessibility text snapshot of the web page for agent reasoning.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Capture a visual screenshot of the active browser workspace for the Stage.',
    geminiParameters: {
      type: 'OBJECT',
      properties: {
        sessionId: { type: 'STRING', description: 'Optional browser session ID' },
      },
    },
    openaiParameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
    },
  },
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

  // Hardline security barrier: Direct shell execution is strictly disabled in Sofia web container
  if (name === 'computer_run') {
    const errorMsg = 'Direct shell execution is disabled in the Sofia web application container. Local commands must run through authorized device agents or Hermes execution runs.';
    return {
      error: errorMsg,
      result: { error: errorMsg },
      mood: 'stern',
    };
  }

  // Ensure hermes tables exist in the passed database
  initHermesTables(db);

  // Execution Boundary Gate: Enforce server-side approval requirement for R2/R3 operations
  const risk = evaluateToolRisk(name, args || {});
  const delegatesToHermes = [
    'ask_hermes',
    'sofia_delegate_to_hermes',
    'computer_screenshot',
    'computer_file_read',
    'computer_file_write',
    'computer_click',
    'computer_type',
    'computer_key',
    'hermes_task_run',
    'hermes_task_status',
    'hermes_tool_call',
  ].includes(name);

  let approvedRowId: string | null = null;

  if (risk.requiresApproval && !delegatesToHermes) {
    const actionHash = computeActionHash(name, args || {}, 'local_exec');
    const approvedRow = db.prepare(
      "SELECT id FROM hermes_approvals WHERE tool_name = ? AND action_hash = ? AND status = 'approved' ORDER BY decided_at DESC LIMIT 1"
    ).get(name, actionHash) as { id: string } | undefined;

    if (!approvedRow) {
      // Pre-execution block: Record approval request and return ApprovalPane
      const approvalRecord = recordApprovalRequest(db, {
        runId: `exec_${Date.now()}`,
        hermesRunId: 'local_exec',
        toolName: name,
        parameters: args || {},
        riskLevel: risk.riskLevel,
      });

      const approvalPane: ApprovalPane = {
        id: `pane-appr-${approvalRecord.id}`,
        title: `Approval Required: ${name}`,
        kind: 'approval',
        approval_id: approvalRecord.id,
        tool_name: name,
        target: args?.target || args?.url || args?.command || args?.recipient || args?.path || undefined,
        risk_level: risk.riskLevel,
        preview: approvalRecord.preview,
        reason: risk.reason,
        expires_at: approvalRecord.expires_at,
        action_hash: approvalRecord.action_hash,
        requires_strong_confirmation: risk.requiresStrongApproval,
        status: 'pending',
      };

      return {
        result: {
          blocked: true,
          requires_approval: true,
          approval_id: approvalRecord.id,
          risk_level: risk.riskLevel,
          reason: risk.reason,
        },
        pane: approvalPane,
        mood: 'stern',
        error: `Execution blocked: tool '${name}' (${risk.riskLevel}) requires explicit owner approval`,
      };
    }

    approvedRowId = approvedRow.id;
  }

  try {
    let result: ToolExecutionResult;

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
            if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'executed');
            return { result: { sent: true }, mood: 'pleased' };
          } catch (tErr) {
            if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'failed', String(tErr));
            return { result: { sent: false, error: String(tErr) } };
          }
        }
        if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'failed', 'Telegram credentials not set');
        return { result: { sent: false, reason: 'Telegram credentials not set' } };
      }

      case 'open_url':
      case 'browser_open': {
        const rawUrl = String(args.url || args.target || 'https://github.com').trim();
        let targetUrl = rawUrl;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
            targetUrl = `https://${targetUrl}`;
          } else {
            targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
          }
        }

        const convId = String(args.conversationId || args.sessionId || 'default').trim() || 'default';
        const session = getOrCreateBrowserSession(db, convId, 'owner', targetUrl, args.title || 'Browser Workspace');

        let title = session.title;
        try {
          const navResult = await getBrowserManager().navigate(session.id, targetUrl);
          title = navResult.title || title;
          updateBrowserSession(db, session.id, { current_url: navResult.url, title, status: 'active' });
        } catch (navErr: any) {
          updateBrowserSession(db, session.id, { current_url: targetUrl, title: 'Navigation Blocked', status: 'error' });
          return {
            result: { error: navErr.message, session_id: session.id },
            pane: {
              id: `pane-browser-${session.id}`,
              title: 'Navigation Blocked',
              kind: 'browser',
              session_id: session.id,
              url: targetUrl,
              lease_holder: session.lease_holder,
              status: 'error',
            },
            mood: 'concerned',
          };
        }

        const pane: BrowserPane = {
          id: `pane-browser-${session.id}`,
          title,
          kind: 'browser',
          session_id: session.id,
          url: targetUrl,
          lease_holder: session.lease_holder,
          status: 'active',
        };

        if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'executed');
        return {
          result: { session_id: session.id, url: targetUrl, title },
          pane,
          mood: 'pleased',
        };
      }

      case 'browser_navigate': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId
          ? getBrowserSession(db, args.sessionId) || getOrCreateBrowserSession(db, convId)
          : getOrCreateBrowserSession(db, convId);

        const navResult = await getBrowserManager().navigate(session.id, args.url);
        updateBrowserSession(db, session.id, { current_url: navResult.url, title: navResult.title, status: 'active' });

        const pane: BrowserPane = {
          id: `pane-browser-${session.id}`,
          title: navResult.title,
          kind: 'browser',
          session_id: session.id,
          url: navResult.url,
          lease_holder: session.lease_holder,
          status: 'active',
        };

        if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'executed');
        return { result: navResult, pane, mood: 'focused' };
      }

      case 'browser_back': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { success: false, error: 'Session not found' } };
        const ok = await getBrowserManager().goBack(session.id);
        const info = await getBrowserManager().getPageInfo(session.id);
        updateBrowserSession(db, session.id, { current_url: info.url, title: info.title });
        return { result: { success: ok, ...info }, mood: 'focused' };
      }

      case 'browser_forward': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { success: false, error: 'Session not found' } };
        const ok = await getBrowserManager().goForward(session.id);
        const info = await getBrowserManager().getPageInfo(session.id);
        updateBrowserSession(db, session.id, { current_url: info.url, title: info.title });
        return { result: { success: ok, ...info }, mood: 'focused' };
      }

      case 'browser_click': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { success: false, error: 'Session not found' } };
        await getBrowserManager().click(session.id, { selector: args.selector, x: args.x, y: args.y });
        if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'executed');
        return { result: { clicked: true, target: args.selector || `${args.x},${args.y}` }, mood: 'focused' };
      }

      case 'browser_type': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { success: false, error: 'Session not found' } };
        await getBrowserManager().type(session.id, args.text, args.selector);
        if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'executed');
        return { result: { typed: true, length: args.text?.length }, mood: 'focused' };
      }

      case 'browser_scroll': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { success: false, error: 'Session not found' } };
        await getBrowserManager().scroll(session.id, args.direction || 'down', args.amount || 300);
        return { result: { scrolled: true, direction: args.direction || 'down' }, mood: 'focused' };
      }

      case 'browser_press_key': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { success: false, error: 'Session not found' } };
        await getBrowserManager().pressKey(session.id, args.key);
        if (approvedRowId) markApprovalExecuted(db, approvedRowId, 'executed');
        return { result: { pressed: args.key }, mood: 'focused' };
      }

      case 'browser_wait': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { success: false, error: 'Session not found' } };
        await getBrowserManager().wait(session.id, args.ms || 1000);
        return { result: { waited_ms: args.ms || 1000 }, mood: 'focused' };
      }

      case 'browser_get_page_info': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { error: 'Session not found' } };
        const info = await getBrowserManager().getPageInfo(session.id);
        return { result: info, mood: 'focused' };
      }

      case 'browser_get_snapshot': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { error: 'Session not found' } };
        const snapshot = await getBrowserManager().getSnapshot(session.id);
        return { result: { snapshot }, mood: 'focused' };
      }

      case 'browser_screenshot': {
        const convId = String(args.conversationId || 'default').trim() || 'default';
        const session = args.sessionId ? getBrowserSession(db, args.sessionId) : getOrCreateBrowserSession(db, convId);
        if (!session) return { result: { error: 'Session not found' } };
        const buf = await getBrowserManager().screenshot(session.id);
        const dataUri = `data:image/png;base64,${buf.toString('base64')}`;
        return {
          result: { screenshot: true, size: buf.length },
          pane: {
            id: `pane-img-${Date.now()}`,
            title: 'Browser Screenshot',
            kind: 'image',
            url: dataUri,
            caption: session.title || 'Browser View',
          },
          mood: 'focused',
        };
      }

      case 'run_named_action': {
        try {
          const actionRes = await executeNamedAction(args.actionId || args.id, args.params);
          if (approvedRowId) {
            markApprovalExecuted(db, approvedRowId, actionRes.ok ? 'executed' : 'failed', actionRes.output);
          }
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
          if (approvedRowId) {
            markApprovalExecuted(db, approvedRowId, 'failed', err?.message);
          }
          return {
            result: { ok: false, error: err.message },
            mood: 'concerned',
          };
        }
      }

      case 'computer_screenshot': {
        return await delegateToHermes(db, 'computer_screenshot', args);
      }

      case 'computer_run': {
        const errorMsg = 'Direct shell execution is disabled in the Sofia web application container. Local commands must run through authorized device agents or Hermes execution runs.';
        return {
          error: errorMsg,
          result: {
            error: errorMsg,
          },
          mood: 'stern',
        };
      }

      case 'computer_file_read': {
        return await delegateToHermes(db, 'computer_file_read', args);
      }

      case 'computer_file_write': {
        return await delegateToHermes(db, 'computer_file_write', args);
      }

      case 'hermes_schedule_create': {
        return {
          result: { error: 'Application-side schedule creation is disabled. Hermes owns authoritative cron scheduling.' },
          mood: 'stern',
        };
      }

      case 'hermes_schedule_list': {
        const rows = db.prepare('SELECT id, name, cron, action, enabled, last_run, next_run FROM schedules ORDER BY created_at DESC').all() as any[];
        return {
          result: { schedules: rows },
          pane: {
            id: `pane-schedlist-${Date.now()}`,
            title: 'Schedules (Read-Only Mirror)',
            kind: 'table',
            columns: ['Name', 'Cron', 'Action', 'Enabled'],
            rows: rows.map(r => [r.name, r.cron, r.action, r.enabled ? 'Yes' : 'No']),
          },
          mood: 'focused',
        };
      }

      case 'hermes_schedule_delete': {
        return {
          result: { error: 'Application-side schedule deletion is disabled. Hermes owns authoritative cron scheduling.' },
          mood: 'stern',
        };
      }

      case 'computer_click':
      case 'computer_type':
      case 'computer_key':
      case 'hermes_task_run':
      case 'hermes_task_status':
      case 'hermes_tool_call':
      case 'ask_hermes':
      case 'sofia_delegate_to_hermes': {
        return await delegateToHermes(db, name, args);
      }

      default:
        return { result: null, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { result: null, error: err?.message || String(err) };
  }
}

async function delegateToHermes(db: DatabaseSync, tool: string, args: any): Promise<ToolExecutionResult> {
  const client = getHermesClient();
  const config = client.getSanitizedConfig();
  const sofiaRunId = `srun_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const conversationId = String(args.conversationId || args.sessionId || 'default').trim() || 'default';
  const prompt =
    tool === 'ask_hermes' || tool === 'sofia_delegate_to_hermes'
      ? String(args.task || args.prompt || '').trim() +
        (args.category ? ` [Category: ${args.category}]` : '') +
        (args.context ? ` [Context: ${args.context}]` : '')
      : `Execute task/tool ${tool} with parameters: ${JSON.stringify(args)}`;

  const instructions = buildHermesEphemeralInstructions();

  // 1. Attempt native async run via POST /v1/runs
  try {
    const run = await client.createRun({
      input: prompt,
      instructions,
      session_id: conversationId,
      idempotency_key: `sofia-${tool}-${Date.now()}`,
    });

    if (run.run_id) {
      try {
        registerRun(db, {
          id: sofiaRunId,
          hermesRunId: run.run_id,
          conversationId,
          sessionKeyRef: hashSessionKey(config.sessionKey),
          userId: 'owner',
          status: run.status || 'started',
          prompt,
        });
      } catch (regErr) {
        console.warn('Failed to register run record:', regErr);
      }

      // Safe wait window for voice and tool execution
      const finalStatus = await client.pollRunUntilComplete(run.run_id, {
        maxWaitMs: 25000,
        intervalMs: 1200,
      });

      if (finalStatus.status === 'completed') {
        const output = finalStatus.output || `Task completed with status: ${finalStatus.status}`;
        try {
          updateRunRecord(db, sofiaRunId, {
            status: 'completed',
            output,
            error: typeof finalStatus.error === 'string' ? finalStatus.error : finalStatus.error?.message,
          });
        } catch {}

        return {
          result: {
            executed: true,
            sofia_run_id: sofiaRunId,
            run_id: finalStatus.run_id,
            status: 'completed',
            output,
            usage: finalStatus.usage,
          },
          pane: {
            id: `pane-hermes-${Date.now()}`,
            title: `Hermes: ${tool === 'ask_hermes' ? 'Task Completed' : tool}`,
            kind: 'code',
            language: 'bash',
            run_id: run.run_id,
            status: 'completed',
            code: output,
          },
          mood: 'pleased',
        };
      }

      // If still running after timeout: provide asynchronous acknowledgement
      if (finalStatus.status === 'running' || finalStatus.status === 'started' || finalStatus.status === 'queued') {
        const asyncMsg = "I've started that task on Hermes. It's running in the background and you can monitor it on the Stage.";
        return {
          result: {
            executed: false,
            sofia_run_id: sofiaRunId,
            run_id: run.run_id,
            status: finalStatus.status,
            message: asyncMsg,
          },
          pane: {
            id: `pane-hermes-${Date.now()}`,
            title: `Hermes: ${tool === 'ask_hermes' ? 'Running Task' : tool}`,
            kind: 'code',
            language: 'bash',
            run_id: run.run_id,
            status: finalStatus.status,
            code: `Task in progress on Hermes (Run ID: ${run.run_id})\nPrompt: ${prompt.slice(0, 80)}`,
          },
          mood: 'focused',
        };
      }

      // Waiting approval
      if (finalStatus.status === 'waiting_approval') {
        return {
          result: {
            executed: false,
            sofia_run_id: sofiaRunId,
            run_id: run.run_id,
            status: 'waiting_approval',
            message: 'That operation requires your approval before proceeding.',
          },
          mood: 'stern',
        };
      }

      // Failed
      const errMsg = typeof finalStatus.error === 'string' ? finalStatus.error : finalStatus.error?.message;
      return {
        result: {
          executed: false,
          sofia_run_id: sofiaRunId,
          run_id: run.run_id,
          status: finalStatus.status,
          error: errMsg || 'Task failed on Hermes',
        },
        mood: 'concerned',
      };
    }
  } catch (err: any) {
    // If runs endpoint fails, attempt fallback to chatCompletions
    try {
      const output = await client.chatCompletions([
        { role: 'user', content: prompt },
      ]);
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
    } catch (fallbackErr: any) {
      return {
        result: {
          executed: false,
          error: err?.message || fallbackErr?.message || 'Hermes gateway unreachable',
        },
        mood: 'concerned',
      };
    }
  }

  return {
    result: { executed: false, message: `Hermes gateway currently unreachable for ${tool}` },
    mood: 'concerned',
  };
}
