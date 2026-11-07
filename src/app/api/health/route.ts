import { NextResponse } from 'next/server';
import { getDatabase, getDayStats } from '@/lib/db';
import { getHermesConfig } from '@/lib/hermes/config';
import { getHermesClient } from '@/lib/hermes';

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  let dbOk = false;
  let coverage = 0;

  try {
    const db = getDatabase();
    const row = db.prepare('SELECT 1 as alive').get() as { alive: number } | undefined;
    dbOk = row?.alive === 1;

    const stats = getDayStats(db, today);
    coverage = stats?.coverage ?? 0;
  } catch {
    dbOk = false;
  }

  // Hermes Authoritative Intelligence Check
  const hermesConfig = getHermesConfig();
  const rotationPending = process.env.HERMES_ROTATION_PENDING === 'true';

  let hermesConfigured = Boolean(hermesConfig.enabled && hermesConfig.apiKey && hermesConfig.baseUrl);
  let hermesReachable = false;
  let canSubmitRuns = false;
  let hermesStatus: 'ready' | 'degraded' | 'not_configured' | 'unreachable' | 'blocked_on_owner_action' =
    hermesConfigured ? 'degraded' : 'not_configured';

  if (rotationPending) {
    hermesStatus = 'blocked_on_owner_action';
  } else if (hermesConfigured) {
    try {
      const client = getHermesClient();
      // Capability check without executing a model turn
      const caps = await client.getCapabilities();
      hermesReachable = true;
      canSubmitRuns = Boolean(
        caps && (
          caps.features?.run_submission ||
          caps.endpoints?.runs ||
          caps.endpoints?.['runs.create'] ||
          caps.endpoints?.['/v1/runs']
        )
      );
      hermesStatus = canSubmitRuns ? 'ready' : 'degraded';
    } catch {
      hermesReachable = false;
      canSubmitRuns = false;
      hermesStatus = 'unreachable';
    }
  }

  // Brain is true ONLY if Hermes is reachable and capability endpoint confirms run submission.
  // A configured URL alone never makes brain: true.
  const brainOk = Boolean(hermesConfigured && hermesReachable && canSubmitRuns);
  const ok = Boolean(dbOk && brainOk);

  return NextResponse.json({
    ok,
    db: dbOk,
    brain: brainOk,
    hermes: {
      configured: hermesConfigured,
      reachable: hermesReachable,
      canSubmitRuns,
      status: hermesStatus,
      endpoint: hermesConfig.baseUrl ? hermesConfig.baseUrl.replace(/\/+$/, '') : null,
    },
    coverage,
    timestamp: new Date().toISOString(),
  });
}
