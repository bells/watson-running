import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { formatDuration, formatPace } from '@core/activityDetail';
import { formatDistanceMeters } from '@core/activityDisplay';
import { getActivityData } from '@core/hooks/useActivities';
import { useRunReview } from '@core/hooks/useRunReview';
import { isPrivateChatToken } from '@core/services/runAgentChat';
import type { RunReviewReport } from '@core/services/runAgentReview';
import { canReviewRun, RUN_REVIEW_ANCHOR } from '../../runReviewRoutes';
import { useRunAgentAccess } from '../../runAgentAccess';
import styles from './style.module.css';

const formatReviewPace = (value: number) => `${formatPace(value, 1000)}/km`;
const reportDate = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function Report({ report }: { report: RunReviewReport }) {
  return (
    <div className={styles.report}>
      <dl className={styles.facts}>
        <div>
          <dt>距离</dt>
          <dd>{formatDistanceMeters(report.facts.distanceMeters, 2)} km</dd>
        </div>
        <div>
          <dt>移动时长</dt>
          <dd>{formatDuration(report.facts.movingSeconds)}</dd>
        </div>
        <div>
          <dt>全程配速</dt>
          <dd>{formatReviewPace(report.facts.averagePaceSecondsPerKm)}</dd>
        </div>
        {report.mode === 'SPLIT_COMPARISON' && (
          <>
            <div>
              <dt>前半程配速</dt>
              <dd>
                {formatReviewPace(report.facts.firstHalfPaceSecondsPerKm)}
              </dd>
            </div>
            <div>
              <dt>后半程配速</dt>
              <dd>
                {formatReviewPace(report.facts.secondHalfPaceSecondsPerKm)}
              </dd>
            </div>
          </>
        )}
      </dl>
      {report.mode === 'SPLIT_COMPARISON' && report.facts.estimated && (
        <p className={styles.note}>半程切点落在分段内，配速按距离比例估算。</p>
      )}
      {report.mode === 'SUMMARY' && (
        <p className={styles.note}>基础速评 · 依据全程数据</p>
      )}
      <div className={styles.findings}>
        <div>
          <h3>本次表现</h3>
          <ul>
            {report.observations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>下次留意</h3>
          <p>{report.improvement}</p>
        </div>
        <div>
          <h3>下一次怎么跑</h3>
          <p>{report.nextRun}</p>
        </div>
      </div>
      <p className={styles.note}>
        生成于{' '}
        <time dateTime={report.generatedAt}>
          {reportDate.format(new Date(report.generatedAt))}
        </time>
      </p>
    </div>
  );
}

function TokenForm() {
  const { setAccessToken } = useRunAgentAccess();
  const [draft, setDraft] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPrivateChatToken(draft.trim())) setAccessToken(draft);
  }

  return (
    <form className={styles.tokenForm} onSubmit={submit}>
      <label htmlFor="run-review-token">访问令牌</label>
      <div className={styles.actions}>
        <input
          id="run-review-token"
          type="password"
          autoComplete="off"
          placeholder="输入 RunAgent 访问令牌"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className={styles.action}
          disabled={!isPrivateChatToken(draft.trim())}
        >
          查询报告
        </button>
      </div>
    </form>
  );
}

function AuthorizedReview({
  runId,
  accessToken,
}: {
  runId: number;
  accessToken: string;
}) {
  const { setAccessToken } = useRunAgentAccess();
  const { state, generate, reload } = useRunReview(runId, accessToken);
  const [expanded, setExpanded] = useState(false);

  if (state.status === 'READY') {
    return (
      <>
        <button
          type="button"
          className={styles.action}
          aria-expanded={expanded}
          aria-controls={expanded ? 'run-review-report' : undefined}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起报告' : '查看报告'}
        </button>
        {expanded && (
          <div id="run-review-report">
            <Report report={state.report} />
          </div>
        )}
      </>
    );
  }

  if (state.status === 'MISSING' || state.status === 'FAILED') {
    return (
      <>
        {state.status === 'FAILED' && (
          <p role="alert">报告生成失败，可以重试。请求 ID {state.requestId}</p>
        )}
        <button type="button" className={styles.action} onClick={generate}>
          {state.status === 'FAILED' ? '重试生成' : '生成报告'}
        </button>
      </>
    );
  }

  if (state.status === 'DISABLED') return <p role="status">生成暂未开放。</p>;
  if (state.status === 'ERROR') {
    const unauthorized = state.error.kind === 'unauthorized';
    return (
      <div role="alert">
        <p>{state.error.message}</p>
        {state.error.requestId && (
          <p className={styles.note}>请求 ID {state.error.requestId}</p>
        )}
        <button
          type="button"
          className={styles.action}
          onClick={unauthorized ? () => setAccessToken('') : reload}
        >
          {unauthorized ? '重新输入令牌' : '重新查询'}
        </button>
      </div>
    );
  }

  return (
    <p role="status">
      {state.status === 'LOADING' ? '正在查询报告…' : '正在生成报告…'}
    </p>
  );
}

function RunReviewPanel({ runId }: { runId: number }) {
  const { hash } = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const { accessToken, tokenRevision } = useRunAgentAccess();

  useEffect(() => {
    if (hash !== `#${RUN_REVIEW_ANCHOR}`) return;
    const frame = requestAnimationFrame(() => {
      sectionRef.current?.focus({ preventScroll: true });
      sectionRef.current?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <section
      ref={sectionRef}
      id={RUN_REVIEW_ANCHOR}
      tabIndex={-1}
      aria-labelledby="run-review-title"
      className={styles.card}
    >
      <header>
        <h2 id="run-review-title">AI 跑后复盘</h2>
        <p className={styles.note}>
          回顾本次表现和节奏，获得下一次跑步建议。报告仅供本人查看。
        </p>
      </header>
      {isPrivateChatToken(accessToken) ? (
        <AuthorizedReview
          key={tokenRevision}
          runId={runId}
          accessToken={accessToken}
        />
      ) : (
        <TokenForm />
      )}
    </section>
  );
}

export default function RunReviewSlot({ runId }: { runId: number }) {
  const activity = getActivityData().find((run) => run.run_id === runId);
  if (!activity || !canReviewRun(activity)) return null;
  return <RunReviewPanel key={runId} runId={runId} />;
}
