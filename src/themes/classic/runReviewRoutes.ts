import { isRunReviewEligible } from '@core/runReviewEligibility';

export const RUN_REVIEW_ANCHOR = 'run-review';
export const runReviewEnabled =
  import.meta.env.VITE_RUN_AGENT_RUN_REVIEW === 'true';

export function canReviewRun(
  activity: Parameters<typeof isRunReviewEligible>[0]
): boolean {
  return runReviewEnabled && isRunReviewEligible(activity);
}
