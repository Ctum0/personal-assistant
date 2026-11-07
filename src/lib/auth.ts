import { NextRequest, NextResponse } from 'next/server';

export function isProductionEnvironment(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (
    Boolean(process.env.COOLIFY_APP_ID) ||
    Boolean(process.env.COOLIFY_CONTAINER_NAME) ||
    process.env.PRODUCTION_DEPLOYMENT === 'true' ||
    process.env.PRODUCTION === 'true' ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT)
  ) {
    return true;
  }
  return false;
}

export function isDevBypassAllowed(): boolean {
  if (isProductionEnvironment()) return false;
  return process.env.SOFIA_ALLOW_DEV_BYPASS === 'true';
}

/**
 * Shared Bearer Token Authentication for Sofia API routes.
 * Checks against SOFIA_API_TOKEN (or SOFIA_AUTH_TOKEN) env variable.
 */
export function verifyApiAuth(req: NextRequest): { authorized: boolean; response?: NextResponse } {
  const { pathname } = req.nextUrl;

  // Always allow health checks
  if (pathname === '/api/health') {
    return { authorized: true };
  }

  const rawTokens = [process.env.SOFIA_API_TOKEN, process.env.SOFIA_AUTH_TOKEN];
  const validTokens = rawTokens
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim());

  const isProd = isProductionEnvironment();

  // If tokens are missing or empty
  if (validTokens.length === 0) {
    if (isProd) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Server authentication misconfigured: SOFIA_API_TOKEN is required in production environments' },
          { status: 500 }
        ),
      };
    }

    if (isDevBypassAllowed()) {
      return { authorized: true };
    }

    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Server authentication misconfigured: SOFIA_API_TOKEN must be configured, or set SOFIA_ALLOW_DEV_BYPASS=true for local development' },
        { status: 500 }
      ),
    };
  }

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token && validTokens.includes(token)) {
      return { authorized: true };
    }
  }

  // 2. Check X-Sofia-Token header
  const customHeader = req.headers.get('x-sofia-token')?.trim();
  if (customHeader && validTokens.includes(customHeader)) {
    return { authorized: true };
  }

  // 3. Check cookie
  const cookieToken = req.cookies.get('sofia_token')?.value?.trim();
  if (cookieToken && validTokens.includes(cookieToken)) {
    return { authorized: true };
  }

  // 4. Ingest route device token check
  if (pathname.startsWith('/api/ingest')) {
    const deviceToken = req.headers.get('x-device-token')?.trim();
    const expectedDeviceToken = (process.env.DEVICE_TOKEN || process.env.SOFIA_DEVICE_TOKEN)?.trim();
    if (expectedDeviceToken && deviceToken === expectedDeviceToken) {
      return { authorized: true };
    }
  }

  // 5. Cron route secret check
  if (pathname.startsWith('/api/cron')) {
    const cronSecret = req.headers.get('x-cron-secret')?.trim();
    const expectedCronSecret = process.env.CRON_SECRET?.trim();
    if (expectedCronSecret && cronSecret === expectedCronSecret) {
      return { authorized: true };
    }
  }

  return {
    authorized: false,
    response: NextResponse.json(
      { error: 'Unauthorized: Invalid or missing authentication token' },
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
