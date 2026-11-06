import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings } from '@/lib/db';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const db = getDatabase();
    const settings = getSettings(db);

    const apiKey =
      body.apiKey ||
      process.env.ELEVENLABS_API_KEY;

    // Default to Bella or configured voice
    const voiceId =
      body.voiceId ||
      settings.voice.elevenlabs_voice_id ||
      'EXAVITQu4vr4xnSDxMaL';

    // Hash check for local disk cache
    const hash = crypto
      .createHash('sha256')
      .update(`${voiceId}:${text}`)
      .digest('hex');

    const cacheDir = path.join(process.cwd(), 'data', 'audio');
    const cachedFilePath = path.join(cacheDir, `${hash}.mp3`);

    if (fs.existsSync(cachedFilePath)) {
      const cachedBuffer = fs.readFileSync(cachedFilePath);
      return new NextResponse(cachedBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': cachedBuffer.byteLength.toString(),
          'Cache-Control': 'public, max-age=86400',
          'X-TTS-Cache': 'HIT',
        },
      });
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          fallback: true,
          message: 'No ElevenLabs API key configured. Use browser high-quality neural voice.',
        },
        { status: 200 }
      );
    }

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.warn('ElevenLabs API error, triggering fallback:', errText);
      return NextResponse.json(
        {
          fallback: true,
          error: `ElevenLabs error (${elevenRes.status}): ${errText}`,
        },
        { status: 200 }
      );
    }

    const audioArrayBuffer = await elevenRes.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    // Save to cache dir
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(cachedFilePath, audioBuffer);
    } catch (writeErr) {
      console.warn('Failed to cache TTS audio:', writeErr);
    }

    return new NextResponse(audioArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioArrayBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400',
        'X-TTS-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('TTS handler error:', err);
    return NextResponse.json(
      {
        fallback: true,
        error: String(err),
      },
      { status: 200 }
    );
  }
}
