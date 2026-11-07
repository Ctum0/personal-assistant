import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { getBrowserSession } from '@/lib/browser/session';
import { getBrowserManager } from '@/server/browser-manager';
import { BrowserInputEvent } from '@/lib/browser/types';

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

  if (session.status === 'closed') {
    return NextResponse.json({ error: 'Browser session is closed' }, { status: 410 });
  }

  // Backend Control Lease Enforcement: Human interaction requires active HUMAN lease
  if (session.lease_holder !== 'HUMAN') {
    return NextResponse.json(
      {
        error: 'Control lease is currently held by Sofia / AGENT. Take control before dispatching input.',
        lease_holder: session.lease_holder,
      },
      { status: 403 }
    );
  }

  let body: BrowserInputEvent;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const validTypes = ['click', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'keydown', 'keyup', 'type'];
  if (!body.type || !validTypes.includes(body.type)) {
    return NextResponse.json(
      { error: `Invalid input event type '${body.type}'` },
      { status: 400 }
    );
  }

  try {
    const success = await getBrowserManager().dispatchInput(id, body);
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to dispatch input to browser worker', details: err.message },
      { status: 500 }
    );
  }
}
