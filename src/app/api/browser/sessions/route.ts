import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import {
  getOrCreateBrowserSession,
  listActiveBrowserSessions,
} from '@/lib/browser/session';

export async function GET(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversation_id') || undefined;

  const db = getDatabase();
  const sessions = listActiveBrowserSessions(db, conversationId);

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const conversationId = body.conversation_id || 'default';
  const initialUrl = body.url || 'https://github.com';
  const title = body.title || 'Browser Workspace';

  const db = getDatabase();
  const session = getOrCreateBrowserSession(db, conversationId, 'owner', initialUrl, title);

  return NextResponse.json({ session });
}
