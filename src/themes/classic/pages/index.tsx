import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Helmet } from 'react-helmet-async';
import Layout from '../components/Layout';
import LocationStat from '../components/LocationStat';
import RunMap from '../components/RunMap';
import RunTable from '../components/RunTable';
import SVGStat from '../components/SVGStat';
import { Link, useSearchParams } from 'react-router-dom';
import {
  summarizeActivities,
  formatSummaryDuration,
} from '@core/activitySummary';
import {
  formatDistanceMeters,
  formatPaceFromSpeed,
  sportDisplayName,
} from '@core/activityDisplay';
import { StatusPanel } from '@core/components/StatusPanel';
import styles from './records.module.css';
import useActivities from '../hooks/useActivities';
import getSiteMetadata from '@core/hooks/useSiteMetadata';
import { useInterval } from '@core/hooks/useInterval';
import { IS_CHINESE } from '../utils/const';
import {
  Activity,
  filterAndSortRuns,
  filterCityRuns,
  filterTitleRuns,
  filterYearRuns,
  scrollToMap,
  sortDateFunc,
  titleForShow,
  RunIds,
} from '../utils/utils';
import {
  geoJsonForRuns,
  getBoundsForGeoData,
  type IViewState,
} from '../utils/geoUtils';
import { useTheme, useThemeChangeCounter } from '../hooks/useTheme';

const HASH_RUN_CHANGE_EVENT = 'running-page-hash-run-change';

const getRunIdFromHash = () => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace('#', '');
  if (!hash.startsWith('run_')) return null;
  const runId = parseInt(hash.replace('run_', ''), 10);
  return Number.isNaN(runId) ? null : runId;
};

const subscribeToRunHash = (onStoreChange: () => void) => {
  window.addEventListener('hashchange', onStoreChange);
  window.addEventListener(HASH_RUN_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('hashchange', onStoreChange);
    window.removeEventListener(HASH_RUN_CHANGE_EVENT, onStoreChange);
  };
};

const notifyRunHashChange = () => {
  window.dispatchEvent(new Event(HASH_RUN_CHANGE_EVENT));
};

