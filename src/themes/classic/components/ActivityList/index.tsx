import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { totalStat, yearSummaryStats } from '@assets/index';
import { loadSvgComponent } from '../../utils/svgUtils';
import type { Activity } from '../../utils/utils';
import useActivities from '../../hooks/useActivities';
import Header from '../Header';
import RunTable from '../RunTable';
import { StatusPanel } from '@core/components/StatusPanel';
import {
  formatDistanceMeters,
  formatPaceFromSpeed,
  sportDisplayName,
} from '@core/activityDisplay';
import {
  formatSummaryDuration,
  groupActivityPeriods,
  summarizeActivities,
  type SummaryInterval,
  type ActivitySummary,
} from '@core/activitySummary';
import styles from './style.module.css';

const LifeSvg = lazy(() => loadSvgComponent(totalStat, './mol.svg'));
const yearSvgs = Object.fromEntries(
  Object.keys(yearSummaryStats).map((path) => [
    path,
    lazy(() => loadSvgComponent(yearSummaryStats, path)),
  ])
);
const ActivityChart = lazy(() => import('./ActivityChart'));
const intervals: Record<SummaryInterval | 'life', string> = {
  year: '按年',
  month: '按月',
  week: '按周',
  day: '按日',
  life: 'Life · 历程图',
};

function PeriodEntry({
  period,
  summary,
  interval,
}: {
  period: string;
  summary: ActivitySummary<Activity>;
  interval: SummaryInterval;
}) {
  const [expanded, setExpanded] = useState(false);
  const [runIndex, setRunIndex] = useState(-1);
  const navigate = useNavigate();
  const chartData = useMemo(() => {
    const counts =
      interval === 'year'
        ? 12
        : interval === 'month'
          ? new Date(
              Number(period.slice(0, 4)),
              Number(period.slice(5, 7)),
              0
            ).getDate()
          : 7;
    const values = Array<number>(counts).fill(0);
    for (const run of summary.activities) {
      const day = run.start_date_local.slice(0, 10);
      const index =
        interval === 'year'
          ? Number(day.slice(5, 7)) - 1
          : interval === 'month'
            ? Number(day.slice(8, 10)) - 1
            : Math.round(
                (Date.parse(`${day}T00:00:00Z`) -
                  Date.parse(`${period}T00:00:00Z`)) /
                  86400000
              );
      if (Number.isFinite(run.distance) && index >= 0 && index < counts)
        values[index] += run.distance / 1000;
    }
    return values.map((distance, index) => ({
      day: index + 1,
      distance: distance.toFixed(2),
    }));
  }, [summary.activities, period, interval]);
  const yAxisMax = Math.max(
    5,
    Math.ceil(
      Math.max(...chartData.map((value) => Number(value.distance))) / 5
    ) * 5
  );
  const maxDistance = Math.max(
    ...summary.activities.map((run) => run.distance)
  );
  const maxSpeed = Math.max(
    ...summary.activities.map((run) => run.average_speed)
  );
  const elevations = summary.activities
    .map((run) => run.elevation_gain)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value)
    );
  return (
    <article className={styles.period}>
      <div className={styles.periodHeading}>
        <h2>
          {period}
          {interval === 'week' && <small> 起的一周</small>}
        </h2>
        <span>{summary.activities.length} 次运动</span>
      </div>
      <dl className={styles.metrics}>
        <div>
          <dt>距离</dt>
          <dd>
            {formatDistanceMeters(summary.distanceMeters)} <small>km</small>
          </dd>
        </div>
        <div>
          <dt>运动时间</dt>
          <dd>{formatSummaryDuration(summary.movingSeconds)}</dd>
        </div>
        <div>
          <dt>平均配速</dt>
          <dd>
            {formatPaceFromSpeed(summary.paceSpeed)} <small>/km</small>
          </dd>
        </div>
        <div>
          <dt>平均心率 · 已记录活动</dt>
          <dd>
            {summary.averageHeartRate?.toFixed(0) ?? '—'} <small>bpm</small>
          </dd>
        </div>
      </dl>
      <p className={styles.note}>
        单次最远 {formatDistanceMeters(maxDistance)} km · 最快活动配速{' '}
        {formatPaceFromSpeed(maxSpeed)} /km · 爬升{' '}
        {elevations.length
          ? elevations.reduce((a, b) => a + b, 0).toFixed(0)
          : '—'}{' '}
        m
        {summary.missingDurations > 0 &&
          ` · ${summary.missingDurations} 条记录缺少时长`}
      </p>
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>查看本周期的记录与分布</summary>
        {expanded && (
          <>
            {interval !== 'day' && (
              <>
                <p className={styles.note}>
                  {interval === 'year'
                    ? '横轴：月份'
                    : interval === 'month'
                      ? '横轴：日期'
                      : '横轴：周一至周日'}{' '}
                  · 纵轴：公里
                </p>
                <div className={styles.chart}>
                  <Suspense
                    fallback={
                      <StatusPanel kind="loading" title="正在加载距离分布…" />
                    }
                  >
                    <ActivityChart
                      data={chartData}
                      yAxisMax={yAxisMax}
                      yAxisTicks={[0, yAxisMax / 2, yAxisMax]}
                    />
                  </Suspense>
                </div>
              </>
            )}
            <RunTable
              runs={summary.activities}
              runIndex={runIndex}
              setRunIndex={setRunIndex}
              locateActivity={(ids) => {
                if (ids[0] !== undefined)
                  navigate(
                    `/?year=${summary.activities.find((run) => run.run_id === ids[0])?.start_date_local.slice(0, 4)}#run_${ids[0]}`
                  );
              }}
            />
          </>
        )}
      </details>
    </article>
  );
}

