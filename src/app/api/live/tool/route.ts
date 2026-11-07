import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings } from '@/lib/db';
import { executeTool } from '@/lib/tools';
import { verifyApiAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const body = await req.json().catch(() => ({}));
    const { name, args } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Tool name is required' }, { status: 400 });
    }

    const db = getDatabase();
    const settings = getSettings(db);

    const execResult = await executeTool(db, name, args || {}, settings);

    return NextResponse.json(execResult);
  } catch (err: any) {
    console.error('Live tool execution error:', err);
    return NextResponse.json(
      { error: err?.message || 'Tool execution failed' },
      { status: 500 }
    );
  }
}
