import contract from '../../run_page/geography/contract.json';
import { parseProviderRegionChain, regionCatalog } from './regionCatalog';
import type { RegionLevel } from './regionCatalog';
import type {
  Geography,
  GeographyRegion,
  GeographySource,
  RegionSelection,
} from './types';

const levels: readonly RegionLevel[] = ['country', 'province', 'city'];
const catalogById = new Map(
  regionCatalog.regions.map((region) => [region.id, region])
);
const statuses = new Set(contract.statuses);
const levelStatuses = new Set(contract.levelStatuses);
const reasons = new Set(contract.reasons);
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const distance = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const id = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(value);
const nullableId = (value: unknown) => value === null || id(value);

export function readActivityGeography(value: unknown): Geography | null {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.source !== 'private_route' ||
    typeof value.status !== 'string' ||
    !statuses.has(value.status) ||
    !object(value.versions) ||
    !object(value.provider) ||
    !object(value.primary) ||
    !object(value.levels) ||
    !Array.isArray(value.regions)
  )
    return null;
  const versions = value.versions;
  const primary = value.primary;
  if (
    !['catalog', 'boundaries', 'rules'].every(
      (key) =>
        typeof versions[key] === 'string' &&
        /^[A-Za-z0-9._-]{1,128}$/.test(versions[key] as string)
    )
  )
    return null;
  const provider = value.provider;
  if (
    ![null, 'provider', 'catalog_inferred'].includes(
      provider.source as string | null
    ) ||
    !levels.every(
      (level) =>
        nullableId(provider[`${level}Id`]) && nullableId(primary[`${level}Id`])
    )
  )
    return null;
  if ((provider.source === null) !== (provider.countryId === null)) return null;
  let parent: string | null = null;
  for (const level of levels) {
    const regionId = provider[`${level}Id`];
    if (regionId !== null) {
      const entry = catalogById.get(regionId as string);
      if (!entry || entry.level !== level || entry.parentId !== parent)
        return null;
    }
    parent = regionId as string | null;
  }
  const valid = value.validGpsDistanceM;
  if (valid !== null && !distance(valid)) return null;
  const tolerance = Math.max(1, typeof valid === 'number' ? valid * 0.0001 : 0);
  const regions = new Map<string, GeographyRegion>();
  for (const raw of value.regions as unknown[]) {
    if (
      !object(raw) ||
      !id(raw.id) ||
      typeof raw.level !== 'string' ||
      !levels.includes(raw.level as RegionLevel) ||
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      !nullableId(raw.parentId) ||
      !distance(raw.distanceM) ||
      raw.distanceM === 0 ||
      regions.has(raw.id as string)
    )
      return null;
    const known = catalogById.get(raw.id as string);
    if (!known || known.level !== raw.level || known.parentId !== raw.parentId)
      return null;
    if (
      raw.level === 'country' &&
      (raw.parentId !== null || !/^country:[A-Z]{3}$/.test(raw.id as string))
    )
      return null;
    if (
      raw.level !== 'country' &&
      !new RegExp(`^CHN:${raw.level}:\\d{6}$`).test(raw.id as string)
    )
      return null;
    regions.set(raw.id as string, raw as unknown as GeographyRegion);
  }
  if (valid === null && regions.size) return null;
  for (const region of regions.values()) {
    if (region.level === 'country') continue;
    const ancestor = region.parentId && regions.get(region.parentId);
    if (
      !ancestor ||
      ancestor.level !== levels[levels.indexOf(region.level) - 1] ||
      [...regions.values()]
        .filter((child) => child.parentId === ancestor.id)
        .reduce((sum, child) => sum + child.distanceM, 0) >
        ancestor.distanceM + tolerance
    )
      return null;
  }
  for (const level of levels) {
    const summary = value.levels[level];
    if (
      !object(summary) ||
      typeof summary.status !== 'string' ||
      !levelStatuses.has(summary.status) ||
      !Array.isArray(summary.reasons) ||
      !summary.reasons.every(
        (reason: unknown) => typeof reason === 'string' && reasons.has(reason)
      )
    )
      return null;
    const values = [
      'trustedDistanceM',
      'uncertainDistanceM',
      'uncoveredDistanceM',
    ].map((key) => summary[key]);
    if (
      valid === null
        ? values.some((item) => item !== null)
        : values.some((item) => !distance(item))
    )
      return null;
    if (
      valid !== null &&
      Math.abs(
        (values as number[]).reduce((sum, item) => sum + item, 0) -
          (valid as number)
      ) > tolerance
    )
      return null;
    const total = [...regions.values()]
      .filter((region) => region.level === level)
      .reduce((sum, region) => sum + region.distanceM, 0);
    if (
      summary.status === 'complete' &&
      (valid === null ||
        (summary.uncertainDistanceM as number) > tolerance ||
        (summary.uncoveredDistanceM as number) > tolerance)
    )
      return null;
    if (
      ['unavailable', 'out_of_scope', 'boundary_unavailable'].includes(
        summary.status
      ) &&
      total > 0
    )
      return null;
    if (
      valid !== null &&
      Math.abs(total - (summary.trustedDistanceM as number)) > tolerance
    )
      return null;
  }
  if (
    value.status === 'complete' &&
    levels.some(
      (level) =>
        (value.levels as Record<string, Record<string, unknown>>)[level]
          .status !== 'complete'
    )
  )
    return null;
  parent = null;
  for (const level of levels) {
    const regionId = value.primary[`${level}Id`];
    if (regionId !== null) {
      const entry = regions.get(regionId as string);
      if (!entry || entry.level !== level || entry.parentId !== parent)
        return null;
    }
    parent = regionId as string | null;
  }
  if (
    !['complete', 'partial'].includes(value.status) &&
    (regions.size || Object.values(value.primary).some((item) => item !== null))
  )
    return null;
  return value as unknown as Geography;
}

