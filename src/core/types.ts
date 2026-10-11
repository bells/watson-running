export interface Activity {
  geography?: Geography;
  geographyIssue?: 'invalid';
  run_id: number;
  name: string;
  distance: number; // meters
  moving_time: string; // "H:MM:SS"
  type: 'Run' | string;
  subtype?: string;
  start_date: string;
  start_date_local: string;
  location_country: string | null;
  summary_polyline: string | null;
  average_heartrate: number | null;
  average_speed: number; // m/s
  elevation_gain: number | null;
  source?: string | null;
  detail_available?: boolean;
  calories_kcal?: number | null;
  total_steps?: number | null;
  average_cadence_spm?: number | null;
  average_stride_m?: number | null;
  streak: number;
  week_streak?: number;
}

export type SportFilter = 'all' | 'Run';
import type { ProviderRegionChain, RegionLevel } from './regionCatalog';

export type GeographyStatus =
  | 'pending'
  | 'complete'
  | 'partial'
  | 'no_route'
  | 'indoor'
  | 'invalid_route'
  | 'unknown_crs'
  | 'boundary_unavailable'
  | 'stale'
  | 'error';
export type GeographyLevelStatus =
  | 'complete'
  | 'partial'
  | 'boundary_unavailable'
  | 'out_of_scope'
  | 'unavailable';
export type GeographySource = 'route' | 'provider';
export interface GeographyRegion {
  id: string;
  level: RegionLevel;
  name: string;
  parentId: string | null;
  distanceM: number;
}
export interface GeographyLevel {
  status: GeographyLevelStatus;
  trustedDistanceM: number | null;
  uncertainDistanceM: number | null;
  uncoveredDistanceM: number | null;
  reasons: string[];
}
export interface Geography {
  schemaVersion: 1;
  status: GeographyStatus;
  source: 'private_route';
  versions: { catalog: string; boundaries: string; rules: string };
  provider: ProviderRegionChain;
  primary: {
    countryId: string | null;
    provinceId: string | null;
    cityId: string | null;
  };
  validGpsDistanceM: number | null;
  levels: Record<RegionLevel, GeographyLevel>;
  regions: GeographyRegion[];
}
export interface RegionSelection {
  source: GeographySource;
  level: RegionLevel;
  regionId: string;
}
