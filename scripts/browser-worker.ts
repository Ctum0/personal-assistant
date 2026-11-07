#!/usr/bin/env tsx
/**
 * Standalone Isolated Browser Worker Process for Sofia AI
 * Runs Chromium via Playwright behind a dedicated Egress Forward Proxy.
 *
 * Usage:
 *   npx tsx scripts/browser-worker.ts
 *   BROWSER_WORKER_PORT=9222 BROWSER_WORKER_SECRET=test-secret npx tsx scripts/browser-worker.ts
 */

import { startBrowserWorkerService } from '../src/server/browser-worker-service';

const PORT = parseInt(process.env.BROWSER_WORKER_PORT || '9222', 10);
const HOST = process.env.BROWSER_WORKER_HOST || '0.0.0.0';
const SECRET = process.env.BROWSER_WORKER_SECRET;

async function main() {
  console.log('[BrowserWorker] Initializing isolated browser worker...');
  const worker = await startBrowserWorkerService({
    port: PORT,
    host: HOST,
    workerSecret: SECRET,
  });

  console.log(`[BrowserWorker] Service listening on http://${HOST}:${PORT}`);
  console.log(`[BrowserWorker] Egress Forward Proxy active on ${worker.egressProxy.proxyUrl}`);
  console.log(`[BrowserWorker] Security: DNS pinning, SSRF/metadata blocking, password masking enabled`);
  if (SECRET) {
    console.log('[BrowserWorker] Authentication: Bearer token verification enforced');
  }

  process.on('SIGINT', async () => {
    console.log('\n[BrowserWorker] Stopping service...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[BrowserWorker] Terminating service...');
    await worker.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[BrowserWorker] Fatal startup error:', err);
  process.exit(1);
});
