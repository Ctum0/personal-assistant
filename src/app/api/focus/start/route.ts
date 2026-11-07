import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { verifyApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    const db = getDatabase();
    const body = await req.json().catch(() => ({}));
    const goalMin = Number(body.minutes) || 45;

    // Interrupt any currently active session
    db.prepare("UPDATE focus_sessions SET result = 'interrupted', end = ? WHERE result = 'active'").run(
      new Date().toISOString()
    );

    const sessionId = `focus-${Date.now()}`;
    const start = new Date().toISOString();

    db.prepare(`
      INSERT INTO focus_sessions (id, start, goal_min, result, distraction_count)
      VALUES (?, ?, ?, 'active', 0)
    `).run(sessionId, start, goalMin);

    return NextResponse.json({
      success: true,
      sessionId,
      start,
      goalMin,
      status: 'active',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
