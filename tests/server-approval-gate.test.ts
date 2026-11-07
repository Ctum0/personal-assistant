import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { NextRequest } from 'next/server';
import {
  evaluateToolRisk,
  computeActionHash,
  canonicalizeJson,
  sanitizeArgumentsPreview,
} from '../src/lib/policy.risk';
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
  AUDIT_GENESIS_PREV_HASH,
} from '../src/lib/hermes/registry';
import { GET as getApprovals } from '../src/app/api/hermes/approvals/route';
import { GET as getApprovalById, POST as postApprovalDecision } from '../src/app/api/hermes/approvals/[id]/route';
import { GET as getAuditLog } from '../src/app/api/hermes/audit/route';
import * as dbModule from '../src/lib/db';

describe('Server-Enforced Approval Gate & Tamper-Evident Audit Log', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-token';
    process.env.HERMES_API_KEY = 'mock-key';
    process.env.HERMES_API_URL = 'https://mock.hermes.org';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createAuthedRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', 'Bearer test-token');
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      ...(init as any),
      headers,
    });
  }

  function createUnauthedRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), init as any);
  }

  // =========================================================================
  // 1. Centralized Risk Policy Evaluation
  // =========================================================================
  describe('Risk Policy Classification & Canonical Action Hashing', () => {
    it('evaluates R0 for safe read-only operations', () => {
      const evaluation = evaluateToolRisk('tasks_list');
      expect(evaluation.level).toBe('R0');
      expect(evaluation.requiresExplicitApproval).toBe(false);

      const timelineEval = evaluateToolRisk('timeline_list');
      expect(timelineEval.level).toBe('R0');

      const catEval = evaluateToolRisk('computer_run', { command: 'cat /etc/os-release' });
      expect(catEval.level).toBe('R0');
    });

    it('evaluates R1 for reversible workspace operations', () => {
      const evalAdd = evaluateToolRisk('tasks_add', { title: 'Review pull request' });
      expect(evalAdd.level).toBe('R1');
      expect(evalAdd.requiresExplicitApproval).toBe(false);

      const evalRemember = evaluateToolRisk('remember', { note: 'Favorite editor is neovim' });
      expect(evalRemember.level).toBe('R1');
    });

    it('evaluates R2 for external communication and side effects', () => {
      const evalSchedule = evaluateToolRisk('hermes_schedule_add', { cron: '0 9 * * *' });
      expect(evalSchedule.level).toBe('R2');
      expect(evalSchedule.requiresExplicitApproval).toBe(true);

      const evalBrowse = evaluateToolRisk('browse_url', { url: 'https://example.com' });
      expect(evalBrowse.level).toBe('R2');
      expect(evalBrowse.requiresExplicitApproval).toBe(true);
    });

    it('evaluates R3 for destructive actions, credential access, or system alteration', () => {
      const evalRm = evaluateToolRisk('computer_run', { command: 'rm -rf /var/data' });
      expect(evalRm.level).toBe('R3');
      expect(evalRm.requiresExplicitApproval).toBe(true);

      const evalSudo = evaluateToolRisk('computer_run', { command: 'sudo systemctl restart nginx' });
      expect(evalSudo.level).toBe('R3');
      expect(evalSudo.requiresExplicitApproval).toBe(true);

      const evalSqlDrop = evaluateToolRisk('database_query', { query: 'DROP TABLE users CASCADE;' });
      expect(evalSqlDrop.level).toBe('R3');

      const evalSecret = evaluateToolRisk('computer_run', { command: 'cat ~/.ssh/id_rsa' });
      expect(evalSecret.level).toBe('R3');
    });

    it('enforces default-deny for unknown tools', () => {
      const unknownEval = evaluateToolRisk('some_unrecognized_custom_tool', { foo: 'bar' });
      expect(unknownEval.level).toBe('R2');
      expect(unknownEval.requiresExplicitApproval).toBe(true);
      expect(unknownEval.reason).toContain('Default-deny policy');
    });

    it('computes deterministic canonical action hash regardless of object key order', () => {
      const hashA = computeActionHash('computer_run', { command: 'ls', timeout: 5000 });
      const hashB = computeActionHash('computer_run', { timeout: 5000, command: 'ls' });
      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{64}$/);

      const diffHash = computeActionHash('computer_run', { command: 'rm -rf /tmp' });
      expect(diffHash).not.toBe(hashA);
    });

    it('sanitizes arguments preview by masking secrets and trimming giant payloads', () => {
      const preview = sanitizeArgumentsPreview({
        token: 'super-secret-auth-bearer',
        nested: { password: 'my-db-password', safeField: 'hello' },
        giantLog: 'A'.repeat(500),
      });

      expect(preview.token).toBe('[REDACTED]');
      expect(preview.nested.password).toBe('[REDACTED]');
      expect(preview.nested.safeField).toBe('hello');
      expect(preview.giantLog.length).toBeLessThan(350);
    });
  });

  // =========================================================================
  // 2. Server-Enforced Approval Lifecycle & Security Invariants
  // =========================================================================
  describe('Server-Enforced Approval Lifecycle & Invariants', () => {
    it('mints unpredictable cryptographic approval IDs (appr_...) and persists hash binding', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_test_1',
        hermesRunId: 'hrun_test_1',
        conversationId: 'conv_main',
        toolName: 'computer_run',
        parameters: { command: 'rm -rf /tmp/scratch' },
      });

      expect(req.id).toMatch(/^appr_\d+_[a-f0-9]+$/);
      expect(req.status).toBe('pending');
      expect(req.risk_level).toBe('R3');
      expect(req.action_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(new Date(req.expires_at).getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('enforces single-use atomic resolution: cannot resolve twice', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_test_2',
        hermesRunId: 'hrun_test_2',
        toolName: 'computer_run',
        parameters: { command: 'mkdir -p /tmp/test' },
      });

      const firstResolution = resolveApproval(db, req.id, 'approved', 'owner');
      expect(firstResolution).toBe(true);

      const secondResolution = resolveApproval(db, req.id, 'denied', 'owner');
      expect(secondResolution).toBe(false); // Second transition must fail

      const stored = getApprovalRecord(db, req.id);
      expect(stored?.status).toBe('approved');
    });

    it('rejects approval resolution when action hash mismatches (tamper attempt)', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_test_3',
        hermesRunId: 'hrun_test_3',
        toolName: 'computer_run',
        parameters: { command: 'echo "hello"' },
      });

      const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const result = resolveApproval(db, req.id, 'approved', { expectedActionHash: fakeHash });
      expect(result.success).toBe(false);

      const stored = getApprovalRecord(db, req.id);
      expect(stored?.status).toBe('pending');
    });

    it('automatically reaps expired approvals and blocks execution', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_test_4',
        hermesRunId: 'hrun_test_4',
        toolName: 'computer_run',
        parameters: { command: 'shutdown -r now' },
        expiresInSeconds: 0, // Immediately expired
      });

      // Small tick to ensure expiration timestamp is in the past
      const stored = getApprovalRecord(db, req.id);
      expect(stored?.status).toBe('expired');

      // Attempting to resolve an expired approval must fail
      const resolution = resolveApproval(db, req.id, 'approved', 'owner');
      expect(resolution).toBe(false);
    });

    it('marks executed outcome and prevents re-execution', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_test_5',
        hermesRunId: 'hrun_test_5',
        toolName: 'computer_run',
        parameters: { command: 'ls -la' },
      });

      resolveApproval(db, req.id, 'approved', 'owner');
      markApprovalExecuted(db, req.id, 'executed', 'exec_out_123');

      const stored = getApprovalRecord(db, req.id);
      expect(stored?.status).toBe('executed');
      expect(stored?.outcome_ref).toBe('exec_out_123');
    });
  });

  // =========================================================================
  // 3. Negative Security Tests (Execution Boundary Enforcement)
  // =========================================================================
  describe('Negative Security Gate: Execution Boundary Enforcement', () => {
    function canExecuteConsequentialAction(
      database: DatabaseSync,
      approvalId: string,
      expectedHash: string
    ): { allowed: boolean; reason: string } {
      const record = getApprovalRecord(database, approvalId);
      if (!record) {
        return { allowed: false, reason: 'approval_not_found' };
      }
      if (record.status !== 'approved') {
        return { allowed: false, reason: `invalid_status_${record.status}` };
      }
      if (record.action_hash !== expectedHash) {
        return { allowed: false, reason: 'action_hash_mismatch' };
      }
      if (new Date(record.expires_at).getTime() < Date.now()) {
        return { allowed: false, reason: 'approval_expired' };
      }
      return { allowed: true, reason: 'authorized' };
    }

    it('BLOCKS execution when approval record is absent', () => {
      const check = canExecuteConsequentialAction(db, 'appr_nonexistent', 'abc123hash');
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('approval_not_found');
    });

    it('BLOCKS execution when approval is still pending', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_neg_1',
        hermesRunId: 'hrun_neg_1',
        toolName: 'computer_run',
        parameters: { command: 'rm -rf /' },
      });

      const check = canExecuteConsequentialAction(db, req.id, req.action_hash);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('invalid_status_pending');
    });

    it('BLOCKS execution when approval was denied', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_neg_2',
        hermesRunId: 'hrun_neg_2',
        toolName: 'computer_run',
        parameters: { command: 'rm -rf /' },
      });

      resolveApproval(db, req.id, 'denied', 'owner');
      const check = canExecuteConsequentialAction(db, req.id, req.action_hash);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('invalid_status_denied');
    });

    it('BLOCKS execution when approval has expired', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_neg_3',
        hermesRunId: 'hrun_neg_3',
        toolName: 'computer_run',
        parameters: { command: 'rm -rf /' },
        expiresInSeconds: 0,
      });

      const check = canExecuteConsequentialAction(db, req.id, req.action_hash);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('invalid_status_expired');
    });

    it('BLOCKS execution when action parameters were modified (hash mismatch)', () => {
      const req = recordApprovalRequest(db, {
        runId: 'srun_neg_4',
        hermesRunId: 'hrun_neg_4',
        toolName: 'computer_run',
        parameters: { command: 'ls /tmp' },
      });

      resolveApproval(db, req.id, 'approved', 'owner');

      // Attacker attempts to substitute a destructive command under the same approval ID
      const tamperedHash = computeActionHash('computer_run', { command: 'rm -rf /tmp' });
      const check = canExecuteConsequentialAction(db, req.id, tamperedHash);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('action_hash_mismatch');
    });
  });

  // =========================================================================
  // 4. Tamper-Evident Audit Log Verification & Tamper Detection
  // =========================================================================
  describe('Tamper-Evident Audit Log Integrity', () => {
    it('creates monotonic sequence with SHA-256 previous hash chaining', () => {
      const entry1 = appendAuditLog(db, {
        eventType: 'approval_requested',
        runId: 'srun_chain_1',
        toolName: 'computer_run',
        actor: 'system',
        actionHash: 'hash111',
        outcome: 'pending',
      });

      expect(entry1.seq).toBe(1);
      expect(entry1.prev_hash).toBe(AUDIT_GENESIS_PREV_HASH);
      expect(entry1.record_hash).toMatch(/^[a-f0-9]{64}$/);

      const entry2 = appendAuditLog(db, {
        eventType: 'approval_granted',
        runId: 'srun_chain_1',
        toolName: 'computer_run',
        actor: 'owner',
        actionHash: 'hash111',
        outcome: 'approved',
      });

      expect(entry2.seq).toBe(2);
      expect(entry2.prev_hash).toBe(entry1.record_hash);

      const entry3 = appendAuditLog(db, {
        eventType: 'tool_executed',
        runId: 'srun_chain_1',
        toolName: 'computer_run',
        actor: 'hermes',
        actionHash: 'hash111',
        outcome: 'success',
      });

      expect(entry3.seq).toBe(3);
      expect(entry3.prev_hash).toBe(entry2.record_hash);

      // Verify chain
      const verification = verifyAuditLogChain(db);
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(3);
      expect(verification.brokenSeq).toBeUndefined();
    });

    it('DETECTS tampering when any audited record is modified', () => {
      appendAuditLog(db, {
        eventType: 'approval_requested',
        runId: 'srun_audit_mod',
        toolName: 'computer_run',
        actor: 'system',
        actionHash: 'hash_original',
        outcome: 'pending',
      });

      appendAuditLog(db, {
        eventType: 'approval_granted',
        runId: 'srun_audit_mod',
        toolName: 'computer_run',
        actor: 'owner',
        actionHash: 'hash_original',
        outcome: 'approved',
      });

      // Verify chain is valid initially
      expect(verifyAuditLogChain(db).valid).toBe(true);

      // Verify trigger blocks direct UPDATE at SQLite engine level
      expect(() => {
        db.prepare("UPDATE execution_audit_log SET tool_name = 'innocent_tool' WHERE seq = 1").run();
      }).toThrow(/append-only: UPDATE operations are strictly prohibited/);

      // Simulate offline disk tampering by temporarily dropping trigger
      db.exec('DROP TRIGGER trg_audit_log_prevent_update');
      db.prepare("UPDATE execution_audit_log SET tool_name = 'innocent_tool' WHERE seq = 1").run();

      const verification = verifyAuditLogChain(db);
      expect(verification.valid).toBe(false);
      expect(verification.brokenSeq).toBe(1);
      expect(verification.error).toContain('Record hash tampering detected at seq 1');
    });

    it('DETECTS tampering when a record is deleted from the sequence', () => {
      appendAuditLog(db, {
        eventType: 'approval_requested',
        runId: 'srun_del_1',
        toolName: 'tool_1',
        actor: 'system',
      });
      appendAuditLog(db, {
        eventType: 'approval_granted',
        runId: 'srun_del_1',
        toolName: 'tool_1',
        actor: 'owner',
      });
      appendAuditLog(db, {
        eventType: 'tool_executed',
        runId: 'srun_del_1',
        toolName: 'tool_1',
        actor: 'hermes',
      });

      expect(verifyAuditLogChain(db).valid).toBe(true);

      // Verify trigger blocks direct DELETE at SQLite engine level
      expect(() => {
        db.prepare('DELETE FROM execution_audit_log WHERE seq = 2').run();
      }).toThrow(/append-only: DELETE operations are strictly prohibited/);

      // Simulate offline deletion by temporarily dropping trigger
      db.exec('DROP TRIGGER trg_audit_log_prevent_delete');
      db.prepare('DELETE FROM execution_audit_log WHERE seq = 2').run();

      const verification = verifyAuditLogChain(db);
      expect(verification.valid).toBe(false);
      expect(verification.brokenSeq).toBe(3);
      expect(verification.error).toContain('Sequence discontinuity');
    });
  });

  // =========================================================================
  // 5. REST API Routes Verification
  // =========================================================================
  describe('Approval & Audit REST API Endpoints', () => {
    beforeEach(() => {
      vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
    });

    it('rejects unauthenticated requests with 401 across all approval endpoints', async () => {
      const unauthedReq = createUnauthedRequest('http://localhost:3000/api/hermes/approvals');
      const resList = await getApprovals(unauthedReq);
      expect(resList.status).toBe(401);

      const resAudit = await getAuditLog(unauthedReq);
      expect(resAudit.status).toBe(401);

      const resItem = await getApprovalById(unauthedReq, { params: Promise.resolve({ id: 'appr_test' }) });
      expect(resItem.status).toBe(401);

      const resDecision = await postApprovalDecision(unauthedReq, { params: Promise.resolve({ id: 'appr_test' }) });
      expect(resDecision.status).toBe(401);
    });

    it('returns 404 for non-existent approval ID', async () => {
      const req = createAuthedRequest('http://localhost:3000/api/hermes/approvals/appr_unknown');
      const res = await getApprovalById(req, { params: Promise.resolve({ id: 'appr_unknown' }) });
      expect(res.status).toBe(404);
    });

    it('lists pending approvals and resolves decision with Hermes gateway integration', async () => {
      const appr = recordApprovalRequest(db, {
        runId: 'srun_route_test',
        hermesRunId: 'hrun_route_test',
        conversationId: 'conv_route_test',
        toolName: 'computer_run',
        parameters: { command: 'systemctl status' },
      });

      // GET list pending
      const listReq = createAuthedRequest('http://localhost:3000/api/hermes/approvals?status=pending');
      const listRes = await getApprovals(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.approvals.some((a: any) => a.id === appr.id)).toBe(true);

      // Mock Hermes gateway approval call
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ acknowledged: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      // POST approve decision without confirmed_risk -> 400 for R3 tool
      const unconfirmedReq = createAuthedRequest(`http://localhost:3000/api/hermes/approvals/${appr.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          expected_action_hash: appr.action_hash,
          reason: 'Manual authorization by owner',
        }),
      });
      const unconfirmedRes = await postApprovalDecision(unconfirmedReq, { params: Promise.resolve({ id: appr.id }) });
      expect(unconfirmedRes.status).toBe(400);

      // POST approve decision with confirmed_risk: true -> 200
      const decisionReq = createAuthedRequest(`http://localhost:3000/api/hermes/approvals/${appr.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          expected_action_hash: appr.action_hash,
          confirmed_risk: true,
          reason: 'Manual authorization by owner',
        }),
      });

      const decisionRes = await postApprovalDecision(decisionReq, { params: Promise.resolve({ id: appr.id }) });
      expect(decisionRes.status).toBe(200);
      const decisionJson = await decisionRes.json();
      expect(decisionJson.success).toBe(true);
      expect(decisionJson.approval.status).toBe('approved');
      expect(decisionJson.approval.id).toBe(appr.id);

      // Verify audit log has recorded the event
      const auditEntries = listAuditLog(db, { runId: 'srun_route_test' });
      expect(auditEntries.some((e) => e.event_type === 'approval.granted')).toBe(true);
    });

    it('returns chain_valid: true via the audit API endpoint', async () => {
      appendAuditLog(db, {
        eventType: 'system_initialized',
        actor: 'system',
      });

      const req = createAuthedRequest('http://localhost:3000/api/hermes/audit');
      const res = await getAuditLog(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.chain_valid).toBe(true);
      expect(json.total_records).toBeGreaterThanOrEqual(1);
    });
  });
});
