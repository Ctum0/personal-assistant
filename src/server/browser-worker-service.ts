import http from 'node:http';
import { BrowserManager, ScreencastFrame } from './browser-manager';
import { startBrowserEgressProxy, EgressProxyInstance } from './browser-egress-proxy';
import { BrowserInputEvent } from '../lib/browser/types';

export interface BrowserWorkerServiceOptions {
  port?: number;
  host?: string;
  workerSecret?: string;
}

export interface BrowserWorkerServiceInstance {
  server: http.Server;
  port: number;
  host: string;
  egressProxy: EgressProxyInstance;
  close: () => Promise<void>;
}

/**
 * Isolated Browser Worker Microservice.
 * Runs Chromium via Playwright behind a dedicated Egress Forward Proxy with IP pinning.
 * Authenticates all Next.js API requests via Bearer token.
 */
export async function startBrowserWorkerService(
  options: BrowserWorkerServiceOptions = {}
): Promise<BrowserWorkerServiceInstance> {
  const port = options.port || parseInt(process.env.BROWSER_WORKER_PORT || '9222', 10);
  const host = options.host || process.env.BROWSER_WORKER_HOST || '0.0.0.0';
  const expectedSecret = options.workerSecret || process.env.BROWSER_WORKER_SECRET;

  // 1. Start dedicated egress forward proxy for socket-level network boundaries
  const egressProxy = await startBrowserEgressProxy({ host: '127.0.0.1' });

  // 2. Initialize BrowserManager configured with the egress proxy
  const manager = BrowserManager.getInstance({
    proxyUrl: egressProxy.proxyUrl,
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint (unauthenticated for liveness probes)
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          worker: 'sofia-isolated-browser-worker',
          egressProxyUrl: egressProxy.proxyUrl,
          port,
        })
      );
      return;
    }

    // Authenticate all operational endpoints
    if (expectedSecret) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token || token !== expectedSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing worker authentication token' }));
        return;
      }
    }

    const readBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
          data += chunk;
          if (data.length > 5 * 1024 * 1024) {
            reject(new Error('Payload too large'));
          }
        });
        req.on('end', () => {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (e) {
            reject(new Error('Invalid JSON payload'));
          }
        });
        req.on('error', reject);
      });
    };

    try {
      // Path routing: /sessions/:id/...
      const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(\/.*)?$/);
      if (!sessionMatch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
        return;
      }

      const sessionId = decodeURIComponent(sessionMatch[1]);
      const subPath = sessionMatch[2] || '';

      // POST /sessions/:id/ensure
      if (req.method === 'POST' && (subPath === '/ensure' || subPath === '')) {
        const body = await readBody();
        await manager.ensureSession(sessionId, body.initialUrl || 'about:blank');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sessionId }));
        return;
      }

      // POST /sessions/:id/navigate
      if (req.method === 'POST' && subPath === '/navigate') {
        const body = await readBody();
        const result = await manager.navigate(sessionId, body.url);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /sessions/:id/back
      if (req.method === 'POST' && subPath === '/back') {
        const success = await manager.goBack(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // POST /sessions/:id/forward
      if (req.method === 'POST' && subPath === '/forward') {
        const success = await manager.goForward(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // POST /sessions/:id/click
      if (req.method === 'POST' && subPath === '/click') {
        const body = await readBody();
        const success = await manager.click(sessionId, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // POST /sessions/:id/type
      if (req.method === 'POST' && subPath === '/type') {
        const body = await readBody();
        const success = await manager.type(sessionId, body.text, body.selector);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // POST /sessions/:id/press_key
      if (req.method === 'POST' && subPath === '/press_key') {
        const body = await readBody();
        const success = await manager.pressKey(sessionId, body.key);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // POST /sessions/:id/scroll
      if (req.method === 'POST' && subPath === '/scroll') {
        const body = await readBody();
        const success = await manager.scroll(sessionId, body.direction, body.amount);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // POST /sessions/:id/wait
      if (req.method === 'POST' && subPath === '/wait') {
        const body = await readBody();
        const success = await manager.wait(sessionId, body.ms);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // GET /sessions/:id/page_info
      if (req.method === 'GET' && subPath === '/page_info') {
        const info = await manager.getPageInfo(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(info));
        return;
      }

      // GET /sessions/:id/snapshot
      if (req.method === 'GET' && subPath === '/snapshot') {
        const snapshot = await manager.getSnapshot(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ snapshot }));
        return;
      }

      // GET /sessions/:id/screenshot
      if (req.method === 'GET' && subPath === '/screenshot') {
        const buffer = await manager.screenshot(sessionId);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(buffer);
        return;
      }

      // POST /sessions/:id/input
      if (req.method === 'POST' && subPath === '/input') {
        const body = await readBody();
        const success = await manager.dispatchInput(sessionId, body.event as BrowserInputEvent);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // GET /sessions/:id/stream (SSE Screencast)
      if (req.method === 'GET' && subPath === '/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(': sse connected\n\n');

        // Bounded frame listener (drops stale frames if client is slow)
        let isWriting = false;
        const unsubscribe = manager.subscribeScreencast(sessionId, (frame: ScreencastFrame) => {
          if (isWriting) return; // Drop frame to prevent unbounded backpressure
          isWriting = true;
          try {
            res.write(`data: ${JSON.stringify(frame)}\n\n`);
          } catch {
            unsubscribe();
          } finally {
            isWriting = false;
          }
        });

        req.on('close', () => {
          unsubscribe();
        });
        return;
      }

      // DELETE /sessions/:id
      if (req.method === 'DELETE' && (subPath === '' || subPath === '/')) {
        await manager.closeSession(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sessionId }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown method/route: ${req.method} ${url.pathname}` }));
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Worker Internal Error' }));
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      resolve({
        server,
        port,
        host,
        egressProxy,
        close: async () => {
          await manager.closeAll();
          await egressProxy.close();
          return new Promise<void>((res) => {
            server.close(() => res());
          });
        },
      });
    });

    server.on('error', reject);
  });
}
