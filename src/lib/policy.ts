import { ConsequenceLogEntry, DayScore, SofiaSettings } from './types';

export interface PolicyCheckResult {
  allowed: boolean;
  clampedIntensity: number;
  reason: string;
}

export function evaluateConsequencePolicy(
  requestedKind: ConsequenceLogEntry['kind'],
  requestedIntensity: number,
  scoreData: DayScore,
  settings: SofiaSettings,
  recentActionsToday: ConsequenceLogEntry[],
  currentTime: Date = new Date()
): PolicyCheckResult {
  const consequences = settings.consequences;

  // 1. Kill switch
  if (consequences.kill_switch_active) {
    return {
      allowed: false,
      clampedIntensity: 0,
      reason: 'BLOCKED: Emergency kill switch is currently engaged.',
    };
  }

  // 2. Master switch
  if (!consequences.master_switch) {
    return {
      allowed: false,
      clampedIntensity: 0,
      reason: 'BLOCKED: Master consequence switch is turned OFF.',
    };
  }

  // 3. Day status check
  if (scoreData.status !== 'normal') {
    return {
      allowed: false,
      clampedIntensity: 0,
      reason: `BLOCKED: Consequences paused for ${scoreData.status} day.`,
    };
  }

  // 4. Coverage check (< 80% coverage)
  if (!scoreData.verdict.consequence_eligible) {
    return {
      allowed: false,
      clampedIntensity: 0,
      reason: 'BLOCKED: Low telemetry coverage (<80%) or score is 8.0+. No consequence applies.',
    };
  }

  // 5. Rung enabled check
  if (!consequences.enabled_rungs[requestedKind]) {
    return {
      allowed: false,
      clampedIntensity: 0,
      reason: `BLOCKED: Consequence rung '${requestedKind}' is not enabled in settings.`,
    };
  }

  // 6. Quiet hours check
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const currentMin = hours * 60 + minutes;

  const [wakeH, wakeM] = settings.target_wake_time.split(':').map(Number);
  const [bedH, bedM] = settings.target_bed_time.split(':').map(Number);
  const wakeMin = wakeH * 60 + wakeM;
  const bedMin = bedH * 60 + bedM;

  const isQuietHours =
    bedMin > wakeMin
      ? currentMin >= bedMin || currentMin < wakeMin
      : currentMin >= bedMin && currentMin < wakeMin;

  if (isQuietHours) {
    return {
      allowed: false,
      clampedIntensity: 0,
      reason: 'BLOCKED: Currently within quiet hours (between bedtime and wake time).',
    };
  }

  // 7. Daily cap check
  const successfulFiredToday = recentActionsToday.filter(
    (a) => a.status === 'fired' || a.status === 'dry_run'
  );
  if (successfulFiredToday.length >= consequences.daily_cap) {
    return {
      allowed: false,
      clampedIntensity: 0,
      reason: `BLOCKED: Daily cap of ${consequences.daily_cap} actions reached for today.`,
    };
  }

  // 8. Minimum gap check (e.g. 30 minutes)
  if (successfulFiredToday.length > 0) {
    const lastAction = successfulFiredToday[successfulFiredToday.length - 1];
    const lastTime = new Date(lastAction.ts).getTime();
    const elapsedMinutes = (currentTime.getTime() - lastTime) / (1000 * 60);

    if (elapsedMinutes < consequences.min_gap_minutes) {
      return {
        allowed: false,
        clampedIntensity: 0,
        reason: `BLOCKED: Minimum cooldown of ${consequences.min_gap_minutes}m not met (${Math.round(
          consequences.min_gap_minutes - elapsedMinutes
        )}m remaining).`,
      };
    }
  }

  // 9. Hard ceiling enforcement
  const clampedIntensity = Math.min(
    consequences.hard_ceiling,
    Math.max(0, requestedIntensity)
  );

  return {
    allowed: true,
    clampedIntensity,
    reason: consequences.dry_run_mode
      ? `APPROVED (DRY RUN): Intensity clamped to ${clampedIntensity}%. Device disconnected.`
      : `APPROVED: Intensity clamped to ${clampedIntensity}%.`,
  };
}
