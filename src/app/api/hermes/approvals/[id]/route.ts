import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import {
  getApprovalRecord,
  resolveApproval,
  getRunRecord,
  updateRunRecord,
} from '@/lib/hermes/registry';
import { getHermesClient } from '@/lib/hermes';

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
    return NextResponse.json({ error: 'Missing approval id' }, { status: 400 });
  }

  const db = getDatabase();
  const record = getApprovalRecord(db, id);

  if (!record) {
    return NextResponse.json({ error: 'Approval record not found' }, { status: 404 });
  }

  return NextResponse.json({ approval: record });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing approval id' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { action, reason, expected_action_hash, confirmed_risk } = body;
  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json(
      { error: "Field 'action' must be 'approve' or 'deny'" },
      { status: 400 }
    );
  }

  const db = getDatabase();
  const record = getApprovalRecord(db, id);

  if (!record) {
    return NextResponse.json({ error: 'Approval record not found' }, { status: 404 });
  }

  // Server-side enforcement: R3 high-consequence operations require explicit risk confirmation
  if (record.risk_level === 'R3' && action === 'approve' && !confirmed_risk) {
    return NextResponse.json(
      {
        error: 'Explicit owner risk acknowledgement (confirmed_risk: true) is required for R3 high-consequence operations',
        risk_level: 'R3',
      },
      { status: 400 }
    );
  }

  // Idempotency check: if already decided to the exact requested decision, return success immediately
  const targetDecision = action === 'approve' ? 'approved' : 'denied';
  if (record.status === targetDecision) {
    return NextResponse.json({
      success: true,
      approval: record,
      hermes_notified: true,
      idempotent: true,
    });
  }

  // Transition to interim 'decision_submitted' status before calling Hermes
  // This validates expected_action_hash and non-expiry, while keeping the record retryable if delivery fails
  const interim = resolveApproval(db, id, 'decision_submitted', {
    reason,
    approverId: 'owner',
    expectedActionHash: expected_action_hash,
  });

  if (!interim.success) {
    const isConflict = interim.error?.includes('already in state') || interim.error?.includes('conflict');
    const isMismatch = interim.error?.includes('mismatch');
    const status = isMismatch ? 403 : isConflict ? 409 : 400;
    return NextResponse.json({ error: interim.error }, { status });
  }

  // Submit decision to the Hermes execution engine
  try {
    const client = getHermesClient();
    const hermesChoice = action === 'approve' ? 'once' : 'deny';

    const success = await client.approveRun(record.hermes_run_id, {
      choice: hermesChoice as any,
      request_id: record.tool_call_id || record.id,
      feedback: reason,
    });

    // Commit final status to approved/denied upon successful delivery
    const finalResolved = resolveApproval(db, id, targetDecision, {
      reason,
      approverId: 'owner',
      expectedActionHash: expected_action_hash,
    });

    // Update associated run record status
    const run = getRunRecord(db, record.run_id, 'owner');
    if (run) {
      updateRunRecord(db, run.id, {
        status: action === 'deny' ? 'stopped' : 'running',
        progressMeta: {
          last_approval_id: id,
          last_decision: action,
          decided_at: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      approval: finalResolved.approval || record,
      hermes_notified: success,
    });
  } catch (err: any) {
    // Hermes communication failed - keep record in decision_submitted state so client can retry without conflict
    return NextResponse.json(
      {
        success: false,
        can_retry: true,
        error: 'Failed to notify Hermes execution engine; approval remains in decision_submitted state and can be retried',
        details: err.message || String(err),
        approval: interim.approval,
      },
      { status: 502 }
    );
  }
}
