import { describe, it, expect } from 'vitest';
import { TONE_CALIBRATION_FIXTURES, buildPersonaPrompt } from '../src/lib/persona';
import { defaultSettings } from '../src/lib/types';

describe('Persona Bible', () => {
  it('contains all tone calibration fixtures from spec §2', () => {
    expect(TONE_CALIBRATION_FIXTURES.length).toBeGreaterThanOrEqual(6);
  });

  it('asserts every sample tone calibration line contains a digit (concrete fact rule)', () => {
    for (const fixture of TONE_CALIBRATION_FIXTURES) {
      const containsDigit = /\d/.test(fixture.line);
      expect(containsDigit, `Sample line for "${fixture.situation}" must contain a digit: "${fixture.line}"`).toBe(true);
    }
  });

  it('builds persona prompt containing strictness dials and core rules', () => {
    const prompt = buildPersonaPrompt(defaultSettings);
    expect(prompt).toContain('Sofia');
    expect(prompt).toContain('Strictness: 7/10');
    expect(prompt).toContain('Warmth: 6/10');
    expect(prompt).toContain('HARD LIMITS');
    expect(prompt).toContain('SPEECH RULES');
    expect(prompt).not.toContain('The user is not a software developer');
  });
});
