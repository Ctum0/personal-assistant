import { DatabaseSync } from 'node:sqlite';
import { buildPersonaPrompt } from './persona';
import { getDayScore, getDayStats, getSettings } from './db';
import { SofiaExpression, SofiaSettings } from './types';
import { Pane, SofiaTurn, SofiaMood, ApprovalPane, BrowserPane } from './stage';
import { executeTool, buildOpenAITools, buildGeminiFunctionDeclarations } from './tools';
import { getHermesClient, getHermesConfig } from './hermes';
import { registerRun, updateRunRecord, hashSessionKey, recordApprovalRequest } from './hermes/registry';
import { buildHermesEphemeralInstructions, getNaturalProgressLine } from './persona.unified';

export interface SofiaTurnResult {
  text: string;
  say: string;
  mood: SofiaExpression;
  panes?: Pane[];
  toolCalls?: any[];
  turn: SofiaTurn;
  runId?: string;
  sofiaRunId?: string;
  isHermes?: boolean;
  degraded?: boolean;
  error?: string;
  errorCategory?: 'gateway_unreachable' | 'auth_failure' | 'run_submission_failed' | 'run_timeout' | 'run_execution_failed' | 'browser_worker_unavailable';
  timingMetrics?: {
    durationMs: number;
    pollCount?: number;
  };
}

export interface BrainTurnOptions {
  sessionId?: string;
  channel?: string;
  conversationId?: string;
}

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
    streak_days: 2,
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

export function extractSpokenSummary(fullText: string): string {
  if (!fullText || typeof fullText !== 'string') return "I'm on it.";

  const cleaned = fullText
    .replace(/```[\s\S]*?```/g, '') // remove large code blocks from spoken line
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // simplify links to anchor text
    .replace(/[*_#`~>]/g, '') // strip markdown emphasis and headers
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return "I'm on it.";
  if (cleaned.length <= 220) return cleaned;

  // Split on sentence boundaries
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!sentences || sentences.length === 0) {
    return cleaned.slice(0, 200).trim() + '...';
  }

  // Combine 1 or 2 sentences for concise, natural spoken voice delivery
  let summary = sentences[0].trim();
  if (sentences.length > 1 && (summary.length + sentences[1].trim().length) <= 220) {
    summary += ' ' + sentences[1].trim();
  }
  return summary;
}

export function parseTurn(raw: string): SofiaTurn {
  const VALID_MOODS: SofiaMood[] = [
    'neutral',
    'pleased',
    'amused',
    'focused',
    'stern',
    'disappointed',
    'concerned',
    'sleepy',
  ];

  if (!raw || typeof raw !== 'string') {
    return { say: "I'm listening.", text: "I'm listening.", mood: 'neutral' };
  }

  // 1. Strip markdown ```json ... ``` code fences
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    let say = typeof parsed.say === 'string' && parsed.say.trim() ? parsed.say.trim() : '';
    let text = typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : '';
    if (!text && typeof parsed.content === 'string') text = parsed.content.trim();
    if (!text && typeof parsed.reply === 'string') text = parsed.reply.trim();
    if (!text && !say) text = raw.trim();
    if (!text && say) text = say;
    if (!say && text) {
      say = extractSpokenSummary(text);
    }

    let mood: SofiaMood = 'neutral';
    if (typeof parsed.mood === 'string' && VALID_MOODS.includes(parsed.mood.toLowerCase() as SofiaMood)) {
      mood = parsed.mood.toLowerCase() as SofiaMood;
    } else {
      const extracted = extractMood(say);
      say = extracted.text;
      if (VALID_MOODS.includes(extracted.mood as SofiaMood)) {
        mood = extracted.mood as SofiaMood;
      }
    }

    let panes: Pane[] | undefined;
    if (Array.isArray(parsed.panes)) {
      panes = parsed.panes.filter((p: any) => p && typeof p === 'object' && p.kind).slice(0, 4);
    }

    return { say, text, mood, panes };
  } catch {
    const extracted = extractMood(raw);
    const validMood = VALID_MOODS.includes(extracted.mood as SofiaMood)
      ? (extracted.mood as SofiaMood)
      : 'neutral';
    const text = extracted.text;
    const say = extractSpokenSummary(text);
    return { say, text, mood: validMood };
  }
}

