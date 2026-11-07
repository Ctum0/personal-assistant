import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { TaskItem } from '@/lib/types';
import { verifyApiAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    const db = getDatabase();
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as unknown as TaskItem[];
    return NextResponse.json(tasks);
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
    const title = (body.title || '').trim();
    if (!title) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 });
    }

    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      title,
      due: body.due || null,
      status: 'pending',
      est_min: Number(body.est_min) || 30,
      created_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO tasks (id, title, due, status, est_min, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newTask.id, newTask.title, newTask.due || null, newTask.status, newTask.est_min, newTask.created_at);

    return NextResponse.json(newTask);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    const db = getDatabase();
    const body = await req.json();
    const { id, status, title, est_min } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    const doneAt = status === 'completed' ? new Date().toISOString() : null;

    db.prepare(`
      UPDATE tasks
      SET status = COALESCE(?, status),
          title = COALESCE(?, title),
          est_min = COALESCE(?, est_min),
          done_at = CASE WHEN ? = 'completed' THEN ? ELSE done_at END
      WHERE id = ?
    `).run(status || null, title || null, est_min || null, status || null, doneAt, id);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return NextResponse.json(updated);
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

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
