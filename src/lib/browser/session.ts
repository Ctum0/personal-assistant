import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  StoredBrowserSession,
  BrowserControlHolder,
  BrowserSessionStatus,
  BrowserControlLeaseState,
} from './types';
import { appendAuditLog } from '../hermes/registry';

export const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Registry for in-flight agent actions allowing instant human preemption cancellation
const ACTIVE_AGENT_ABORT_CONTROLLERS = new Map<string, AbortController>();

export function registerAgentAbortController(sessionId: string): AbortController {
  const controller = new AbortController();
  ACTIVE_AGENT_ABORT_CONTROLLERS.set(sessionId, controller);
  return controller;
}

export function unregisterAgentAbortController(sessionId: string): void {
  ACTIVE_AGENT_ABORT_CONTROLLERS.delete(sessionId);
}

export function cancelActiveAgentAction(sessionId: string, reason: string = 'Preempted by human owner'): boolean {
  const controller = ACTIVE_AGENT_ABORT_CONTROLLERS.get(sessionId);
  if (controller) {
    controller.abort(new Error(reason));
    ACTIVE_AGENT_ABORT_CONTROLLERS.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * Initializes SQLite tables for browser sessions and control leases.
 */
export function initBrowserTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'owner',
      conversation_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL DEFAULT 'Browser Workspace',
      current_url TEXT NOT NULL DEFAULT 'about:blank',
      status TEXT NOT NULL DEFAULT 'active',
      lease_holder TEXT NOT NULL DEFAULT 'HUMAN',
      lease_expires_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_browser_sessions_conv ON browser_sessions(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_browser_sessions_status ON browser_sessions(status);
  `);
}

/**
 * Retrieves an active browser session for a conversation, or creates a new one.
 * Prevents recreating browser sessions on every component rerender.
 */
export function getOrCreateBrowserSession(
  db: DatabaseSync,
  conversationId: string = 'default',
  userId: string = 'owner',
  initialUrl: string = 'about:blank',
  initialTitle: string = 'Browser Workspace'
): StoredBrowserSession {
  initBrowserTables(db);
  const conv = conversationId.trim() || 'default';

  // Check for existing active/navigating session for this conversation
  const existing = db
    .prepare(
      `SELECT * FROM browser_sessions 
       WHERE conversation_id = ? AND status != 'closed' 
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(conv) as any;

  if (existing) {
    if (existing.user_id !== userId) {
      throw new Error('Unauthorized browser session access (IDOR protection)');
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE browser_sessions SET updated_at = ? WHERE id = ?').run(now, existing.id);
    return { ...existing, updated_at: now };
  }

  // Create new browser session
  const id = `bsess_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date();
  const leaseExpires = new Date(now.getTime() + DEFAULT_LEASE_DURATION_MS).toISOString();
  const createdAt = now.toISOString();

  db.prepare(`
    INSERT INTO browser_sessions (
      id, user_id, conversation_id, title, current_url, status,
      lease_holder, lease_expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', 'HUMAN', ?, ?, ?)
  `).run(id, userId, conv, initialTitle, initialUrl, leaseExpires, createdAt, createdAt);

  appendAuditLog(db, {
    event_type: 'browser.session_created',
    conversation_id: conv,
    actor: 'owner',
    details: { sessionId: id, url: initialUrl, title: initialTitle },
  });

  return {
    id,
    user_id: userId,
    conversation_id: conv,
    title: initialTitle,
    current_url: initialUrl,
    status: 'active',
    lease_holder: 'HUMAN',
    lease_expires_at: leaseExpires,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

/**
 * Retrieves a browser session by ID, validating ownership.
 */
export function getBrowserSession(
  db: DatabaseSync,
  sessionId: string,
  userId?: string
): StoredBrowserSession | null {
  initBrowserTables(db);
  const row = db.prepare('SELECT * FROM browser_sessions WHERE id = ?').get(sessionId) as any;
  if (!row) return null;

  if (userId && row.user_id !== userId) {
    return null; // IDOR protection
  }

  return row as StoredBrowserSession;
}

/**
 * Updates URL, title, or status of an active browser session.
 */
export function updateBrowserSession(
  db: DatabaseSync,
  sessionId: string,
  updates: {
    current_url?: string;
    title?: string;
    status?: BrowserSessionStatus;
  }
): StoredBrowserSession | null {
  initBrowserTables(db);
  const current = getBrowserSession(db, sessionId);
  if (!current) return null;

  const now = new Date().toISOString();
  const newUrl = updates.current_url !== undefined ? updates.current_url : current.current_url;
  const newTitle = updates.title !== undefined ? updates.title : current.title;
  const newStatus = updates.status !== undefined ? updates.status : current.status;

  db.prepare(`
    UPDATE browser_sessions
    SET current_url = ?, title = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(newUrl, newTitle, newStatus, now, sessionId);

  return getBrowserSession(db, sessionId);
}

/**
 * Inspects the control lease state of a browser session.
 */
export function getControlLeaseState(
  db: DatabaseSync,
  sessionId: string
): BrowserControlLeaseState | null {
  const session = getBrowserSession(db, sessionId);
  if (!session) return null;

  const now = Date.now();
  const expiresAtMs = session.lease_expires_at ? new Date(session.lease_expires_at).getTime() : 0;
  const isExpired = now > expiresAtMs;

  return {
    sessionId: session.id,
    holder: session.lease_holder,
    expiresAt: session.lease_expires_at,
    isExpired,
    canTakeControl: true, // Human owner can always take control
  };
}

/**
 * Acquires or hands off the exclusive control lease.
 * Human owner can always take control from Agent (preemption).
 * Agent can only acquire if lease is expired or currently held by Agent.
 */
export function acquireControlLease(
  db: DatabaseSync,
  sessionId: string,
  targetHolder: BrowserControlHolder,
  durationMs: number = DEFAULT_LEASE_DURATION_MS
): { success: boolean; lease?: BrowserControlLeaseState; error?: string } {
  initBrowserTables(db);
  const session = getBrowserSession(db, sessionId);
  if (!session) return { success: false, error: 'Browser session not found' };

  if (session.status === 'closed') {
    return { success: false, error: 'Cannot acquire lease on closed browser session' };
  }

  const now = Date.now();
  const expiresAtMs = session.lease_expires_at ? new Date(session.lease_expires_at).getTime() : 0;
  const isExpired = now > expiresAtMs;

  // Agent cannot preempt active human control lease without explicit handoff
  if (targetHolder === 'AGENT' && session.lease_holder === 'HUMAN' && !isExpired) {
    return {
      success: false,
      error: 'Human currently holds an active control lease. Request handoff before agent control.',
      lease: {
        sessionId,
        holder: session.lease_holder,
        expiresAt: session.lease_expires_at,
        isExpired: false,
        canTakeControl: false,
      },
    };
  }

  // If human is taking control, cancel any in-flight agent actions immediately
  if (targetHolder === 'HUMAN') {
    cancelActiveAgentAction(sessionId, 'Human owner preempted control');
  }

  const newExpiresAt = new Date(now + durationMs).toISOString();
  const nowIso = new Date(now).toISOString();

  let insideTx = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    insideTx = true;
  } catch {}

  try {
    db.prepare(`
      UPDATE browser_sessions
      SET lease_holder = ?, lease_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(targetHolder, newExpiresAt, nowIso, sessionId);

    if (insideTx) {
      db.exec('COMMIT');
    }
  } catch (err: any) {
    if (insideTx) {
      try {
        db.exec('ROLLBACK');
      } catch {}
    }
    return { success: false, error: `Failed to acquire lease atomically: ${err.message}` };
  }

  appendAuditLog(db, {
    event_type: 'browser.lease_acquired',
    conversation_id: session.conversation_id,
    actor: targetHolder === 'HUMAN' ? 'owner' : 'hermes',
    details: {
      sessionId,
      previousHolder: session.lease_holder,
      newHolder: targetHolder,
      expiresAt: newExpiresAt,
    },
  });

  return {
    success: true,
    lease: {
      sessionId,
      holder: targetHolder,
      expiresAt: newExpiresAt,
      isExpired: false,
      canTakeControl: true,
    },
  };
}

/**
 * Closes a browser session cleanly.
 */
export function closeBrowserSession(db: DatabaseSync, sessionId: string): boolean {
  initBrowserTables(db);
  const session = getBrowserSession(db, sessionId);
  if (!session || session.status === 'closed') return false;

  const now = new Date().toISOString();
  db.prepare(`UPDATE browser_sessions SET status = 'closed', updated_at = ? WHERE id = ?`).run(now, sessionId);

  appendAuditLog(db, {
    event_type: 'browser.session_closed',
    conversation_id: session.conversation_id,
    actor: 'system',
    details: { sessionId, lastUrl: session.current_url },
  });

  return true;
}

/**
 * Lists active browser sessions.
 */
export function listActiveBrowserSessions(
  db: DatabaseSync,
  conversationId?: string
): StoredBrowserSession[] {
  initBrowserTables(db);
  let query = "SELECT * FROM browser_sessions WHERE status != 'closed'";
  const params: any[] = [];

  if (conversationId) {
    query += ' AND conversation_id = ?';
    params.push(conversationId);
  }

  query += ' ORDER BY updated_at DESC LIMIT 10';
  return db.prepare(query).all(...params) as any[];
}
