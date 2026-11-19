import { parseMovingSeconds } from './activityDisplay';

interface PublishedActivity {
  run_id?: unknown;
  type?: unknown;
  distance?: unknown;
  moving_time?: unknown;
}

export interface BasicRunReviewEvidence {
  runId: number;
  distanceMeters: number;
  movingSeconds: number;
}

export function basicRunReviewEvidence(
  activity: PublishedActivity
): BasicRunReviewEvidence | null {
  const {
    run_id: runId,
    type,
    distance: distanceMeters,
    moving_time,
  } = activity;
  if (
    type !== 'Run' ||
    typeof runId !== 'number' ||
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    typeof distanceMeters !== 'number' ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    typeof moving_time !== 'string'
  ) {
    return null;
  }
  const movingSeconds = parseMovingSeconds(moving_time);
  if (
    movingSeconds === null ||
    !Number.isSafeInteger(movingSeconds) ||
    movingSeconds <= 0
  ) {
    return null;
  }
  return { runId, distanceMeters, movingSeconds };
}

export function isRunReviewEligible(activity: PublishedActivity): boolean {
  return basicRunReviewEvidence(activity) !== null;
}
