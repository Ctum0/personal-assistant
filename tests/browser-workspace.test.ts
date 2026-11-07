import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { NextRequest } from 'next/server';
import http from 'node:http';
import {
  validateDestinationUrl,
  isPrivateOrRestrictedIpv4,
  isPrivateOrRestrictedIpv6,
} from '@/lib/browser/security';
import {
  initBrowserTables,
  getOrCreateBrowserSession,
  getBrowserSession,
  updateBrowserSession,
  getControlLeaseState,
  acquireControlLease,
  closeBrowserSession,
  listActiveBrowserSessions,
} from '@/lib/browser/session';
import { getBrowserManager } from '@/server/browser-manager';
import { executeTool } from '@/lib/tools';
import { initHermesTables, resolveApproval, getApprovalRecord } from '@/lib/hermes/registry';
import * as dbModule from '@/lib/db';
import { GET as getSessions, POST as postSession } from '@/app/api/browser/sessions/route';
import { GET as getSessionById, DELETE as deleteSessionById } from '@/app/api/browser/sessions/[id]/route';
import { GET as getLease, POST as postLease } from '@/app/api/browser/sessions/[id]/control/route';
import { POST as postInput } from '@/app/api/browser/sessions/[id]/input/route';
import { POST as postAction } from '@/app/api/browser/sessions/[id]/action/route';

