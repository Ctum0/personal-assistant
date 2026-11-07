import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import {
  getBrowserSession,
  getControlLeaseState,
  acquireControlLease,
} from '@/lib/browser/session';
import { BrowserControlHolder } from '@/lib/browser/types';

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
  return NextResponse.json({ lease });
}

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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const targetHolder: BrowserControlHolder = body.target_holder || body.holder;
  if (targetHolder !== 'HUMAN' && targetHolder !== 'AGENT') {
    return NextResponse.json(
      { error: "Field 'target_holder' must be either 'HUMAN' or 'AGENT'" },
      { status: 400 }
    );
  }

  const durationMs = typeof body.duration_ms === 'number' ? body.duration_ms : undefined;
  const result = acquireControlLease(db, id, targetHolder, durationMs);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, lease: result.lease },
      { status: 409 } // Conflict: Human currently holds lease
    );
  }

  return NextResponse.json({ success: true, lease: result.lease });
}
