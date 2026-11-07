import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { listPendingApprovals, listApprovalHistory } from '@/lib/hermes/registry';

export async function GET(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const conversationId = searchParams.get('conversation_id') || undefined;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 30));

  const db = getDatabase();

  if (!statusFilter || statusFilter === 'pending') {
    const pending = listPendingApprovals(db, conversationId);
    return NextResponse.json({
      approvals: pending,
      count: pending.length,
    });
  }

  const history = listApprovalHistory(db, {
    status: statusFilter,
    conversationId,
    limit,
  });

  return NextResponse.json({
    approvals: history,
    count: history.length,
  });
}
