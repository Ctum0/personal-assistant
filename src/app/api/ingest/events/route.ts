import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, ingestEvents, rebuildDayStats } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const requiredToken = process.env.DEVICE_TOKEN;
    if (requiredToken) {
      const token = req.headers.get('x-device-token');
      if (token !== requiredToken) {
        return NextResponse.json({ error: 'unauthorized_device_token' }, { status: 401 });
      }
    }

    const db = getDatabase();
    const body = await req.json();

    const events = Array.isArray(body.events) ? body.events : [body];
    const insertedCount = ingestEvents(db, events);

    const today = new Date().toISOString().slice(0, 10);
    rebuildDayStats(db, today);

    return NextResponse.json({ success: true, count: insertedCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
