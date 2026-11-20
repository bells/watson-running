import { isRunReviewEligible } from '@core/runReviewEligibility';

export const RUN_REVIEW_ANCHOR = 'run-review';
export const publicRunAgentEnabled =
  import.meta.env.VITE_RUN_AGENT_PUBLIC_API === 'true';
const privateReviewEnabled =
  import.meta.env.VITE_RUN_AGENT_RUN_REVIEW === 'true';
const publicReviewIds = new Set(
  (import.meta.env.VITE_RUN_AGENT_PUBLIC_REVIEW_IDS ?? '')
    .split(',')
    .map((entry: string) => entry.trim())
    .filter((entry: string) => /^[1-9]\d{0,15}$/.test(entry))
    .map(Number)
    .filter(Number.isSafeInteger)
);
export const runReviewEnabled =
  privateReviewEnabled || (publicRunAgentEnabled && publicReviewIds.size > 0);

type PublishedActivity = Parameters<typeof isRunReviewEligible>[0];

export function canReviewRunPublicly(activity: PublishedActivity): boolean {
  return (
    publicRunAgentEnabled &&
    typeof activity.run_id === 'number' &&
    publicReviewIds.has(activity.run_id) &&
    isRunReviewEligible(activity)
  );
}

export function canReviewRun(
  activity: PublishedActivity,
  includePrivate = true
): boolean {
  return (
    canReviewRunPublicly(activity) ||
    (includePrivate && privateReviewEnabled && isRunReviewEligible(activity))
  );
}
