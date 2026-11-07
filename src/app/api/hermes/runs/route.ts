import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getHermesClient, getHermesConfig } from '@/lib/hermes';
import { getDatabase } from '@/lib/db';
import {
  registerRun,
  listRunRecords,
  getOrCreateHermesSession,
  hashSessionKey,
} from '@/lib/hermes/registry';

export async function POST(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { input, conversation_id, channel, model, instructions, idempotency_key } = body;
  if (!input || (typeof input !== 'string' && !Array.isArray(input))) {
    return NextResponse.json(
      { error: "Field 'input' must be a non-empty string or array of messages" },
      { status: 400 }
    );
  }

  const db = getDatabase();
  const config = getHermesConfig();
  const conversationId = (conversation_id && String(conversation_id).trim()) || `conv_${Date.now()}`;
  const validChannel = channel === 'voice' ? 'voice' : 'text';
  const userId = 'owner';

  // 1. Establish persistent session continuity
  const hermesSession = getOrCreateHermesSession(
    db,
    conversationId,
    config.sessionKey,
    validChannel,
    userId
  );

  const client = getHermesClient();
  const sofiaRunId = `srun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const finalIdempotencyKey = idempotency_key || `sofia-${sofiaRunId}`;

  try {
    const rawPrompt = typeof input === 'string' ? input : input[input.length - 1]?.content || '';

    // 2. Dispatch native run to Hermes gateway
    const hermesRun = await client.createRun({
      input,
      session_id: hermesSession.hermes_session_id,
      model,
      instructions,
      idempotency_key: finalIdempotencyKey,
    });

    // 3. Register run in SQLite registry
    const stored = registerRun(db, {
      id: sofiaRunId,
      hermesRunId: hermesRun.run_id,
      conversationId,
      hermesSessionId: hermesSession.hermes_session_id,
      sessionKeyRef: hashSessionKey(config.sessionKey),
      userId,
      status: hermesRun.status || 'started',
      prompt: rawPrompt,
    });

    return NextResponse.json(
      {
        sofia_run_id: stored.id,
        hermes_run_id: stored.hermes_run_id,
        conversation_id: stored.conversation_id,
        hermes_session_id: stored.hermes_session_id,
        status: stored.status,
        created_at: stored.created_at,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Failed to create Hermes run',
        details: err.message || String(err),
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { searchParams } = req.nextUrl;
  const conversationId = searchParams.get('conversation_id') || undefined;
  const status = searchParams.get('status') || undefined;
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);

  const db = getDatabase();
  const runs = listRunRecords(db, {
    conversationId,
    status,
    limit,
    userId: 'owner',
  });

  return NextResponse.json({ runs });
}
