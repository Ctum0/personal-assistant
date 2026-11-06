import { NextResponse } from 'next/server';
import { getDatabase, getDayStats } from '@/lib/db';

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  let dbOk = false;
  let coverage = 0;
  let brainOk = false;

  try {
    const db = getDatabase();
    const row = db.prepare('SELECT 1 as alive').get() as { alive: number } | undefined;
    dbOk = row?.alive === 1;

    const stats = getDayStats(db, today);
    coverage = stats?.coverage ?? 0;
  } catch (err) {
    dbOk = false;
  }

  // Brain health: check if API key is present in env or DB
  const litellmKey = process.env.LITELLM_API_KEY || '';
  brainOk = !!litellmKey;

  const ok = dbOk;

  return NextResponse.json({
    ok,
    db: dbOk,
    brain: brainOk,
    coverage,
    timestamp: new Date().toISOString(),
  });
}
