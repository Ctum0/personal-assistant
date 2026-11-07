import { NextRequest } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getHermesClient } from '@/lib/hermes';
import { getDatabase } from '@/lib/db';
import { getRunRecord, updateRunRecord, recordApprovalRequest } from '@/lib/hermes/registry';

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
    return new Response(JSON.stringify({ error: 'Missing run id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDatabase();
  const stored = getRunRecord(db, id, 'owner');
  if (!stored) {
    return new Response(JSON.stringify({ error: 'Run not found or unauthorized' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lastEventId = req.headers.get('last-event-id') || undefined;
  const encoder = new TextEncoder();
  const client = getHermesClient();

  // Create an abort controller linked to the incoming request
  const abortController = new AbortController();
  req.signal.addEventListener('abort', () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const safeEnqueue = (chunk: string) => {
        if (isClosed || abortController.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          isClosed = true;
        }
      };

      // If run was already completed, send a final event and close immediately
      if (['completed', 'failed', 'stopped'].includes(stored.status)) {
        safeEnqueue(
          `event: run.${stored.status}\ndata: ${JSON.stringify({
            status: stored.status,
            output: stored.output,
            error: stored.error,
          })}\n\n`
        );
        controller.close();
        return;
      }

      // Keepalive heartbeat timer every 15s to keep proxy connections alive
      const pingInterval = setInterval(() => {
        safeEnqueue(': keepalive\n\n');
      }, 15000);

      try {
        await client.streamRunEvents(
          stored.hermes_run_id,
          (ev) => {
            if (ev.event === 'comment') {
              safeEnqueue(`: ${ev.data || 'keepalive'}\n\n`);
              return;
            }

            let chunk = '';
            if (ev.seq !== undefined) {
              chunk += `id: ${ev.seq}\n`;
            }
            chunk += `event: ${ev.event}\n`;
            chunk += `data: ${typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data)}\n\n`;
            safeEnqueue(chunk);

            // Update database progress metadata
            try {
              if (ev.event === 'run.completed') {
                updateRunRecord(db, stored.id, {
                  status: 'completed',
                  output: typeof ev.data === 'object' ? ev.data?.output : String(ev.data),
                  lastEventId: ev.seq !== undefined ? String(ev.seq) : ev.event,
                });
              } else if (ev.event === 'run.failed') {
                updateRunRecord(db, stored.id, {
                  status: 'failed',
                  error: typeof ev.data === 'object' ? ev.data?.error || ev.data?.message : String(ev.data),
                  lastEventId: ev.seq !== undefined ? String(ev.seq) : ev.event,
                });
              } else if (ev.event === 'run.interrupted') {
                updateRunRecord(db, stored.id, {
                  status: 'waiting_approval',
                  lastEventId: ev.seq !== undefined ? String(ev.seq) : ev.event,
                  progressMeta: ev.data,
                });

                // Automatically mint a server approval record if not already present
                try {
                  const toolName = typeof ev.data === 'object' ? (ev.data?.tool_name || ev.data?.name || ev.data?.tool || 'consequential_action') : 'consequential_action';
                  const toolCallId = typeof ev.data === 'object' ? (ev.data?.tool_call_id || ev.data?.request_id) : undefined;
                  const parameters = typeof ev.data === 'object' ? (ev.data?.parameters || ev.data?.arguments || ev.data?.args || {}) : {};
                  recordApprovalRequest(db, {
                    runId: stored.id,
                    hermesRunId: stored.hermes_run_id,
                    conversationId: stored.conversation_id,
                    toolName,
                    toolCallId,
                    parameters,
                  });
                } catch {}
              } else if (
                ev.event === 'tool.started' ||
                ev.event === 'tool.completed' ||
                ev.event === 'subagent.start' ||
                ev.event === 'subagent.complete' ||
                ev.event === 'message.delta' ||
                ev.event === 'message.interim'
              ) {
                updateRunRecord(db, stored.id, {
                  lastEventId: ev.seq !== undefined ? String(ev.seq) : ev.event,
                  progressMeta: ev.data,
                });
              }
            } catch {}
          },
          { signal: abortController.signal, lastEventId }
        );
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          safeEnqueue(
            `event: error\ndata: ${JSON.stringify({
              error: err.message || 'Stream error',
            })}\n\n`
          );
        }
      } finally {
        clearInterval(pingInterval);
        isClosed = true;
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
