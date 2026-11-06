import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings, updateSettings } from '@/lib/db';

function stripSecrets(settings: any) {
  const sanitized = JSON.parse(JSON.stringify(settings));
  if (sanitized.hermes) {
    // Strip hermes.api_key entirely from response
    delete sanitized.hermes.api_key;
  }
  if (sanitized.voice) {
    sanitized.voice.elevenlabs_api_key = sanitized.voice.elevenlabs_api_key ? { set: true } : { set: false };
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
    const current = getSettings(db);
    const body = await req.json();

    // Preserve secrets if stripped or missing in incoming body
    if (body.hermes) {
      if (typeof body.hermes.api_key !== 'string') {
        body.hermes.api_key = current.hermes?.api_key || '';
      }
    }
    if (body.voice) {
      if (typeof body.voice.elevenlabs_api_key !== 'string') {
        body.voice.elevenlabs_api_key = current.voice?.elevenlabs_api_key || '';
      }
    }

    const updated = updateSettings(db, body);
    return NextResponse.json(stripSecrets(updated));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
