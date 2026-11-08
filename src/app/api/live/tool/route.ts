import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings } from '@/lib/db';
import { executeTool } from '@/lib/tools';
import { verifyApiAuth } from '@/lib/auth';
import { recordLiveDelegation, updateLiveDelegation } from '@/lib/hermes/registry';

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const body = await req.json().catch(() => ({}));
    const { name, args, conversationId, sessionId, functionCallId } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Tool name is required' }, { status: 400 });
    }

    const db = getDatabase();
    const settings = getSettings(db);

    const convId = conversationId || sessionId || args?.conversationId || args?.sessionId || 'default';
    const sessId = sessionId || conversationId || args?.sessionId || args?.conversationId || 'default';

    if (functionCallId) {
      try {
        recordLiveDelegation(db, {
          conversationId: convId,
          liveSessionId: sessId,
          functionCallId,
          toolName: name,
          status: 'started',
        });
      } catch (recErr) {
        console.warn('Failed to record live delegation:', recErr);
      }
    }

    const toolArgs = {
      ...(args || {}),
      conversationId: convId,
      sessionId: sessId,
      functionCallId,
    };

    const execResult = await executeTool(db, name, toolArgs, settings);

    if (functionCallId) {
      try {
        updateLiveDelegation(db, functionCallId, {
          hermesRunId: execResult.result?.run_id || execResult.result?.hermes_run_id,
          status: execResult.result?.status || (execResult.error ? 'failed' : 'completed'),
          output: execResult.result?.output ? String(execResult.result.output) : undefined,
          error: execResult.error,
        });
      } catch (upErr) {
        console.warn('Failed to update live delegation:', upErr);
      }
    }

    return NextResponse.json(execResult);
  } catch (err: any) {
    console.error('Live tool execution error:', err);
    return NextResponse.json(
      { error: err?.message || 'Tool execution failed' },
      { status: 500 }
    );
  }
}
