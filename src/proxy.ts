import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from './lib/auth';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Static assets and public health check are always allowed
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/sofia') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/worklets') ||
    pathname === '/favicon.ico' ||
    pathname === '/api/health' ||
    pathname === '/unlock' ||
    pathname === '/api/auth'
  ) {
    return NextResponse.next();
  }

  // 2. Cron and Ingest routes have their own secret headers
  if (pathname.startsWith('/api/cron') || pathname.startsWith('/api/ingest')) {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    return NextResponse.next();
  }

  // 2b. Browser SSE stream with ticket parameter passes through to route handler for SQLite verification
  if (pathname.includes('/stream') && req.nextUrl.searchParams.get('ticket')) {
    return NextResponse.next();
  }

  // 3. API route protection
  if (pathname.startsWith('/api')) {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    return NextResponse.next();
  }

  // 4. Page route protection
  const expectedToken = (process.env.SOFIA_AUTH_TOKEN || process.env.SOFIA_API_TOKEN || '').trim();
  if (!expectedToken) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const customHeader = req.headers.get('x-sofia-token');
  const cookieToken = req.cookies.get('sofia_token')?.value;
  const queryToken = req.nextUrl.searchParams.get('token')?.trim();
  const token = authHeader || customHeader || cookieToken || queryToken;

  if (token === expectedToken) {
    const res = NextResponse.next();
    if (queryToken === expectedToken && !cookieToken) {
      res.cookies.set('sofia_token', expectedToken, {
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
      });
    }
    return res;
  }

  // Redirect unauthenticated browser users to /unlock
  const unlockUrl = new URL('/unlock', req.url);
  return NextResponse.redirect(unlockUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
