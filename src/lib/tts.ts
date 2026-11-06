import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const AUDIO_DIR = path.join(process.cwd(), 'data', 'audio');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

const MAX_CACHE_FILES = 300;
const ELEVENLABS_MONTHLY_CAP = 10000;

export function pruneAudioCache(): void {
  try {
    if (!fs.existsSync(AUDIO_DIR)) return;
    const files = fs.readdirSync(AUDIO_DIR)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => {
        const filePath = path.join(AUDIO_DIR, f);
        const stats = fs.statSync(filePath);
        return { path: filePath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime);

    if (files.length > MAX_CACHE_FILES) {
      const excess = files.length - MAX_CACHE_FILES;
      for (let i = 0; i < excess; i++) {
        fs.unlinkSync(files[i].path);
      }
    }
  } catch (err) {
    console.warn('Audio cache pruning failed:', err);
  }
}

export function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function elevenLabsBudgetLeft(db: DatabaseSync): number {
  try {
    const month = getCurrentMonth();
    const row = db
      .prepare('SELECT SUM(chars) as total FROM tts_usage WHERE month = ? AND provider = ?')
      .get(month, 'elevenlabs') as { total: number | null } | undefined;
    const used = row?.total ?? 0;
    return Math.max(0, ELEVENLABS_MONTHLY_CAP - used);
  } catch (err) {
    console.warn('Failed to query elevenlabs budget:', err);
    return 0;
  }
}

export function recordElevenLabsUsage(db: DatabaseSync, chars: number): void {
  try {
    const id = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const month = getCurrentMonth();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO tts_usage (id, provider, chars, month, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, 'elevenlabs', chars, month, now);
  } catch (err) {
    console.warn('Failed to record elevenlabs usage:', err);
  }
}

export interface EdgeTtsOptions {
  voice?: string;
  pitch?: string;
  rate?: string;
}

export async function synthesizeEdge(
  text: string,
  options: EdgeTtsOptions = {}
): Promise<{ buffer: Buffer; filePath: string }> {
  const voice = options.voice || 'en-US-AvaNeural';
  const pitch = options.pitch || '+25Hz';
  const rate = options.rate || '+6%';

  const hash = crypto
    .createHash('sha256')
    .update(`edge:${voice}:${pitch}:${rate}:${text}`)
    .digest('hex');
  const filePath = path.join(AUDIO_DIR, `${hash}.mp3`);

  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    return { buffer, filePath };
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { pitch, rate });

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    audioStream.on('data', (c: Buffer) => chunks.push(c));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', (err) => reject(err));
  });

  fs.writeFileSync(filePath, buffer);
  pruneAudioCache();

  return { buffer, filePath };
}

export interface ElevenLabsOptions {
  voiceId?: string;
  apiKey?: string;
}

export async function synthesizeElevenLabs(
  text: string,
  options: ElevenLabsOptions = {},
  db?: DatabaseSync
): Promise<{ buffer: Buffer; filePath: string }> {
  const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';
  const apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY || '';

  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  if (db) {
    const remaining = elevenLabsBudgetLeft(db);
    if (remaining < text.length) {
      throw new Error(`ElevenLabs monthly budget exhausted (${remaining} chars left, need ${text.length})`);
    }
  }

  const hash = crypto
    .createHash('sha256')
    .update(`elevenlabs:${voiceId}:${text}`)
    .digest('hex');
  const filePath = path.join(AUDIO_DIR, `${hash}.mp3`);

  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    return { buffer, filePath };
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs TTS error (${res.status}): ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  fs.writeFileSync(filePath, buffer);
  if (db) {
    recordElevenLabsUsage(db, text.length);
  }
  pruneAudioCache();

  return { buffer, filePath };
}
