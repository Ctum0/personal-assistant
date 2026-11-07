import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { listAuditLog, verifyAuditLogChain } from '@/lib/hermes/registry';

export async function GET(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('run_id') || undefined;
  const eventType = searchParams.get('event_type') || undefined;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));

  const db = getDatabase();

  const records = listAuditLog(db, { limit, runId, eventType });
  const chainCheck = verifyAuditLogChain(db);

  return NextResponse.json({
    chain_valid: chainCheck.valid,
    chain_status: chainCheck.valid ? 'intact' : 'compromised',
    total_records: chainCheck.totalRecords,
    error: chainCheck.error,
    broken_seq: chainCheck.brokenSeq,
    records,
  });
}