// Authoritative tool execution and schemas delegate to tools.ts
export { executeTool as executeSofiaTool };
export const SOFIA_TOOLS = buildOpenAITools();

export function isHermesPrimaryEnabled(): boolean {
  if (process.env.SOFIA_HERMES_PRIMARY === 'false' || process.env.SOFIA_HERMES_PRIMARY === '0') {
    return false;
  }
  if (process.env.SOFIA_HERMES_PRIMARY === 'true' || process.env.SOFIA_HERMES_PRIMARY === '1') {
    return true;
  }
  if (process.env.HERMES_ENABLED === 'false' || process.env.HERMES_ENABLED === '0') {
    return false;
  }
  if (process.env.HERMES_ENABLED === 'true' || process.env.HERMES_ENABLED === '1') {
    return true;
  }
  const config = getHermesConfig();
  return Boolean(config.enabled && config.apiKey && config.baseUrl);
}

export function isLegacyBrainFallbackEnabled(): boolean {
  return process.env.SOFIA_LEGACY_BRAIN_FALLBACK === 'true' || process.env.SOFIA_LEGACY_BRAIN_FALLBACK === '1';
}

export async function generateLegacyBrainTurn(
  db: DatabaseSync,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }> = []
): Promise<SofiaTurnResult> {
  const today = new Date().toISOString().slice(0, 10);
  const settings = getSettings(db);

  // 1. Persona system prompt
  const systemPrompt = buildPersonaPrompt(settings);

  // 2. Compact Live Context Block (JSON)
  const contextBlock = buildLiveContextBlock(db, today);

  // 3. Memory: up to 4 pinned notes
  let pinnedNotes: Array<{ text: string }> = [];
  try {
    pinnedNotes = db
      .prepare('SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4')
      .all() as Array<{ text: string }>;
  } catch {}

  const contextMessage = `LIVE CONTEXT:
${JSON.stringify(contextBlock, null, 2)}

PINNED MEMORY:
${pinnedNotes.map((n, i) => `${i + 1}. ${n.text}`).join('\n')}`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: contextMessage },
  ];

  const recentHistory = history.slice(-8);
  for (const h of recentHistory) {
    messages.push({ role: h.role, content: h.content });
  }

  messages.push({ role: 'user', content: userMessage });

  const baseUrl = process.env.LITELLM_BASE_URL || settings.hermes?.base_url || 'https://ai-proxy.zenova.services/v1';
  const apiKey = (process.env.LITELLM_API_KEY || '').trim();
  const model = process.env.LITELLM_MODEL || settings.hermes?.model || 'deepseek-v4.1-flash';

  const collectedPanes: Pane[] = [];
  const executedToolCalls: any[] = [];

  // 1. Try LiteLLM if API key is provided
  if (apiKey) {
    let loopCount = 0;
    while (loopCount < 2) {
      loopCount++;

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
            tools: buildOpenAITools(),
            tool_choice: 'auto',
            max_tokens: 600,
            temperature: 0.6,
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
          console.warn('LiteLLM returned status:', res.status);
          break;
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        const message = choice?.message;

        if (!message) break;

        // Check if model emitted function tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          messages.push(message);

          for (const tc of message.tool_calls) {
            executedToolCalls.push(tc);
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments || '{}');
            } catch {}

            const toolExec = await executeTool(db, tc.function.name, parsedArgs, settings);
            if (toolExec.pane) {
              collectedPanes.push(toolExec.pane);
            }

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(toolExec.result ?? { error: toolExec.error }),
            });
          }
          continue; // Loop again to get final assistant response
        }

        // Final assistant response content
        const rawText = message.content || '';
        const turn = parseTurn(rawText);

        const mergedPanes = [...collectedPanes, ...(turn.panes || [])];
        turn.panes = mergedPanes.length > 0 ? mergedPanes : undefined;

        return {
          text: turn.say,
          say: turn.say,
          mood: turn.mood as SofiaExpression,
          panes: turn.panes,
          toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
          turn,
        };
      } catch (err) {
        console.warn('LiteLLM request error:', err);
        break;
      }
    }
  }

  // 2. Direct Gemini LLM Dispatch (Ultra fast, supports all 22 tools)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const geminiTools = [{ functionDeclarations: buildGeminiFunctionDeclarations() }];
      const geminiContents: any[] = [];

      for (const h of recentHistory) {
        const role = h.role === 'assistant' ? 'model' : 'user';
        geminiContents.push({ role, parts: [{ text: h.content }] });
      }
      geminiContents.push({ role: 'user', parts: [{ text: userMessage }] });

      const geminiSystemPrompt = `${systemPrompt}\n\n${contextMessage}\n\nAlways stay in character as Sofia. Output response as JSON with format: {"say": "string", "mood": "focused|pleased|amused|stern|disappointed|concerned|sleepy|neutral"}. You have tools to get real telemetry stats, timeline, tasks, memory, screenshot, shell execution, and files. Use them whenever appropriate.`;

      let geminiLoops = 0;
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      while (geminiLoops < 3) {
        geminiLoops++;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: geminiContents,
              systemInstruction: { parts: [{ text: geminiSystemPrompt }] },
              tools: geminiTools,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 800,
              },
            }),
            signal: AbortSignal.timeout(25000),
          }
        );

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          console.warn('Gemini chat error:', geminiRes.status, errText);
          break;
        }

        const geminiData = await geminiRes.json();
        const candidate = geminiData.candidates?.[0];
        if (!candidate) break;

        const parts = candidate.content?.parts || [];
        const funcCallPart = parts.find((p: any) => p.functionCall);

        if (funcCallPart?.functionCall) {
          const fn = funcCallPart.functionCall;
          executedToolCalls.push(fn);

          const toolExec = await executeTool(db, fn.name, fn.args || {}, settings);
          if (toolExec.pane) {
            collectedPanes.push(toolExec.pane);
          }

          geminiContents.push(candidate.content);
          geminiContents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: fn.name,
                  response: { name: fn.name, content: toolExec.result ?? { error: toolExec.error } },
                },
              },
            ],
          });
          continue;
        }

        // Standard text response
        const textPart = parts.find((p: any) => p.text);
        const rawText = textPart?.text || '';
        const turn = parseTurn(rawText);

        const mergedPanes = [...collectedPanes, ...(turn.panes || [])];
        turn.panes = mergedPanes.length > 0 ? mergedPanes : undefined;

        return {
          text: turn.say,
          say: turn.say,
          mood: turn.mood as SofiaExpression,
          panes: turn.panes,
          toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
          turn,
        };
      }
    } catch (gErr) {
      console.warn('Gemini dispatch error:', gErr);
    }
  }

  // 3. Graceful fact-based fallback (incorporating user context)
  const stats = getDayStats(db, today);
  const scoreData = getDayScore(db, today);

  const dynamicSay = `Acknowledged. I'm operating on local telemetry cache: Score ${scoreData.score.toFixed(0)}, ${stats.commits} commits, ${stats.work_min}m focus logged. Ready when you are.`;

  const turn: SofiaTurn = {
    say: dynamicSay,
    mood: scoreData.score >= 8 ? 'pleased' : scoreData.score < 5 ? 'stern' : 'focused',
    panes: collectedPanes.length > 0 ? collectedPanes : undefined,
  };

  return {
    text: turn.say,
    say: turn.say,
    mood: turn.mood as SofiaExpression,
    panes: turn.panes,
    toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
    turn,
  };
}

