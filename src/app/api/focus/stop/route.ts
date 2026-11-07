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
    const result = body.result || 'completed';

    const info = db.prepare(`
      UPDATE focus_sessions
      SET result = ?, end = ?
      WHERE result = 'active'
    `).run(result, new Date().toISOString());

    return NextResponse.json({
      success: true,
      updated: info.changes,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
