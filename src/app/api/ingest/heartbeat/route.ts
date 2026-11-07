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
    const tokenHeader = req.headers.get('x-device-token') || req.headers.get('authorization') || '';
    const body = await req.json().catch(() => ({}));
    const deviceId = body.device || 'pc-main';
    const status = body.status || 'active';
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO devices (id, name, token_hash, last_seen, kind)
      VALUES (?, ?, ?, ?, 'pc')
      ON CONFLICT(id) DO UPDATE SET last_seen = ?, kind = 'pc'
    `).run(deviceId, deviceId, tokenHeader || 'unauthenticated', nowIso, nowIso);

    return NextResponse.json({
      success: true,
      device: deviceId,
      status,
      received_at: nowIso,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
