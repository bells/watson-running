import { useMemo } from 'react';
import type { Activity, SportFilter } from '../types';
import {
  activityYear,
  formatDistanceMeters,
  formatDurationShort,
  formatPaceFromSpeed,
  parseMovingSeconds,
} from '../activityDisplay';

// Canonical province extraction — handles all 3 location_country formats,
// only returns Chinese provinces (filters out foreign locations).
export function extractProvince(loc: string | null): string | null {
  if (!loc || loc === 'None') return null;
  // Format 1: Python dict string {'country':'中国','province':'河南省',...}
  if (loc.startsWith('{')) {
    try {
      const d = JSON.parse(
        loc.replace(/'/g, '"').replace(/None/g, 'null')
      ) as Record<string, string>;
      if (d.country === '中国' && d.province) return d.province;
    } catch {
      /* ignore */
    }
    return null;
  }
  // Format 2 & 3: search for full province names first
  const provincePatterns = [
    '北京市',
    '天津市',
    '上海市',
    '重庆市',
    '河北省',
    '山西省',
    '辽宁省',
    '吉林省',
    '黑龙江省',
    '江苏省',
    '浙江省',
    '安徽省',
    '福建省',
    '江西省',
    '山东省',
    '河南省',
    '湖北省',
    '湖南省',
    '广东省',
    '海南省',
    '四川省',
    '贵州省',
    '云南省',
    '陕西省',
    '甘肃省',
    '青海省',
    '内蒙古自治区',
    '广西壮族自治区',
    '西藏自治区',
    '宁夏回族自治区',
    '新疆维吾尔自治区',
    '香港特别行政区',
    '澳门特别行政区',
    '台湾省',
  ];
  for (const p of provincePatterns) {
    if (loc.includes(p)) return p;
  }
  // Fuzzy: short names → full names
  const fuzzy: [string, string][] = [
    ['上海', '上海市'],
    ['北京', '北京市'],
    ['天津', '天津市'],
    ['重庆', '重庆市'],
    ['江苏', '江苏省'],
    ['浙江', '浙江省'],
    ['广东', '广东省'],
    ['河南', '河南省'],
    ['四川', '四川省'],
    ['湖北', '湖北省'],
    ['湖南', '湖南省'],
    ['福建', '福建省'],
    ['安徽', '安徽省'],
    ['山东', '山东省'],
    ['河北', '河北省'],
    ['山西', '山西省'],
    ['云南', '云南省'],
    ['贵州', '贵州省'],
    ['陕西', '陕西省'],
    ['甘肃', '甘肃省'],
    ['辽宁', '辽宁省'],
    ['吉林', '吉林省'],
    ['黑龙江', '黑龙江省'],
    ['海南', '海南省'],
    ['内蒙古', '内蒙古自治区'],
    ['广西', '广西壮族自治区'],
    ['西藏', '西藏自治区'],
    ['新疆', '新疆维吾尔自治区'],
    ['宁夏', '宁夏回族自治区'],
    ['香港', '香港特别行政区'],
    ['澳门', '澳门特别行政区'],
    ['台湾', '台湾省'],
  ];
  for (const [key, val] of fuzzy) {
    if (loc.includes(key)) return val;
  }
  return null;
}

export function useFilteredActivities(
  activities: Activity[],
  filter: SportFilter,
  year: number | null
) {
  return useMemo(() => {
    let filtered = activities;
    if (filter !== 'all') {
      filtered = filtered.filter((a) => a.type === filter);
    }
    if (year) {
      filtered = filtered.filter((a) => {
        return activityYear(a) === String(year);
      });
    }
    return filtered;
  }, [activities, filter, year]);
}

export function parseMovingTime(time: string): number {
  return parseMovingSeconds(time) ?? 0;
}

export function formatDistance(meters: number): string {
  return formatDistanceMeters(meters, 0);
}

export function formatPace(speedMs: number): string {
  return formatPaceFromSpeed(speedMs);
}

export function formatDuration(timeStr: string): string {
  return formatDurationShort(timeStr);
}

export function getAvailableYears(activities: Activity[]): number[] {
  const years = new Set(
    activities
      .map((activity) => activityYear(activity))
      .filter((year): year is string => year !== null)
      .map(Number)
  );
  return Array.from(years).sort((a, b) => b - a);
}

// Async data loading (fetch-based, compatible with Suspense)
import activitiesUrl from '@/static/activities.json?url';

let activityDataCache: Activity[] | null = null;
let activityDataError: unknown = null;
let activityDataPromise: Promise<Activity[]> | null = null;

const loadActivityData = () => {
  activityDataPromise ??= fetch(activitiesUrl)
    .then((response) => {
      if (!response.ok)
        throw new Error(`Failed to load activities: ${response.status}`);
      return response.json() as Promise<Activity[]>;
    })
    .then((data) => {
      activityDataCache = data;
      return data;
    })
    .catch((error: unknown) => {
      activityDataError = error;
      throw error;
    });
  return activityDataPromise;
};

export const getActivityData = () => {
  if (activityDataError) throw activityDataError;
  if (activityDataCache) return activityDataCache;
  throw loadActivityData();
};

// Reset the module-level cache so an ErrorBoundary can retry after a fetch failure
export function resetActivityData() {
  activityDataCache = null;
  activityDataError = null;
  activityDataPromise = null;
}
