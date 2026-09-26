import { useEffect, useState } from 'react';
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
  formatDuration,
  formatPace,
  type ActivityDetail,
  type ActivitySample,
} from '@core/activityDetail';
import styles from './ActivityDetailPage.module.css';

interface DetailState {
  detail: ActivityDetail | null;
  error: string | null;
}

const chartDefinitions = [
  { key: 'heart_rate_bpm', title: '心率', unit: 'bpm', color: '#db5964' },
  { key: 'cadence_spm', title: '步频', unit: '步/分', color: '#397db0' },
  { key: 'stride_m_estimate', title: '估算步幅', unit: '米', color: '#998035' },
  { key: 'altitude_m', title: '海拔', unit: '米', color: '#57876d' },
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
  const hasValues = samples.some((sample) => sample[metric.key] !== null);
  return (
    <section className={styles.chartCard}>
      <h2>{metric.title}</h2>
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

export default function ActivityDetailPage() {
  const runId = getRunId();
  const [state, setState] = useState<DetailState>({
    detail: null,
    error: null,
  });

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
        return response.json() as Promise<ActivityDetail>;
      })
      .then((detail) => {
        if (detail.schema_version !== 1 || detail.run_id !== runId) {
          throw new Error('详细数据与当前记录不匹配。');
        }
        setState({ detail, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          detail: null,
          error: error instanceof Error ? error.message : '详细数据加载失败。',
        });
      });
    return () => controller.abort();
  }, [runId]);

  const { detail, error } = state;
  const homeUrl = import.meta.env.BASE_URL;
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
          <span>WATSON / RUN DATA</span>
        </nav>
        {runId === null || error ? (
          <div className={styles.message} role="status">
            {error ?? '无效的运动记录。'}
          </div>
        ) : !detail ? (
          <div className={styles.message} role="status">
            正在加载运动详情…
          </div>
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
