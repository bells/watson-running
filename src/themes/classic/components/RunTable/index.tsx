import React, { useState, useMemo, useCallback } from 'react';
import {
  sortDateFunc,
  sortDateFuncReverse,
  convertMovingTime2Sec,
  Activity,
  RunIds,
} from '../../utils/utils';
import { SHOW_ELEVATION_GAIN } from '../../utils/const';
import {
  DIST_UNIT,
  titleForRun,
  formatPace,
  formatRunTime,
} from '../../utils/utils';
import { Link, useLocation } from 'react-router-dom';
import { sportDisplayName, routeDisplayStatus } from '@core/activityDisplay';

import RunRow from './RunRow';
import styles from './style.module.css';

interface IRunTableProperties {
  runs: Activity[];
  locateActivity: (_runIds: RunIds) => void;
  runIndex: number;
  setRunIndex: (_index: number) => void;
}

type SortFunc = (_a: Activity, _b: Activity) => number;
type SortDirection = 'ascending' | 'descending';
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

interface SortState {
  direction: SortDirection;
  key: string;
}

const RunTable = ({
  runs,
  locateActivity,
  runIndex,
  setRunIndex,
}: IRunTableProperties) => {
  const location = useLocation();
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const sortKeys = useMemo(() => {
    const keys = [DIST_UNIT, 'Elev', 'Pace', 'BPM', 'Time', 'Date'];
    return SHOW_ELEVATION_GAIN ? keys : keys.filter((key) => key !== 'Elev');
  }, []);

  const getSortFunction = useCallback(
    (key: string, direction: SortDirection): SortFunc | undefined => {
      const multiplier = direction === 'ascending' ? 1 : -1;

      if (key === DIST_UNIT) {
        return (a, b) => (a.distance - b.distance) * multiplier;
      }
      if (key === 'Elev') {
        return (a, b) =>
          ((a.elevation_gain ?? 0) - (b.elevation_gain ?? 0)) * multiplier;
      }
      if (key === 'Pace') {
        return (a, b) => {
          if (!a.average_speed) return b.average_speed ? 1 : 0;
          if (!b.average_speed) return -1;
          return (1000 / a.average_speed - 1000 / b.average_speed) * multiplier;
        };
      }
      if (key === 'BPM') {
        return (a, b) =>
          ((a.average_heartrate ?? 0) - (b.average_heartrate ?? 0)) *
          multiplier;
      }
      if (key === 'Time') {
        return (a, b) =>
          (convertMovingTime2Sec(a.moving_time) -
            convertMovingTime2Sec(b.moving_time)) *
          multiplier;
      }
      if (key === 'Date') {
        return direction === 'ascending' ? sortDateFuncReverse : sortDateFunc;
      }

      return undefined;
    },
    []
  );

  const displayedRuns = useMemo(() => {
    if (!sortState) return runs;

    const sortFunction = getSortFunction(sortState.key, sortState.direction);
    if (!sortFunction) return runs;

    return runs.slice().sort(sortFunction);
  }, [getSortFunction, runs, sortState]);

  const totalPages = Math.max(1, Math.ceil(displayedRuns.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const currentPageRuns = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return displayedRuns.slice(startIndex, startIndex + pageSize);
  }, [displayedRuns, pageSize, safeCurrentPage]);

  const runIndexById = useMemo(
    () => new Map(runs.map((run, index) => [run.run_id, index])),
    [runs]
  );

  const handleClick = useCallback(
    (key: string) => {
      setRunIndex(-1);
      setCurrentPage(1);
      setSortState((currentState) => {
        const initialDirection = key === 'Date' ? 'ascending' : 'descending';
        const nextDirection =
          currentState?.key === key
            ? currentState.direction === 'descending'
              ? 'ascending'
              : 'descending'
            : initialDirection;

        return { key, direction: nextDirection };
      });
    },
    [setRunIndex]
  );

  const handlePageSizeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setPageSize(Number(event.target.value));
    setCurrentPage(1);
  };

  return (
    <div className={styles.tableContainer}>
      <div className={styles.sortControls}>
        <label htmlFor="record-sort">记录排序</label>
        <select
          id="record-sort"
          value={sortState?.key ?? 'Date'}
          onChange={(event) => handleClick(event.target.value)}
        >
          {sortKeys.map((key) => (
            <option key={key} value={key}>
              {key === DIST_UNIT
                ? '距离'
                : ({
                    Pace: '配速',
                    BPM: '心率',
                    Time: '时长',
                    Date: '日期',
                    Elev: '爬升',
                  }[key] ?? key)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => handleClick(sortState?.key ?? 'Date')}
        >
          {sortState?.direction === 'ascending' ? '升序 ↑' : '降序 ↓'}
        </button>
      </div>
      <table className={styles.runTable} cellSpacing="0" cellPadding="0">
        <thead>
          <tr>
            <th />
            {sortKeys.map((k) => (
              <th
                key={k}
                aria-sort={
                  sortState?.key === k ? sortState.direction : undefined
                }
                className={styles.sortableHeader}
              >
                <button type="button" onClick={() => handleClick(k)}>
                  {k}
                </button>
              </th>
            ))}
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {currentPageRuns.map((run) => {
            const sourceIndex = runIndexById.get(run.run_id) ?? -1;
            return (
              <RunRow
                key={run.run_id}
                elementIndex={sourceIndex}
                locateActivity={locateActivity}
                run={run}
                runIndex={runIndex}
                setRunIndex={setRunIndex}
              />
            );
          })}
        </tbody>
      </table>

      <div className={styles.mobileRecords}>
        {currentPageRuns.map((run) => {
          const index = runIndexById.get(run.run_id) ?? -1;
          const selected = runIndex === index;
          return (
            <article
              key={run.run_id}
              className={selected ? styles.mobileSelected : ''}
            >
              <p className={styles.runDate}>
                {run.start_date_local.slice(0, 16)} ·{' '}
                {sportDisplayName(run.type)}
              </p>
              <button
                type="button"
                className={styles.recordTitle}
                aria-pressed={selected}
                onClick={() => {
                  setRunIndex(selected ? -1 : index);
                  locateActivity(selected ? [] : [run.run_id]);
                }}
              >
                {titleForRun(run)} · {selected ? '取消定位' : '地图定位'}
              </button>
              <dl>
                <div>
                  <dt>距离</dt>
                  <dd>{(run.distance / 1000).toFixed(2)} km</dd>
                </div>
                <div>
                  <dt>配速</dt>
                  <dd>{formatPace(run.average_speed)} /km</dd>
                </div>
                <div>
                  <dt>时长</dt>
                  <dd>{formatRunTime(run.moving_time)}</dd>
                </div>
                <div>
                  <dt>心率</dt>
                  <dd>{run.average_heartrate?.toFixed(0) ?? '—'} bpm</dd>
                </div>
              </dl>
              <div className={styles.recordFooter}>
                <span>
                  {routeDisplayStatus(run) === 'missing'
                    ? '没有公开路线'
                    : '有公开路线'}
                </span>
                {run.detail_available ? (
                  <Link
                    to={`/activity/${run.run_id}`}
                    state={{
                      returnTo: `${import.meta.env.BASE_URL.replace(/\/$/, '')}${location.pathname}${location.search}#run_${run.run_id}`,
                    }}
                    className={styles.detailLink}
                  >
                    查看详情 ↗
                  </Link>
                ) : (
                  <span>暂无详细数据</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <label htmlFor="run-table-page-size">每页显示</label>
          <select
            id="run-table-page-size"
            value={pageSize}
            onChange={handlePageSizeChange}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:ring-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>条，共 {displayedRuns.length} 条记录</span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
              className="flex h-11 w-11 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="上一页"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            <span className="text-sm text-gray-600 dark:text-gray-300">
              第 {safeCurrentPage} / {totalPages} 页
            </span>

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={safeCurrentPage === totalPages}
              className="flex h-11 w-11 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="下一页"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RunTable;