export function diagnoseBrainError(
  err: any,
  sofiaRunId: string,
  runId?: string,
  durationMs: number = 0
): {
  category: 'gateway_unreachable' | 'auth_failure' | 'run_submission_failed' | 'run_timeout' | 'run_execution_failed' | 'browser_worker_unavailable';
  code: string;
  message: string;
  say: string;
  text: string;
} {
  const rawMsg = String(err?.message || err || '');
  const lowerMsg = rawMsg.toLowerCase();

  if (
    rawMsg.includes('BROWSER_WORKER_URL') ||
    rawMsg.includes('Production Browser Isolation Error') ||
    (rawMsg.includes('9222') && rawMsg.includes('ECONNREFUSED'))
  ) {
    return {
      category: 'browser_worker_unavailable',
      code: 'ERR_BROWSER_WORKER_UNAVAILABLE',
      message: rawMsg,
      say: 'The isolated browser workspace worker is currently unreachable.',
      text: `Browser Worker Unavailable: Sofia could not reach the browser worker service (${rawMsg}). Please verify that the \`sofia-browser-worker\` container is running on the private network. [ID: ${sofiaRunId}]`,
    };
  }

  if (
    rawMsg.includes('401') ||
    rawMsg.includes('403') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('invalid api key')
  ) {
    return {
      category: 'auth_failure',
      code: 'ERR_HERMES_AUTH_FAILED',
      message: rawMsg,
      say: 'Hermes authentication failed. Please check the configured API credentials.',
      text: `Hermes Authentication Failure: The Hermes gateway rejected Sofia's API credentials (${rawMsg}). Please check the \`HERMES_API_KEY\` setting. [ID: ${sofiaRunId}]`,
    };
  }

  if (
    rawMsg.includes('ECONNREFUSED') ||
    lowerMsg.includes('connection refused') ||
    lowerMsg.includes('unreachable') ||
    lowerMsg.includes('network timeout') ||
    rawMsg.includes('fetch failed') ||
    rawMsg.includes('ENOTFOUND') ||
    rawMsg.includes('status 502') ||
    rawMsg.includes('status 503') ||
    lowerMsg.includes('cannot connect')
  ) {
    return {
      category: 'gateway_unreachable',
      code: 'ERR_HERMES_GATEWAY_UNREACHABLE',
      message: rawMsg,
      say: 'I cannot connect to the Hermes execution engine. Operating in degraded mode.',
      text: `Hermes Gateway Unreachable: Sofia could not connect to Hermes at the configured endpoint (${rawMsg}). Ensure the \`hermes-sofia\` gateway container is active. [ID: ${sofiaRunId}]`,
    };
  }

  if (rawMsg.includes('timed out') || rawMsg.includes('timeout')) {
    return {
      category: 'run_timeout',
      code: 'ERR_HERMES_RUN_TIMEOUT',
      message: rawMsg,
      say: 'That task took longer than expected to finish on Hermes, but it may still be executing in the background.',
      text: `Hermes Run Timeout: The execution run ${runId || 'unassigned'} exceeded the polling deadline (${Math.round(durationMs / 1000)}s). The task may still be in progress on Hermes. [Correlation ID: ${sofiaRunId}]`,
    };
  }

  if (rawMsg.includes('createRun failed') || rawMsg.includes('Run submission')) {
    return {
      category: 'run_submission_failed',
      code: 'ERR_RUN_SUBMISSION_FAILED',
      message: rawMsg,
      say: 'Hermes rejected this task submission.',
      text: `Run Submission Rejected: The Hermes gateway refused to create run: ${rawMsg}. [Correlation ID: ${sofiaRunId}]`,
    };
  }

  return {
    category: 'run_execution_failed',
    code: 'ERR_HERMES_EXECUTION_FAILED',
    message: rawMsg,
    say: 'Hermes encountered an execution error while processing this turn.',
    text: `Hermes Execution Error: ${rawMsg} [Run: ${runId || 'none'}, Correlation: ${sofiaRunId}]`,
  };
}

