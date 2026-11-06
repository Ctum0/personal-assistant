import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getTodayLiveSeconds, trackLiveUsage } from '@/lib/db';

export async function GET() {
  const db = getDatabase();
  const seconds = getTodayLiveSeconds(db);
  const minutes = Math.round((seconds / 60) * 10) / 10;
  return NextResponse.json({
    seconds,
    minutes,
    softLimitMinutes: 60,
    hardLimitMinutes: 120,
    approachingLimit: minutes >= 50,
    exceededLimit: minutes >= 120,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const seconds = Number(body.seconds);
    if (!seconds || seconds <= 0) {
      return NextResponse.json({ error: 'Valid positive seconds required' }, { status: 400 });
    }

    const db = getDatabase();
    trackLiveUsage(db, seconds);
    const totalSeconds = getTodayLiveSeconds(db);
    const minutes = Math.round((totalSeconds / 60) * 10) / 10;

    return NextResponse.json({
      tracked: seconds,
      totalSeconds,
      minutes,
      softLimitMinutes: 60,
      hardLimitMinutes: 120,
      exceededLimit: minutes >= 120,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
