import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase, createBrowserStreamTicket } from '@/lib/db';
import { getBrowserSession } from '@/lib/browser/session';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { id } = await context.params;
  const db = getDatabase();
  const session = getBrowserSession(db, id, 'owner');

  if (!session) {
    return NextResponse.json({ error: 'Browser session not found or unauthorized' }, { status: 404 });
  }

  // Create 60-second single-use ticket
  const ticket = createBrowserStreamTicket(db, id, 60_000);

  return NextResponse.json({
    ticket,
    sessionId: id,
    expiresIn: 60,
  });
}
