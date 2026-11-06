import { NextRequest, NextResponse } from 'next/server';

/**
 * Shared Bearer Token Authentication for Sofia API routes.
 * Checks against SOFIA_API_TOKEN (or SOFIA_AUTH_TOKEN) env variable.
 */
export function verifyApiAuth(req: NextRequest): { authorized: boolean; response?: NextResponse } {
  const expectedToken = process.env.SOFIA_API_TOKEN || process.env.SOFIA_AUTH_TOKEN;

  // If no token is set in the environment, allow access (local dev mode)
  if (!expectedToken) {
    return { authorized: true };
  }

  const { pathname } = req.nextUrl;

  // Always allow health checks
  if (pathname === '/api/health') {
    return { authorized: true };
  }

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token === expectedToken) {
      return { authorized: true };
    }
  }

  // 2. Check X-Sofia-Token header
  const customHeader = req.headers.get('x-sofia-token');
  if (customHeader && customHeader === expectedToken) {
    return { authorized: true };
  }

  // 3. Check cookie
  const cookieToken = req.cookies.get('sofia_token')?.value;
  if (cookieToken && cookieToken === expectedToken) {
    return { authorized: true };
  }

  // 4. Ingest route device token check
  if (pathname.startsWith('/api/ingest')) {
    const deviceToken = req.headers.get('x-device-token');
    const expectedDeviceToken = process.env.DEVICE_TOKEN || process.env.SOFIA_DEVICE_TOKEN;
    if (expectedDeviceToken && deviceToken === expectedDeviceToken) {
      return { authorized: true };
    }
  }

  // 5. Cron route secret check
  if (pathname.startsWith('/api/cron')) {
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedCronSecret = process.env.CRON_SECRET;
    if (expectedCronSecret && cronSecret === expectedCronSecret) {
      return { authorized: true };
    }
  }

  return {
    authorized: false,
    response: NextResponse.json(
      { error: 'Unauthorized: Invalid or missing SOFIA_API_TOKEN bearer token' },
      { status: 401 }
    ),
  };
}

/**
 * Route handler wrapper to enforce API authentication on individual route handlers.
 */
export function withAuth<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<Response>
) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    return handler(req, ...args);
  };
}
