import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, ingestEvents } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const db = getDatabase();
    const body = await req.json();

    const events = Array.isArray(body.events) ? body.events : [body];
    const insertedCount = ingestEvents(db, events);

    return NextResponse.json({ success: true, count: insertedCount });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
