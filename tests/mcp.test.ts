import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { HermesBrowserToolAdapter } from '@/lib/browser/hermes-adapter';
import { initDatabase } from '@/lib/db';

describe('MCP Browser Adapter & Protocol', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  it('handles MCP initialize handshake', async () => {
    const adapter = new HermesBrowserToolAdapter(db, 'conv_test');
    const res = await adapter.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });

    expect(res.jsonrpc).toBe('2.0');
    expect(res.id).toBe(1);
    expect(res.result.serverInfo.name).toBe('sofia-browser');
    expect(res.result.capabilities.tools).toBeDefined();
  });

  it('lists all 12 browser tools on tools/list', async () => {
    const adapter = new HermesBrowserToolAdapter(db, 'conv_test');
    const res = await adapter.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(res.result.tools).toBeInstanceOf(Array);
    expect(res.result.tools.length).toBe(12);

    const names = res.result.tools.map((t: any) => t.name);
    expect(names).toContain('browser_open');
    expect(names).toContain('browser_navigate');
    expect(names).toContain('browser_click');
    expect(names).toContain('browser_type');
    expect(names).toContain('browser_scroll');
    expect(names).toContain('browser_get_page_info');
    expect(names).toContain('browser_get_snapshot');
    expect(names).toContain('browser_screenshot');
  });

  it('handles ping and notifications/initialized cleanly', async () => {
    const adapter = new HermesBrowserToolAdapter(db, 'conv_test');
    const pingRes = await adapter.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'ping',
    });
    expect(pingRes.result).toEqual({});

    const initNotifRes = await adapter.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'notifications/initialized',
    });
    expect(initNotifRes.result).toEqual({});
  });
});
