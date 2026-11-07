import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initHermesTables } from '../src/lib/hermes/registry';
import { initBrowserTables, getOrCreateBrowserSession, getBrowserSession } from '../src/lib/browser/session';
import { HermesBrowserToolAdapter } from '../src/lib/browser/hermes-adapter';
import { getBrowserManager } from '../src/server/browser-manager';
import * as dbModule from '../src/lib/db';

describe('SOFIA PHASE 4.1 — Genuine Hermes Tool Integration & Stage Synchronization', () => {
  let db: DatabaseSync;
  let adapter: HermesBrowserToolAdapter;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initHermesTables(db);
    initBrowserTables(db);
    vi.restoreAllMocks();
    vi.spyOn(dbModule, 'getDatabase').mockReturnValue(db);
    adapter = new HermesBrowserToolAdapter(db, 'conv_hermes_demo');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes all 12 browser tools formatted for Hermes tool discovery / MCP schema', () => {
    const tools = adapter.listTools();
    expect(tools.length).toBe(12);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('browser_open');
    expect(toolNames).toContain('browser_navigate');
    expect(toolNames).toContain('browser_click');
    expect(toolNames).toContain('browser_type');
    expect(toolNames).toContain('browser_get_page_info');
    expect(toolNames).toContain('browser_get_snapshot');

    const openTool = tools.find((t) => t.name === 'browser_open');
    expect(openTool?.inputSchema.properties.url).toBeDefined();
  });

  it('demonstrates end-to-end Hermes tool flow: Open -> Read -> Navigate -> Shared Interaction -> Observe', async () => {
    const manager = getBrowserManager();

    // 1. Hermes opens GitHub repository page
    vi.spyOn(manager, 'navigate').mockResolvedValueOnce({
      url: 'https://github.com/ctum/sofia',
      title: 'GitHub - ctum/sofia: Autonomous AI Assistant',
      status: 200,
    });

    const openRes = await adapter.executeHermesTool({
      name: 'browser_open',
      arguments: {
        url: 'https://github.com/ctum/sofia',
        conversationId: 'conv_hermes_demo',
      },
      runId: 'hrun_test_1001',
    });

    expect(openRes.success).toBe(true);
    expect(openRes.sessionId).toBeDefined();
    expect(openRes.pane).toBeDefined();
    expect(openRes.pane.kind).toBe('browser');
    expect(openRes.pane.url).toBe('https://github.com/ctum/sofia');
    expect(openRes.pane.title).toBe('GitHub - ctum/sofia: Autonomous AI Assistant');

    const activeSessionId = openRes.sessionId!;
    const dbSession = getBrowserSession(db, activeSessionId);
    expect(dbSession).not.toBeNull();
    expect(dbSession?.current_url).toBe('https://github.com/ctum/sofia');

    // 2. Hermes reads page info and snapshot for reasoning
    vi.spyOn(manager, 'getPageInfo').mockResolvedValueOnce({
      url: 'https://github.com/ctum/sofia',
      title: 'GitHub - ctum/sofia: Autonomous AI Assistant',
      status: 200,
      textSnippet: 'Repository containing Sofia personal assistant implementation.',
      canGoBack: false,
      canGoForward: false,
      viewport: { width: 1280, height: 800 },
    });

    vi.spyOn(manager, 'getSnapshot').mockResolvedValueOnce(
      'PAGE TITLE: GitHub - ctum/sofia\nURL: https://github.com/ctum/sofia\n\nINTERACTIVE ELEMENTS:\n[1] <a href="/pulls">Pull requests</a>\n[2] <button>Code</button>'
    );

    const infoRes = await adapter.executeHermesTool({
      name: 'browser_get_page_info',
      arguments: { sessionId: activeSessionId },
    });
    expect(infoRes.success).toBe(true);
    expect(infoRes.result.title).toContain('ctum/sofia');

    const snapRes = await adapter.executeHermesTool({
      name: 'browser_get_snapshot',
      arguments: { sessionId: activeSessionId },
    });
    expect(snapRes.success).toBe(true);
    expect(snapRes.result.snapshot).toContain('Pull requests');

    // 3. Hermes navigates to the pull requests page
    vi.spyOn(manager, 'navigate').mockResolvedValueOnce({
      url: 'https://github.com/ctum/sofia/pulls',
      title: 'Pull Requests · ctum/sofia',
      status: 200,
    });

    const navRes = await adapter.executeHermesTool({
      name: 'browser_navigate',
      arguments: {
        sessionId: activeSessionId,
        url: 'https://github.com/ctum/sofia/pulls',
      },
    });
    expect(navRes.success).toBe(true);
    expect(navRes.result.url).toBe('https://github.com/ctum/sofia/pulls');
    expect(navRes.pane.url).toBe('https://github.com/ctum/sofia/pulls');

    // 4. Human interacts with the page (human takes control lease)
    db.prepare('UPDATE browser_sessions SET lease_holder = ?, lease_expires_at = ? WHERE id = ?').run(
      'HUMAN',
      new Date(Date.now() + 60000).toISOString(),
      activeSessionId
    );

    // 5. Hermes observes updated page state
    vi.spyOn(manager, 'getPageInfo').mockResolvedValueOnce({
      url: 'https://github.com/ctum/sofia/pull/42',
      title: 'PR #42: Harden Browser Execution Boundary',
      status: 200,
      textSnippet: 'Reviewing changes on Phase 4.1 execution boundary.',
      canGoBack: true,
      canGoForward: false,
      viewport: { width: 1280, height: 800 },
    });

    const updatedObs = await adapter.executeHermesTool({
      name: 'browser_get_page_info',
      arguments: { sessionId: activeSessionId },
    });
    expect(updatedObs.success).toBe(true);
    expect(updatedObs.result.url).toBe('https://github.com/ctum/sofia/pull/42');
  });

  it('handles standard MCP JSON-RPC 2.0 tools/list and tools/call protocol methods', async () => {
    // 1. tools/list
    const listRpc = await adapter.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(listRpc.jsonrpc).toBe('2.0');
    expect(listRpc.id).toBe(1);
    expect(listRpc.result.tools.length).toBe(12);

    // 2. tools/call
    const manager = getBrowserManager();
    vi.spyOn(manager, 'navigate').mockResolvedValueOnce({
      url: 'https://github.com',
      title: 'GitHub',
      status: 200,
    });

    const callRpc = await adapter.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'browser_open',
        arguments: { url: 'https://github.com' },
      },
    });

    expect(callRpc.jsonrpc).toBe('2.0');
    expect(callRpc.id).toBe(2);
    expect(callRpc.result.isError).toBe(false);
    expect(callRpc.result.sessionId).toBeDefined();
    expect(callRpc.result.pane.kind).toBe('browser');
  });
});
