import { describe, it, expect } from 'vitest';
import { evaluateConsequencePolicy } from '../src/lib/policy';
import { ConsequenceLogEntry, DayScore, SofiaSettings, defaultSettings } from '../src/lib/types';

describe('Safety Policy Unit Tests', () => {
  const eligibleDayScore: DayScore = {
    date: '2026-11-06',
    score: 4.5,
    components: { wake: 0.2, focus: 0.4, output: 0.3, leisure: 0.1, sleep: 0.5 },
    verdict: {
      text: 'Weak day',
      woke_at: '11:30',
      commits: 1,
      leisure_pct: 45,
      focus_hours: 2.0,
      streak_days: 0,
      consequence_eligible: true,
      suggested_intensity: 35,
    },
    intensity: 35,
    status: 'normal',
  };

  const enabledSettings: SofiaSettings = {
    ...defaultSettings,
    consequences: {
      ...defaultSettings.consequences,
      master_switch: true,
      enabled_rungs: {
        words: true,
        friction: true,
        alarm: true,
        stakes: true,
        haptic: true,
        stimulus: true,
      },
      hard_ceiling: 40,
      daily_cap: 2,
      min_gap_minutes: 30,
      kill_switch_active: false,
      dry_run_mode: false,
    },
  };

  it('blocks if master switch is off', () => {
    const res = evaluateConsequencePolicy('haptic', 25, eligibleDayScore, defaultSettings, []);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Master consequence switch is turned OFF');
  });

  it('blocks if kill switch is active', () => {
    const killedSettings = {
      ...enabledSettings,
      consequences: { ...enabledSettings.consequences, kill_switch_active: true },
    };
    const res = evaluateConsequencePolicy('haptic', 25, eligibleDayScore, killedSettings, []);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Emergency kill switch');
  });

  it('clamps intensity to hard ceiling', () => {
    // 2:00 PM (not quiet hours)
    const afternoonTime = new Date('2026-11-06T14:00:00');
    const res = evaluateConsequencePolicy('haptic', 80, eligibleDayScore, enabledSettings, [], afternoonTime);
    expect(res.allowed).toBe(true);
    // Hard ceiling is 40
    expect(res.clampedIntensity).toBe(40);
  });

  it('blocks during quiet hours (e.g. 2:00 AM)', () => {
    const midnightTime = new Date('2026-11-06T02:00:00');
    const res = evaluateConsequencePolicy('haptic', 25, eligibleDayScore, enabledSettings, [], midnightTime);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('quiet hours');
  });

  it('blocks if daily cap is reached', () => {
    const afternoonTime = new Date('2026-11-06T15:00:00');
    const pastActions: ConsequenceLogEntry[] = [
      { id: '1', ts: '2026-11-06T10:00:00Z', kind: 'haptic', intensity: 20, reason: 'test', approved_by: 'system', status: 'fired' },
      { id: '2', ts: '2026-11-06T12:00:00Z', kind: 'haptic', intensity: 20, reason: 'test', approved_by: 'system', status: 'fired' },
    ];
    const res = evaluateConsequencePolicy('haptic', 25, eligibleDayScore, enabledSettings, pastActions, afternoonTime);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Daily cap');
  });

  it('blocks if 30-minute cooldown not met', () => {
    const timeNow = new Date('2026-11-06T14:15:00');
    const pastActions: ConsequenceLogEntry[] = [
      { id: '1', ts: new Date('2026-11-06T14:00:00').toISOString(), kind: 'haptic', intensity: 20, reason: 'test', approved_by: 'system', status: 'fired' },
    ];
    const res = evaluateConsequencePolicy('haptic', 25, eligibleDayScore, enabledSettings, pastActions, timeNow);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Minimum cooldown');
  });
});
