import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getHourlyTimeline } from '@/lib/db';
import { verifyApiAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    const db = getDatabase();
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const timeline = getHourlyTimeline(db, dateStr);
    return NextResponse.json(timeline);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
