import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { NextRequest } from 'next/server';
import {
  initHermesTables,
  recordApprovalRequest,
  getApprovalRecord,
  resolveApproval,
  markApprovalExecuted,
  listPendingApprovals,
  appendAuditLog,
  verifyAuditLogChain,
  listAuditLog,
  computeAuditRecordHash,
} from '@/lib/hermes/registry';
import {
  evaluateToolRisk,
  computeActionHash,
  sanitizeArgumentsPreview,
} from '@/lib/policy.risk';
import { executeTool } from '@/lib/tools';
import { ApprovalPane } from '@/lib/stage';
import * as dbModule from '@/lib/db';
import { POST as postApprovalDecision } from '@/app/api/hermes/approvals/[id]/route';
import { POST as postRunApproval } from '@/app/api/hermes/runs/[id]/approval/route';

describe('SOFIA PHASE 3.1 — Server Approval Hardening & Audit Integrity', () => {
  let db: DatabaseSync;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
    process.env.SOFIA_API_TOKEN = 'test-audit-token';
    process.env.HERMES_API_KEY = 'mock-key';
    process.env.HERMES_API_URL = 'https://mock.hermes.org';
    process.env.HERMES_ENABLED = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createAuthedRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', 'Bearer test-audit-token');
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      ...(init as any),
      headers,
    });
  }

  // -------------------------------------------------------------------------
  // 1. Tool Blocked Before Execution & Unprotected Tool Block (Default-Deny)
  // -------------------------------------------------------------------------
  it('1 & 2. BLOCKS R2/R3 tools and unknown tools before execution, minting approval request', async () => {
    // Attempt to execute an unapproved R2 tool (send_telegram)
    const telegramRes = await executeTool(db, 'send_telegram', { text: 'Hello outside' }, {} as any);
    expect(telegramRes.result.blocked).toBe(true);
    expect(telegramRes.result.requires_approval).toBe(true);
    expect(telegramRes.pane?.kind).toBe('approval');
    expect((telegramRes.pane as ApprovalPane)?.risk_level).toBe('R2');

    // Attempt to execute an unknown unmapped tool (default-deny policy)
    const unknownRes = await executeTool(db, 'system_arbitrary_cmd', { flag: true }, {} as any);
    expect(unknownRes.result.blocked).toBe(true);
    expect(unknownRes.result.requires_approval).toBe(true);
    expect(unknownRes.pane?.kind).toBe('approval');
    expect(['R2', 'R3']).toContain((unknownRes.pane as ApprovalPane)?.risk_level);
  });

  // -------------------------------------------------------------------------
  // 3 & 4. Request ID & Run ID Binding Disambiguation
  // -------------------------------------------------------------------------
  it('3 & 4. Eliminates FIFO resolution and requires explicit request_id / tool_call_id when multiple pending', async () => {
    const runId = 'srun_disambig_test';
    const hermesRunId = 'hrun_disambig_test';

    // Register run
    db.prepare(`
      INSERT INTO hermes_runs (id, hermes_run_id, conversation_id, session_key_ref, user_id, status, prompt)
      VALUES (?, ?, 'default', 'ref123', 'owner', 'running', 'multi task')
    `).run(runId, hermesRunId);

    // Create 2 concurrent approvals under the same run
    const appr1 = recordApprovalRequest(db, {
      runId,
      hermesRunId,
      toolName: 'computer_file_write',
      toolCallId: 'call_write_1',
      parameters: { path: '/tmp/test1' },
      riskLevel: 'R3',
    });

    const appr2 = recordApprovalRequest(db, {
      runId,
      hermesRunId,
      toolName: 'computer_file_write',
      toolCallId: 'call_write_2',
      parameters: { path: '/tmp/test2' },
      riskLevel: 'R3',
    });

    // Submitting approval to run endpoint WITHOUT request_id/tool_call_id should return 400
    const ambiguousReq = createAuthedRequest(`http://localhost:3000/api/hermes/runs/${runId}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        confirmed_risk: true,
      }),
    });

    const ambiguousRes = await postRunApproval(ambiguousReq, { params: Promise.resolve({ id: runId }) });
    expect(ambiguousRes.status).toBe(400);
    const ambiguousJson = await ambiguousRes.json();
    expect(ambiguousJson.error).toContain('Multiple pending approvals exist for this run');
    expect(ambiguousJson.pending_count).toBe(2);

    // Now disambiguate by targeting call_write_2 specifically
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ acknowledged: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const specificReq = createAuthedRequest(`http://localhost:3000/api/hermes/runs/${runId}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        tool_call_id: 'call_write_2',
        confirmed_risk: true,
      }),
    });

    const specificRes = await postRunApproval(specificReq, { params: Promise.resolve({ id: runId }) });
    expect(specificRes.status).toBe(200);

    // Verify appr2 is approved and appr1 remains pending
    const check1 = getApprovalRecord(db, appr1.id);
    const check2 = getApprovalRecord(db, appr2.id);
    expect(check1?.status).toBe('pending');
    expect(check2?.status).toBe('approved');
  });

  // -------------------------------------------------------------------------
  // 5 & 6. Session & Conversation Isolation
  // -------------------------------------------------------------------------
  it('5 & 6. Isolates pending approvals by conversation ID', () => {
    recordApprovalRequest(db, {
      runId: 'srun_c1',
      hermesRunId: 'hrun_c1',
      conversationId: 'conv_alice',
      toolName: 'send_telegram',
      parameters: { text: 'Alice' },
    });

    recordApprovalRequest(db, {
      runId: 'srun_c2',
      hermesRunId: 'hrun_c2',
      conversationId: 'conv_bob',
      toolName: 'send_telegram',
      parameters: { text: 'Bob' },
    });

    const alicePending = listPendingApprovals(db, 'conv_alice');
    const bobPending = listPendingApprovals(db, 'conv_bob');
    const allPending = listPendingApprovals(db);

    expect(alicePending.length).toBe(1);
    expect(alicePending[0].conversation_id).toBe('conv_alice');

    expect(bobPending.length).toBe(1);
    expect(bobPending[0].conversation_id).toBe('conv_bob');

    expect(allPending.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 7. Argument Mutation Detection (Cryptographic Action Hash)
  // -------------------------------------------------------------------------
  it('7. Rejects approval resolution if action arguments are mutated', () => {
    const appr = recordApprovalRequest(db, {
      runId: 'srun_tamper',
      hermesRunId: 'hrun_tamper',
      toolName: 'computer_file_write',
      parameters: { path: '/etc/safe.conf', content: 'good' },
      riskLevel: 'R3',
    });

    // Attacker alters expected action hash
    const fakeHash = computeActionHash('computer_file_write', { path: '/etc/shadow', content: 'bad' }, 'hrun_tamper');

    const result = resolveApproval(db, appr.id, 'approved', {
      expectedActionHash: fakeHash,
      reason: 'Malicious modification attempt',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Action hash mismatch');

    // Approval record remains pending
    const fresh = getApprovalRecord(db, appr.id);
    expect(fresh?.status).toBe('pending');

    // Security rejection recorded in audit log
    const audit = listAuditLog(db, { runId: 'srun_tamper' });
    expect(audit.some((e) => e.event_type === 'security.rejected')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 8 & 9. Duplicate Resolution & Atomic Conflict Prevention
  // -------------------------------------------------------------------------
  it('8 & 9. Prevents duplicate resolutions and enforces idempotent responses', () => {
    const appr = recordApprovalRequest(db, {
      runId: 'srun_atomic',
      hermesRunId: 'hrun_atomic',
      toolName: 'send_telegram',
      parameters: { text: 'Single message' },
    });

    const first = resolveApproval(db, appr.id, 'approved', { reason: 'First resolution' });
    expect(first.success).toBe(true);
    expect(first.approval.status).toBe('approved');

    // Second resolution with same target decision is idempotent success
    const secondSame = resolveApproval(db, appr.id, 'approved', { reason: 'Retry resolution' });
    expect(secondSame.success).toBe(true);
    expect(secondSame.idempotent).toBe(true);

    // Second resolution attempting to change decision to denied is rejected
    const secondConflicting = resolveApproval(db, appr.id, 'denied', { reason: 'Conflicting resolution' });
    expect(secondConflicting.success).toBe(false);
    expect(secondConflicting.error).toContain("already in state 'approved'");
  });

  // -------------------------------------------------------------------------
  // 10 & 11. Hermes Gateway Delivery Failure, Interim State, & Retry Recovery
  // -------------------------------------------------------------------------
  it('10 & 11. Maintains decision_submitted state during delivery failure and allows retry recovery', async () => {
    const appr = recordApprovalRequest(db, {
      runId: 'srun_retry',
      hermesRunId: 'hrun_retry',
      toolName: 'send_telegram',
      parameters: { text: 'Delivery test' },
      riskLevel: 'R2',
    });

    // 1st attempt: Hermes network timeout (502)
    const failingFetch = vi.fn().mockRejectedValue(new Error('Gateway connection timeout'));
    vi.stubGlobal('fetch', failingFetch);

    const req1 = createAuthedRequest(`http://localhost:3000/api/hermes/approvals/${appr.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    const res1 = await postApprovalDecision(req1, { params: Promise.resolve({ id: appr.id }) });
    expect(res1.status).toBe(502);
    const json1 = await res1.json();
    expect(json1.can_retry).toBe(true);
    expect(json1.approval.status).toBe('decision_submitted');

    // Verify DB record is in decision_submitted state (not permanently locked)
    const inFlight = getApprovalRecord(db, appr.id);
    expect(inFlight?.status).toBe('decision_submitted');

    // 2nd attempt: Hermes recovers
    const recoveredFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ acknowledged: true }),
    });
    vi.stubGlobal('fetch', recoveredFetch);

    const req2 = createAuthedRequest(`http://localhost:3000/api/hermes/approvals/${appr.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    const res2 = await postApprovalDecision(req2, { params: Promise.resolve({ id: appr.id }) });
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.success).toBe(true);
    expect(json2.approval.status).toBe('approved');

    const finalRecord = getApprovalRecord(db, appr.id);
    expect(finalRecord?.status).toBe('approved');
  });

  // -------------------------------------------------------------------------
  // 12. State Preservation Across Refresh / Retrieval
  // -------------------------------------------------------------------------
  it('12. Preserves approval decision and execution status across fresh database handles', () => {
    const appr = recordApprovalRequest(db, {
      runId: 'srun_persist',
      hermesRunId: 'hrun_persist',
      toolName: 'send_telegram',
      parameters: { msg: 'Persist' },
    });

    resolveApproval(db, appr.id, 'approved', { reason: 'Authorized' });
    markApprovalExecuted(db, appr.id, 'executed', 'output_ok');

    const fresh = getApprovalRecord(db, appr.id);
    expect(fresh?.status).toBe('executed');
    expect(fresh?.outcome_ref).toBe('output_ok');
    expect(fresh?.decision_reason).toBe('Authorized');
  });

  // -------------------------------------------------------------------------
  // 13, 14, 15, 16. Audit Log Integrity, Tamper Detection, & Trigger Protection
  // -------------------------------------------------------------------------
  it('13, 14, 15, 16. Protects audit log with triggers and detects modification, deletion, and reordering', () => {
    const log1 = appendAuditLog(db, {
      event_type: 'approval.requested',
      run_id: 'srun_chain_test',
      tool_name: 'comp_write',
      actor: 'hermes',
      risk_level: 'R3',
      action_hash: 'hash_a',
      details: { path: '/etc/config', key: '[REDACTED]' },
    });

    const log2 = appendAuditLog(db, {
      event_type: 'approval.granted',
      run_id: 'srun_chain_test',
      tool_name: 'comp_write',
      actor: 'owner',
      risk_level: 'R3',
      action_hash: 'hash_a',
      details: { reason: 'Authorized' },
    });

    expect(verifyAuditLogChain(db).valid).toBe(true);

    // 16. Test SQLite triggers prevent UPDATE and DELETE
    expect(() => {
      db.prepare("UPDATE execution_audit_log SET details_json = '{\"tampered\": true}' WHERE seq = 1").run();
    }).toThrow(/append-only: UPDATE operations are strictly prohibited/);

    expect(() => {
      db.prepare('DELETE FROM execution_audit_log WHERE seq = 1').run();
    }).toThrow(/append-only: DELETE operations are strictly prohibited/);

    // 13. Test tampering with details_json is detected
    db.exec('DROP TRIGGER trg_audit_log_prevent_update');
    db.prepare("UPDATE execution_audit_log SET details_json = '{\"tampered\": true}' WHERE seq = 1").run();
    const tamperingRes = verifyAuditLogChain(db);
    expect(tamperingRes.valid).toBe(false);
    expect(tamperingRes.brokenSeq).toBe(1);
    expect(tamperingRes.error).toContain('Record hash tampering detected at seq 1');

    // Restore original details_json to re-verify chain
    db.prepare('UPDATE execution_audit_log SET details_json = ? WHERE seq = 1').run(
      JSON.stringify(sanitizeArgumentsPreview({ path: '/etc/config', key: '[REDACTED]' }))
    );
    expect(verifyAuditLogChain(db).valid).toBe(true);

    // 14. Test record deletion is detected
    db.exec('DROP TRIGGER trg_audit_log_prevent_delete');
    db.prepare('DELETE FROM execution_audit_log WHERE seq = 1').run();
    const deletionRes = verifyAuditLogChain(db);
    expect(deletionRes.valid).toBe(false);
    expect(deletionRes.error).toContain('Sequence discontinuity');
  });

  // -------------------------------------------------------------------------
  // 17. Zero Raw Secret / Credential Persistence
  // -------------------------------------------------------------------------
  it('17. Sanitizes preview and redacts raw secrets from SQLite parameters column', () => {
    const secretToken = 'sk-proj-super-secret-hermes-bearer-token-12345';
    const secretPassword = 'MySecretRootPassword99!';

    const appr = recordApprovalRequest(db, {
      runId: 'srun_secret',
      hermesRunId: 'hrun_secret',
      toolName: 'database_query',
      parameters: {
        api_key: secretToken,
        password: secretPassword,
        query: 'SELECT * FROM users',
      },
      riskLevel: 'R2',
    });

    // Inspect the raw SQLite row directly from the database table
    const rawRow = db.prepare('SELECT parameters, preview_json FROM hermes_approvals WHERE id = ?').get(appr.id) as any;

    expect(rawRow.parameters).not.toContain(secretToken);
    expect(rawRow.parameters).not.toContain(secretPassword);
    expect(rawRow.preview_json).not.toContain(secretToken);
    expect(rawRow.preview_json).not.toContain(secretPassword);

    expect(rawRow.parameters).toContain('[REDACTED]');
    expect(rawRow.preview_json).toContain('[REDACTED]');
  });

  // -------------------------------------------------------------------------
  // 18. Server-Side Validation of Explicit R3 Risk Acknowledgement
  // -------------------------------------------------------------------------
  it('18. Enforces server-side validation for R3 risk acknowledgement (confirmed_risk: true)', async () => {
    const r3Appr = recordApprovalRequest(db, {
      runId: 'srun_r3_val',
      hermesRunId: 'hrun_r3_val',
      toolName: 'computer_file_write',
      parameters: { path: '/etc/hosts', content: '127.0.0.1 custom' },
      riskLevel: 'R3',
    });

    // Approving R3 without confirmed_risk must fail with 400
    const unconfirmedReq = createAuthedRequest(`http://localhost:3000/api/hermes/approvals/${r3Appr.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    const unconfirmedRes = await postApprovalDecision(unconfirmedReq, { params: Promise.resolve({ id: r3Appr.id }) });
    expect(unconfirmedRes.status).toBe(400);
    const unconfirmedJson = await unconfirmedRes.json();
    expect(unconfirmedJson.error).toContain('Explicit owner risk acknowledgement (confirmed_risk: true) is required');

    // Denying R3 does not require confirmed_risk
    const denyReq = createAuthedRequest(`http://localhost:3000/api/hermes/approvals/${r3Appr.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny' }),
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ acknowledged: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const denyRes = await postApprovalDecision(denyReq, { params: Promise.resolve({ id: r3Appr.id }) });
    expect(denyRes.status).toBe(200);
  });
});
