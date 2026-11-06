import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from './lib/auth';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets and public health check are always allowed
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/sofia') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    pathname === '/api/health'
  ) {
    return NextResponse.next();
  }

  // Enforce API token on all /api/* routes
  if (pathname.startsWith('/api')) {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }
    return NextResponse.next();
  }

  // For non-API routes, check single-user token if SOFIA_API_TOKEN is set
  const expectedToken = process.env.SOFIA_API_TOKEN || process.env.SOFIA_AUTH_TOKEN;
  if (!expectedToken) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization');
  const cookieToken = req.cookies.get('sofia_token')?.value;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || cookieToken;

  if (token === expectedToken) {
    return NextResponse.next();
  }

  return new NextResponse('Unauthorized: Sofia is single-user.', { status: 401 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
