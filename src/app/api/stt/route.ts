import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';


/**
 * Server-side Speech-to-Text Endpoint.
 * Receives audio (audio/webm, audio/wav, audio/ogg) from the browser's MediaRecorder
 * and forwards it to the private self-hosted Whisper ASR service on the VPS.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data' },
        { status: 400 }
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 });
    }

    const audioFile = (formData.get('file') || formData.get('audio') || formData.get('audio_file')) as File | null;
    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required (fields: file, audio, audio_file)' }, { status: 400 });
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ text: '', language: 'en' });
    }

    const whisperBaseUrl = (process.env.WHISPER_URL || 'http://sofia-transcription:9000').replace(/\/+$/, '');
    const asrUrl = `${whisperBaseUrl}/asr?encode=true&task=transcribe&output=json`;

    const blob = new Blob([arrayBuffer], { type: audioFile.type || 'audio/webm' });
    const forwardData = new FormData();
    forwardData.append('audio_file', blob, audioFile.name || 'recording.webm');

    const whisperRes = await fetch(asrUrl, {
      method: 'POST',
      body: forwardData,
      signal: AbortSignal.timeout(15000),
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text().catch(() => whisperRes.statusText);
      console.error(`Whisper service error (${whisperRes.status}):`, errText);
      return NextResponse.json(
        { error: 'Transcription service error', details: errText },
        { status: 502 }
      );
    }

    const data = await whisperRes.json();
    const rawText = typeof data.text === 'string' ? data.text : '';
    const cleanedText = rawText.trim();

    return NextResponse.json({
      text: cleanedText,
      language: data.language || 'en',
    });
  } catch (err: any) {
    console.error('STT route error:', err);
    return NextResponse.json(
      { error: 'Internal STT processing failure', message: err.message },
      { status: 500 }
    );
  }
}
