import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyApiAuth } from '../src/lib/auth';

describe('Auth Middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnv = process.env.SOFIA_API_TOKEN;

  function setNodeEnv(env: string) {
    (process.env as any).NODE_ENV = env;
  }

  afterEach(() => {
    setNodeEnv(originalNodeEnv || 'test');
    process.env.SOFIA_API_TOKEN = originalEnv;
  });

  it('fails closed (500) in development when SOFIA_API_TOKEN is not set and SOFIA_ALLOW_DEV_BYPASS is not set', () => {
    setNodeEnv('development');
    delete process.env.SOFIA_API_TOKEN;
    delete process.env.SOFIA_AUTH_TOKEN;
    delete process.env.SOFIA_ALLOW_DEV_BYPASS;
    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(500);
  });

  it('allows requests in development when SOFIA_ALLOW_DEV_BYPASS is explicitly true', () => {
    setNodeEnv('development');
    delete process.env.SOFIA_API_TOKEN;
    delete process.env.SOFIA_AUTH_TOKEN;
    process.env.SOFIA_ALLOW_DEV_BYPASS = 'true';
    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(true);
    delete process.env.SOFIA_ALLOW_DEV_BYPASS;
  });

  it('fails closed (500) when NODE_ENV=development but a production deployment marker is present', () => {
    setNodeEnv('development');
    delete process.env.SOFIA_API_TOKEN;
    delete process.env.SOFIA_AUTH_TOKEN;
    process.env.SOFIA_ALLOW_DEV_BYPASS = 'true'; // attacker or mistake attempts bypass
    process.env.COOLIFY_APP_ID = 'app-container-123'; // production container marker

    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(500);

    delete process.env.COOLIFY_APP_ID;
    delete process.env.SOFIA_ALLOW_DEV_BYPASS;
  });

  it('fails closed in production (500) when tokens are missing entirely', () => {
    setNodeEnv('production');
    delete process.env.SOFIA_API_TOKEN;
    delete process.env.SOFIA_AUTH_TOKEN;
    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(500);
  });

  it('fails closed in production (500) when tokens are whitespace only', () => {
    setNodeEnv('production');
    process.env.SOFIA_API_TOKEN = '   ';
    delete process.env.SOFIA_AUTH_TOKEN;
    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(500);
  });

  it('rejects unauthenticated requests with 401 when SOFIA_API_TOKEN is set', () => {
    setNodeEnv('production');
    process.env.SOFIA_API_TOKEN = 'secret-token-123';
    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it('rejects invalid tokens with 401', () => {
    setNodeEnv('production');
    process.env.SOFIA_API_TOKEN = 'secret-token-123';
    const req = new NextRequest('http://localhost:3000/api/chat', {
      headers: {
        Authorization: 'Bearer invalid-token-xyz',
      },
    });
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it('allows requests with valid Authorization Bearer header', () => {
    setNodeEnv('production');
    process.env.SOFIA_API_TOKEN = 'secret-token-123';
    const req = new NextRequest('http://localhost:3000/api/chat', {
      headers: {
        Authorization: 'Bearer secret-token-123',
      },
    });
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(true);
  });

  it('allows requests with valid X-Sofia-Token header', () => {
    setNodeEnv('production');
    process.env.SOFIA_API_TOKEN = 'secret-token-123';
    const req = new NextRequest('http://localhost:3000/api/chat', {
      headers: {
        'x-sofia-token': 'secret-token-123',
      },
    });
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(true);
  });

  it('always allows /api/health regardless of token or environment', () => {
    setNodeEnv('production');
    delete process.env.SOFIA_API_TOKEN;
    delete process.env.SOFIA_AUTH_TOKEN;
    const req = new NextRequest('http://localhost:3000/api/health');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(true);
  });
});
