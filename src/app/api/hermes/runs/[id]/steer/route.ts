import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getHermesClient } from '@/lib/hermes';
import { getDatabase } from '@/lib/db';
import { getRunRecord } from '@/lib/hermes/registry';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing run id' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { message } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json(
      { error: "Field 'message' must be a non-empty string" },
      { status: 400 }
    );
  }

  const db = getDatabase();
  const stored = getRunRecord(db, id, 'owner');
  if (!stored) {
    return NextResponse.json({ error: 'Run not found or unauthorized' }, { status: 404 });
  }

  try {
    const client = getHermesClient();
    const success = await client.steerRun(stored.hermes_run_id, message.trim());

    return NextResponse.json({
      success,
      sofia_run_id: stored.id,
      hermes_run_id: stored.hermes_run_id,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Failed to steer Hermes run',
        details: err.message || String(err),
      },
      { status: 502 }
    );
  }
}
