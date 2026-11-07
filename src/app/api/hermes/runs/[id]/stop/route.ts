import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getHermesClient } from '@/lib/hermes';
import { getDatabase } from '@/lib/db';
import { getRunRecord, updateRunRecord } from '@/lib/hermes/registry';

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

  const db = getDatabase();
  const stored = getRunRecord(db, id, 'owner');
  if (!stored) {
    return NextResponse.json({ error: 'Run not found or unauthorized' }, { status: 404 });
  }

  if (['completed', 'failed', 'stopped'].includes(stored.status)) {
    return NextResponse.json({
      message: `Run is already in terminal state '${stored.status}'`,
      sofia_run_id: stored.id,
      hermes_run_id: stored.hermes_run_id,
      status: stored.status,
    });
  }

  try {
    const client = getHermesClient();
    const stopped = await client.stopRun(stored.hermes_run_id);

    if (stopped) {
      updateRunRecord(db, stored.id, {
        status: 'stopped',
        completedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: stopped,
      sofia_run_id: stored.id,
      hermes_run_id: stored.hermes_run_id,
      status: stopped ? 'stopped' : stored.status,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Failed to stop Hermes run',
        details: err.message || String(err),
      },
      { status: 502 }
    );
  }
}
