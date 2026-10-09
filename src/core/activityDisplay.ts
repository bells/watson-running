import type { Activity } from './types';

export const MISSING_VALUE = '—';

export function formatDistanceMeters(
  meters: number | null | undefined,
  digits = 1
): string {
  if (meters == null || !Number.isFinite(meters) || meters < 0) {
    return MISSING_VALUE;
  }
  return (meters / 1000).toFixed(digits);
}

export function formatPaceFromSpeed(
  speedMs: number | null | undefined,
  style: 'clock' | 'runner' = 'clock'
): string {
  if (speedMs == null || !Number.isFinite(speedMs) || speedMs <= 0) {
    return MISSING_VALUE;
  }
  const totalSeconds = Math.round(1000 / speedMs);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return style === 'runner'
    ? `${minutes}′${seconds}″`
    : `${minutes}:${seconds}`;
}

export function formatPaceFromElapsed(
  movingSeconds: number | null | undefined,
  distanceMeters: number | null | undefined
): string {
  if (
    movingSeconds == null ||
    distanceMeters == null ||
    !Number.isFinite(movingSeconds) ||
    !Number.isFinite(distanceMeters) ||
    movingSeconds <= 0 ||
    distanceMeters <= 0
  ) {
    return MISSING_VALUE;
  }
  return formatPaceFromSpeed(distanceMeters / movingSeconds, 'runner');
}

export function parseMovingSeconds(
  value: string | null | undefined
): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(?:(\d+) days?, )?(\d+):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  if (minutes >= 60 || seconds >= 60) return null;
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

export function formatDurationShort(value: string | null | undefined): string {
  const seconds = parseMovingSeconds(value);
  if (seconds == null) return MISSING_VALUE;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function activityYear(
  activity: Pick<Activity, 'start_date_local'>
): string | null {
  const match = activity.start_date_local.match(/^(\d{4})-\d{2}-\d{2}/);
  return match?.[1] ?? null;
}

export function compareActivitiesNewest(
  a: Pick<Activity, 'start_date_local' | 'run_id'>,
  b: Pick<Activity, 'start_date_local' | 'run_id'>
): number {
  const byDate = b.start_date_local.localeCompare(a.start_date_local);
  return byDate || b.run_id - a.run_id;
}

export function sportDisplayName(type: string | null | undefined): string {
  const names: Record<string, string> = {
    Run: '跑步',
    Ride: '骑行',
    Walk: '步行',
    Hike: '徒步',
    Swim: '游泳',
    Workout: '训练',
  };
  if (!type) return '未分类运动';
  return names[type] ?? type;
}

export function routeDisplayStatus(activity: {
  summary_polyline?: string | null;
}): 'available' | 'missing' {
  return activity.summary_polyline ? 'available' : 'missing';
}
