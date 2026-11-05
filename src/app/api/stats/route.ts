import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getDayStats } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDatabase();
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const stats = getDayStats(db, dateStr);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
