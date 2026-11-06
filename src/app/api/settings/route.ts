import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings, updateSettings } from '@/lib/db';

function redactSecrets(settings: any) {
  const redacted = JSON.parse(JSON.stringify(settings));
  if (redacted.hermes) {
    redacted.hermes.api_key = redacted.hermes.api_key ? { set: true } : { set: false };
  }
  if (redacted.voice) {
    redacted.voice.elevenlabs_api_key = redacted.voice.elevenlabs_api_key ? { set: true } : { set: false };
  }
  return redacted;
}

export async function GET() {
  try {
    const db = getDatabase();
    const settings = getSettings(db);
    return NextResponse.json(redactSecrets(settings));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = getDatabase();
    const current = getSettings(db);
    const body = await req.json();

    // Preserve secrets if redacted or missing in incoming body
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
    return NextResponse.json(redactSecrets(updated));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
