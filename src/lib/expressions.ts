import { SofiaExpression } from './types';

export const MOOD_TO_EXPRESSION: Record<string, SofiaExpression> = {
  neutral: 'neutral',
  pleased: 'pleased',
  amused: 'amused',
  proud: 'pleased',
  strict: 'stern',
  stern: 'stern',
  disappointed: 'disappointed',
  concerned: 'concerned',
  curious: 'focused',
  focused: 'focused',
  sleepy: 'sleepy',
  alarmed: 'stern',
};

export function getExpressionFromMood(mood?: string | null): SofiaExpression {
  if (!mood) return 'neutral';
  const clean = mood.toLowerCase().trim();
  return MOOD_TO_EXPRESSION[clean] || 'neutral';
}

export const EXPRESSION_IMAGES: Record<SofiaExpression, string> = {
  neutral: '/sofia/expressions/neutral.webp',
  pleased: '/sofia/expressions/pleased.webp',
  amused: '/sofia/expressions/amused.webp',
  focused: '/sofia/expressions/focused.webp',
  stern: '/sofia/expressions/stern.webp',
  disappointed: '/sofia/expressions/disappointed.webp',
  concerned: '/sofia/expressions/concerned.webp',
  sleepy: '/sofia/expressions/sleepy.webp',
};
