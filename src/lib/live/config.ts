import { DatabaseSync } from 'node:sqlite';
import { buildVoicePersona } from '../persona.voice';
import { buildGeminiFunctionDeclarations } from '../tools';

export interface LiveConfig {
  model: string;
  voice: string;
  modalities: string[];
  systemPrompt: string;
  functionDeclarations: any[];
  realtimeInputConfig: {
    automaticActivityDetection: {
      prefixPaddingMs: number;
      silenceDurationMs: number;
      startOfSpeechSensitivity: string;
      endOfSpeechSensitivity: string;
    };
  };
}

export function getLiveConfig(
  db: DatabaseSync,
  conversationId?: string,
  overrides?: { voice?: string; model?: string }
): LiveConfig {
  const modalities =
    (process.env.SOFIA_LIVE_MODALITIES ?? 'AUDIO') === 'TEXT' ? ['TEXT'] : ['AUDIO'];

  return {
    model: overrides?.model || process.env.SOFIA_LIVE_MODEL || 'gemini-3.8-live',
    voice: overrides?.voice || process.env.SOFIA_LIVE_VOICE || 'Aoede',
    modalities,
    systemPrompt: buildVoicePersona(db, conversationId),
    functionDeclarations: buildGeminiFunctionDeclarations(),
    realtimeInputConfig: {
      automaticActivityDetection: {
        prefixPaddingMs: 100,
        silenceDurationMs: Number(process.env.SOFIA_VAD_SILENCE_MS ?? 500),
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
      },
    },
  };
}
