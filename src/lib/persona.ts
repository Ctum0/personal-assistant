import { SofiaSettings } from './types';
import {
  DEFAULT_PERSONALITY_DIALS,
  type ToneCalibrationSample,
  TONE_CALIBRATION_FIXTURES,
  buildMasterPersonaPrompt,
} from './persona.unified';

export {
  DEFAULT_PERSONALITY_DIALS,
  type ToneCalibrationSample,
  TONE_CALIBRATION_FIXTURES,
};

/**
 * Builds the master text persona prompt for Sofia.
 * Backed by the unified persona specification (src/lib/persona.unified.ts).
 */
export function buildPersonaPrompt(settings: SofiaSettings): string {
  return buildMasterPersonaPrompt(settings);
}
