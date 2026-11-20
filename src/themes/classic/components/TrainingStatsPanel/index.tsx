import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '@core/activityDetail';
import { formatPaceFromElapsed, MISSING_VALUE } from '@core/activityDisplay';
import { StatusPanel } from '@core/components/StatusPanel';
import { useTrainingStats } from '@core/hooks/useTrainingStats';
import {
  isValidTrainingRange,
  recentTrainingRange,
  trainingDistances,
  type TrainingDistance,
  type TrainingResponse,
} from '@core/services/runAgentTraining';
import { runningAdviceContext } from '@core/services/runAgentEvidence';
import {
  RunningEvidenceDetails,
  RunningLocationFields,
  type RunningLocation,
} from '../RunningAdvice';
import styles from './style.module.css';

const distances: Record<TrainingDistance, string> = {
  FIVE_K: '5 公里',
  TEN_K: '10 公里',
  HALF_MARATHON: '半程马拉松',
  MARATHON: '全程马拉松',
};
const distanceFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
});

const displayDistance = (km: number) => `${distanceFormatter.format(km)} km`;
const displayPace = (seconds: number | null) =>
  seconds && seconds > 0
    ? `${formatPaceFromElapsed(seconds, 1000)} /km`
    : MISSING_VALUE;

function Metrics({ values }: { values: ReadonlyArray<[string, string]> }) {
  return (
    <dl className={styles.metrics}>
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TrainingResult({ result }: { result: TrainingResponse }) {
  const freshness = result.dataThrough
    ? `数据截至 ${result.dataThrough}`
    : '快照截止日期未知';
  return (
    <section
      className={styles.result}
      aria-label="训练统计结果"
      aria-live="polite"
    >
      {result.kind === 'SUMMARY' ? (
        <>
          <h3>训练汇总</h3>
          <p>
            {result.startDate} 至 {result.endDate}
          </p>
          {result.runCount === 0 ? (
            <StatusPanel kind="empty" title="该日期范围没有跑步记录" />
          ) : (
            <Metrics
              values={[
                ['跑步次数', String(result.runCount)],
                ['总距离', displayDistance(result.totalDistanceKm)],
                ['总移动时长', formatDuration(result.totalDurationSeconds)],
                ['平均配速', displayPace(result.averagePaceSecondsPerKm)],
              ]}
            />
          )}
        </>
      ) : (
        <>
          <h3>估算个人最佳</h3>
          <p>{distances[result.distanceType]} · 按整场活动估算</p>
          {result.result ? (
            <Metrics
              values={[
                ['活动日期', result.result.date],
                ['活动距离', displayDistance(result.result.activityDistanceKm)],
                ['移动时长', formatDuration(result.result.durationSeconds)],
                [
                  '平均配速',
                  displayPace(result.result.averagePaceSecondsPerKm),
                ],
              ]}
            />
          ) : (
            <StatusPanel kind="empty" title="没有匹配该距离的跑步记录" />
          )}
        </>
      )}
      <p className={styles.freshness}>{freshness}</p>
      {result.advice && (
        <div className={styles.trainingAdvice}>
          <h3>训练建议</h3>
          <p>{result.advice}</p>
        </div>
      )}
      <RunningEvidenceDetails evidence={result.evidence} />
    </section>
  );
}

export default function TrainingStatsPanel({
  accessToken,
  authorizedToSend,
  publicApi,
  trainingThrough,
  location,
  onLocationChange,
}: {
  accessToken: string | undefined;
  authorizedToSend: boolean;
  publicApi: boolean;
  trainingThrough?: string;
  location: RunningLocation;
  onLocationChange: (_location: RunningLocation) => void;
}) {
  const snapshotEnd =
    publicApi &&
    !accessToken &&
    trainingThrough &&
    isValidTrainingRange(trainingThrough, trainingThrough)
      ? new Date(`${trainingThrough}T12:00:00`)
      : undefined;
  const [range, setRange] = useState(() => recentTrainingRange(7, snapshotEnd));
  const [distance, setDistance] = useState<TrainingDistance>('FIVE_K');
  const [invalidRange, setInvalidRange] = useState(false);
  const [includeAdvice, setIncludeAdvice] = useState(false);
  const [goal, setGoal] = useState('');
  const { query, reset, state } = useTrainingStats(accessToken);
  const pending = state.status === 'pending';
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== 'idle') {
      feedbackRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [state]);

  function changeRange(nextRange: typeof range) {
    setRange(nextRange);
    setInvalidRange(false);
    reset();
  }

  const adviceContext =
    publicApi && includeAdvice
      ? runningAdviceContext(location.city, location.runningAt, goal)
      : undefined;

  return (
    <section
      className={styles.training}
      aria-label={publicApi ? '训练统计' : '我的训练'}
      tabIndex={0}
    >
      {authorizedToSend ? null : (
        <p className={styles.hint}>输入访问令牌后可查询训练数据。</p>
      )}
      {publicApi && !accessToken && (
        <p className={styles.hint}>统计范围为 Watson 已公开的跑步记录。</p>
      )}
      {publicApi && (
        <details className={styles.form}>
          <summary>附加训练依据</summary>
          <label className={styles.adviceToggle}>
            <input
              type="checkbox"
              checked={includeAdvice}
              onChange={(event) => setIncludeAdvice(event.target.checked)}
              disabled={pending}
            />
            查询时附上相关书籍和天气
          </label>
          {includeAdvice && (
            <>
              <label>
                训练目标
                <input
                  type="text"
                  value={goal}
                  maxLength={300}
                  placeholder="例如提高耐力或安排恢复跑"
                  disabled={pending}
                  onChange={(event) => setGoal(event.target.value)}
                />
              </label>
              <RunningLocationFields
                location={location}
                onChange={onLocationChange}
                disabled={pending}
              />
            </>
          )}
        </details>
      )}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!authorizedToSend) return;
          if (!isValidTrainingRange(range.startDate, range.endDate)) {
            setInvalidRange(true);
            reset();
            return;
          }
          setInvalidRange(false);
          void query({
            kind: 'SUMMARY',
            ...range,
            ...(adviceContext && { adviceContext }),
          });
        }}
      >
        <fieldset disabled={pending}>
          <legend>日期汇总</legend>
          <div className={styles.presets}>
            <button
              type="button"
              onClick={() => changeRange(recentTrainingRange(7, snapshotEnd))}
            >
              {snapshotEnd ? '最近有记录的 7 天' : '最近 7 天'}
            </button>
            <button
              type="button"
              onClick={() => changeRange(recentTrainingRange(30, snapshotEnd))}
            >
              {snapshotEnd ? '最近有记录的 30 天' : '最近 30 天'}
            </button>
          </div>
          <div className={styles.dateRange}>
            <label>
              开始日期
              <input
                type="date"
                required
                value={range.startDate}
                aria-invalid={invalidRange}
                aria-describedby={
                  invalidRange ? 'training-date-error' : undefined
                }
                onChange={(event) =>
                  changeRange({ ...range, startDate: event.target.value })
                }
              />
            </label>
            <label>
              结束日期
              <input
                type="date"
                required
                value={range.endDate}
                aria-invalid={invalidRange}
                aria-describedby={
                  invalidRange ? 'training-date-error' : undefined
                }
                onChange={(event) =>
                  changeRange({ ...range, endDate: event.target.value })
                }
              />
            </label>
          </div>
          {invalidRange && (
            <p className={styles.invalid} id="training-date-error" role="alert">
              开始日期须早于或等于结束日期，区间最多包含 366 天。
            </p>
          )}
          <button
            type="submit"
            className={styles.query}
            disabled={!authorizedToSend}
          >
            查询汇总
          </button>
        </fieldset>
      </form>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (authorizedToSend)
            void query({
              kind: 'PERSONAL_BEST',
              distanceType: distance,
              ...(adviceContext && { adviceContext }),
            });
        }}
      >
        <fieldset disabled={pending}>
          <legend>个人最佳</legend>
          <div className={styles.pbFields}>
            <label>
              PB 距离
              <select
                value={distance}
                onChange={(event) => {
                  const next = trainingDistances.find(
                    (value) => value === event.target.value
                  );
                  if (!next) return;
                  setDistance(next);
                  reset();
                }}
              >
                {trainingDistances.map((value) => (
                  <option key={value} value={value}>
                    {distances[value]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={styles.query}
              disabled={!authorizedToSend}
            >
              查询 PB
            </button>
          </div>
        </fieldset>
      </form>
      {state.status !== 'idle' && (
        <div ref={feedbackRef}>
          {state.status === 'pending' && (
            <StatusPanel
              kind="loading"
              title="正在查询训练统计…"
              actionLabel="取消查询"
              onAction={reset}
            />
          )}
          {state.status === 'failure' && (
            <StatusPanel
              kind="error"
              title="查询失败"
              description={state.error.message}
              actionLabel="重试查询"
              onAction={() => void query(state.request)}
            >
              {state.error.requestId && <p>请求编号 {state.error.requestId}</p>}
            </StatusPanel>
          )}
          {state.status === 'success' && (
            <TrainingResult result={state.result} />
          )}
        </div>
      )}
    </section>
  );
}
