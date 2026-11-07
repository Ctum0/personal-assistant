import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import {
  getBrowserSession,
  closeBrowserSession,
  getControlLeaseState,
} from '@/lib/browser/session';
import { getBrowserManager } from '@/server/browser-manager';

export async function GET(
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

  const lease = getControlLeaseState(db, id);

  let pageInfo = null;
  try {
    pageInfo = await getBrowserManager().getPageInfo(id);
  } catch {}

  return NextResponse.json({ session, lease, pageInfo });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { id } = await context.params;
  const db = getDatabase();

  const closed = closeBrowserSession(db, id);
  await getBrowserManager().closeSession(id).catch(() => {});

  if (!closed) {
    return NextResponse.json({ error: 'Browser session not found or already closed' }, { status: 404 });
  }

  return NextResponse.json({ success: true, sessionId: id, status: 'closed' });
}
