import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { verifyApiAuth } from '@/lib/auth';
import { HermesBrowserToolAdapter } from '@/lib/browser/hermes-adapter';

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Unauthorized: Missing or invalid authentication token' } },
        { status: 401 }
      );
    }

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const adapter = new HermesBrowserToolAdapter(db, 'conv_main');
    const result = await adapter.handleJsonRpc(body);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: err.message || 'Internal error' } },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const db = getDatabase();
  const adapter = new HermesBrowserToolAdapter(db, 'conv_main');
  return NextResponse.json({
    name: 'sofia-browser',
    protocol: 'jsonrpc-2.0',
    tools: adapter.listTools(),
  });
}
