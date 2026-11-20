import { Link, useLocation } from 'react-router-dom';
import { canReviewRun, publicRunAgentEnabled } from '../../runReviewRoutes';
import { useRunAgentAccess } from '../../runAgentAccess';
import type { Activity } from '../../utils/utils';
import styles from './style.module.css';

export default function RunDetailLink({
  run,
  compact = false,
}: {
  run: Activity;
  compact?: boolean;
}) {
  const location = useLocation();
  const { accessToken } = useRunAgentAccess();
  const review = canReviewRun(
    run,
    !publicRunAgentEnabled || Boolean(accessToken)
  );
  if (!run.detail_available && !review)
    return <span>{compact ? '暂无详细数据' : '—'}</span>;

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <Link
      to={`/activity/${run.run_id}`}
      state={{
        returnTo: `${base}${location.pathname}${location.search}#run_${run.run_id}`,
      }}
      className={styles.detailLink}
      onClick={(event) => event.stopPropagation()}
    >
      {review ? '详情 · AI 复盘' : '查看详情'}
      {compact && ' ↗'}
    </Link>
  );
}
