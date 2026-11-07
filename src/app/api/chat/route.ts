import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { processSofiaChatTurn } from '@/lib/brain';

export async function POST(req: NextRequest) {
  try {
    const db = getDatabase();
    const body = await req.json();

    const sessionId = body.sessionId || body.session_id || 'default';
    const channel = body.channel || 'chat';

    // Handle voice turn persistence without triggering LLM turn
    if (body.persistOnly) {
      const userText = body.userMessage || body.message || '';
      const assistantText = body.assistantMessage || '';
      const mood = body.mood || 'neutral';

      if (userText.trim()) {
        db.prepare(
          'INSERT INTO messages (id, ts, role, content, session_id, channel) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(`msg-${Date.now()}-u`, new Date().toISOString(), 'user', userText, sessionId, channel);
      }

      if (assistantText.trim()) {
        db.prepare(
          'INSERT INTO messages (id, ts, role, content, mood, session_id, channel) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          `msg-${Date.now()}-a`,
          new Date().toISOString(),
          'assistant',
          assistantText,
          mood,
          sessionId,
          channel
        );
      }

      return NextResponse.json({ ok: true });
    }

    const userMessage = body.message || '';
    const history = body.history || [];

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

    const result = await processSofiaChatTurn(db, userMessage, history);

    // Save Sofia's reply
    db.prepare(
      'INSERT INTO messages (id, ts, role, content, mood, tool_calls, session_id, channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      `msg-${Date.now()}-a`,
      new Date().toISOString(),
      'assistant',
      result.text,
      result.mood,
      result.toolCalls ? JSON.stringify(result.toolCalls) : null,
      sessionId,
      channel
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
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
    }>;

    if (sessionId) {
      rows = db
        .prepare(
          'SELECT id, ts, role, content, mood, tool_calls, session_id, channel FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 30'
        )
        .all(sessionId) as any;
    } else {
      rows = db
        .prepare(
          'SELECT id, ts, role, content, mood, tool_calls, session_id, channel FROM messages ORDER BY ts DESC LIMIT 30'
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
          tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        }))
        .reverse()
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