interface RegionActivity {
  geography?: unknown;
  location_country?: string | null;
  distance: number;
  start_date_local?: string;
  type?: string;
}
export function normalizeActivityGeography<T extends RegionActivity>(
  activity: T
): T {
  if (activity.geography === undefined) return activity;
  const geography = readActivityGeography(activity.geography);
  if (geography) return { ...activity, geography };
  const { geography: ignored, ...rest } = activity;
  void ignored;
  return { ...rest, geographyIssue: 'invalid' } as unknown as T;
}
export function activityRegions(
  activity: RegionActivity,
  source: GeographySource,
  level: RegionLevel
): GeographyRegion[] {
  const geography = readActivityGeography(activity.geography);
  if (source === 'route')
    return geography && ['complete', 'partial'].includes(geography.status)
      ? geography.regions.filter(
          (region) => region.level === level && region.distanceM > 0
        )
      : [];
  const provider =
    geography?.provider ?? parseProviderRegionChain(activity.location_country);
  const regionId = provider[`${level}Id`];
  const region = regionId ? catalogById.get(regionId) : null;
  return region
    ? [
        {
          id: region.id,
          name: region.name,
          parentId: region.parentId,
          level,
          distanceM: distance(activity.distance) ? activity.distance : 0,
        },
      ]
    : [];
}
export function matchesActivityRegion(
  activity: RegionActivity,
  selection: RegionSelection
): boolean {
  return activityRegions(activity, selection.source, selection.level).some(
    (region) => region.id === selection.regionId
  );
}
export function scopeRegionActivities<T extends RegionActivity>(
  activities: readonly T[],
  scope: { year?: string | null; sport?: string } = {}
): T[] {
  return activities.filter(
    (activity) =>
      (!scope.year ||
        scope.year === 'all' ||
        activity.start_date_local?.slice(0, 4) === scope.year) &&
      (!scope.sport || scope.sport === 'all' || activity.type === scope.sport)
  );
}
export function aggregateActivityRegions(
  activities: readonly RegionActivity[],
  source: GeographySource,
  level: RegionLevel,
  scope: { year?: string | null; sport?: string } = {}
) {
  const scoped = scopeRegionActivities(activities, scope);
  const rows = new Map<string, GeographyRegion & { activityCount: number }>();
  let coveredActivities = 0;
  for (const activity of scoped) {
    const entries = activityRegions(activity, source, level);
    if (entries.length) coveredActivities += 1;
    for (const region of entries) {
      const previous = rows.get(region.id);
      rows.set(region.id, {
        ...region,
        distanceM: (previous?.distanceM ?? 0) + region.distanceM,
        activityCount: (previous?.activityCount ?? 0) + 1,
      });
    }
  }
  return {
    rows: [...rows.values()].sort(
      (a, b) => b.distanceM - a.distanceM || a.id.localeCompare(b.id)
    ),
    coveredActivities,
    totalActivities: scoped.length,
    unavailableActivities: scoped.length - coveredActivities,
  };
}
export function defaultGeographySource(
  activities: readonly RegionActivity[]
): GeographySource {
  return activities.some(
    (activity) => activityRegions(activity, 'route', 'country').length
  )
    ? 'route'
    : 'provider';
}
export function regionLabel(region: { name: string; parentId: string | null }) {
  const parent = region.parentId ? catalogById.get(region.parentId) : null;
  return parent ? `${region.name} · ${parent.name}` : region.name;
}
