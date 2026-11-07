import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { processSofiaChatTurn } from '@/lib/brain';
import { verifyApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const db = getDatabase();
    const body = await req.json();

    const sessionId = body.sessionId || body.session_id || 'default';
    const channel = body.channel || 'chat';

    // Handle voice turn persistence without triggering LLM turn
    if (body.persistOnly) {
      const userText = body.userMessage || body.message || '';
      const assistantText = body.assistantMessage || '';
      const mood = body.mood || 'neutral';
      const runId = body.runId || body.run_id || null;

      if (userText.trim()) {
        db.prepare(
          'INSERT INTO messages (id, ts, role, content, session_id, channel, run_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(`msg-${Date.now()}-u`, new Date().toISOString(), 'user', userText, sessionId, channel, runId);
      }

      if (assistantText.trim()) {
        db.prepare(
          'INSERT INTO messages (id, ts, role, content, mood, session_id, channel, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          `msg-${Date.now()}-a`,
          new Date().toISOString(),
          'assistant',
          assistantText,
          mood,
          sessionId,
          channel,
          runId
        );
      }

      return NextResponse.json({ ok: true });
    }

    const userMessage = body.message || '';
    let history = Array.isArray(body.history) ? body.history : [];

    if (!userMessage.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Save user message to database
    db.prepare(
      'INSERT INTO messages (id, ts, role, content, session_id, channel) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      `msg-${Date.now()}-u`,
      new Date().toISOString(),
      'user',
      userMessage,
      sessionId,
      channel
    );

    // If client did not provide history, load recent messages from SQLite database for this session!
    if (history.length === 0) {
      try {
        const rows = db
          .prepare(
            'SELECT role, content FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 8'
          )
          .all(sessionId) as Array<{ role: 'user' | 'assistant'; content: string }>;
        // Exclude the current message we just inserted (first row in DESC)
        const pastRows = rows.slice(1).reverse();
        history = pastRows.map((r) => ({
          role: r.role,
          content: r.content,
        }));
      } catch (err) {
        console.warn('Failed to load past conversation context from DB:', err);
      }
    }

    const result = await processSofiaChatTurn(db, userMessage, history, { sessionId, channel });

    // Save Sofia's reply with linked run_id
    db.prepare(
      'INSERT INTO messages (id, ts, role, content, mood, tool_calls, session_id, channel, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      `msg-${Date.now()}-a`,
      new Date().toISOString(),
      'assistant',
      result.text,
      result.mood,
      result.toolCalls ? JSON.stringify(result.toolCalls) : null,
      sessionId,
      channel,
      result.runId || null
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const db = getDatabase();
    const sessionId = req.nextUrl.searchParams.get('sessionId');

    let rows: Array<{
      id: string;
      ts: string;
      role: 'user' | 'assistant';
      content: string;
      mood: string | null;
      tool_calls: string | null;
      session_id?: string;
      channel?: string;
      run_id?: string | null;
    }>;

    if (sessionId) {
      rows = db
        .prepare(
          'SELECT id, ts, role, content, mood, tool_calls, session_id, channel, run_id FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 30'
        )
        .all(sessionId) as any;
    } else {
      rows = db
        .prepare(
          'SELECT id, ts, role, content, mood, tool_calls, session_id, channel, run_id FROM messages ORDER BY ts DESC LIMIT 30'
        )
        .all() as any;
    }

    return NextResponse.json(
      rows
        .map((r) => ({
          id: r.id,
          ts: r.ts,
          role: r.role,
          content: r.content,
          mood: r.mood,
          session_id: r.session_id || 'default',
          channel: r.channel || 'chat',
          run_id: r.run_id || null,
          tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        }))
        .reverse()
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
