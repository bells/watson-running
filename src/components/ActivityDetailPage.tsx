import { Suspense, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  activityDetailUrl,
  isActivityDetail,
  formatDuration,
  formatPace,
  type ActivityDetail,
  type ActivitySample,
} from '@core/activityDetail';
import styles from './ActivityDetailPage.module.css';
import { StatusPanel } from '@core/components/StatusPanel';
import { useTheme } from '@core/hooks/useTheme';
import { getActivityData } from '@core/hooks/useActivities';
import {
  formatDistanceMeters,
  formatPaceFromSpeed,
  formatDurationShort,
} from '@core/activityDisplay';

interface DetailState {
  detail: ActivityDetail | null;
  error: string | null;
}

const chartDefinitions = [
  {
    key: 'heart_rate_bpm',
    title: '心率',
    unit: 'bpm',
    color: 'var(--running-chart-heart)',
  },
  {
    key: 'cadence_spm',
    title: '步频',
    unit: '步/分',
    color: 'var(--running-chart-cadence)',
  },
  {
    key: 'stride_m_estimate',
    title: '估算步幅',
    unit: '米',
    color: 'var(--running-warning)',
  },
  {
    key: 'altitude_m',
    title: '海拔',
    unit: '米',
    color: 'var(--running-chart-elevation)',
  },
] as const;

const splitBarWidth = (
  fastestPace: number,
  seconds: number,
  distanceM: number
): string => {
  if (!Number.isFinite(fastestPace) || seconds <= 0 || distanceM <= 0)
    return '20%';
  return `${Math.max(20, Math.min(100, (100 * fastestPace) / (seconds / distanceM)))}%`;
};

function MetricChart({
  samples,
  metric,
}: {
  samples: ActivitySample[];
  metric: (typeof chartDefinitions)[number];
}) {
  const values = samples
    .map((sample) => sample[metric.key])
    .filter(
      (value): value is number => value !== null && Number.isFinite(value)
    );
  const hasValues = values.length > 0;
  return (
    <section className={styles.chartCard}>
      <h2>
        {metric.title} <small>({metric.unit})</small>
      </h2>
      {hasValues && (
        <p className={styles.note}>
          采样范围 {Math.min(...values).toFixed(1)}–
          {Math.max(...values).toFixed(1)} {metric.unit}
        </p>
      )}
      {hasValues ? (
        <div className={styles.chart}>
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
            initialDimension={{ width: 320, height: 210 }}
          >
            <AreaChart
              data={samples}
              margin={{ top: 12, right: 8, left: -14, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--detail-rule)"
                strokeDasharray="3 4"
                vertical={false}
              />
              <XAxis
                dataKey="moving_seconds"
                tickFormatter={(value: number) => `${Math.round(value / 60)}′`}
                tick={{ fontSize: 11, fill: 'var(--detail-muted)' }}
                minTickGap={28}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: 'var(--detail-muted)' }}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--detail-card)',
                  border: '1px solid var(--detail-rule)',
                  borderRadius: 8,
                  color: 'var(--detail-ink)',
                }}
                labelFormatter={(value) =>
                  `运动时间 ${formatDuration(Number(value))}`
                }
                formatter={(value) => [`${value} ${metric.unit}`, metric.title]}
              />
              <Area
                type="monotone"
                dataKey={metric.key}
                stroke={metric.color}
                fill={metric.color}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className={styles.empty}>这次运动没有{metric.title}采样。</p>
      )}
    </section>
  );
}

