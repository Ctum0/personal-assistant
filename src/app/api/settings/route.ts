import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings, updateSettings } from '@/lib/db';

function stripSecrets(settings: any) {
  const sanitized = JSON.parse(JSON.stringify(settings));
  if (sanitized.hermes) {
    delete sanitized.hermes.api_key;
  }
  if (sanitized.voice) {
    delete sanitized.voice.elevenlabs_api_key;
  }
  return sanitized;
}

export async function GET() {
  try {
    const db = getDatabase();
    const settings = getSettings(db);
    return NextResponse.json(stripSecrets(settings));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDatabase();
    const body = await req.json();

    const updated = updateSettings(db, body);
    return NextResponse.json(stripSecrets(updated));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
