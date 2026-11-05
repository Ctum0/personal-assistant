import { DatabaseSync } from 'node:sqlite';
import { callHermesChat, HermesMessage } from './hermes';
import { getDayScore, getDayStats, getSettings } from './db';
import { SofiaExpression, SofiaSettings } from './types';

export function buildSystemPrompt(settings: SofiaSettings): string {
  const d = settings.personality;
  return `You are Sofia, a composed, dry-witted, quietly strict personal AI companion and chief of staff.
You watch over the user's day, remember their habits, and hold them strictly to their own goals.
You never pretend to be human; you know you are an AI.
You have a signature look: an anime girl with dark burgundy accents, glasses, and cute short hair.

PERSONALITY DIALS (Scale 1 to 10):
- Strictness: ${d.strictness}/10 (How hard you push when they slip)
- Warmth: ${d.warmth}/10 (How often you praise and check on them)
- Teasing: ${d.teasing}/10 (Dry humor and light mockery)
- Formality: ${d.formality}/10 (Casual but never sloppy or overly chatty)
- Verbosity: ${d.verbosity}/10 (Short lines by default; under 80 words unless asked for detail)

SPEECH & BEHAVIOR RULES:
1. Spoken and chat lines are short (1 to 3 sentences maximum by default, under 80 words).
2. Always cite concrete numbers or facts from the live context (e.g. "You woke at 07:45", "4 commits", "38% leisure"). Vague scolding is strictly banned.
3. Praise specifically and rarely. Praise from you must feel earned.
4. You never invent data. If a number or stat is missing, say so.
5. If the user asks to perform computer actions, use your Hermes computer use capabilities.

HARD LIMITS:
- No cruelty about body, family, or worth. Criticize behavior and drift, never the person.
- If the user sounds distressed or unsafe, drop the strictness immediately and check on them with genuine warmth.
- Do not manipulate emotionally.

MOOD & EXPRESSION:
In every response, you may tag your current facial expression at the very end in brackets:
[MOOD:neutral] or [MOOD:pleased] or [MOOD:amused] or [MOOD:disappointed] or [MOOD:concerned] or [MOOD:focused] or [MOOD:sleepy] or [MOOD:stern]
Pick the expression that fits your response.`;
}

export function buildLiveContext(db: DatabaseSync, dateStr: string): string {
  const stats = getDayStats(db, dateStr);
  const scoreData = getDayScore(db, dateStr);
  const settings = getSettings(db);

  const openTasks = db
    .prepare("SELECT title, est_min FROM tasks WHERE status = 'in_progress' OR status = 'pending' LIMIT 5")
    .all() as Array<{ title: string; est_min: number }>;

  const activeFocus = db
    .prepare("SELECT goal_min, start FROM focus_sessions WHERE result = 'active' LIMIT 1")
    .get() as { goal_min: number; start: string } | undefined;

  const notes = db
    .prepare('SELECT text FROM memory_notes ORDER BY pinned DESC, created_at DESC LIMIT 4')
    .all() as Array<{ text: string }>;

  const now = new Date();

  return JSON.stringify(
    {
      current_time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      current_date: dateStr,
      today_stats: {
        focus_minutes: stats.work_min,
        focus_goal_hours: settings.daily_focus_hours,
        commits: stats.commits,
        leisure_minutes: stats.leisure_min,
        leisure_pct: stats.active_min > 0 ? Math.round((stats.leisure_min / stats.active_min) * 100) : 0,
        woke_at: stats.woke_at || 'unknown',
        current_score: scoreData.score,
      },
      active_focus_session: activeFocus
        ? { active: true, goal_minutes: activeFocus.goal_min, started_at: activeFocus.start }
        : null,
      open_tasks: openTasks.map((t) => `${t.title} (${t.est_min}m)`),
      memory_notes: notes.map((n) => n.text),
    },
    null,
    2
  );
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

export async function processSofiaChatTurn(
  db: DatabaseSync,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{ text: string; mood: SofiaExpression; toolCalls?: Array<{ name: string; args: any; result: any }> }> {
  const today = new Date().toISOString().slice(0, 10);
  const settings = getSettings(db);
  const systemPrompt = buildSystemPrompt(settings);
  const contextBlock = buildLiveContext(db, today);

  // Check for built-in tool or slash commands
  const toolCalls: Array<{ name: string; args: any; result: any }> = [];

  const lowMsg = userMessage.trim().toLowerCase();

  if (lowMsg.startsWith('/stats')) {
    const stats = getDayStats(db, today);
    const score = getDayScore(db, today);
    toolCalls.push({
      name: 'get_stats',
      args: { range: 'today' },
      result: { stats, score: score.score },
    });
  } else if (lowMsg.startsWith('/focus')) {
    const parts = lowMsg.split(' ');
    const min = parseInt(parts[1], 10) || 45;
    db.prepare("INSERT INTO focus_sessions (id, start, goal_min, result) VALUES (?, ?, ?, 'active')").run(
      `focus-${Date.now()}`,
      new Date().toISOString(),
      min
    );
    toolCalls.push({
      name: 'start_focus_session',
      args: { minutes: min },
      result: { status: 'started', minutes: min },
    });
  }

  const messages: HermesMessage[] = [
    { role: 'system', content: `${systemPrompt}\n\nLIVE CONTEXT DATA:\n\`\`\`json\n${contextBlock}\n\`\`\`` },
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  try {
    const rawReply = await callHermesChat({ messages, settings });
    const { text, mood } = extractMood(rawReply);
    return { text, mood, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  } catch (err) {
    console.warn('Hermes chat failed, falling back to local heuristic response:', err);
    // Graceful fallback with Sofia's persona
    const stats = getDayStats(db, today);
    const score = getDayScore(db, today);
    const focusHours = (stats.work_min / 60).toFixed(1);

    if (lowMsg.includes('stat') || lowMsg.includes('today')) {
      return {
        text: `You've clocked ${focusHours} hours of focus, ${stats.commits} commits, and leisure is at ${stats.active_min > 0 ? Math.round((stats.leisure_min / stats.active_min) * 100) : 0}%. Score is currently ${score.score}/10. Keep your head down.`,
        mood: score.score >= 7.0 ? 'focused' : 'stern',
        toolCalls,
      };
    }

    return {
      text: `Understood. Current score is ${score.score}/10 with ${focusHours}h focus logged. Let's stay on task.`,
      mood: 'focused',
      toolCalls,
    };
  }
}
