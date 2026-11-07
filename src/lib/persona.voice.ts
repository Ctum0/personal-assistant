import { DatabaseSync } from 'node:sqlite';
import { buildLiveContextBlock } from './brain';
import { buildMasterVoicePersona } from './persona.unified';

/**
 * Sofia Voice Persona (Spec §D.3)
 * Derived from the master unified persona specification (src/lib/persona.unified.ts)
 * and tailored for low-latency, natural turn-taking voice interaction with Gemini Live API.
 */
export function buildVoicePersona(db: DatabaseSync, conversationId?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const contextBlock = buildLiveContextBlock(db, today);

  let pinnedNotes: Array<{ text: string }> = [];
  try {
    pinnedNotes = db
      .prepare('SELECT text FROM memory_notes WHERE pinned = 1 LIMIT 4')
      .all() as Array<{ text: string }>;
  } catch {}

  // Fetch recent conversation history from SQLite messages table for text-to-voice continuity
  let recentMessages: Array<{ role: string; content: string; channel?: string }> = [];
  try {
    const convId = conversationId || 'default';
    recentMessages = db
      .prepare(
        'SELECT role, content, channel FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 6'
      )
      .all(convId) as Array<{ role: string; content: string; channel?: string }>;
    recentMessages.reverse();
  } catch {}

  const contextStr = JSON.stringify(
    {
      today: contextBlock.today,
      open_tasks: contextBlock.open_tasks,
      current_app: contextBlock.current_app,
      pinned_memory: pinnedNotes.map((n) => n.text),
      recent_conversation: recentMessages.map((m) => ({
        role: m.role,
        text: m.content.slice(0, 200),
        channel: m.channel || 'text',
      })),
    },
    null,
    2
  );

  return buildMasterVoicePersona(contextStr);
}
