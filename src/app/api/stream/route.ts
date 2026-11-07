import { NextRequest } from 'next/server';
import { getDatabase, getDayScore, getDayStats } from '@/lib/db';
import { verifyApiAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        const db = getDatabase();
        const today = new Date().toISOString().slice(0, 10);
        const stats = getDayStats(db, today);
        const score = getDayScore(db, today);

        // Initial snapshot
        sendEvent('connected', { time: new Date().toISOString() });
        sendEvent('stats', stats);
        sendEvent('score', score);
      } catch (err) {
        console.error('SSE initialization error:', err);
      }

      // Keepalive heartbeat interval
      const interval = setInterval(() => {
        try {
          const db = getDatabase();
          const today = new Date().toISOString().slice(0, 10);
          const stats = getDayStats(db, today);
          const score = getDayScore(db, today);
          sendEvent('heartbeat', {
            ts: new Date().toISOString(),
            stats,
            score,
          });
        } catch {
          // ignore
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