const clearRunHash = () => {
  if (window.location.hash) {
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`
    );
    notifyRunHashChange();
  }
};

const setRunHash = (runId: number) => {
  const newHash = `#run_${runId}`;
  if (window.location.hash !== newHash) {
    window.history.pushState(null, '', newHash);
    notifyRunHashChange();
  }
};

const useRunHashId = () =>
  useSyncExternalStore(subscribeToRunHash, getRunIdFromHash, () => null);

const Index = () => {
  const { siteTitle, siteUrl } = getSiteMetadata();
  const { activities, thisYear, years } = useActivities();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialYear = searchParams.get('year') ?? thisYear;
  const sport = searchParams.get('sport') ?? 'all';
  const themeChangeCounter = useThemeChangeCounter();
  const [year, setYear] = useState(initialYear);
  const [runIndex, setRunIndex] = useState(-1);
  const [title, setTitle] = useState('');
  // Animation states for replacing intervalIdRef
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAnimationIndex, setCurrentAnimationIndex] = useState(0);
  const [animationRuns, setAnimationRuns] = useState<Activity[]>([]);
  const [currentFilter, setCurrentFilter] = useState<{
    item: string;
    func: (_run: Activity, _value: string) => boolean;
  }>({ item: initialYear, func: filterYearRuns });

  // Track if we're showing a single run from URL hash
  const singleRunId = useRunHashId();

  // Animation trigger for single runs - increment this to force animation replay
  const [animationTrigger, setAnimationTrigger] = useState(0);

  const selectedRunIdRef = useRef<number | null>(null);
  const selectedRunDateRef = useRef<string | null>(null);

  // Memoize expensive calculations
  const runs = useMemo(() => {
    return filterAndSortRuns(
      activities.filter((run) => sport === 'all' || run.type === sport),
      currentFilter.item,
      currentFilter.func,
      sortDateFunc
    );
  }, [activities, currentFilter.item, currentFilter.func, sport]);

  const geoData = useMemo(() => {
    void themeChangeCounter;
    return geoJsonForRuns(runs);
  }, [runs, themeChangeCounter]);

  // for auto zoom
  const bounds = useMemo(() => {
    return getBoundsForGeoData(geoData);
  }, [geoData]);

  const [viewState, setViewState] = useState<IViewState>(() => ({
    ...bounds,
  }));

  // Add state for animated geoData to handle the animation effect
  const [animatedGeoData, setAnimatedGeoData] = useState(geoData);

  // Use useInterval for animation instead of intervalIdRef
  useInterval(
    () => {
      if (!isAnimating || currentAnimationIndex >= animationRuns.length) {
        setIsAnimating(false);
        setAnimatedGeoData(geoData);
        return;
      }

      const runsNum = animationRuns.length;
      const sliceNum = runsNum >= 8 ? Math.ceil(runsNum / 8) : 1;
      const nextIndex = Math.min(currentAnimationIndex + sliceNum, runsNum);
      const tempRuns = animationRuns.slice(0, nextIndex);
      setAnimatedGeoData(geoJsonForRuns(tempRuns));
      setCurrentAnimationIndex(nextIndex);

      if (nextIndex >= runsNum) {
        setIsAnimating(false);
        setAnimatedGeoData(geoData);
      }
    },
    isAnimating ? 300 : null
  );

  // Helper function to start animation
  const startAnimation = useCallback(
    (runsToAnimate: Activity[]) => {
      if (
        runsToAnimate.length === 0 ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        setAnimatedGeoData(geoData);
        return;
      }

      const sliceNum =
        runsToAnimate.length >= 8 ? Math.ceil(runsToAnimate.length / 8) : 1;
      setAnimationRuns(runsToAnimate);
      setCurrentAnimationIndex(sliceNum);
      setIsAnimating(true);
    },
    [geoData]
  );

  const changeByItem = useCallback(
    (
      item: string,
      name: string,
      func: (_run: Activity, _value: string) => boolean
    ) => {
      if (name != 'Year') {
        setYear(thisYear);
      }
      setCurrentFilter({ item, func });
      setRunIndex(-1);
      setTitle(`${item} ${name} Running Heatmap`);
      // Reset single run state when changing filters
      clearRunHash();
    },
    [thisYear]
  );

  const changeYear = useCallback(
    (y: string) => {
      // default year
      setYear(y);

      if ((viewState.zoom ?? 0) > 3 && bounds) {
        setViewState({
          ...bounds,
        });
      }

      changeByItem(y, 'Year', filterYearRuns);
      setSearchParams(
        (params) => {
          params.set('year', y);
          return params;
        },
        { replace: true }
      );
      // Stop current animation
      setIsAnimating(false);
    },
    [viewState.zoom, bounds, changeByItem, setSearchParams]
  );

  const changeCity = useCallback(
    (city: string) => {
      changeByItem(city, 'City', filterCityRuns);
    },
    [changeByItem]
  );

  const changeTitle = useCallback(
    (title: string) => {
      changeByItem(title, 'Title', filterTitleRuns);
    },
    [changeByItem]
  );

  const locateActivity = useCallback(
    (runIds: RunIds) => {
      const ids = new Set(runIds);

      const selectedRuns = !runIds.length
        ? runs
        : runs.filter((run: Activity) => ids.has(run.run_id));

      if (!selectedRuns.length) {
        return;
      }

      const lastRun = selectedRuns.slice().sort(sortDateFunc)[0];

      if (!lastRun) {
        return;
      }

      // Set runIndex for table highlighting when single run is selected
      if (runIds.length === 1) {
        const runId = runIds[0];
        const runIdx = runs.findIndex((run) => run.run_id === runId);
        setRunIndex(runIdx);
      } else {
        setRunIndex(-1);
      }

      // Update URL hash when a single run is located
      if (runIds.length === 1) {
        const runId = runIds[0];
        setRunHash(runId);
      } else {
        // If multiple runs or no runs, clear the hash and single run state
        clearRunHash();
      }

      // Create geoData for selected runs and calculate new bounds
      const selectedGeoData = geoJsonForRuns(selectedRuns);
      const selectedBounds = getBoundsForGeoData(selectedGeoData);

      // Stop any existing animation
      setIsAnimating(false);

      // Update the animated geoData immediately to trigger RunMap animation
      setAnimatedGeoData(selectedGeoData);

      // For single run, trigger animation by incrementing the trigger
      if (runIds.length === 1) {
        setAnimationTrigger((prev) => prev + 1);
      }

      // Update view state
      setViewState({
        ...selectedBounds,
      });
      setTitle(titleForShow(lastRun));
      scrollToMap();
    },
    [runs]
  );

  // Auto locate activity when singleRunId is set and activities are loaded
  // First, detect the run's year and switch to it if needed
  useEffect(() => {
    if (singleRunId !== null && activities.length > 0) {
      const frameId = requestAnimationFrame(() => {
        const targetRun = activities.find((run) => run.run_id === singleRunId);
        if (targetRun) {
          const runYear = targetRun.start_date_local.slice(0, 4);
          if (year !== runYear) {
            setYear(runYear);
            setCurrentFilter({ item: runYear, func: filterYearRuns });
          }
        } else {
          // If run doesn't exist, clear the hash and show a warning
          console.warn(`Run with ID ${singleRunId} not found in activities`);
          window.history.replaceState(null, '', window.location.pathname);
          notifyRunHashChange();
        }
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [singleRunId, activities, year]);

  useEffect(() => {
    if (singleRunId !== null && runs.length > 0) {
      const frameId = requestAnimationFrame(() => {
        const runExistsInCurrentRuns = runs.some(
          (run) => run.run_id === singleRunId
        );
        if (runExistsInCurrentRuns) {
          locateActivity([singleRunId]);
        }
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [runs, singleRunId, locateActivity]);

  // Update bounds when geoData changes
  useEffect(() => {
    if (singleRunId === null) {
      const frameId = requestAnimationFrame(() => {
        setViewState((prev) => ({
          ...prev,
          ...bounds,
        }));
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [bounds, singleRunId]);

  // Animate geoData when runs change
  useEffect(() => {
    if (singleRunId === null) {
      const frameId = requestAnimationFrame(() => startAnimation(runs));
      return () => cancelAnimationFrame(frameId);
    }
  }, [runs, startAnimation, singleRunId]);

  useEffect(() => {
    if (year !== 'Total') {
      return;
    }

    let svgStat = document.getElementById('svgStat');
    if (!svgStat) {
      return;
    }

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'path') {
        // Use querySelector to get the <desc> element and the <title> element.
        const descEl = target.querySelector('desc');
        if (descEl) {
          // If the runId exists in the <desc> element, it means that a running route has been clicked.
          const runId = Number(descEl.innerHTML);
          if (!runId) {
            return;
          }
          if (selectedRunIdRef.current === runId) {
            selectedRunIdRef.current = null;
            locateActivity(runs.map((r) => r.run_id));
          } else {
            selectedRunIdRef.current = runId;
            locateActivity([runId]);
          }
          return;
        }

        const titleEl = target.querySelector('title');
        if (titleEl) {
          // If the runDate exists in the <title> element, it means that a date square has been clicked.
          const [runDate] = titleEl.innerHTML.match(
            /\d{4}-\d{1,2}-\d{1,2}/
          ) || [`${+thisYear + 1}`];
          const runIDsOnDate = runs
            .filter((r) => r.start_date_local.slice(0, 10) === runDate)
            .map((r) => r.run_id);
          if (!runIDsOnDate.length) {
            return;
          }
          if (selectedRunDateRef.current === runDate) {
            selectedRunDateRef.current = null;
            locateActivity(runs.map((r) => r.run_id));
          } else {
            selectedRunDateRef.current = runDate;
            locateActivity(runIDsOnDate);
          }
        }
      }
    };
    svgStat.addEventListener('click', handleClick);
    return () => {
      svgStat && svgStat.removeEventListener('click', handleClick);
    };
  }, [year, locateActivity, runs, thisYear]);

  const { theme } = useTheme();
  const totalSummary = useMemo(
    () => summarizeActivities(activities),
    [activities]
  );
  const latestRun = useMemo(
    () => totalSummary.activities.find((run) => run.type === 'Run'),
    [totalSummary]
  );
  const rangeSummary = useMemo(() => summarizeActivities(runs), [runs]);
  const sports = [...new Set(activities.map((run) => run.type))];

  return (
    <Layout>
      <Helmet>
        <html lang="en" data-theme={theme} />
      </Helmet>
      <main className={styles.records}>
        <header className={styles.intro}>
          <div>
            <h1>
              <a href={siteUrl}>{siteTitle}</a>
            </h1>
            <p className={styles.motto}>So live a life you will remember!</p>
            <p className={styles.range}>
              累计 · {years.at(-1)} 至 {thisYear} · {activities.length} 次运动
            </p>
          </div>
          <div className={styles.total}>
            <span>累计距离</span>
            <strong>
              {formatDistanceMeters(totalSummary.distanceMeters)}{' '}
              <small>km</small>
            </strong>
            <Link to="/summary">回看运动历程 ↗</Link>
          </div>
        </header>
        {latestRun && (
          <section className={styles.latest} aria-label="最近一次跑步">
            <span>
              最近一次跑步 · {latestRun.start_date_local.slice(0, 16)}
            </span>
            <strong>{formatDistanceMeters(latestRun.distance)} km</strong>
            {latestRun.detail_available ? (
              <Link
                to={`/activity/${latestRun.run_id}`}
                state={{
                  returnTo: `${window.location.pathname}${window.location.search}`,
                }}
              >
                查看详情 ↗
              </Link>
            ) : (
              <span>暂无详细数据</span>
            )}
          </section>
        )}
        <section className={styles.filters} aria-label="记录筛选">
          <label>
            年份
            <select
              aria-label="年份"
              value={year}
              onChange={(event) => changeYear(event.target.value)}
            >
              <option value="Total">全部年份</option>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            运动类型
            <select
              aria-label="运动类型"
              value={sport}
              onChange={(event) => {
                setRunIndex(-1);
                clearRunHash();
                setSearchParams(
                  (params) => {
                    params.set('sport', event.target.value);
                    params.set('year', year);
                    return params;
                  },
                  { replace: true }
                );
              }}
            >
              <option value="all">全部运动</option>
              {sports.map((value) => (
                <option key={value} value={value}>
                  {sportDisplayName(value)}
                </option>
              ))}
            </select>
          </label>
          <a href="#records">查看 {runs.length} 条记录 ↓</a>
        </section>
        <section className={styles.rangeStats} aria-label="当前范围统计">
          <div>
            <span>
              {currentFilter.item === 'Total' ? '全部年份' : currentFilter.item}{' '}
              · {sport === 'all' ? '全部运动' : sportDisplayName(sport)}
            </span>
            <strong>
              {formatDistanceMeters(rangeSummary.distanceMeters)}{' '}
              <small>km</small>
            </strong>
          </div>
          <div>
            <span>运动次数</span>
            <strong>{runs.length}</strong>
          </div>
          <div>
            <span>运动时间</span>
            <strong>{formatSummaryDuration(rangeSummary.movingSeconds)}</strong>
          </div>
          <div>
            <span>平均配速 · 有时长记录</span>
            <strong>
              {formatPaceFromSpeed(rangeSummary.paceSpeed)} <small>/km</small>
            </strong>
          </div>
        </section>
        {IS_CHINESE && (
          <details className={styles.locations}>
            <summary>按地区与时段探索</summary>
            <LocationStat
              changeYear={changeYear}
              changeCity={changeCity}
              changeTitle={changeTitle}
            />
          </details>
        )}
        <section id="records" className={styles.recordSection}>
          <h2>
            运动记录 <span>{runs.length} 条 · 选择记录可在地图定位</span>
          </h2>
          {runs.length ? (
            <RunTable
              key={`${currentFilter.item}-${sport}`}
              runs={runs}
              locateActivity={locateActivity}
              runIndex={runIndex}
              setRunIndex={setRunIndex}
            />
          ) : (
            <StatusPanel
              kind="empty"
              title="这个范围没有运动记录"
              description="试试其他年份或运动类型。"
            />
          )}
        </section>
        <section
          id="map-container"
          className={styles.mapSection}
          aria-label="公开运动路线"
        >
          <h2>
            路线与记录 <span>只展示公开导出的路线</span>
          </h2>
          <RunMap
            title={title}
            viewState={viewState}
            geoData={animatedGeoData}
            setViewState={setViewState}
            changeYear={changeYear}
            thisYear={year}
            animationTrigger={animationTrigger}
          />
        </section>
        {year === 'Total' && (
          <details className={styles.locations}>
            <summary>查看累计轨迹与热力图</summary>
            <SVGStat />
          </details>
        )}
      </main>
      {/* Enable Audiences in Vercel Analytics: https://vercel.com/docs/concepts/analytics/audiences/quickstart */}
      {import.meta.env.VERCEL && <Analytics />}
    </Layout>
  );
};

export default Index;
