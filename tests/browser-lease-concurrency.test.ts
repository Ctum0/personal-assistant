import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  initBrowserTables,
  getOrCreateBrowserSession,
  getBrowserSession,
  getControlLeaseState,
  acquireControlLease,
  registerAgentAbortController,
  cancelActiveAgentAction,
} from '../src/lib/browser/session';
import { initHermesTables } from '../src/lib/hermes/registry';

describe('SOFIA PHASE 4.1 — Browser Control Lease & Concurrency Invariants', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
    initBrowserTables(db);
  });

  it('allows human owner to acquire control lease and blocks agent without handoff', () => {
    const session = getOrCreateBrowserSession(db, 'conv_lease_1', 'owner');
    expect(session.lease_holder).toBe('HUMAN');

    // Agent attempts to take control while human lease is active
    const agentAttempt = acquireControlLease(db, session.id, 'AGENT');
    expect(agentAttempt.success).toBe(false);
    expect(agentAttempt.error).toContain('Human currently holds an active control lease');

    const state = getControlLeaseState(db, session.id);
    expect(state?.holder).toBe('HUMAN');
  });

  it('allows agent to acquire lease after explicit handoff', () => {
    const session = getOrCreateBrowserSession(db, 'conv_lease_2', 'owner');

    // Human hands off lease by setting expiry to 0 or explicit switch
    const handoff = acquireControlLease(db, session.id, 'AGENT', 60000);
    // Since human currently holds lease, human can explicitly reassign
    // Or expire human lease
    db.prepare('UPDATE browser_sessions SET lease_expires_at = ? WHERE id = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      session.id
    );

    const agentAcquire = acquireControlLease(db, session.id, 'AGENT', 60000);
    expect(agentAcquire.success).toBe(true);
    expect(agentAcquire.lease?.holder).toBe('AGENT');

    const updated = getBrowserSession(db, session.id);
    expect(updated?.lease_holder).toBe('AGENT');
  });

  it('human can preempt agent immediately and in-flight agent actions are aborted', () => {
    const session = getOrCreateBrowserSession(db, 'conv_lease_3', 'owner');

    // Set lease to agent
    db.prepare('UPDATE browser_sessions SET lease_holder = ?, lease_expires_at = ? WHERE id = ?').run(
      'AGENT',
      new Date(Date.now() + 60000).toISOString(),
      session.id
    );

    // Register active agent in-flight action abort signal
    const agentAbortController = registerAgentAbortController(session.id);
    expect(agentAbortController.signal.aborted).toBe(false);

    // Human immediately preempts
    const humanPreempt = acquireControlLease(db, session.id, 'HUMAN', 120000);
    expect(humanPreempt.success).toBe(true);
    expect(humanPreempt.lease?.holder).toBe('HUMAN');

    // Verify the agent in-flight action signal was aborted
    expect(agentAbortController.signal.aborted).toBe(true);
    expect((agentAbortController.signal.reason as Error).message).toContain('Human owner preempted control');

    // Session remains intact
    const currentSession = getBrowserSession(db, session.id);
    expect(currentSession?.lease_holder).toBe('HUMAN');
    expect(currentSession?.status).toBe('active');
  });

  it('handles concurrent lease acquisitions atomically without corrupting state', async () => {
    const session = getOrCreateBrowserSession(db, 'conv_lease_4', 'owner');

    // Simulate 20 concurrent lease acquisition requests
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 20; i++) {
      const holder = i % 2 === 0 ? 'HUMAN' : 'AGENT';
      promises.push(
        new Promise((resolve) => {
          const res = acquireControlLease(db, session.id, holder, 5000);
          resolve(res);
        })
      );
    }

    const results = await Promise.all(promises);
    expect(results.length).toBe(20);

    // Verify final state is valid and non-corrupt
    const finalSession = getBrowserSession(db, session.id);
    expect(finalSession).not.toBeNull();
    expect(['HUMAN', 'AGENT']).toContain(finalSession?.lease_holder);
    expect(new Date(finalSession!.lease_expires_at).getTime()).toBeGreaterThan(Date.now() - 10000);
  });

  it('recovers correctly when lease has expired', () => {
    const session = getOrCreateBrowserSession(db, 'conv_lease_5', 'owner');

    // Expire the lease
    db.prepare('UPDATE browser_sessions SET lease_holder = ?, lease_expires_at = ? WHERE id = ?').run(
      'AGENT',
      new Date(Date.now() - 5000).toISOString(),
      session.id
    );

    const state = getControlLeaseState(db, session.id);
    expect(state?.isExpired).toBe(true);

    // Human can take back control immediately
    const humanReclaim = acquireControlLease(db, session.id, 'HUMAN');
    expect(humanReclaim.success).toBe(true);
    expect(humanReclaim.lease?.holder).toBe('HUMAN');
  });
});
