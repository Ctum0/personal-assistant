import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { MemoryNote } from '@/lib/types';
import { verifyApiAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    const db = getDatabase();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';

    let rows: Array<{ id: string; text: string; tags: string; created_at: string; pinned: number }>;
    if (query) {
      rows = db
        .prepare('SELECT * FROM memory_notes WHERE text LIKE ? ORDER BY pinned DESC, created_at DESC')
        .all(`%${query}%`) as typeof rows;
    } else {
      rows = db.prepare('SELECT * FROM memory_notes ORDER BY pinned DESC, created_at DESC').all() as typeof rows;
    }

    const notes: MemoryNote[] = rows.map((r) => ({
      id: r.id,
      text: r.text,
      tags: JSON.parse(r.tags || '[]'),
      created_at: r.created_at,
      pinned: Boolean(r.pinned),
    }));

    // Also fetch daily summaries
    const summaries = db.prepare('SELECT * FROM day_summaries ORDER BY date DESC LIMIT 10').all();

    return NextResponse.json({ notes, summaries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    const db = getDatabase();
    const body = await req.json();
    const text = (body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Text required' }, { status: 400 });
    }

    const newNote: MemoryNote = {
      id: `note-${Date.now()}`,
      text,
      tags: Array.isArray(body.tags) ? body.tags : ['user-note'],
      created_at: new Date().toISOString(),
      pinned: Boolean(body.pinned),
    };

    db.prepare(`
      INSERT INTO memory_notes (id, text, tags, created_at, pinned)
      VALUES (?, ?, ?, ?, ?)
    `).run(newNote.id, newNote.text, JSON.stringify(newNote.tags), newNote.created_at, newNote.pinned ? 1 : 0);

    return NextResponse.json(newNote);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    const db = getDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    db.prepare('DELETE FROM memory_notes WHERE id = ?').run(id);
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
