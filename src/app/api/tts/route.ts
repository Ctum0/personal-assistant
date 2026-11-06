import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSettings } from '@/lib/db';
import {
  synthesizeEdge,
  synthesizeElevenLabs,
  elevenLabsBudgetLeft,
} from '@/lib/tts';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const db = getDatabase();
    const settings = getSettings(db);

    const requestedProvider = body.provider || settings.voice?.provider || 'edge';
    const voice = body.voice || settings.voice?.voice_name;

    let audioBuffer: Buffer;

    // Check if ElevenLabs is explicitly requested, has API key, and has remaining budget
    if (
      requestedProvider === 'elevenlabs' &&
      process.env.ELEVENLABS_API_KEY &&
      elevenLabsBudgetLeft(db) >= text.length
    ) {
      try {
        const voiceId = body.voiceId || settings.voice?.elevenlabs_voice_id || 'EXAVITQu4vr4xnSDxMaL';
        const res = await synthesizeElevenLabs(
          text,
          { voiceId, apiKey: process.env.ELEVENLABS_API_KEY },
          db
        );
        audioBuffer = res.buffer;
      } catch (err) {
        console.warn('ElevenLabs TTS failed, falling back to Edge TTS:', err);
        const res = await synthesizeEdge(text, {
          voice: 'en-US-AvaNeural',
          pitch: '+25Hz',
          rate: '+6%',
        });
        audioBuffer = res.buffer;
      }
    } else {
      // Default to Edge TTS: unlimited, free, high quality
      const res = await synthesizeEdge(text, {
        voice: voice || 'en-US-AvaNeural',
        pitch: '+25Hz',
        rate: '+6%',
      });
      audioBuffer = res.buffer;
    }

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err: any) {
    console.error('TTS route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to synthesize speech' },
      { status: 500 }
    );
  }
}
