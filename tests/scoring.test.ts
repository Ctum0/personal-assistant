import { describe, it, expect } from 'vitest';
import {
  computeWakeScore,
  computeFocusScore,
  computeOutputScore,
  computeLeisureScore,
  computeSleepScore,
  calculateDayScore,
} from '../src/lib/scoring';
import { DayStats, SofiaSettings, defaultSettings } from '../src/lib/types';

describe('Scoring Engine Unit Tests', () => {
  it('computes wake score correctly: on or before target is 1.0, 4h late is 0.0', () => {
    expect(computeWakeScore('07:00', '07:30')).toBe(1.0);
    expect(computeWakeScore('07:30', '07:30')).toBe(1.0);
    // 2 hours late -> 0.5
    expect(computeWakeScore('09:30', '07:30')).toBe(0.5);
    // 4 hours late -> 0.0
    expect(computeWakeScore('11:30', '07:30')).toBe(0.0);
    // 5 hours late -> clamped to 0.0
    expect(computeWakeScore('12:30', '07:30')).toBe(0.0);
    // missing wake time -> 0.5 fallback
    expect(computeWakeScore(null, '07:30')).toBe(0.5);
  });

  it('computes focus score correctly', () => {
    // 5 hours goal (300 min)
    expect(computeFocusScore(300, 5.0)).toBe(1.0);
    expect(computeFocusScore(150, 5.0)).toBe(0.5);
    expect(computeFocusScore(450, 5.0)).toBe(1.0); // capped at 1.0
    expect(computeFocusScore(0, 5.0)).toBe(0.0);
  });

  it('computes output score correctly', () => {
    // 6 output goal (commits + tasks)
    expect(computeOutputScore(4, 2, 6)).toBe(1.0);
    expect(computeOutputScore(3, 0, 6)).toBe(0.5);
    expect(computeOutputScore(8, 4, 6)).toBe(1.0); // capped at 1.0
  });

  it('computes leisure score correctly: <=20% is 1.0, >=50% is 0.0', () => {
    // 100 min total: 15 min leisure (15%) -> 1.0
    expect(computeLeisureScore(15, 100)).toBe(1.0);
    // 20 min leisure (20%) -> 1.0
    expect(computeLeisureScore(20, 100)).toBe(1.0);
    // 35 min leisure (35%) -> halfway between 20% and 50% -> 0.5
    expect(computeLeisureScore(35, 100)).toBe(0.5);
    // 50 min leisure (50%) -> 0.0
    expect(computeLeisureScore(50, 100)).toBe(0.0);
    // 70 min leisure (70%) -> 0.0
    expect(computeLeisureScore(70, 100)).toBe(0.0);
    // 0 active min -> 1.0
    expect(computeLeisureScore(0, 0)).toBe(1.0);
  });

  it('computes sleep score correctly: 7-9h is 1.0, drops outside', () => {
    expect(computeSleepScore(8.0)).toBe(1.0);
    expect(computeSleepScore(7.0)).toBe(1.0);
    expect(computeSleepScore(9.0)).toBe(1.0);
    // 6.0 hours -> 0.5
    expect(computeSleepScore(6.0)).toBe(0.5);
    // <= 5.0 hours -> 0.0
    expect(computeSleepScore(4.5)).toBe(0.0);
    // 10.0 hours -> 0.5
    expect(computeSleepScore(10.0)).toBe(0.5);
    // >= 11.0 hours -> 0.0
    expect(computeSleepScore(11.5)).toBe(0.0);
  });

  it('computes high score day (8+ commits, low leisure, early wake)', () => {
    const stats: DayStats = {
      date: '2026-11-06',
      active_min: 360,
      work_min: 300,
      leisure_min: 40, // 11%
      neutral_min: 20,
      commits: 6,
      woke_at: '07:15',
      bed_at: '23:15',
      coverage: 0.95,
    };
    const dayScore = calculateDayScore(stats, 2, 8.0, defaultSettings, 5);
    expect(dayScore.score).toBeGreaterThanOrEqual(9.0);
    expect(dayScore.verdict.consequence_eligible).toBe(false); // 8+ gives no consequence
  });

  it('handles low coverage (<80%) by disabling consequences', () => {
    const stats: DayStats = {
      date: '2026-11-06',
      active_min: 60,
      work_min: 20,
      leisure_min: 40,
      neutral_min: 0,
      commits: 0,
      woke_at: '11:00',
      bed_at: null,
      coverage: 0.65, // < 80%
    };
    const dayScore = calculateDayScore(stats, 0, 6.0, defaultSettings, 0);
    expect(dayScore.verdict.consequence_eligible).toBe(false);
    expect(dayScore.verdict.text).toContain('only saw part of your day');
  });
});
