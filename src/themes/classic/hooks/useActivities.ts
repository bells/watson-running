import { useMemo } from 'react';
import type { Activity } from '../utils/utils';
import { locationForRun, titleForRun } from '../utils/utils';
import { getActivityData } from '@core/hooks/useActivities';

interface ProcessedActivities {
  activities: Activity[];
  years: string[];
  countries: string[];
  provinces: string[];
  cities: Record<string, number>;
  runPeriod: Record<string, number>;
  thisYear: string;
}

const processActivities = (activityData: Activity[]): ProcessedActivities => {
  const cities: Record<string, number> = {};
  const runPeriod: Record<string, number> = {};
  const provinces: Set<string> = new Set();
  const countries: Set<string> = new Set();
  const years: Set<string> = new Set();

  // location_country 在这批个人数据中主要保存省份，国家层级固定为中国。
  countries.add('中国');

  activityData.forEach((run) => {
    const location = locationForRun(run);

    const periodName = titleForRun(run);
    if (periodName) {
      runPeriod[periodName] = runPeriod[periodName]
        ? runPeriod[periodName] + 1
        : 1;
    }

    const { city, province } = location;
    // drop only one char city
    if (city.length > 1) {
      cities[city] = cities[city] ? cities[city] + run.distance : run.distance;
    }
    if (province) provinces.add(province);
    const year = run.start_date_local.slice(0, 4);
    years.add(year);
  });

  const yearsArray = [...years].sort().reverse();
  const thisYear = yearsArray[0] || '';

  return {
    activities: activityData,
    years: yearsArray,
    countries: [...countries],
    provinces: [...provinces],
    cities,
    runPeriod,
    thisYear,
  };
};

let processedActivitiesCache: {
  activityData: Activity[];
  processedActivities: ProcessedActivities;
} | null = null;

const getProcessedActivities = (activityData: Activity[]) => {
  if (processedActivitiesCache?.activityData === activityData) {
    return processedActivitiesCache.processedActivities;
  }

  const processedActivities = processActivities(activityData);
  processedActivitiesCache = { activityData, processedActivities };
  return processedActivities;
};

const useActivities = () => {
  const activityData = getActivityData();
  return useMemo(
    () =>
      getProcessedActivities(
        activityData.map((activity) => ({
          ...activity,
          subtype: activity.subtype ?? '',
        }))
      ),
    [activityData]
  );
};

export default useActivities;
