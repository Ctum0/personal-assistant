import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings } from '@/lib/db';
import { checkHermesStatus, executeHermesComputerAction } from '@/lib/hermes';

export async function GET() {
  try {
    const db = getDatabase();
    const settings = getSettings(db);
    const status = await checkHermesStatus(settings);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDatabase();
    const settings = getSettings(db);
    const body = await req.json();

    const action = body.action || 'system_status';
    const param = body.param || '';

    const execution = await executeHermesComputerAction(action, param, settings);
    return NextResponse.json(execution);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
