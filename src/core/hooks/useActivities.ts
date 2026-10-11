import { useMemo } from 'react';
import type { Activity, SportFilter } from '../types';
import {
  activityYear,
  formatDistanceMeters,
  formatDurationShort,
  formatPaceFromSpeed,
  parseMovingSeconds,
} from '../activityDisplay';

import { parseActivityLocation } from '../activityLocation';
import { normalizeActivityGeography } from '../activityGeography';

export function extractProvince(loc: string | null): string | null {
  const location = parseActivityLocation(loc);
  return location.country === '中国' ? location.province || null : null;
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
      const normalized = data.map(normalizeActivityGeography);
      activityDataCache = normalized;
      return normalized;
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
