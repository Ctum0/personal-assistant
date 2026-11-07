import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { getBrowserSession, updateBrowserSession } from '@/lib/browser/session';
import { getBrowserManager } from '@/server/browser-manager';
import { evaluateToolRisk, computeActionHash } from '@/lib/policy.risk';
import { recordApprovalRequest, markApprovalExecuted } from '@/lib/hermes/registry';
import { BrowserActionRequest } from '@/lib/browser/types';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const { id } = await context.params;
  const db = getDatabase();
  const session = getBrowserSession(db, id, 'owner');

  if (!session) {
    return NextResponse.json({ error: 'Browser session not found or unauthorized' }, { status: 404 });
  }

  if (session.status === 'closed') {
    return NextResponse.json({ error: 'Browser session is closed' }, { status: 410 });
  }

  let body: BrowserActionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const action = body.action;
  const toolName = `browser_${action}`;

  // 1. Evaluate Consequential Risk & Enforcement Boundary
  const risk = evaluateToolRisk(toolName, body);

  let approvedRowId: string | null = null;

  if (risk.requiresApproval) {
    const actionHash = computeActionHash(toolName, body, id);

    // Look for valid matching approval in hermes_approvals
    const approvedRow = db.prepare(
      "SELECT id FROM hermes_approvals WHERE tool_name = ? AND action_hash = ? AND status = 'approved' ORDER BY decided_at DESC LIMIT 1"
    ).get(toolName, actionHash) as { id: string } | undefined;

    if (!approvedRow) {
      // Pre-execution block: Record approval request in Phase 3 gate
      const approvalRecord = recordApprovalRequest(db, {
        runId: `browser_exec_${Date.now()}`,
        hermesRunId: id,
        conversationId: session.conversation_id,
        toolName,
        parameters: body,
        riskLevel: risk.riskLevel,
      });

      return NextResponse.json(
        {
          blocked: true,
          requires_approval: true,
          approval_id: approvalRecord.id,
          risk_level: risk.riskLevel,
          action_hash: actionHash,
          reason: risk.reason,
          error: `Execution paused: '${toolName}' (${risk.riskLevel}) requires explicit human approval before execution.`,
        },
        { status: 403 }
      );
    }

    approvedRowId = approvedRow.id;
  }

  const manager = getBrowserManager();

  try {
    let result: any;

    switch (action) {
      case 'open':
      case 'navigate': {
        if (!body.url) {
          return NextResponse.json({ error: 'URL is required for navigate action' }, { status: 400 });
        }
        const nav = await manager.navigate(id, body.url);
        updateBrowserSession(db, id, { current_url: nav.url, title: nav.title });
        result = nav;
        break;
      }

      case 'back': {
        const ok = await manager.goBack(id);
        const info = await manager.getPageInfo(id);
        updateBrowserSession(db, id, { current_url: info.url, title: info.title });
        result = { success: ok, ...info };
        break;
      }

      case 'forward': {
        const ok = await manager.goForward(id);
        const info = await manager.getPageInfo(id);
        updateBrowserSession(db, id, { current_url: info.url, title: info.title });
        result = { success: ok, ...info };
        break;
      }

      case 'click': {
        const ok = await manager.click(id, { selector: body.selector, x: body.x, y: body.y });
        result = { clicked: ok };
        break;
      }

      case 'type': {
        if (body.text === undefined) {
          return NextResponse.json({ error: 'Text is required for type action' }, { status: 400 });
        }
        const ok = await manager.type(id, body.text, body.selector);
        result = { typed: ok, length: body.text.length };
        break;
      }

      case 'scroll': {
        const ok = await manager.scroll(id, body.direction || 'down', body.amount || 300);
        result = { scrolled: ok };
        break;
      }

      case 'press_key': {
        if (!body.key) {
          return NextResponse.json({ error: 'Key is required for press_key action' }, { status: 400 });
        }
        const ok = await manager.pressKey(id, body.key);
        result = { pressed: body.key, success: ok };
        break;
      }

      case 'wait': {
        const ok = await manager.wait(id, body.ms || 1000);
        result = { waited_ms: body.ms || 1000, success: ok };
        break;
      }

      case 'get_page_info': {
        result = await manager.getPageInfo(id);
        break;
      }

      case 'get_snapshot': {
        const snapshot = await manager.getSnapshot(id);
        result = { snapshot };
        break;
      }

      case 'screenshot': {
        const buf = await manager.screenshot(id);
        result = { screenshot: true, format: 'png', size: buf.length };
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown browser action '${action}'` }, { status: 400 });
    }

    if (approvedRowId) {
      markApprovalExecuted(db, approvedRowId, 'executed');
    }

    return NextResponse.json({ success: true, action, result });
  } catch (err: any) {
    if (approvedRowId) {
      markApprovalExecuted(db, approvedRowId, 'failed', err.message);
    }
    return NextResponse.json(
      { error: err.message || 'Browser action execution failed', action },
      { status: 500 }
    );
  }
}
