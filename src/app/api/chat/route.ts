import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { processSofiaChatTurn } from '@/lib/brain';

export async function POST(req: NextRequest) {
  try {
    const db = getDatabase();
    const body = await req.json();
    const userMessage = body.message || '';
    const history = body.history || [];

    if (!userMessage.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Save user message to database
    db.prepare('INSERT INTO messages (id, ts, role, content) VALUES (?, ?, ?, ?)').run(
      `msg-${Date.now()}-u`,
      new Date().toISOString(),
      'user',
      userMessage
    );

    const result = await processSofiaChatTurn(db, userMessage, history);

    // Save Sofia's reply
    db.prepare(
      'INSERT INTO messages (id, ts, role, content, mood, tool_calls) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      `msg-${Date.now()}-a`,
      new Date().toISOString(),
      'assistant',
      result.text,
      result.mood,
      result.toolCalls ? JSON.stringify(result.toolCalls) : null
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT id, ts, role, content, mood, tool_calls FROM messages ORDER BY ts DESC LIMIT 30')
      .all() as Array<{
      id: string;
      ts: string;
      role: 'user' | 'assistant';
      content: string;
      mood: string | null;
      tool_calls: string | null;
    }>;

    return NextResponse.json(
      rows
        .map((r) => ({
          id: r.id,
          ts: r.ts,
          role: r.role,
          content: r.content,
          mood: r.mood,
          tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        }))
        .reverse()
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
