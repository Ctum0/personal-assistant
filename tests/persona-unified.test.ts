import { describe, it, expect } from 'vitest';
import {
  SOFIA_PERSONA_VERSION,
  NATURAL_PROGRESS_LINES,
  getNaturalProgressLine,
  buildHermesEphemeralInstructions,
  buildMasterPersonaPrompt,
  buildMasterVoicePersona,
} from '@/lib/persona.unified';
import { defaultSettings } from '@/lib/types';

describe('Unified Sofia Personality Specification', () => {
  it('exports version and core progress lines', () => {
    expect(SOFIA_PERSONA_VERSION).toBe('2.0.0');
    expect(NATURAL_PROGRESS_LINES.dispatch).toBe("I'm checking that now.");
    expect(NATURAL_PROGRESS_LINES.completed).toBe("Done. I've verified the result.");
    expect(NATURAL_PROGRESS_LINES.waiting_approval).toContain('needs your approval');
  });

  it('maps run lifecycle events to natural Sofia responses without log dump', () => {
    expect(getNaturalProgressLine('waiting_approval')).toEqual({
      say: NATURAL_PROGRESS_LINES.waiting_approval,
      mood: 'stern',
    });
    expect(getNaturalProgressLine('completed')).toEqual({
      say: NATURAL_PROGRESS_LINES.completed,
      mood: 'pleased',
    });
    expect(getNaturalProgressLine('failed')).toEqual({
      say: NATURAL_PROGRESS_LINES.failed,
      mood: 'concerned',
    });
    expect(getNaturalProgressLine('stopped')).toEqual({
      say: NATURAL_PROGRESS_LINES.cancelled,
      mood: 'neutral',
    });
    expect(getNaturalProgressLine('running', 'browse_url')).toEqual({
      say: NATURAL_PROGRESS_LINES.research,
      mood: 'focused',
    });
    expect(getNaturalProgressLine('running', 'computer_run')).toEqual({
      say: NATURAL_PROGRESS_LINES.execution,
      mood: 'focused',
    });
    expect(getNaturalProgressLine('running', 'computer_file_read')).toEqual({
      say: NATURAL_PROGRESS_LINES.files,
      mood: 'focused',
    });
  });

  it('builds concise ephemeral instructions for Hermes without mutating global persona', () => {
    const instructions = buildHermesEphemeralInstructions(defaultSettings);
    expect(instructions).toContain('You are Sofia');
    expect(instructions).toContain('chief of staff');
    expect(instructions).toContain('Strictness 7/10');
    expect(instructions).toContain('Never simulate or invent data');
  });

  it('maintains consistency between text and voice personality cores', () => {
    const textPrompt = buildMasterPersonaPrompt(defaultSettings);
    const voicePrompt = buildMasterVoicePersona('{}');

    expect(textPrompt).toContain('You are Sofia');
    expect(voicePrompt).toContain('You are Sofia');
    expect(textPrompt).toContain('Chief of staff first');
    expect(voicePrompt).toContain('chief of staff');
    expect(textPrompt).toContain('HARD LIMITS');
    expect(voicePrompt).toContain('The line you don\'t cross');
  });
});
