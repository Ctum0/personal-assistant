import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getHermesClient } from '@/lib/hermes';
import { getDatabase } from '@/lib/db';
import { getRunRecord, updateRunRecord } from '@/lib/hermes/registry';

export async function GET(
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

  // If already in terminal status, return stored record immediately
  if (['completed', 'failed', 'stopped'].includes(stored.status)) {
    return NextResponse.json({
      sofia_run_id: stored.id,
      hermes_run_id: stored.hermes_run_id,
      conversation_id: stored.conversation_id,
      status: stored.status,
      prompt: stored.prompt,
      output: stored.output,
      error: stored.error,
      progress_meta: stored.progress_meta,
      created_at: stored.created_at,
      updated_at: stored.updated_at,
      completed_at: stored.completed_at,
    });
  }

  // Active run: reconcile live status with Hermes
  try {
    const client = getHermesClient();
    const live = await client.getRun(stored.hermes_run_id);

    const updated = updateRunRecord(db, stored.id, {
      status: live.status,
      output: live.output,
      error: typeof live.error === 'string' ? live.error : live.error?.message,
      lastEventId: live.last_event,
      progressMeta: {
        usage: live.usage,
        runtime: live.runtime,
        last_event: live.last_event,
      },
    });

    return NextResponse.json({
      sofia_run_id: updated?.id || stored.id,
      hermes_run_id: updated?.hermes_run_id || stored.hermes_run_id,
      conversation_id: updated?.conversation_id || stored.conversation_id,
      status: updated?.status || live.status,
      prompt: updated?.prompt || stored.prompt,
      output: updated?.output || live.output,
      error: updated?.error,
      progress_meta: updated?.progress_meta,
      created_at: updated?.created_at || stored.created_at,
      updated_at: updated?.updated_at,
      completed_at: updated?.completed_at,
    });
  } catch (err: any) {
    // If Hermes is momentarily unreachable, return the stored state with a warning
    return NextResponse.json({
      sofia_run_id: stored.id,
      hermes_run_id: stored.hermes_run_id,
      conversation_id: stored.conversation_id,
      status: stored.status,
      prompt: stored.prompt,
      output: stored.output,
      error: stored.error,
      progress_meta: stored.progress_meta,
      warning: `Live status reconciliation failed: ${err.message}`,
      created_at: stored.created_at,
      updated_at: stored.updated_at,
    });
  }
}
