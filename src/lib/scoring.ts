import { DayScore, DayStats, ScoreComponents, SofiaSettings } from './types';

export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function computeWakeScore(wokeAt: string | null, targetWakeTime: string): number {
  if (!wokeAt) return 0.5; // neutral fallback if wake time is unrecorded
  const wokeMin = parseTimeToMinutes(wokeAt);
  const targetMin = parseTimeToMinutes(targetWakeTime);

  if (wokeMin <= targetMin) return 1.0;
  const maxDelayMin = 4 * 60; // 4 hours
  const delay = wokeMin - targetMin;
  if (delay >= maxDelayMin) return 0.0;
  return Math.max(0, 1.0 - delay / maxDelayMin);
}

export function computeFocusScore(workMin: number, focusGoalHours: number): number {
  const goalMin = Math.max(1, focusGoalHours * 60);
  return Math.min(1.0, Math.max(0, workMin / goalMin));
}

export function computeOutputScore(commits: number, tasksCompleted: number, outputGoal: number): number {
  const goal = Math.max(1, outputGoal);
  const totalOutput = commits + tasksCompleted;
  return Math.min(1.0, Math.max(0, totalOutput / goal));
}

export function computeLeisureScore(leisureMin: number, activeMin: number): number {
  if (activeMin <= 0) return 1.0;
  const leisureRatio = leisureMin / activeMin;
  // 1.0 at <= 20%, falling linearly to 0 at >= 50%
  if (leisureRatio <= 0.20) return 1.0;
  if (leisureRatio >= 0.50) return 0.0;
  return Number(Math.max(0, 1.0 - (leisureRatio - 0.20) / (0.50 - 0.20)).toFixed(4));
}

export function computeSleepScore(sleepHours: number): number {
  // Ideal: 7 - 9 hours -> 1.0
  if (sleepHours >= 7.0 && sleepHours <= 9.0) return 1.0;
  if (sleepHours < 7.0) {
    // 5h or less = 0.0, 7h = 1.0
    if (sleepHours <= 5.0) return 0.0;
    return (sleepHours - 5.0) / 2.0;
  } else {
    // > 9.0: 11h or more = 0.0, 9h = 1.0
    if (sleepHours >= 11.0) return 0.0;
    return (11.0 - sleepHours) / 2.0;
  }
}

export function calculateDayScore(
  stats: DayStats,
  tasksCompleted: number,
  sleepHours: number,
  settings: SofiaSettings,
  streakDays: number = 0,
  dayStatus: 'normal' | 'rest' | 'sick' | 'travel' = 'normal'
): DayScore {
  const wake = computeWakeScore(stats.woke_at, settings.target_wake_time);
  const focus = computeFocusScore(stats.work_min, settings.daily_focus_hours);
  const output = computeOutputScore(stats.commits, tasksCompleted, settings.daily_output_goal);
  const leisure = computeLeisureScore(stats.leisure_min, stats.active_min);
  const sleep = computeSleepScore(sleepHours);

  const components: ScoreComponents = {
    wake: Number(wake.toFixed(3)),
    focus: Number(focus.toFixed(3)),
    output: Number(output.toFixed(3)),
    leisure: Number(leisure.toFixed(3)),
    sleep: Number(sleep.toFixed(3)),
  };

  const weights = settings.score_weights || { wake: 2, focus: 3, output: 2, leisure: 2, sleep: 1 };
  const totalWeight = weights.wake + weights.focus + weights.output + weights.leisure + weights.sleep;

  const rawWeightedSum =
    components.wake * weights.wake +
    components.focus * weights.focus +
    components.output * weights.output +
    components.leisure * weights.leisure +
    components.sleep * weights.sleep;

  const score = Number(((rawWeightedSum / totalWeight) * 10).toFixed(1));

  const leisurePct = stats.active_min > 0 ? Math.round((stats.leisure_min / stats.active_min) * 100) : 0;
  const focusHours = Number((stats.work_min / 60).toFixed(1));

  // Consequence eligibility rules
  const coverageEligible = (stats.coverage ?? 1.0) >= 0.80;
  const statusEligible = dayStatus === 'normal';
  const consequenceEligible = coverageEligible && statusEligible && score < 8.0;

  let suggestedIntensity = 0;
  if (consequenceEligible) {
    if (score >= 6.0) {
      suggestedIntensity = 15; // light haptic/vibration
    } else {
      // Scale from 20 up to max 60 based on score drop below 6
      suggestedIntensity = Math.min(settings.consequences.hard_ceiling, Math.round(20 + (6.0 - score) * 8));
    }
  }

  let verdictText = '';
  if (!coverageEligible) {
    verdictText = `Data coverage was only ${Math.round((stats.coverage ?? 0) * 100)}%. I only saw part of your day, so no penalty is applied. Let's make sure the PC agent stays connected tomorrow.`;
  } else if (dayStatus !== 'normal') {
    verdictText = `Marked as a ${dayStatus} day. Rest up. Streaks are paused.`;
  } else if (score >= 8.5) {
    verdictText = `Score is ${score}/10. ${stats.commits} commits, ${focusHours}h focus, and under ${leisurePct}% leisure. Exceptional discipline. That is earned.`;
  } else if (score >= 7.0) {
    verdictText = `Score is ${score}/10. ${focusHours}h focus logged, ${stats.commits} commits. Decent momentum, but you let leisure creep up to ${leisurePct}%.`;
  } else if (score >= 5.0) {
    verdictText = `Score is ${score}/10. ${leisurePct}% leisure and only ${focusHours}h of real focus. You slipped from your targets. Tomorrow starts promptly at ${settings.target_wake_time}.`;
  } else {
    verdictText = `Score is ${score}/10. Unacceptable drift: ${leisurePct}% leisure, ${focusHours}h focus vs ${settings.daily_focus_hours}h goal. A reset is necessary.`;
  }

  return {
    date: stats.date,
    score,
    components,
    verdict: {
      text: verdictText,
      woke_at: stats.woke_at,
      commits: stats.commits,
      leisure_pct: leisurePct,
      focus_hours: focusHours,
      streak_days: streakDays,
      consequence_eligible: consequenceEligible,
      suggested_intensity: suggestedIntensity,
    },
    intensity: suggestedIntensity,
    status: dayStatus,
  };
}
