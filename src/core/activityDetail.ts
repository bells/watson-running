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
  if (distanceM <= 0) return '—';
  const pace = Math.round((seconds * 1000) / distanceM);
  return `${Math.floor(pace / 60)}′${String(pace % 60).padStart(2, '0')}″`;
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
};
