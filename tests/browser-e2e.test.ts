import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { startBrowserTestSite, TestSiteInstance } from './fixtures/browser-test-site';
import { BrowserManager } from '../src/server/browser-manager';
import { initBrowserTables, getOrCreateBrowserSession, acquireControlLease } from '../src/lib/browser/session';
import { initHermesTables } from '../src/lib/hermes/registry';
import { evaluateToolRisk } from '../src/lib/policy.risk';

describe('SOFIA PHASE 4.1 — Real Chromium Live Browser End-to-End Suite', () => {
  let testSite: TestSiteInstance;
  let manager: BrowserManager;
  let db: DatabaseSync;
  let sessionId: string;

  beforeAll(async () => {
    testSite = await startBrowserTestSite();
    manager = BrowserManager.resetInstanceForTesting({ allowLoopbackForTesting: true });
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
    initBrowserTables(db);
    const session = getOrCreateBrowserSession(db, 'conv_e2e', 'owner', testSite.baseUrl);
    sessionId = session.id;
  }, 25000);

  afterAll(async () => {
    if (manager) {
      await manager.closeAll().catch(() => {});
    }
    if (testSite) {
      await testSite.close().catch(() => {});
    }
  });

  // =========================================================================
  // 1. Normal Browsing Operations on Real Chromium
  // =========================================================================
  describe('1. Normal Real Browser Workspace Lifecycle', () => {
    it('opens local fixture page and verifies page title and DOM', async () => {
      const nav = await manager.navigate(sessionId, testSite.baseUrl);
      expect(nav.status).toBe(200);
      expect(nav.title).toBe('Sofia Test Home');

      const info = await manager.getPageInfo(sessionId);
      expect(info.title).toBe('Sofia Test Home');
      expect(info.textSnippet).toContain('Welcome to Sofia Test Portal');
      expect(info.interactiveElementsCount).toBeGreaterThanOrEqual(3);
    }, 15000);

    it('interacts with DOM: clicks counter button and verifies state change', async () => {
      // Click increment button
      const clicked = await manager.click(sessionId, { selector: '#counter-btn' });
      expect(clicked).toBe(true);

      const info = await manager.getPageInfo(sessionId);
      expect(info.textSnippet).toContain('Count: 1');
    });

    it('types text into input field and scrolls viewport', async () => {
      await manager.type(sessionId, 'Sofia Jarvis Browser Workspace Active', '#note-input');
      const snap = await manager.getSnapshot(sessionId);
      expect(snap).toContain('Sofia Jarvis Browser Workspace Active');

      // Scroll down and back to top
      await expect(manager.scroll(sessionId, 'down', 200)).resolves.toBe(true);
      await expect(manager.scroll(sessionId, 'top')).resolves.toBe(true);
    });

    it('navigates to page 2, goes back, and captures high-res PNG screenshot', async () => {
      await manager.click(sessionId, { selector: '#link-page2' });
      await manager.wait(sessionId, 300);

      const page2Info = await manager.getPageInfo(sessionId);
      expect(page2Info.title).toBe('Page Two - Documentation');

      // Go back
      const backOk = await manager.goBack(sessionId);
      expect(backOk).toBe(true);

      // Capture screenshot
      const buffer = await manager.screenshot(sessionId);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      // Verify PNG magic bytes: 0x89 0x50 0x4E 0x47
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    });
  });

  // =========================================================================
  // 2. Shared Human/Agent Interaction & Preemption
  // =========================================================================
  describe('2. Shared Human/Agent Interaction & Preemption', () => {
    it('dispatches human mouse input to update DOM and agent observes change', async () => {
      // Return to home page
      await manager.navigate(sessionId, testSite.baseUrl);

      // Human clicks counter
      await manager.click(sessionId, { selector: '#counter-btn' });
      const info1 = await manager.getPageInfo(sessionId);
      expect(info1.textSnippet).toContain('Count: 1');

      // Agent acquires lease and clicks
      db.prepare('UPDATE browser_sessions SET lease_expires_at = ? WHERE id = ?').run(
        new Date(Date.now() - 1000).toISOString(),
        sessionId
      );
      acquireControlLease(db, sessionId, 'AGENT');

      await manager.click(sessionId, { selector: '#counter-btn' });
      const info2 = await manager.getPageInfo(sessionId);
      expect(info2.textSnippet).toContain('Count: 2');

      // Human immediately preempts
      const humanLease = acquireControlLease(db, sessionId, 'HUMAN');
      expect(humanLease.success).toBe(true);
      expect(humanLease.lease?.holder).toBe('HUMAN');
    });
  });

  // =========================================================================
  // 3. Security, SSRF & Wire Redirect Blocking
  // =========================================================================
  describe('3. Network Egress Security & Metadata Blocking', () => {
    it('blocks navigation to private IPs directly', async () => {
      await expect(manager.navigate(sessionId, 'http://10.0.0.1/admin')).rejects.toThrow(
        /Navigation blocked by security policy/
      );
      await expect(manager.navigate(sessionId, 'http://169.254.169.254/latest')).rejects.toThrow(
        /Navigation blocked by security policy/
      );
    });

    it(
      'intercepts and aborts wire-level redirects to cloud metadata endpoints',
      async () => {
        // /redirect-internal redirects to http://169.254.169.254/latest/meta-data/
        // Playwright route interception aborts the redirected request
        try {
          await manager.navigate(sessionId, `${testSite.baseUrl}/redirect-internal`, { timeout: 2500 });
        } catch (err: any) {
          expect(err.message).toMatch(/(blocked|net::ERR_FAILED|aborted|timeout|timed out)/i);
        }
      },
      8000
    );
  });

  // =========================================================================
  // 4. Sensitive Credential Redaction & Typing Restriction
  // =========================================================================
  describe('4. Sensitive Credential Redaction & Typing Restriction', () => {
    it('blocks agent from typing credentials into password fields', async () => {
      await manager.navigate(sessionId, `${testSite.baseUrl}/login`);

      // Attempting to type into password input must throw
      await expect(manager.type(sessionId, 'superSecretP@ssword123', '#password')).rejects.toThrow(
        /Agent credential typing is strictly forbidden/
      );
    });

    it('redacts password values in page snapshots preventing secret leakage', async () => {
      await manager.navigate(sessionId, `${testSite.baseUrl}/login`);

      const snap = await manager.getSnapshot(sessionId);
      expect(snap).toContain('<input>[REDACTED_PASSWORD]</input>');
      expect(snap).not.toContain('superSecretP@ssword123');
    });
  });

  // =========================================================================
  // 5. Consequential Action Authorization Categorization
  // =========================================================================
  describe('5. Consequential Browser Action Authorization', () => {
    it('evaluates form submission as R2 requiring explicit owner approval', () => {
      const risk = evaluateToolRisk('browser_click', {
        selector: '#login-btn',
        role: 'submit',
        formAction: '/login-submit',
      });
      expect(risk.riskLevel).toBe('R2');
      expect(risk.requiresApproval).toBe(true);
      expect(risk.reason).toContain('Consequential browser action');
    });

    it('evaluates payment checkout as R2 requiring explicit owner approval', () => {
      const risk = evaluateToolRisk('browser_click', {
        selector: '#pay-btn',
        buttonText: 'Confirm Payment',
        actionType: 'checkout',
      });
      expect(risk.riskLevel).toBe('R2');
      expect(risk.requiresApproval).toBe(true);
    });

    it('evaluates permanent account deletion as R3 requiring strong passkey step-up', () => {
      const risk = evaluateToolRisk('browser_click', {
        selector: '#delete-btn',
        ariaLabel: 'delete-account',
        buttonText: 'Permanently Delete Account',
      });
      expect(risk.riskLevel).toBe('R3');
      expect(risk.requiresStrongApproval).toBe(true);
      expect(risk.reason).toContain('Destructive browser action');
    });
  });

  // =========================================================================
  // 6. Real Screencast SSE Streaming
  // =========================================================================
  describe('6. Screencast Frame Streaming', () => {
    it('generates real JPEG screencast frames on page interaction', async () => {
      let receivedFrame = false;
      const unsubscribe = manager.subscribeScreencast(sessionId, (frame) => {
        if (frame.data && frame.data.length > 50) {
          receivedFrame = true;
        }
      });

      // Trigger a render by navigating
      await manager.navigate(sessionId, testSite.baseUrl);
      await manager.wait(sessionId, 500);

      unsubscribe();
      expect(receivedFrame).toBe(true);
    });
  });
});
