import { useState, useMemo } from 'react';
import type { Activity, SportFilter } from '../types';
import { formatDuration, formatPace } from '../hooks/useActivities';
import { useLocale } from '../hooks/useLocale';
import { StatusPanel } from '@core/components/StatusPanel';
import { activityDetailHref, isWatchSource } from '@core/activityDetail';
import {
  compareActivitiesNewest,
  formatDistanceMeters,
  sportDisplayName,
} from '@core/activityDisplay';

interface ActivityLogProps {
  activities: Activity[];
  years: number[];
  year: number | null;
  setYear: (y: number | null) => void;
  selectedActivity?: Activity | null;
  onSelectActivity?: (a: Activity | null) => void;
  filter?: SportFilter;
}

const PAGE_SIZE = 16;

type DistanceFilter = 'all' | '10' | '20' | '40';

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    Run: '🏃',
  };
  return icons[type] ?? '📌';
}

export function ActivityLog({
  activities,
  years,
  year,
  setYear,
  selectedActivity,
  onSelectActivity,
  filter: _filter,
}: ActivityLogProps) {
  const { t, locale } = useLocale();
  const selectedId = selectedActivity?.run_id ?? null;
  const [pageState, setPageState] = useState({ index: 0, selectedId });
  const [distFilter, setDistFilter] = useState<DistanceFilter>('all');
  function matchesDistance(activity: Activity, value: DistanceFilter) {
    const km = activity.distance / 1000;
    return (
      value === 'all' ||
      (value === '10'
        ? km >= 10 && km < 20
        : value === '20'
          ? km >= 20 && km < 40
          : km >= 40)
    );
  }
  const effectiveDistFilter =
    selectedActivity && !matchesDistance(selectedActivity, distFilter)
      ? 'all'
      : distFilter;
  const sorted = useMemo(
    () =>
      activities
        .filter((activity) => matchesDistance(activity, effectiveDistFilter))
        .sort(compareActivitiesNewest),
    [activities, effectiveDistFilter]
  );
  const selectedIndex = sorted.findIndex(
    (activity) => activity.run_id === selectedId
  );
  const page =
    pageState.selectedId !== selectedId && selectedIndex >= 0
      ? Math.floor(selectedIndex / PAGE_SIZE)
      : pageState.index;
  function setPage(next: number | ((current: number) => number)) {
    setPageState({
      index: typeof next === 'number' ? next : next(page),
      selectedId,
    });
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = sorted.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('activityLog')}</h2>
        <span className="text-sm text-[var(--color-muted)]">
          {t('showing')} {sorted.length ? safePage * PAGE_SIZE + 1 : 0}-
          {Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} {t('of')}{' '}
          {sorted.length}
        </span>
      </div>

      {/* Year tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setYear(null);
            setPage(0);
          }}
          className={`min-h-11 rounded-full px-3 py-1 text-xs font-medium transition-all ${year === null ? 'bg-[var(--running-accent-fill)] text-[#202a33]' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
        >
          All
        </button>
        {years.map((y) => (
          <button
            key={y}
            onClick={() => {
              setYear(y);
              setPage(0);
            }}
            className={`min-h-11 rounded-full px-3 py-1 text-xs font-medium transition-all ${year === y ? 'bg-[var(--running-accent-fill)] text-[#202a33]' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Distance filter */}
      <div className="mb-5 flex items-center gap-2">
        {(
          [
            ['all', t('all')],
            ['10', '10km+'],
            ['20', '20km+'],
            ['40', '40km+'],
          ] as [DistanceFilter, string][]
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => {
              onSelectActivity?.(null);
              setDistFilter(val);
              setPage(0);
            }}
            className={`min-h-11 rounded-full px-3 py-1 text-xs font-medium transition-all ${effectiveDistFilter === val ? 'bg-[var(--running-accent-fill)] text-[#202a33]' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {sorted.length === 0 && (
        <StatusPanel
          kind="empty"
          title="没有符合筛选条件的记录"
          description="切换年份或距离范围后再试。"
        />
      )}
      <div className="overflow-x-auto">
        <table className="activity-log-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
              <th className="pb-3 font-medium">{t('date')}</th>
              <th className="pb-3 font-medium">{t('type')}</th>
              <th className="pb-3 font-medium">{t('name')}</th>
              <th className="pb-3 font-medium">{t('distance')}</th>
              <th className="pb-3 font-medium">{t('duration')}</th>
              <th className="pb-3 font-medium">{t('pace')}</th>
              <th className="pb-3 font-medium">{t('hr')}</th>
              <th className="pb-3 font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((a) => (
              <tr
                key={a.run_id}
                onClick={() =>
                  onSelectActivity?.(
                    selectedActivity?.run_id === a.run_id ? null : a
                  )
                }
                className={`cursor-pointer border-b border-[var(--color-border)]/30 transition-colors ${
                  selectedActivity?.run_id === a.run_id
                    ? 'border-l-2 border-l-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'hover:bg-[var(--color-bg)]'
                }`}
              >
                <td
                  data-label="日期"
                  className="py-3 text-[var(--color-muted)]"
                >
                  {a.start_date_local.slice(0, 16).replace('T', ' ')}
                </td>
                <td data-label="运动" className="py-3">
                  <span className="text-[var(--color-muted)]">
                    {typeIcon(a.type)}{' '}
                    {locale === 'zh' ? sportDisplayName(a.type) : a.type}
                  </span>
                </td>
                <td data-label="记录" className="py-3">
                  <button
                    type="button"
                    aria-pressed={selectedActivity?.run_id === a.run_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectActivity?.(
                        selectedActivity?.run_id === a.run_id ? null : a
                      );
                    }}
                    className="min-h-11 text-left underline underline-offset-2"
                  >
                    {a.name || t('run')}
                  </button>{' '}
                  {isWatchSource(a.source) && (
                    <span title={a.source ?? '手表记录'} aria-label="手表记录">
                      ⌚
                    </span>
                  )}
                </td>
                <td data-label="距离" className="py-3 font-mono font-medium">
                  {formatDistanceMeters(a.distance)}
                  <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">
                    km
                  </span>
                </td>
                <td
                  data-label="时长"
                  className="py-3 text-[var(--color-muted)]"
                >
                  {formatDuration(a.moving_time)}
                </td>
                <td
                  data-label="配速"
                  className="py-3 text-[var(--color-muted)]"
                >
                  {formatPace(a.average_speed)}
                </td>
                <td
                  data-label="心率"
                  className="py-3 text-[var(--color-muted)]"
                >
                  {a.average_heartrate == null
                    ? '—'
                    : Math.round(a.average_heartrate)}
                </td>
                <td data-label="详情" className="py-3">
                  {a.detail_available ? (
                    <a
                      href={activityDetailHref(a.run_id)}
                      onClick={(event) => event.stopPropagation()}
                      className="text-[var(--color-accent)] underline underline-offset-2 focus-visible:outline-2"
                    >
                      查看详情
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={safePage === 0}
          className="min-h-11 min-w-11 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          <span aria-label="上一页">←</span>
        </button>
        <span className="text-sm text-[var(--color-muted)]">
          {t('page')} {safePage + 1} {t('pageOf')} {totalPages} {t('pages')}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={safePage >= totalPages - 1}
          className="min-h-11 min-w-11 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          <span aria-label="下一页">→</span>
        </button>
      </div>
    </div>
  );
}
