import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getDayScore, getHistoryScores } from '@/lib/db';
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
    const history = searchParams.get('history');

    if (history) {
      const limit = parseInt(history, 10) || 14;
      const historyList = getHistoryScores(db, limit);
      return NextResponse.json(historyList);
    }

    const dayScore = getDayScore(db, dateStr);
    return NextResponse.json(dayScore);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
