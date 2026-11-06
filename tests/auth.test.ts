import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyApiAuth } from '../src/lib/auth';

describe('Auth Middleware', () => {
  const originalEnv = process.env.SOFIA_API_TOKEN;

  afterEach(() => {
    process.env.SOFIA_API_TOKEN = originalEnv;
  });

  it('allows requests when SOFIA_API_TOKEN is not set', () => {
    delete process.env.SOFIA_API_TOKEN;
    delete process.env.SOFIA_AUTH_TOKEN;
    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(true);
  });

  it('rejects unauthenticated requests with 401 when SOFIA_API_TOKEN is set', () => {
    process.env.SOFIA_API_TOKEN = 'secret-token-123';
    const req = new NextRequest('http://localhost:3000/api/chat');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it('allows requests with valid Authorization Bearer header', () => {
    process.env.SOFIA_API_TOKEN = 'secret-token-123';
    const req = new NextRequest('http://localhost:3000/api/chat', {
      headers: {
        Authorization: 'Bearer secret-token-123',
      },
    });
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(true);
  });

  it('always allows /api/health regardless of token', () => {
    process.env.SOFIA_API_TOKEN = 'secret-token-123';
    const req = new NextRequest('http://localhost:3000/api/health');
    const result = verifyApiAuth(req);
    expect(result.authorized).toBe(true);
  });
});
