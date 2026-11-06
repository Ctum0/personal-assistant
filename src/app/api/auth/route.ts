import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';

    const expectedToken = process.env.SOFIA_AUTH_TOKEN || process.env.SOFIA_API_TOKEN;

    // If no token is configured in environment, allow open access
    if (!expectedToken) {
      const response = NextResponse.json({ ok: true, devMode: true });
      response.cookies.set('sofia_token', 'dev-token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 86400,
        path: '/',
      });
      return response;
    }

    if (token === expectedToken) {
      const response = NextResponse.json({ ok: true });
      response.cookies.set('sofia_token', expectedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 86400,
        path: '/',
      });
      return response;
    }

    return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const expectedToken = process.env.SOFIA_AUTH_TOKEN || process.env.SOFIA_API_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ authenticated: true, devMode: true });
  }

  const cookieToken = req.cookies.get('sofia_token')?.value;
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  const isAuth = cookieToken === expectedToken || authHeader === expectedToken;
  return NextResponse.json({ authenticated: isAuth });
}
