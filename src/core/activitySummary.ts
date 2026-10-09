import type { Activity } from './types';
import { compareActivitiesNewest, parseMovingSeconds } from './activityDisplay';

export type SummaryInterval = 'year' | 'month' | 'week' | 'day';
export type SummaryActivity = Pick<
  Activity,
  'run_id' | 'start_date_local' | 'distance' | 'moving_time' | 'type'
> & { average_heartrate?: number | null };

export interface ActivitySummary<T extends SummaryActivity> {
  activities: T[];
  distanceMeters: number | null;
  movingSeconds: number | null;
  paceSpeed: number | null;
  averageHeartRate: number | null;
  missingDurations: number;
}

export function summarizeActivities<T extends SummaryActivity>(
  activities: readonly T[]
): ActivitySummary<T> {
  let distanceMeters = 0;
  let distances = 0;
  let movingSeconds = 0;
  let durations = 0;
  let paceMeters = 0;
  let paceSeconds = 0;
  let heartRateTotal = 0;
  let heartRates = 0;
  for (const activity of activities) {
    const distance = activity.distance;
    const seconds = parseMovingSeconds(activity.moving_time);
    const validDistance = Number.isFinite(distance) && distance >= 0;
    if (validDistance) {
      distanceMeters += distance;
      distances++;
    }
    if (seconds !== null) {
      movingSeconds += seconds;
      durations++;
    }
    if (validDistance && distance > 0 && seconds !== null && seconds > 0) {
      paceMeters += distance;
      paceSeconds += seconds;
    }
    if (
      activity.average_heartrate != null &&
      Number.isFinite(activity.average_heartrate)
    ) {
      heartRateTotal += activity.average_heartrate;
      heartRates++;
    }
  }
  return {
    activities: activities.toSorted(compareActivitiesNewest),
    distanceMeters: distances ? distanceMeters : null,
    movingSeconds: durations ? movingSeconds : null,
    paceSpeed: paceSeconds > 0 ? paceMeters / paceSeconds : null,
    averageHeartRate: heartRates ? heartRateTotal / heartRates : null,
    missingDurations: activities.length - durations,
  };
}

export function activityPeriod(
  dateTime: string,
  interval: SummaryInterval
): string | null {
  const day = dateTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    return null;
  if (interval === 'year') return day.slice(0, 4);
  if (interval === 'month') return day.slice(0, 7);
  if (interval === 'day') return day;
  // 用本地日历日期的 UTC 表示求周一，避免夏令时和 ISO 跨年周错位。
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function groupActivityPeriods<T extends SummaryActivity>(
  activities: readonly T[],
  interval: SummaryInterval
): Array<{ period: string; summary: ActivitySummary<T> }> {
  const groups = new Map<string, T[]>();
  for (const activity of activities) {
    const period = activityPeriod(activity.start_date_local, interval);
    if (period === null) continue;
    const group = groups.get(period) ?? [];
    group.push(activity);
    groups.set(period, group);
  }
  return Array.from(groups, ([period, values]) => ({
    period,
    summary: summarizeActivities(values),
  })).sort((a, b) => b.period.localeCompare(a.period));
}

export function formatSummaryDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分`;
}