export default function ActivityList() {
  const { activities, years } = useActivities();
  const [params, setParams] = useSearchParams();
  const requestedInterval = params.get('interval') ?? 'month';
  const interval =
    requestedInterval in intervals
      ? (requestedInterval as SummaryInterval | 'life')
      : 'month';
  const sport = params.get('sport') ?? 'all';
  const year = params.get('year') ?? 'Total';
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      activities.filter(
        (run) =>
          (year === 'Total' || run.start_date_local.startsWith(year)) &&
          (interval === 'life' || sport === 'all' || run.type === sport)
      ),
    [activities, year, sport, interval]
  );
  const total = useMemo(() => summarizeActivities(filtered), [filtered]);
  const periods = useMemo(
    () =>
      groupActivityPeriods(filtered, interval === 'life' ? 'year' : interval),
    [filtered, interval]
  );
  const pageCount = Math.max(1, Math.ceil(periods.length / 12));
  const safePage = Math.min(page, pageCount - 1);
  function changeFilter(key: string, value: string) {
    setParams(
      (current) => {
        current.set(key, value);
        return current;
      },
      { replace: true }
    );
    setPage(0);
  }
  const YearSvg = yearSvgs[`./year_summary_${year}.svg`];
  return (
    <>
      <Header />
      <main className={styles.activityList}>
        <header className={styles.heading}>
          <h1>运动历程</h1>
          <p>从一段时间，回到每一次出发。</p>
        </header>
        <section className={styles.filterContainer} aria-label="汇总筛选">
          <label>
            运动类型
            <select
              aria-label="运动类型"
              value={sport}
              disabled={interval === 'life'}
              onChange={(event) => changeFilter('sport', event.target.value)}
            >
              <option value="all">全部运动</option>
              {[...new Set(activities.map((run) => run.type))].map((type) => (
                <option key={type} value={type}>
                  {sportDisplayName(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            周期
            <select
              aria-label="周期"
              value={interval}
              onChange={(event) => {
                changeFilter('interval', event.target.value);
                if (event.target.value === 'life') changeFilter('sport', 'all');
              }}
            >
              {Object.entries(intervals).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            年份
            <select
              aria-label="年份"
              value={year}
              onChange={(event) => changeFilter('year', event.target.value)}
            >
              <option value="Total">全部年份</option>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className={styles.range} aria-label="汇总范围">
          <p>
            {year === 'Total' ? '全部年份累计' : `${year} 年`} ·{' '}
            {interval === 'life' || sport === 'all'
              ? '全部运动'
              : sportDisplayName(sport)}
          </p>
          <strong>
            {formatDistanceMeters(total.distanceMeters)} <small>km</small>
          </strong>
          <span>
            {filtered.length} 次运动 ·{' '}
            {formatSummaryDuration(total.movingSeconds)}
          </span>
        </section>
        {interval === 'life' ? (
          <div className={styles.lifeContainer}>
            <Suspense
              fallback={<StatusPanel kind="loading" title="正在加载历程图…" />}
            >
              {YearSvg ? (
                <YearSvg />
              ) : year === 'Total' ? (
                <LifeSvg />
              ) : (
                <StatusPanel
                  kind="empty"
                  title="这个年份没有生成历程图"
                  description="切换到按年或按月仍可查看记录。"
                />
              )}
            </Suspense>
          </div>
        ) : (
          <>
            {periods.length === 0 && (
              <StatusPanel
                kind="empty"
                title="这个范围没有运动记录"
                description="切换年份或运动类型后再试。"
              />
            )}
            {periods
              .slice(safePage * 12, (safePage + 1) * 12)
              .map(({ period, summary }) => (
                <PeriodEntry
                  key={`${interval}-${sport}-${period}`}
                  period={period}
                  summary={summary}
                  interval={interval}
                />
              ))}
            {pageCount > 1 && (
              <nav className={styles.pagination} aria-label="周期分页">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  上一页
                </button>
                <span>
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage === pageCount - 1}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount - 1, value + 1))
                  }
                >
                  下一页
                </button>
              </nav>
            )}
          </>
        )}
      </main>
    </>
  );
}
