import { useMemo } from 'react';
import { summarizeLocations } from '@core/activityLocation';
import type { Activity } from '../utils/utils';
import { titleForRun } from '../utils/utils';
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
  const runPeriod: Record<string, number> = {};
  const years: Set<string> = new Set();
  const { countries, provinces, cities } = summarizeLocations(activityData);

  activityData.forEach((run) => {
    const periodName = titleForRun(run);
    if (periodName) {
      runPeriod[periodName] = runPeriod[periodName]
        ? runPeriod[periodName] + 1
        : 1;
    }

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
