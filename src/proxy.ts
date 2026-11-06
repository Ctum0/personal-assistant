import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const authToken = process.env.SOFIA_AUTH_TOKEN;

  // If no auth token is configured, allow local access freely
  if (!authToken) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Allow static assets, health check, and public expression images
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/sofia') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    pathname === '/api/health'
  ) {
    return NextResponse.next();
  }

  // Check Authorization header or cookie
  const authHeader = req.headers.get('authorization');
  const cookieToken = req.cookies.get('sofia_token')?.value;
  const token = authHeader?.replace('Bearer ', '') || cookieToken;

  if (token === authToken) {
    return NextResponse.next();
  }

  // Device collector token bypass for ingest routes
  const deviceToken = req.headers.get('x-device-token');
  const expectedDeviceToken = process.env.DEVICE_TOKEN;
  if (pathname.startsWith('/api/ingest') && expectedDeviceToken && deviceToken === expectedDeviceToken) {
    return NextResponse.next();
  }

  // Cron secret bypass for cron routes
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = process.env.CRON_SECRET;
  if (pathname.startsWith('/api/cron') && expectedCronSecret && cronSecret === expectedCronSecret) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return new NextResponse('Unauthorized: Sofia is single-user.', { status: 401 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
