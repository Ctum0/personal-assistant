import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  initHermesTables,
  registerRun,
  getRunRecord,
  updateRunRecord,
  listRunRecords,
  getOrCreateHermesSession,
  recordApprovalRequest,
  resolveApproval,
  hashSessionKey,
} from '../src/lib/hermes/registry';

describe('Hermes SQLite Registry & Session Mapping', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
  });

  it('initializes Hermes tables properly', () => {
    const runsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hermes_runs'")
      .get();
    expect(runsTable).toBeDefined();

    const sessionsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hermes_sessions'")
      .get();
    expect(sessionsTable).toBeDefined();

    const approvalsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hermes_approvals'")
      .get();
    expect(approvalsTable).toBeDefined();
  });

  it('registers and retrieves a run record with IDOR protection', () => {
    const sessionKeyRef = hashSessionKey('secret-session-key');
    const created = registerRun(db, {
      id: 'srun_123',
      hermesRunId: 'hrun_abc',
      conversationId: 'conv_1',
      sessionKeyRef,
      userId: 'owner',
      status: 'started',
      prompt: 'Check system status',
    });

    expect(created.id).toBe('srun_123');
    expect(created.status).toBe('started');

    // Retrieve as owner
    const retrieved = getRunRecord(db, 'srun_123', 'owner');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.hermes_run_id).toBe('hrun_abc');
    expect(retrieved?.session_key_ref).toBe(sessionKeyRef);

    // Retrieve by Hermes run ID
    const byHermesId = getRunRecord(db, 'hrun_abc', 'owner');
    expect(byHermesId?.id).toBe('srun_123');

    // IDOR protection: unauthorized user should get null
    const unauthorized = getRunRecord(db, 'srun_123', 'attacker');
    expect(unauthorized).toBeNull();
  });

  it('updates run record status, output, and completion', () => {
    registerRun(db, {
      id: 'srun_456',
      hermesRunId: 'hrun_def',
      conversationId: 'conv_1',
      sessionKeyRef: 'ref_1',
      userId: 'owner',
      status: 'running',
      prompt: 'Summarize issue #10',
    });

    const updated = updateRunRecord(db, 'srun_456', {
      status: 'completed',
      output: 'Issue #10 summary',
      progressMeta: { duration_s: 4.2 },
    });

    expect(updated?.status).toBe('completed');
    expect(updated?.output).toBe('Issue #10 summary');
    expect(updated?.progress_meta?.duration_s).toBe(4.2);
    expect(updated?.completed_at).toBeDefined();
  });

  it('lists run records with conversation and status filtering', () => {
    registerRun(db, {
      id: 'srun_1',
      hermesRunId: 'hrun_1',
      conversationId: 'conv_A',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'completed',
      prompt: 'Task 1',
    });
    registerRun(db, {
      id: 'srun_2',
      hermesRunId: 'hrun_2',
      conversationId: 'conv_A',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'running',
      prompt: 'Task 2',
    });
    registerRun(db, {
      id: 'srun_3',
      hermesRunId: 'hrun_3',
      conversationId: 'conv_B',
      sessionKeyRef: 'ref',
      userId: 'owner',
      status: 'completed',
      prompt: 'Task 3',
    });

    const convARuns = listRunRecords(db, { conversationId: 'conv_A', userId: 'owner' });
    expect(convARuns.length).toBe(2);

    const runningRuns = listRunRecords(db, { status: 'running', userId: 'owner' });
    expect(runningRuns.length).toBe(1);
    expect(runningRuns[0].id).toBe('srun_2');
  });

  it('binds text and voice channels of the same conversation to a single Hermes session', () => {
    const session1 = getOrCreateHermesSession(db, 'conv_main', 'my-key', 'text', 'owner');
    const session2 = getOrCreateHermesSession(db, 'conv_main', 'my-key', 'voice', 'owner');

    expect(session1.hermes_session_id).toBe(session2.hermes_session_id);
    expect(session1.conversation_id).toBe('conv_main');

    // Different conversation gets different session
    const session3 = getOrCreateHermesSession(db, 'conv_secondary', 'my-key', 'text', 'owner');
    expect(session3.hermes_session_id).not.toBe(session1.hermes_session_id);
  });

  it('records and resolves tool approvals', () => {
    const appr = recordApprovalRequest(db, {
      runId: 'srun_999',
      hermesRunId: 'hrun_999',
      toolName: 'computer_run',
      toolCallId: 'call_abc',
      parameters: { command: 'rm -rf /tmp/test' },
    });

    expect(appr.status).toBe('pending');
    expect(appr.tool_name).toBe('computer_run');

    const resolved = resolveApproval(db, appr.id, 'approved');
    expect(resolved).toBe(true);

    const reResolve = resolveApproval(db, appr.id, 'denied');
    expect(reResolve).toBe(false); // Already resolved
  });
});
