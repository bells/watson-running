import { formatPaceFromElapsed } from './activityDisplay';

export interface ActivitySplit {
  distance_m: number;
  moving_seconds: number;
  cumulative_distance_m: number;
  cumulative_moving_seconds: number;
  partial: boolean;
}

export interface ActivitySample {
  moving_seconds: number;
  heart_rate_bpm: number | null;
  altitude_m: number | null;
  steps: number | null;
  step_measure: number | null;
  cadence_spm: number | null;
  stride_m_estimate: number | null;
}

export interface ActivityDetail {
  schema_version: 1;
  run_id: number;
  start_time_unix: number;
  source: string | null;
  heart_rate_source: string | null;
  distance_m: number;
  moving_seconds: number;
  elapsed_seconds: number;
  calories_kcal: number | null;
  total_steps: number | null;
  sample_interval_seconds: number;
  average_cadence_spm: number | null;
  average_stride_m: number | null;
  min_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  average_heart_rate_bpm: number | null;
  min_altitude_m: number | null;
  max_altitude_m: number | null;
  splits: ActivitySplit[];
  samples: ActivitySample[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isActivityDetail(value: unknown): value is ActivityDetail {
  if (
    !isRecord(value) ||
    value.schema_version !== 1 ||
    !Number.isSafeInteger(value.run_id)
  )
    return false;
  if (
    ![value.source, value.heart_rate_source].every(
      (source) => source === null || typeof source === 'string'
    )
  )
    return false;
  if (
    ![
      'start_time_unix',
      'distance_m',
      'moving_seconds',
      'elapsed_seconds',
      'sample_interval_seconds',
    ].every((key) => finite(value[key]) && value[key] >= 0)
  )
    return false;
  if (
    ![
      'calories_kcal',
      'total_steps',
      'average_cadence_spm',
      'average_stride_m',
      'min_heart_rate_bpm',
      'max_heart_rate_bpm',
      'average_heart_rate_bpm',
      'min_altitude_m',
      'max_altitude_m',
    ].every((key) => value[key] === null || finite(value[key]))
  )
    return false;
  if (!Array.isArray(value.splits) || !Array.isArray(value.samples))
    return false;
  return (
    value.splits.every(
      (split: unknown) =>
        isRecord(split) &&
        typeof split.partial === 'boolean' &&
        [
          'distance_m',
          'moving_seconds',
          'cumulative_distance_m',
          'cumulative_moving_seconds',
        ].every((key) => finite(split[key]) && split[key] >= 0)
    ) &&
    value.samples.every(
      (sample: unknown) =>
        isRecord(sample) &&
        finite(sample.moving_seconds) &&
        sample.moving_seconds >= 0 &&
        [
          'heart_rate_bpm',
          'altitude_m',
          'steps',
          'step_measure',
          'cadence_spm',
          'stride_m_estimate',
        ].every((key) => sample[key] === null || finite(sample[key]))
    )
  );
}

export const activityDetailHref = (runId: number): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/activity/${runId}`;

export const activityDetailUrl = (runId: number): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/activity-details/${runId}.json`;

export const isWatchSource = (source: string | null | undefined): boolean =>
  Boolean(
    source &&
    /garmin|forerunner|apple watch|coros|suunto|polar|fitbit/i.test(source)
  );

export const formatPace = (seconds: number, distanceM: number): string => {
  return formatPaceFromElapsed(seconds, distanceM);
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
};
