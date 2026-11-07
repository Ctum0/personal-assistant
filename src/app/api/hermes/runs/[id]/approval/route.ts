import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getHermesClient } from '@/lib/hermes';
import { getDatabase } from '@/lib/db';
import { getRunRecord, updateRunRecord, resolveApproval } from '@/lib/hermes/registry';

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
    return NextResponse.json({ error: 'Missing run id' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { action, choice: rawChoice, tool_call_id, request_id, feedback, resolve_all } = body;
  const choice = rawChoice || (action === 'deny' ? 'deny' : action === 'approve' ? 'once' : '');
  const validChoices = ['once', 'session', 'always', 'deny', 'approve'];

  if (!choice || !validChoices.includes(choice)) {
    return NextResponse.json(
      { error: "Field 'choice' (or 'action') must be one of: 'once', 'session', 'always', 'deny', 'approve'" },
      { status: 400 }
    );
  }

  const db = getDatabase();
  const stored = getRunRecord(db, id, 'owner');
  if (!stored) {
    return NextResponse.json({ error: 'Run not found or unauthorized' }, { status: 404 });
  }

  // Look up pending approval for this run without FIFO/arbitrary LIMIT 1 matching
  const targetId = request_id || tool_call_id;
  let targetApproval: any;

  if (targetId) {
    targetApproval = db.prepare(
      "SELECT * FROM hermes_approvals WHERE (run_id = ? OR hermes_run_id = ?) AND (id = ? OR tool_call_id = ?) AND status IN ('pending', 'decision_submitted')"
    ).get(stored.id, stored.hermes_run_id, targetId, targetId);

    if (!targetApproval) {
      // Check if it was already decided
      const alreadyDecided = db.prepare(
        "SELECT * FROM hermes_approvals WHERE (run_id = ? OR hermes_run_id = ?) AND (id = ? OR tool_call_id = ?)"
      ).get(stored.id, stored.hermes_run_id, targetId, targetId);

      if (alreadyDecided) {
        targetApproval = alreadyDecided;
      }
    }
  } else {
    // Check how many pending approvals exist for this run
    const pendingRows = db.prepare(
      "SELECT * FROM hermes_approvals WHERE (run_id = ? OR hermes_run_id = ?) AND status IN ('pending', 'decision_submitted')"
    ).all(stored.id, stored.hermes_run_id) as any[];

    if (pendingRows.length > 1) {
      return NextResponse.json(
        {
          error: `Multiple pending approvals exist for this run (${pendingRows.length} pending). Explicit request_id or tool_call_id is required to avoid resolving the wrong action.`,
          pending_count: pendingRows.length,
        },
        { status: 400 }
      );
    }

    if (pendingRows.length === 1) {
      targetApproval = pendingRows[0];
    }
  }

  let approvalId = targetApproval?.id;
  const decision = choice === 'deny' ? 'denied' : 'approved';

  if (targetApproval) {
    // R3 risk acknowledgement check
    if (targetApproval.risk_level === 'R3' && decision === 'approved' && !body.confirmed_risk) {
      return NextResponse.json(
        {
          error: 'Explicit owner risk acknowledgement (confirmed_risk: true) is required for R3 high-consequence operations',
          risk_level: 'R3',
        },
        { status: 400 }
      );
    }

    // Set interim state
    const interimResult = resolveApproval(db, approvalId, 'decision_submitted', {
      approverId: 'owner',
      reason: feedback || (choice === 'deny' ? 'Owner denied' : 'Owner authorized'),
    });

    if (!interimResult.success) {
      const isConflict = interimResult.error?.includes('already in state') || interimResult.error?.includes('conflict');
      const status = isConflict ? 409 : 400;
      return NextResponse.json({ error: interimResult.error }, { status });
    }
  }

  try {
    const client = getHermesClient();
    const success = await client.approveRun(stored.hermes_run_id, {
      choice: choice as any,
      request_id: request_id || tool_call_id || approvalId,
      resolve_all,
      feedback,
    });

    if (approvalId) {
      resolveApproval(db, approvalId, decision, {
        approverId: 'owner',
        reason: feedback || (choice === 'deny' ? 'Owner denied' : 'Owner authorized'),
      });
    }

    if (success) {
      updateRunRecord(db, stored.id, {
        status: choice === 'deny' ? 'stopped' : 'running',
        progressMeta: {
          last_decision: choice,
          request_id: request_id || tool_call_id,
          approval_id: approvalId,
          decided_at: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      success,
      sofia_run_id: stored.id,
      hermes_run_id: stored.hermes_run_id,
      approval_id: approvalId,
      choice,
      action: choice === 'deny' ? 'deny' : 'approve',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Failed to submit approval to Hermes; decision remains retryable',
        can_retry: true,
        details: err.message || String(err),
      },
      { status: 502 }
    );
  }
}
