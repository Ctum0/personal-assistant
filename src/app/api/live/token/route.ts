import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getLiveConfig } from '@/lib/live/config';
import { verifyApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on server' },
      { status: 500 }
    );
  }

  const bodyData = await req.json().catch(() => ({}));
  const conversationId = bodyData.conversationId || req.nextUrl.searchParams.get('conversationId') || 'default';

  const now = Date.now();
  const db = getDatabase();
  const cfg = getLiveConfig(db, conversationId);

  const body = {
    uses: 1,
    expireTime: new Date(now + 30 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + 60_000).toISOString(),
  };

  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('auth_tokens minting failed', res.status, text);
      return NextResponse.json(
        { error: 'token_mint_failed', status: res.status, detail: text },
        { status: 502 }
      );
    }

    const tokenObj = JSON.parse(text);
    const tokenVal = (tokenObj.name || '').replace(/^auth_tokens\//, '');

    return NextResponse.json({
      token: tokenVal,
      tokenName: tokenObj.name,
      expiresIn: 1800,
      model: cfg.model,
      voice: cfg.voice,
      modalities: cfg.modalities,
      systemPrompt: cfg.systemPrompt,
      functionDeclarations: cfg.functionDeclarations,
      realtimeInputConfig: cfg.realtimeInputConfig,
    });
  } catch (err: any) {
    console.error('Token route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to mint auth token' },
      { status: 500 }
    );
  }
}
