import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase, consumeBrowserStreamTicket } from '@/lib/db';
import { getBrowserSession } from '@/lib/browser/session';
import { getBrowserManager, ScreencastFrame } from '@/server/browser-manager';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const db = getDatabase();

  const ticket = req.nextUrl.searchParams.get('ticket')?.trim();
  let isAuthorized = false;

  if (ticket) {
    isAuthorized = consumeBrowserStreamTicket(db, ticket, id);
  }

  if (!isAuthorized) {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
  }

  const session = getBrowserSession(db, id, 'owner');

  if (!session) {
    return NextResponse.json({ error: 'Browser session not found or unauthorized' }, { status: 404 });
  }

  const manager = getBrowserManager();

  // Ensure browser session is active in manager
  await manager.ensureSession(id, session.current_url).catch(() => {});

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      const sendEvent = (event: string, payload: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch {
          isClosed = true;
        }
      };

      // 1. Send connection establishment ack
      sendEvent('connected', { sessionId: id, status: session.status, url: session.current_url });

      // 2. Send latest cached frame immediately if available
      const latest = manager.getLatestFrame(id);
      if (latest) {
        sendEvent('frame', latest);
      }

      // 3. Subscribe to real-time CDP screencast frames
      const unsubscribe = manager.subscribeScreencast(id, (frame: ScreencastFrame) => {
        sendEvent('frame', frame);
      });

      // 4. Heartbeat keepalive every 15 seconds
      const heartbeat = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          isClosed = true;
          clearInterval(heartbeat);
        }
      }, 15000);

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