function getRunId(): number | null {
  const match = window.location.pathname.match(/\/activity\/(\d+)\/?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function ActivityOverview({ runId }: { runId: number }) {
  const run = getActivityData().find((activity) => activity.run_id === runId);
  if (!run) return null;
  return (
    <section className={styles.section} aria-label="已有运动概览">
      <h2>{run.name || '运动记录'}</h2>
      <p className={styles.note}>
        {run.start_date_local} · {formatDistanceMeters(run.distance)} km ·{' '}
        {formatDurationShort(run.moving_time)} ·{' '}
        {formatPaceFromSpeed(run.average_speed)} /km
      </p>
    </section>
  );
}

function returnPath(defaultPath: string): string {
  const historyState: unknown = window.history.state;
  if (
    typeof historyState !== 'object' ||
    historyState === null ||
    !('usr' in historyState)
  )
    return defaultPath;
  const userState = historyState.usr;
  if (
    typeof userState !== 'object' ||
    userState === null ||
    !('returnTo' in userState)
  )
    return defaultPath;
  const path = userState.returnTo;
  return typeof path === 'string' &&
    path.startsWith(import.meta.env.BASE_URL) &&
    !path.startsWith('//')
    ? path
    : defaultPath;
}

export default function ActivityDetailPage() {
  const { dark, toggle } = useTheme();
  const runId = getRunId();
  const [state, setState] = useState<DetailState>({
    detail: null,
    error: null,
  });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (runId === null) return;
    const controller = new AbortController();
    fetch(activityDetailUrl(runId), { signal: controller.signal })
      .then((response) => {
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || !contentType.includes('application/json')) {
          throw new Error(
            response.status === 404 || contentType.includes('text/html')
              ? '这条记录暂时没有详细数据。'
              : '详细数据加载失败。'
          );
        }
        return response.json() as Promise<unknown>;
      })
      .then((detail) => {
        if (!isActivityDetail(detail) || detail.run_id !== runId) {
          throw new Error('详细数据与当前记录不匹配。');
        }
        if (!controller.signal.aborted) setState({ detail, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          detail: null,
          error: error instanceof Error ? error.message : '详细数据加载失败。',
        });
      });
    return () => controller.abort();
  }, [runId, retryCount]);

  const { detail, error } = state;
  const homeUrl = returnPath(import.meta.env.BASE_URL);
  const fastestSplitPace = detail
    ? Math.min(
        ...detail.splits
          .filter((split) => split.distance_m > 0 && split.moving_seconds > 0)
          .map((split) => split.moving_seconds / split.distance_m)
      )
    : 0;
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="页面导航">
          <a href={homeUrl}>← 返回跑步记录</a>
          <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
          >
            {dark ? '浅色模式' : '深色模式'}
          </button>
        </nav>
        {runId === null || error ? (
          <>
            {runId !== null && (
              <Suspense fallback={null}>
                <ActivityOverview runId={runId} />
              </Suspense>
            )}
            <StatusPanel
              kind="error"
              title={runId === null ? '无效的运动记录' : '运动详情暂不可用'}
              description={error ?? '请从记录列表选择一条运动。'}
              actionLabel={runId === null ? undefined : '重试加载'}
              onAction={
                runId === null
                  ? undefined
                  : () => {
                      setState({ detail: null, error: null });
                      setRetryCount((count) => count + 1);
                    }
              }
            />
          </>
        ) : !detail ? (
          <StatusPanel kind="loading" title="正在加载运动详情…" />
        ) : (
          <>
            <header className={styles.hero}>
              <div>
                <p className={styles.eyebrow}>
                  运动详情 ·{' '}
                  {new Date(detail.start_time_unix * 1000).toLocaleString(
                    'zh-CN'
                  )}{' '}
                  {detail.source ? `· ${detail.source}` : ''}
                </p>
                <h1>
                  {(detail.distance_m / 1000).toFixed(2)} <small>公里</small>
                </h1>
                <p className={styles.subtitle}>
                  用每一公里和每一次落脚，回看这段跑步。
                </p>
              </div>
              <div className={styles.paceBadge}>
                <span>平均配速</span>
                <strong>
                  {formatPace(detail.moving_seconds, detail.distance_m)}
                </strong>
                <span>每公里</span>
              </div>
            </header>

            <section className={styles.summary} aria-label="运动概览">
              <div>
                <span>运动时间</span>
                <strong>{formatDuration(detail.moving_seconds)}</strong>
              </div>
              <div>
                <span>总步数</span>
                <strong>{detail.total_steps?.toLocaleString() ?? '—'}</strong>
              </div>
              <div>
                <span>平均步频</span>
                <strong>
                  {detail.average_cadence_spm?.toFixed(0) ?? '—'}{' '}
                  <small>步/分</small>
                </strong>
              </div>
              <div>
                <span>平均心率</span>
                <strong>
                  {detail.average_heart_rate_bpm?.toFixed(0) ?? '—'}{' '}
                  <small>bpm</small>
                </strong>
              </div>
              <div>
                <span>热量</span>
                <strong>
                  {detail.calories_kcal?.toFixed(0) ?? '—'} <small>kcal</small>
                </strong>
              </div>
              <div>
                <span>估算步幅</span>
                <strong>
                  {detail.average_stride_m?.toFixed(2) ?? '—'} <small>米</small>
                </strong>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <h2>每公里配速</h2>
                <span>SPLITS</span>
              </div>
              {detail.splits.length ? (
                <div className={styles.splits}>
                  {detail.splits.map((split, index) => (
                    <div
                      className={styles.split}
                      key={split.cumulative_distance_m}
                    >
                      <span className={styles.splitNumber}>
                        {split.partial
                          ? '尾段'
                          : String(index + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={styles.splitBar}
                        style={{
                          width: splitBarWidth(
                            fastestSplitPace,
                            split.moving_seconds,
                            split.distance_m
                          ),
                        }}
                      />
                      <strong>
                        {formatPace(split.moving_seconds, split.distance_m)}
                      </strong>
                      <span>{(split.distance_m / 1000).toFixed(2)} km</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.empty}>这次运动没有分公里记录。</p>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <h2>运动曲线</h2>
                <span>{detail.sample_interval_seconds} 秒采样</span>
              </div>
              <div className={styles.chartGrid}>
                {chartDefinitions.map((metric) => (
                  <MetricChart
                    key={metric.key}
                    samples={detail.samples}
                    metric={metric}
                  />
                ))}
              </div>
              <p className={styles.note}>
                步幅根据每段步数与距离估算；无采样的数据不补值。海拔与心率来自悦跑圈记录。
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