describe('SOFIA PHASE 4 — Live Browser Workspace & Shared Control', () => {
  let db: DatabaseSync;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
    initBrowserTables(db);
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.SOFIA_API_TOKEN = 'test-browser-token';
    vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
  });

  function createAuthedRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', 'Bearer test-browser-token');
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      ...(init as any),
      headers,
    });
  }

  // =========================================================================
  // 1. SSRF & Network Boundary Protections
  // =========================================================================
  describe('1. SSRF, DNS Rebinding & Network Protections', () => {
    it('blocks private IPv4 subnets, loopbacks, and cloud metadata', () => {
      expect(isPrivateOrRestrictedIpv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('127.1.2.3')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('10.0.0.5')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('172.24.5.6')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('172.31.255.254')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('192.168.1.1')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('169.254.169.254')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('100.64.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('0.0.0.0')).toBe(true);
      expect(isPrivateOrRestrictedIpv4('224.0.0.1')).toBe(true);

      // Public IPs allowed
      expect(isPrivateOrRestrictedIpv4('140.82.121.4')).toBe(false); // GitHub
      expect(isPrivateOrRestrictedIpv4('8.8.8.8')).toBe(false); // Google DNS
    });

    it('blocks IPv6 loopbacks, link-local, and unique-local subnets', () => {
      expect(isPrivateOrRestrictedIpv6('::1')).toBe(true);
      expect(isPrivateOrRestrictedIpv6('fe80::1')).toBe(true);
      expect(isPrivateOrRestrictedIpv6('fc00::1')).toBe(true);
      expect(isPrivateOrRestrictedIpv6('fd12:3456::1')).toBe(true);
      expect(isPrivateOrRestrictedIpv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIpv6('::ffff:169.254.169.254')).toBe(true);

      // Public IPv6 allowed
      expect(isPrivateOrRestrictedIpv6('2606:4700:4700::1111')).toBe(false); // Cloudflare
    });

    it('rejects disallowed protocols, localhost, and metadata hosts', async () => {
      expect((await validateDestinationUrl('file:///etc/passwd')).allowed).toBe(false);
      expect((await validateDestinationUrl('javascript:alert(1)')).allowed).toBe(false);
      expect((await validateDestinationUrl('data:text/html,<h1>bad</h1>')).allowed).toBe(false);
      expect((await validateDestinationUrl('gopher://127.0.0.1:70')).allowed).toBe(false);
      expect((await validateDestinationUrl('http://localhost:3000')).allowed).toBe(false);
      expect((await validateDestinationUrl('http://app.localhost')).allowed).toBe(false);
      expect((await validateDestinationUrl('http://127.0.0.1/')).allowed).toBe(false);
      expect((await validateDestinationUrl('http://169.254.169.254/latest/meta-data')).allowed).toBe(false);
      expect((await validateDestinationUrl('http://metadata.google.internal')).allowed).toBe(false);
      expect((await validateDestinationUrl('http://user:secret@example.com')).allowed).toBe(false);
    });

    it('detects DNS rebinding when public hostname resolves to private IP', async () => {
      // Mock DNS resolver returning AWS metadata IP for an innocent-looking domain
      const mockLookup = async (host: string) => ['169.254.169.254'];
      const res = await validateDestinationUrl('http://rebind-attacker.com', {
        lookupFn: mockLookup,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('resolves to private/restricted IP');
    });

    it('allows genuine public destinations', async () => {
      const mockLookup = async (host: string) => ['140.82.121.4'];
      const res = await validateDestinationUrl('https://github.com/ctum/sofia', {
        lookupFn: mockLookup,
      });
      expect(res.allowed).toBe(true);
      expect(res.normalizedUrl).toBe('https://github.com/ctum/sofia');
    });
  });

  // =========================================================================
  // 2. Shared Control Lease & Session Lifecycle
  // =========================================================================
  describe('2. Shared Control Lease & Session Invariants', () => {
    it('creates or reuses a browser session without duplicate allocations', () => {
      const session1 = getOrCreateBrowserSession(db, 'conv_p4_test', 'owner', 'https://github.com');
      expect(session1.id).toMatch(/^bsess_/);
      expect(session1.current_url).toBe('https://github.com');
      expect(session1.lease_holder).toBe('HUMAN');

      // Re-invoking with the same conversation ID returns the exact same active session
      const session2 = getOrCreateBrowserSession(db, 'conv_p4_test', 'owner');
      expect(session2.id).toBe(session1.id);
      expect(session2.current_url).toBe('https://github.com');
    });

    it('prevents IDOR access to sessions belonging to another user', () => {
      const session = getOrCreateBrowserSession(db, 'conv_priv', 'owner');
      expect(() => getOrCreateBrowserSession(db, 'conv_priv', 'attacker')).toThrow(/IDOR protection/);
      expect(getBrowserSession(db, session.id, 'attacker')).toBeNull();
    });

    it('enforces exclusive control lease and human preemption over agent', () => {
      const session = getOrCreateBrowserSession(db, 'conv_lease_test');

      // Initially held by HUMAN
      const initialLease = getControlLeaseState(db, session.id);
      expect(initialLease?.holder).toBe('HUMAN');
      expect(initialLease?.isExpired).toBe(false);

      // AGENT attempts to steal lease while HUMAN is active -> REJECTED
      const agentSteal = acquireControlLease(db, session.id, 'AGENT');
      expect(agentSteal.success).toBe(false);
      expect(agentSteal.error).toContain('Human currently holds an active control lease');

      // Human hands off control to AGENT
      db.prepare("UPDATE browser_sessions SET lease_expires_at = datetime('now', '-1 minute') WHERE id = ?").run(session.id);
      const agentAcquire = acquireControlLease(db, session.id, 'AGENT');
      expect(agentAcquire.success).toBe(true);
      expect(agentAcquire.lease?.holder).toBe('AGENT');

      // HUMAN can ALWAYS preemptively take control back from AGENT
      const humanTakeback = acquireControlLease(db, session.id, 'HUMAN');
      expect(humanTakeback.success).toBe(true);
      expect(humanTakeback.lease?.holder).toBe('HUMAN');
    });

    it('closes browser session and prevents further lease operations', () => {
      const session = getOrCreateBrowserSession(db, 'conv_close_test');
      expect(closeBrowserSession(db, session.id)).toBe(true);

      const closed = getBrowserSession(db, session.id);
      expect(closed?.status).toBe('closed');

      const leaseAttempt = acquireControlLease(db, session.id, 'HUMAN');
      expect(leaseAttempt.success).toBe(false);
      expect(leaseAttempt.error).toContain('closed browser session');
    });
  });

  // =========================================================================
  // 3. REST API Routes & Input / Stream Validation
  // =========================================================================
  describe('3. REST API Routes Verification', () => {
    it('requires authentication on all browser session endpoints', async () => {
      const unauthedReq = new NextRequest('http://localhost:3000/api/browser/sessions');
      const resList = await getSessions(unauthedReq);
      expect(resList.status).toBe(401);

      const resGet = await getSessionById(unauthedReq, { params: Promise.resolve({ id: 'bsess_123' }) });
      expect(resGet.status).toBe(401);
    });

    it('lists active sessions and creates new session via POST /api/browser/sessions', async () => {
      const createReq = createAuthedRequest('http://localhost:3000/api/browser/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: 'conv_api_test',
          url: 'https://github.com',
          title: 'GitHub Repo',
        }),
      });

      const createRes = await postSession(createReq);
      expect(createRes.status).toBe(200);
      const createJson = await createRes.json();
      expect(createJson.session.id).toMatch(/^bsess_/);
      expect(createJson.session.current_url).toBe('https://github.com');

      const listReq = createAuthedRequest('http://localhost:3000/api/browser/sessions?conversation_id=conv_api_test');
      const listRes = await getSessions(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.sessions.length).toBe(1);
      expect(listJson.sessions[0].id).toBe(createJson.session.id);
    });

    it('blocks human input when control lease is held by AGENT (HTTP 403)', async () => {
      const session = getOrCreateBrowserSession(db, 'conv_input_test');
      // Set lease to AGENT
      db.prepare("UPDATE browser_sessions SET lease_holder = 'AGENT' WHERE id = ?").run(session.id);

      const inputReq = createAuthedRequest(`http://localhost:3000/api/browser/sessions/${session.id}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'click',
          x: 100,
          y: 200,
        }),
      });

      const res = await postInput(inputReq, { params: Promise.resolve({ id: session.id }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Control lease is currently held by Sofia / AGENT');
    });

    it('enforces Phase 3 approval gate for consequential browser actions', async () => {
      const session = getOrCreateBrowserSession(db, 'conv_action_test');

      // Attempt consequential click (delete account / submit) without prior approval
      const actionReq = createAuthedRequest(`http://localhost:3000/api/browser/sessions/${session.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'click',
          selector: 'button.delete-account',
        }),
      });

      const actionRes = await postAction(actionReq, { params: Promise.resolve({ id: session.id }) });
      expect(actionRes.status).toBe(403);
      const actionJson = await actionRes.json();
      expect(actionJson.blocked).toBe(true);
      expect(actionJson.requires_approval).toBe(true);
      expect(actionJson.risk_level).toBe('R3');
      expect(actionJson.approval_id).toMatch(/^appr_/);

      // Verify approval record was minted in hermes_approvals
      const apprRecord = getApprovalRecord(db, actionJson.approval_id);
      expect(apprRecord).not.toBeNull();
      expect(apprRecord?.tool_name).toBe('browser_click');
      expect(apprRecord?.status).toBe('pending');
    });
  });

  // =========================================================================
  // 4. Sofia executeTool Integration: "Open GitHub"
  // =========================================================================
  describe('4. Tool Integration: Saying "Open GitHub"', () => {
    it('opens live browser workspace and generates BrowserPane in Sofia Stage', async () => {
      const manager = getBrowserManager();
      vi.spyOn(manager, 'navigate').mockResolvedValue({
        url: 'https://github.com',
        title: 'GitHub: Let’s build from here',
        status: 200,
      });
      vi.spyOn(manager, 'getPageInfo').mockResolvedValue({
        url: 'https://github.com',
        title: 'GitHub: Let’s build from here',
        status: 200,
        textSnippet: 'GitHub is where over 100 million developers build software.',
        canGoBack: false,
        canGoForward: false,
        viewport: { width: 1280, height: 800 },
      });

      const toolRes = await executeTool(
        db,
        'browser_open',
        { url: 'https://github.com', conversationId: 'conv_voice_test' },
        {} as any
      );

      expect(toolRes.result.session_id).toMatch(/^bsess_/);
      expect(toolRes.result.url).toBe('https://github.com');
      expect(toolRes.pane?.kind).toBe('browser');
      expect(toolRes.pane?.title).toBeDefined();

      const browserPane = toolRes.pane as any;
      expect(browserPane.session_id).toBe(toolRes.result.session_id);
      expect(browserPane.url).toBe('https://github.com');
      expect(browserPane.lease_holder).toBe('HUMAN');

      // Subsequent call reuses session
      const secondCall = await executeTool(
        db,
        'browser_get_page_info',
        { sessionId: toolRes.result.session_id },
        {} as any
      );
      expect(secondCall.result).toBeDefined();
    });
  });
});
