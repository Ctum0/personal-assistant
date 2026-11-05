import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings, updateSettings } from '@/lib/db';

export async function GET() {
  try {
    const db = getDatabase();
    const settings = getSettings(db);
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDatabase();
    const body = await req.json();
    const updated = updateSettings(db, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