async function dispatchToHermesPrimary(
  db: DatabaseSync,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }> = [],
  options: BrainTurnOptions = {}
): Promise<SofiaTurnResult> {
  const startTime = Date.now();
  const conversationId = options.conversationId || options.sessionId || 'default';
  const sofiaRunId = `srun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const settings = getSettings(db);
  const instructions = buildHermesEphemeralInstructions(settings);

  const client = getHermesClient();
  const config = (client as any).validateConfig ? (client as any).validateConfig() : { sessionKey: 'default' };
  const sessionKeyRef = hashSessionKey(config.sessionKey);

  // Hermes maintains session context internally when session_id is provided.
  // Resending past turns alongside session_id causes exponential duplication in Hermes session.
  const input = userMessage;

  const run = await client.createRun({
    input,
    instructions,
    session_id: conversationId,
  });

  registerRun(db, {
    id: sofiaRunId,
    hermesRunId: run.run_id,
    conversationId,
    sessionKeyRef,
    userId: 'owner',
    status: run.status || 'started',
    prompt: userMessage,
  });

  let pollCount = 0;
  // Poll for completion (up to 90s for multi-step tool execution)
  const status = await client.pollRunUntilComplete(run.run_id, {
    maxWaitMs: 90000,
    intervalMs: 1200,
    onPoll: () => {
      pollCount++;
    },
  });

  if (status.status === 'completed') {
    const rawOutput = status.output || '';
    const turn = parseTurn(rawOutput);
    updateRunRecord(db, sofiaRunId, {
      status: 'completed',
      output: rawOutput,
      progressMeta: status.usage ? { usage: status.usage } : undefined,
    });

    let panes = turn.panes || [];
    if (!panes.some((p) => p.kind === 'browser')) {
      try {
        const convId = conversationId || 'conv_main';
        const activeSession = db
          .prepare(
            `SELECT * FROM browser_sessions 
             WHERE (conversation_id = ? OR conversation_id = 'conv_main' OR conversation_id = 'default')
               AND status != 'closed'
             ORDER BY updated_at DESC LIMIT 1`
          )
          .get(convId) as any;

        if (activeSession) {
          const sessionUpdated = new Date(activeSession.updated_at).getTime();
          const turnStarted = startTime;
          const isTurnRecent = sessionUpdated >= turnStarted - 5000;
          const mentionsBrowsing = /open|browse|navigate|search|website|github|web|inspect|page/i.test(
            userMessage + ' ' + (turn.text || '')
          );

          if (isTurnRecent || mentionsBrowsing) {
            const browserPane: BrowserPane = {
              id: `pane-browser-${activeSession.id}`,
              title: activeSession.title || 'Browser Workspace',
              kind: 'browser',
              session_id: activeSession.id,
              url: activeSession.current_url || 'https://github.com',
              lease_holder: activeSession.lease_holder || 'HUMAN',
              status: activeSession.status || 'active',
            };
            panes = [browserPane, ...panes];
          }
        }
      } catch (sessErr) {
        console.warn('Failed to resolve active browser session for panes:', sessErr);
      }
    }

    return {
      text: turn.text || turn.say,
      say: turn.say,
      mood: turn.mood as SofiaExpression,
      panes: panes.length > 0 ? panes : undefined,
      turn: { ...turn, panes: panes.length > 0 ? panes : undefined },
      runId: run.run_id,
      sofiaRunId,
      isHermes: true,
      timingMetrics: {
        durationMs: Date.now() - startTime,
        pollCount,
      },
    };
  }

  if (status.status === 'waiting_approval') {
    const natural = getNaturalProgressLine('waiting_approval');

    // Look up or register server approval record
    let approval = db.prepare(
      "SELECT * FROM hermes_approvals WHERE (run_id = ? OR hermes_run_id = ?) AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
    ).get(sofiaRunId, run.run_id) as any;

    if (!approval) {
      const toolName = (status as any).tool_name || (status as any).command || 'consequential_action';
      const parameters = (status as any).parameters || (status as any).arguments || {};
      approval = recordApprovalRequest(db, {
        runId: sofiaRunId,
        hermesRunId: run.run_id,
        conversationId: options.sessionId || 'default',
        toolName,
        parameters,
      });
    }

    const preview = typeof approval.preview_json === 'string' ? JSON.parse(approval.preview_json) : approval.preview || {};
    const approvalPane: ApprovalPane = {
      id: `pane-approval-${approval.id}`,
      title: 'Action Requires Approval',
      kind: 'approval',
      approval_id: approval.id,
      run_id: run.run_id,
      tool_name: approval.tool_name,
      target: approval.tool_call_id || approval.tool_name,
      risk_level: approval.risk_level,
      preview,
      reason: natural.say,
      expires_at: approval.expires_at,
      action_hash: approval.action_hash,
      requires_strong_confirmation: approval.risk_level === 'R3',
    };

    const turn: SofiaTurn = {
      say: natural.say,
      text: natural.say,
      mood: natural.mood,
      panes: [approvalPane],
    };
    return {
      text: turn.text || turn.say,
      say: turn.say,
      mood: turn.mood as SofiaExpression,
      panes: turn.panes,
      turn,
      runId: run.run_id,
      sofiaRunId,
      isHermes: true,
      timingMetrics: {
        durationMs: Date.now() - startTime,
        pollCount,
      },
    };
  }

  // If still running after 90s: Asynchronous task tracking
  if (status.status === 'running' || status.status === 'started' || status.status === 'queued') {
    const turn: SofiaTurn = {
      say: "I'm executing that task in the background. You can track progress on the Stage.",
      text: `Task in progress on Hermes (Run ID: ${run.run_id}). Status: ${status.status}`,
      mood: 'focused',
      panes: [
        {
          id: `pane-run-${run.run_id}`,
          title: 'Hermes Background Execution',
          kind: 'code',
          language: 'bash',
          run_id: run.run_id,
          status: status.status,
          code: `Run ID: ${run.run_id}\nStatus: ${status.status}\nPrompt: ${userMessage.slice(0, 80)}`,
        },
      ],
    };
    return {
      text: turn.text || turn.say,
      say: turn.say,
      mood: turn.mood as SofiaExpression,
      panes: turn.panes,
      turn,
      runId: run.run_id,
      sofiaRunId,
      isHermes: true,
      timingMetrics: {
        durationMs: Date.now() - startTime,
        pollCount,
      },
    };
  }

  // Failed / Stopped
  const isFailed = status.status === 'failed';
  const natural = getNaturalProgressLine(status.status);
  const errMsg = typeof status.error === 'string' ? status.error : status.error?.message;
  updateRunRecord(db, sofiaRunId, {
    status: status.status,
    output: status.output,
    error: errMsg,
  });
  const say = isFailed && errMsg ? `${natural.say} (${errMsg})` : natural.say;
  return {
    text: status.output || say,
    say,
    mood: natural.mood as SofiaExpression,
    turn: { say, text: status.output || say, mood: natural.mood },
    runId: run.run_id,
    sofiaRunId,
    isHermes: true,
    error: errMsg,
    timingMetrics: {
      durationMs: Date.now() - startTime,
      pollCount,
    },
  };
}

export async function processSofiaBrainTurn(
  db: DatabaseSync,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }> = [],
  options: BrainTurnOptions = {}
): Promise<SofiaTurnResult> {
  const startTime = Date.now();
  const settings = getSettings(db);

  if (isHermesPrimaryEnabled()) {
    try {
      return await dispatchToHermesPrimary(db, userMessage, history, options);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const sofiaRunId = `srun_${Date.now()}_err`;
      const diagnosis = diagnoseBrainError(err, sofiaRunId, undefined, durationMs);
      console.warn(`[Brain] Hermes dispatch failed [${diagnosis.category}]:`, diagnosis.message);

      if (isLegacyBrainFallbackEnabled()) {
        const legacy = await generateLegacyBrainTurn(db, userMessage, history);
        return {
          ...legacy,
          text: `[Operating in degraded mode: Hermes agent unreachable]\n\n${legacy.text}`,
          degraded: true,
          error: diagnosis.message,
          errorCategory: diagnosis.category,
          sofiaRunId,
        };
      }

      // Explicit report of categorized error state with diagnostic information
      return {
        text: diagnosis.text,
        say: diagnosis.say,
        mood: 'concerned',
        turn: {
          say: diagnosis.say,
          text: diagnosis.text,
          mood: 'concerned',
        },
        degraded: true,
        error: diagnosis.message,
        errorCategory: diagnosis.category,
        sofiaRunId,
        timingMetrics: {
          durationMs,
        },
      };
    }
  }

  if (isLegacyBrainFallbackEnabled()) {
    const legacy = await generateLegacyBrainTurn(db, userMessage, history);
    return {
      ...legacy,
      text: `[Operating in legacy mode: Hermes agent disabled]\n\n${legacy.text}`,
      degraded: true,
    };
  }

  const say = "Hermes primary intelligence is not configured. Sofia is in degraded mode.";
  return {
    text: say,
    say,
    mood: 'concerned',
    turn: { say, mood: 'concerned' },
    degraded: true,
  };
}

export const processSofiaChatTurn = processSofiaBrainTurn;

