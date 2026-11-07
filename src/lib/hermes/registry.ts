import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import { getDatabase } from '../db';
import {
  evaluateToolRisk,
  computeActionHash,
  canonicalizeJson,
  sanitizeArgumentsPreview,
  RiskLevel,
  ApprovalStatus,
} from '../policy.risk';

export interface StoredRunRecord {
  id: string;
  hermes_run_id: string;
  conversation_id: string;
  hermes_session_id?: string;
  session_key_ref: string;
  user_id: string;
  status: 'queued' | 'started' | 'running' | 'completed' | 'failed' | 'stopped' | 'waiting_approval' | string;
  prompt: string;
  output?: string;
  error?: string;
  last_event_id?: string;
  progress_meta?: any;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface StoredHermesSession {
  conversation_id: string;
  hermes_session_id: string;
  session_key_ref: string;
  user_id: string;
  channel: 'text' | 'voice';
  created_at: string;
  updated_at: string;
}

export interface StoredApprovalRecord {
  id: string;
  run_id: string;
  hermes_run_id: string;
  conversation_id: string;
  tool_name: string;
  tool_call_id?: string;
  parameters?: any;
  preview: any;
  action_hash: string;
  risk_level: RiskLevel;
  status: ApprovalStatus;
  created_at: string;
  expires_at: string;
  decided_at?: string;
  decision_reason?: string;
  approver_id: string;
  outcome_ref?: string;
}

export interface StoredAuditLogRecord {
  id: string;
  seq: number;
  ts: string;
  event_type: string;
  run_id?: string;
  hermes_run_id?: string;
  conversation_id?: string;
  tool_call_id?: string;
  tool_name?: string;
  actor: 'owner' | 'hermes' | 'system';
  risk_level?: RiskLevel;
  action_hash?: string;
  outcome?: string;
  details?: any;
  prev_hash: string;
  record_hash: string;
}

export interface AuditLogInput {
  event_type?: string;
  eventType?: string;
  run_id?: string;
  runId?: string;
  hermes_run_id?: string;
  hermesRunId?: string;
  conversation_id?: string;
  conversationId?: string;
  tool_call_id?: string;
  toolCallId?: string;
  tool_name?: string;
  toolName?: string;
  actor: 'owner' | 'hermes' | 'system';
  risk_level?: RiskLevel;
  riskLevel?: RiskLevel;
  action_hash?: string;
  actionHash?: string;
  outcome?: string;
  details?: any;
}

export const AUDIT_GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Initializes Hermes persistent tables in SQLite.
 */
export function initHermesTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hermes_runs (
      id TEXT PRIMARY KEY,
      hermes_run_id TEXT UNIQUE,
      conversation_id TEXT NOT NULL,
      hermes_session_id TEXT,
      session_key_ref TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'owner',
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT,
      error TEXT,
      last_event_id TEXT,
      progress_meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_hermes_runs_conv ON hermes_runs(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_hermes_runs_status ON hermes_runs(status);
    CREATE INDEX IF NOT EXISTS idx_hermes_runs_user ON hermes_runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_hermes_runs_hermes_id ON hermes_runs(hermes_run_id);

    CREATE TABLE IF NOT EXISTS hermes_sessions (
      conversation_id TEXT PRIMARY KEY,
      hermes_session_id TEXT NOT NULL,
      session_key_ref TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'owner',
      channel TEXT NOT NULL DEFAULT 'text',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hermes_approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      hermes_run_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL DEFAULT 'default',
      tool_name TEXT NOT NULL,
      tool_call_id TEXT,
      parameters TEXT,
      preview_json TEXT NOT NULL DEFAULT '{}',
      action_hash TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL DEFAULT 'R2',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT '',
      decided_at TEXT,
      decision_reason TEXT,
      approver_id TEXT NOT NULL DEFAULT 'owner',
      outcome_ref TEXT
    );

    CREATE TABLE IF NOT EXISTS execution_audit_log (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL UNIQUE,
      ts TEXT NOT NULL,
      event_type TEXT NOT NULL,
      run_id TEXT,
      hermes_run_id TEXT,
      conversation_id TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      actor TEXT NOT NULL,
      risk_level TEXT,
      action_hash TEXT,
      outcome TEXT,
      details_json TEXT,
      prev_hash TEXT NOT NULL,
      record_hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_hermes_approvals_run ON hermes_approvals(run_id);
    CREATE INDEX IF NOT EXISTS idx_hermes_approvals_hermes_run ON hermes_approvals(hermes_run_id);
    CREATE INDEX IF NOT EXISTS idx_hermes_approvals_status ON hermes_approvals(status);
    CREATE INDEX IF NOT EXISTS idx_hermes_approvals_hash ON hermes_approvals(action_hash);
    CREATE INDEX IF NOT EXISTS idx_audit_log_seq ON execution_audit_log(seq);
    CREATE INDEX IF NOT EXISTS idx_audit_log_run ON execution_audit_log(run_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_event ON execution_audit_log(event_type);

    CREATE TRIGGER IF NOT EXISTS trg_audit_log_prevent_update
    BEFORE UPDATE ON execution_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'execution_audit_log is append-only: UPDATE operations are strictly prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_audit_log_prevent_delete
    BEFORE DELETE ON execution_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'execution_audit_log is append-only: DELETE operations are strictly prohibited');
    END;
  `);

  // Migration guards for table evolution
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'default'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN preview_json TEXT NOT NULL DEFAULT '{}'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN action_hash TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'R2'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN decision_reason TEXT"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN approver_id TEXT NOT NULL DEFAULT 'owner'"); } catch {}
  try { db.exec("ALTER TABLE hermes_approvals ADD COLUMN outcome_ref TEXT"); } catch {}
}

/**
 * Creates a hashed, non-secret reference of a session key.
 */
export function hashSessionKey(sessionKey: string): string {
  return crypto.createHash('sha256').update(sessionKey).digest('hex').slice(0, 16);
}

/**
 * Registers a newly created run in the persistent database.
 */
export function registerRun(
  db: DatabaseSync,
  data: {
    id: string;
    hermesRunId: string;
    conversationId: string;
    hermesSessionId?: string;
    sessionKeyRef: string;
    userId?: string;
    status: string;
    prompt: string;
  }
): StoredRunRecord {
  const now = new Date().toISOString();
  const userId = data.userId || 'owner';

  db.prepare(`
    INSERT OR REPLACE INTO hermes_runs (
      id, hermes_run_id, conversation_id, hermes_session_id, session_key_ref,
      user_id, status, prompt, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.hermesRunId,
    data.conversationId,
    data.hermesSessionId || null,
    data.sessionKeyRef,
    userId,
    data.status,
    data.prompt,
    now,
    now
  );

  return {
    id: data.id,
    hermes_run_id: data.hermesRunId,
    conversation_id: data.conversationId,
    hermes_session_id: data.hermesSessionId,
    session_key_ref: data.sessionKeyRef,
    user_id: userId,
    status: data.status,
    prompt: data.prompt,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Retrieves a stored run by Sofia run ID or Hermes run ID, validating ownership if userId is supplied.
 */
export function getRunRecord(
  db: DatabaseSync,
  runIdentifier: string,
  userId?: string
): StoredRunRecord | null {
  const stmt = db.prepare(`
    SELECT * FROM hermes_runs WHERE id = ? OR hermes_run_id = ? LIMIT 1
  `);
  const row = stmt.get(runIdentifier, runIdentifier) as any;
  if (!row) return null;

  if (userId && row.user_id !== userId) {
    return null; // IDOR protection
  }

  return {
    ...row,
    progress_meta: row.progress_meta ? JSON.parse(row.progress_meta) : undefined,
  };
}

/**
 * Updates an existing run record with latest Hermes status, output, or error.
 */
export function updateRunRecord(
  db: DatabaseSync,
  id: string,
  updates: {
    status?: string;
    output?: string;
    error?: string;
    lastEventId?: string;
    progressMeta?: any;
    completedAt?: string;
  }
): StoredRunRecord | null {
  const existing = getRunRecord(db, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const newStatus = updates.status || existing.status;
  const newOutput = updates.output !== undefined ? updates.output : existing.output;
  const newError = updates.error !== undefined ? updates.error : existing.error;
  const newLastEventId = updates.lastEventId !== undefined ? updates.lastEventId : existing.last_event_id;
  const newProgressMeta = updates.progressMeta !== undefined
    ? JSON.stringify(updates.progressMeta)
    : (existing.progress_meta ? JSON.stringify(existing.progress_meta) : null);
  const newCompletedAt = updates.completedAt || (['completed', 'failed', 'stopped'].includes(newStatus) ? now : existing.completed_at);

  db.prepare(`
    UPDATE hermes_runs SET
      status = ?, output = ?, error = ?, last_event_id = ?, progress_meta = ?,
      completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    newStatus,
    newOutput || null,
    newError || null,
    newLastEventId || null,
    newProgressMeta,
    newCompletedAt || null,
    now,
    existing.id
  );

  return getRunRecord(db, existing.id);
}

/**
 * Lists stored runs for a conversation or user.
 */
export function listRunRecords(
  db: DatabaseSync,
  filters: {
    conversationId?: string;
    status?: string;
    userId?: string;
    limit?: number;
  }
): StoredRunRecord[] {
  let query = 'SELECT * FROM hermes_runs WHERE 1=1';
  const params: any[] = [];

  if (filters.userId) {
    query += ' AND user_id = ?';
    params.push(filters.userId);
  }
  if (filters.conversationId) {
    query += ' AND conversation_id = ?';
    params.push(filters.conversationId);
  }
  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(filters.limit || 20);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    ...r,
    progress_meta: r.progress_meta ? JSON.parse(r.progress_meta) : undefined,
  }));
}

/**
 * Gets or creates a persistent session mapping for a conversation.
 * Ties both text and voice interactions of the same conversation to a stable Hermes session.
 */
export function getOrCreateHermesSession(
  db: DatabaseSync,
  conversationId: string,
  sessionKey: string,
  channel: 'text' | 'voice' = 'text',
  userId: string = 'owner'
): StoredHermesSession {
  const sessionKeyRef = hashSessionKey(sessionKey);
  const existing = db.prepare('SELECT * FROM hermes_sessions WHERE conversation_id = ?').get(conversationId) as any;

  if (existing) {
    if (existing.user_id !== userId) {
      throw new Error('Unauthorized conversation session access');
    }
    return existing as StoredHermesSession;
  }

  const now = new Date().toISOString();
  const hermesSessionId = `hsess_${conversationId.replace(/[^a-zA-Z0-9_-]/g, '')}_${Date.now()}`;

  db.prepare(`
    INSERT INTO hermes_sessions (conversation_id, hermes_session_id, session_key_ref, user_id, channel, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(conversationId, hermesSessionId, sessionKeyRef, userId, channel, now, now);

  return {
    conversation_id: conversationId,
    hermes_session_id: hermesSessionId,
    session_key_ref: sessionKeyRef,
    user_id: userId,
    channel,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Computes the tamper-evident hash for an audit log record.
 */
/**
 * Computes the tamper-evident canonical SHA-256 hash covering all 14 persisted database fields.
 */
export function computeAuditRecordHash(
  arg:
    | {
        seq: number;
        ts: string;
        event_type: string;
        run_id?: string | null;
        hermes_run_id?: string | null;
        conversation_id?: string | null;
        tool_call_id?: string | null;
        tool_name?: string | null;
        actor: string;
        risk_level?: string | null;
        action_hash?: string | null;
        outcome?: string | null;
        details_json?: string | null;
        prev_hash: string;
      }
    | number,
  ts?: string,
  eventType?: string,
  runId?: string,
  toolName?: string,
  actor?: string,
  actionHash?: string,
  outcome?: string,
  prevHash?: string,
  detailsJson?: string | null,
  hermesRunId?: string | null,
  conversationId?: string | null,
  toolCallId?: string | null,
  riskLevel?: string | null
): string {
  let record: {
    seq: number;
    ts: string;
    event_type: string;
    run_id?: string | null;
    hermes_run_id?: string | null;
    conversation_id?: string | null;
    tool_call_id?: string | null;
    tool_name?: string | null;
    actor: string;
    risk_level?: string | null;
    action_hash?: string | null;
    outcome?: string | null;
    details_json?: string | null;
    prev_hash: string;
  };

  if (typeof arg === 'object' && arg !== null) {
    record = {
      seq: arg.seq,
      ts: arg.ts,
      event_type: arg.event_type,
      run_id: arg.run_id || null,
      hermes_run_id: arg.hermes_run_id || null,
      conversation_id: arg.conversation_id || null,
      tool_call_id: arg.tool_call_id || null,
      tool_name: arg.tool_name || null,
      actor: arg.actor,
      risk_level: arg.risk_level || null,
      action_hash: arg.action_hash || null,
      outcome: arg.outcome || null,
      details_json: arg.details_json || null,
      prev_hash: arg.prev_hash,
    };
  } else {
    record = {
      seq: arg,
      ts: ts || '',
      event_type: eventType || 'event',
      run_id: runId || null,
      hermes_run_id: hermesRunId || null,
      conversation_id: conversationId || null,
      tool_call_id: toolCallId || null,
      tool_name: toolName || null,
      actor: actor || 'system',
      risk_level: riskLevel || null,
      action_hash: actionHash || null,
      outcome: outcome || null,
      details_json: detailsJson || null,
      prev_hash: prevHash || AUDIT_GENESIS_PREV_HASH,
    };
  }

  // Canonical serialization covering all 14 security-relevant database fields
  const canonicalPayload = canonicalizeJson({
    action_hash: record.action_hash,
    actor: record.actor,
    conversation_id: record.conversation_id,
    details_json: record.details_json,
    event_type: record.event_type,
    hermes_run_id: record.hermes_run_id,
    outcome: record.outcome,
    prev_hash: record.prev_hash,
    risk_level: record.risk_level,
    run_id: record.run_id,
    seq: record.seq,
    tool_call_id: record.tool_call_id,
    tool_name: record.tool_name,
    ts: record.ts,
  });

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

export interface AuditCheckpoint {
  seq: number;
  record_hash: string;
  ts: string;
}

let inMemoryCheckpoint: AuditCheckpoint | null = null;

export function updateAuditCheckpoint(record: { seq: number; record_hash: string; ts: string }): void {
  inMemoryCheckpoint = {
    seq: record.seq,
    record_hash: record.record_hash,
    ts: record.ts,
  };
}

export function getAuditCheckpoint(): AuditCheckpoint | null {
  return inMemoryCheckpoint;
}

/**
 * Appends a tamper-evident record to the append-only execution audit log.
 */
export function appendAuditLog(db: DatabaseSync, event: AuditLogInput): StoredAuditLogRecord {
  const id = `aud_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const ts = new Date().toISOString();

  // Retrieve the latest record for monotonic sequence and previous hash chaining
  const lastRow = db.prepare(
    'SELECT seq, record_hash FROM execution_audit_log ORDER BY seq DESC LIMIT 1'
  ).get() as { seq: number; record_hash: string } | undefined;

  const seq = lastRow ? lastRow.seq + 1 : 1;
  const prev_hash = lastRow ? lastRow.record_hash : AUDIT_GENESIS_PREV_HASH;

  const eventType = event.event_type || (event as any).eventType || 'event';
  const runId = event.run_id || (event as any).runId || null;
  const hermesRunId = event.hermes_run_id || (event as any).hermesRunId || null;
  const conversationId = event.conversation_id || (event as any).conversationId || null;
  const toolCallId = event.tool_call_id || (event as any).toolCallId || null;
  const toolName = event.tool_name || (event as any).toolName || null;
  const actor = event.actor || 'system';
  const riskLevel = event.risk_level || (event as any).riskLevel || null;
  const actionHash = event.action_hash || (event as any).actionHash || null;
  const outcome = event.outcome || null;

  const detailsJson = event.details
    ? (typeof event.details === 'string' ? event.details : JSON.stringify(sanitizeArgumentsPreview(event.details)))
    : null;

  const record_hash = computeAuditRecordHash({
    seq,
    ts,
    event_type: eventType,
    run_id: runId,
    hermes_run_id: hermesRunId,
    conversation_id: conversationId,
    tool_call_id: toolCallId,
    tool_name: toolName,
    actor,
    risk_level: riskLevel,
    action_hash: actionHash,
    outcome,
    details_json: detailsJson,
    prev_hash,
  });

  db.prepare(`
    INSERT INTO execution_audit_log (
      id, seq, ts, event_type, run_id, hermes_run_id, conversation_id,
      tool_call_id, tool_name, actor, risk_level, action_hash, outcome,
      details_json, prev_hash, record_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    seq,
    ts,
    eventType,
    runId,
    hermesRunId,
    conversationId,
    toolCallId,
    toolName,
    actor,
    riskLevel,
    actionHash,
    outcome,
    detailsJson,
    prev_hash,
    record_hash
  );

  updateAuditCheckpoint({ seq, record_hash, ts });

  return {
    id,
    seq,
    ts,
    event_type: eventType,
    run_id: runId || undefined,
    hermes_run_id: hermesRunId || undefined,
    conversation_id: conversationId || undefined,
    tool_call_id: toolCallId || undefined,
    tool_name: toolName || undefined,
    actor,
    risk_level: riskLevel || undefined,
    action_hash: actionHash || undefined,
    outcome: outcome || undefined,
    details: event.details,
    prev_hash,
    record_hash,
  };
}

/**
 * Verifies the mathematical integrity of the tamper-evident audit log chain.
 */
export function verifyAuditLogChain(db: DatabaseSync): {
  valid: boolean;
  totalRecords: number;
  error?: string;
  brokenSeq?: number;
} {
  const rows = db.prepare(
    'SELECT * FROM execution_audit_log ORDER BY seq ASC'
  ).all() as any[];

  if (rows.length === 0) {
    return { valid: true, totalRecords: 0 };
  }

  let expectedPrevHash = AUDIT_GENESIS_PREV_HASH;
  let expectedSeq = 1;

  for (const row of rows) {
    if (row.seq !== expectedSeq) {
      return {
        valid: false,
        totalRecords: rows.length,
        brokenSeq: row.seq,
        error: `Sequence discontinuity: expected seq ${expectedSeq}, found ${row.seq}`,
      };
    }

    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalRecords: rows.length,
        brokenSeq: row.seq,
        error: `Hash chain broken at seq ${row.seq}: prev_hash does not match previous record_hash`,
      };
    }

    const recomputedHash = computeAuditRecordHash({
      seq: row.seq,
      ts: row.ts,
      event_type: row.event_type,
      run_id: row.run_id || null,
      hermes_run_id: row.hermes_run_id || null,
      conversation_id: row.conversation_id || null,
      tool_call_id: row.tool_call_id || null,
      tool_name: row.tool_name || null,
      actor: row.actor,
      risk_level: row.risk_level || null,
      action_hash: row.action_hash || null,
      outcome: row.outcome || null,
      details_json: row.details_json || null,
      prev_hash: row.prev_hash,
    });

    if (recomputedHash !== row.record_hash) {
      return {
        valid: false,
        totalRecords: rows.length,
        brokenSeq: row.seq,
        error: `Record hash tampering detected at seq ${row.seq}: record_hash modified`,
      };
    }

    expectedPrevHash = row.record_hash;
    expectedSeq++;
  }

  return { valid: true, totalRecords: rows.length };
}

/**
 * Lists audit log records with optional filtering.
 */
export function listAuditLog(
  db: DatabaseSync,
  options: { limit?: number; runId?: string; eventType?: string } = {}
): StoredAuditLogRecord[] {
  let query = 'SELECT * FROM execution_audit_log WHERE 1=1';
  const params: any[] = [];

  if (options.runId) {
    query += ' AND (run_id = ? OR hermes_run_id = ?)';
    params.push(options.runId, options.runId);
  }
  if (options.eventType) {
    query += ' AND event_type = ?';
    params.push(options.eventType);
  }

  query += ' ORDER BY seq DESC LIMIT ?';
  params.push(options.limit || 50);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    ...r,
    details: r.details_json ? JSON.parse(r.details_json) : undefined,
  }));
}

/**
 * Records a server-minted pending tool approval request for a run.
 */
export function recordApprovalRequest(
  db: DatabaseSync,
  data: {
    runId: string;
    hermesRunId: string;
    conversationId?: string;
    toolName: string;
    toolCallId?: string;
    parameters?: any;
    expiresInMs?: number;
    expiresInSeconds?: number;
    riskLevel?: RiskLevel;
  }
): StoredApprovalRecord {
  // Unpredictable cryptographic approval ID
  const id = `appr_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date();
  const created_at = now.toISOString();
  const expiresInMs = data.expiresInMs ?? (data.expiresInSeconds !== undefined ? data.expiresInSeconds * 1000 : 600000);
  const expires_at = expiresInMs <= 0
    ? new Date(now.getTime() - 1000).toISOString()
    : new Date(now.getTime() + expiresInMs).toISOString();

  const conversation_id = data.conversationId || 'default';
  const riskEval = data.riskLevel ? { riskLevel: data.riskLevel } : evaluateToolRisk(data.toolName, data.parameters);
  const risk_level: RiskLevel = data.riskLevel || riskEval.riskLevel;

  const action_hash = computeActionHash(data.toolName, data.parameters || {}, data.hermesRunId);
  const preview = sanitizeArgumentsPreview(data.parameters || {});
  const preview_json = JSON.stringify(preview);
  // Guarantee zero raw credential/secret persistence by storing sanitized preview in parameters column
  const paramsStr = preview_json;

  db.prepare(`
    INSERT INTO hermes_approvals (
      id, run_id, hermes_run_id, conversation_id, tool_name, tool_call_id,
      parameters, preview_json, action_hash, risk_level, status,
      created_at, expires_at, approver_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'owner')
  `).run(
    id,
    data.runId,
    data.hermesRunId,
    conversation_id,
    data.toolName,
    data.toolCallId || null,
    paramsStr,
    preview_json,
    action_hash,
    risk_level,
    created_at,
    expires_at
  );

  // Record approval request in audit log
  appendAuditLog(db, {
    event_type: 'approval.requested',
    run_id: data.runId,
    hermes_run_id: data.hermesRunId,
    conversation_id,
    tool_call_id: data.toolCallId,
    tool_name: data.toolName,
    actor: 'hermes',
    risk_level,
    action_hash,
    details: { preview, expires_at },
  });

  return {
    id,
    run_id: data.runId,
    hermes_run_id: data.hermesRunId,
    conversation_id,
    tool_name: data.toolName,
    tool_call_id: data.toolCallId,
    parameters: data.parameters,
    preview,
    action_hash,
    risk_level,
    status: 'pending',
    created_at,
    expires_at,
    approver_id: 'owner',
  };
}

/**
 * Retrieves a stored approval record, automatically transitioning it to 'expired' if the deadline has passed.
 */
export function getApprovalRecord(db: DatabaseSync, approvalId: string): StoredApprovalRecord | null {
  const row = db.prepare('SELECT * FROM hermes_approvals WHERE id = ?').get(approvalId) as any;
  if (!row) return null;

  // Check expiration if still pending or decision_submitted
  if ((row.status === 'pending' || row.status === 'decision_submitted') && row.expires_at) {
    const expiresAtMs = new Date(row.expires_at).getTime();
    if (Date.now() > expiresAtMs) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE hermes_approvals SET status = 'expired', decided_at = ? WHERE id = ? AND status IN ('pending', 'decision_submitted')
      `).run(now, approvalId);
      row.status = 'expired';
      row.decided_at = now;

      appendAuditLog(db, {
        event_type: 'approval.expired',
        run_id: row.run_id,
        hermes_run_id: row.hermes_run_id,
        conversation_id: row.conversation_id,
        tool_call_id: row.tool_call_id,
        tool_name: row.tool_name,
        actor: 'system',
        risk_level: row.risk_level,
        action_hash: row.action_hash,
        outcome: 'expired',
      });
    }
  }

  return {
    id: row.id,
    run_id: row.run_id,
    hermes_run_id: row.hermes_run_id,
    conversation_id: row.conversation_id,
    tool_name: row.tool_name,
    tool_call_id: row.tool_call_id,
    parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
    preview: row.preview_json ? JSON.parse(row.preview_json) : {},
    action_hash: row.action_hash,
    risk_level: row.risk_level,
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
    decision_reason: row.decision_reason,
    approver_id: row.approver_id,
    outcome_ref: row.outcome_ref,
  };
}

/**
 * Resolves a pending approval record atomically (single-use, bound to action hash and non-expired).
 */
export function resolveApproval(
  db: DatabaseSync,
  approvalId: string,
  decision: 'approved' | 'denied' | 'decision_submitted',
  options?: string | {
    reason?: string;
    approverId?: string;
    expectedActionHash?: string;
  },
  approverIdArg?: string
): any {
  let reason: string | undefined;
  let approverId = 'owner';
  let expectedActionHash: string | undefined;
  const isObjectCall = Boolean(options && typeof options === 'object');

  if (typeof options === 'string') {
    reason = options;
    if (approverIdArg) approverId = approverIdArg;
  } else if (isObjectCall && typeof options === 'object') {
    reason = options.reason;
    approverId = options.approverId || 'owner';
    expectedActionHash = options.expectedActionHash;
  }

  const current = getApprovalRecord(db, approvalId);
  if (!current) {
    if (isObjectCall) return { success: false, error: 'Approval request not found' };
    return false;
  }

  // Idempotent resolution: if already in the target decision state, return success immediately
  if (current.status === decision) {
    if (isObjectCall) return { success: true, approval: current, idempotent: true };
    return true;
  }

  // Fail closed if expired
  if (current.status === 'expired') {
    if (isObjectCall) return { success: false, error: 'Approval request has expired and cannot be approved' };
    return false;
  }

  // Allow transitioning from 'pending' or 'decision_submitted'
  // If current status is terminal ('approved', 'denied', 'executed', 'failed'), disallow modification
  const resolvableStates = ['pending', 'decision_submitted'];
  if (!resolvableStates.includes(current.status)) {
    if (isObjectCall) return { success: false, error: `Approval request is already in state '${current.status}'` };
    return false;
  }

  // Cryptographic action binding verification: verify action has not been modified
  if (expectedActionHash && expectedActionHash !== current.action_hash) {
    appendAuditLog(db, {
      event_type: 'security.rejected',
      run_id: current.run_id,
      hermes_run_id: current.hermes_run_id,
      conversation_id: current.conversation_id,
      tool_call_id: current.tool_call_id,
      tool_name: current.tool_name,
      actor: approverId as any,
      risk_level: current.risk_level,
      action_hash: expectedActionHash,
      outcome: 'hash_mismatch',
      details: { expected: current.action_hash, provided: expectedActionHash },
    });
    if (isObjectCall) return { success: false, error: 'Action hash mismatch: arguments or target modified' };
    return false;
  }

  const now = new Date().toISOString();
  const decisionReason = reason || (
    decision === 'approved' ? 'Owner authorized' :
    decision === 'denied' ? 'Owner denied' : 'Decision submitted to Hermes'
  );

  // Atomic database transition
  const res = db.prepare(`
    UPDATE hermes_approvals
    SET status = ?, decided_at = ?, decision_reason = ?, approver_id = ?
    WHERE id = ? AND status IN ('pending', 'decision_submitted')
  `).run(decision, now, decisionReason, approverId, approvalId);

  if ((res as any).changes === 0) {
    if (isObjectCall) return { success: false, error: 'Concurrent approval conflict: request was already resolved' };
    return false;
  }

  // Log decision to append-only audit trail
  const event_type =
    decision === 'approved' ? 'approval.granted' :
    decision === 'denied' ? 'approval.denied' : 'approval.submitted';

  appendAuditLog(db, {
    event_type,
    run_id: current.run_id,
    hermes_run_id: current.hermes_run_id,
    conversation_id: current.conversation_id,
    tool_call_id: current.tool_call_id,
    tool_name: current.tool_name,
    actor: approverId as any,
    risk_level: current.risk_level,
    action_hash: current.action_hash,
    outcome: decision,
    details: { reason: decisionReason },
  });

  const updated: StoredApprovalRecord = {
    ...current,
    status: decision,
    decided_at: now,
    decision_reason: decisionReason,
    approver_id: approverId,
  };

  if (isObjectCall) {
    return { success: true, approval: updated };
  }
  return true;
}

/**
 * Transitions an approved tool execution to 'executed' or 'failed'.
 */
export function markApprovalExecuted(
  db: DatabaseSync,
  approvalId: string,
  outcome: 'executed' | 'failed',
  outcomeRef?: string
): boolean {
  const current = getApprovalRecord(db, approvalId);
  if (!current || current.status !== 'approved') {
    return false;
  }

  const res = db.prepare(`
    UPDATE hermes_approvals SET status = ?, outcome_ref = ? WHERE id = ? AND status = 'approved'
  `).run(outcome, outcomeRef || null, approvalId);

  const success = (res as any).changes > 0;
  if (success) {
    appendAuditLog(db, {
      event_type: outcome === 'executed' ? 'tool.executed' : 'tool.failed',
      run_id: current.run_id,
      hermes_run_id: current.hermes_run_id,
      conversation_id: current.conversation_id,
      tool_call_id: current.tool_call_id,
      tool_name: current.tool_name,
      actor: 'hermes',
      risk_level: current.risk_level,
      action_hash: current.action_hash,
      outcome,
      details: { outcome_ref: outcomeRef },
    });
  }

  return success;
}

/**
 * Lists active pending approvals for an owner, automatically reaping expired records.
 */
export function listPendingApprovals(
  db: DatabaseSync,
  conversationId?: string
): StoredApprovalRecord[] {
  let query = "SELECT id FROM hermes_approvals WHERE status IN ('pending', 'decision_submitted')";
  const params: any[] = [];

  if (conversationId) {
    query += ' AND conversation_id = ?';
    params.push(conversationId);
  }

  query += ' ORDER BY created_at ASC';
  const rows = db.prepare(query).all(...params) as Array<{ id: string }>;

  // getApprovalRecord reaps expired entries automatically
  const active: StoredApprovalRecord[] = [];
  for (const { id } of rows) {
    const record = getApprovalRecord(db, id);
    if (record && record.status === 'pending') {
      active.push(record);
    }
  }

  return active;
}

/**
 * Lists approval history with pagination.
 */
export function listApprovalHistory(
  db: DatabaseSync,
  options: { limit?: number; status?: string; conversationId?: string } = {}
): StoredApprovalRecord[] {
  let query = 'SELECT * FROM hermes_approvals WHERE 1=1';
  const params: any[] = [];

  if (options.status && options.status !== 'all') {
    query += ' AND status = ?';
    params.push(options.status);
  }
  if (options.conversationId) {
    query += ' AND conversation_id = ?';
    params.push(options.conversationId);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(options.limit || 30);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    run_id: r.run_id,
    hermes_run_id: r.hermes_run_id,
    conversation_id: r.conversation_id,
    tool_name: r.tool_name,
    tool_call_id: r.tool_call_id,
    parameters: r.parameters ? JSON.parse(r.parameters) : undefined,
    preview: r.preview_json ? JSON.parse(r.preview_json) : {},
    action_hash: r.action_hash,
    risk_level: r.risk_level,
    status: r.status,
    created_at: r.created_at,
    expires_at: r.expires_at,
    decided_at: r.decided_at,
    decision_reason: r.decision_reason,
    approver_id: r.approver_id,
    outcome_ref: r.outcome_ref,
  }));
}
