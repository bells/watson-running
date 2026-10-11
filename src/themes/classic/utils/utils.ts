import {
  matchesActivityCity,
  parseActivityLocation,
} from '@core/activityLocation';
import {
  compareActivitiesNewest,
  formatDistanceMeters,
  formatPaceFromSpeed,
  parseMovingSeconds,
  routeDisplayStatus,
  sportDisplayName,
} from '@core/activityDisplay';
import { RUN_TITLES, ACTIVITY_TYPES, RICH_TITLE } from './const';

export type Coordinate = [number, number];

export type RunIds = Array<number> | [];

// Check for units environment variable
const IS_IMPERIAL = import.meta.env.VITE_USE_IMPERIAL === 'true';
export const M_TO_DIST = IS_IMPERIAL ? 1609.344 : 1000; // Meters to Mi or Km
export const M_TO_ELEV = IS_IMPERIAL ? 3.28084 : 1; // Meters to Feet or Meters
export const DIST_UNIT = IS_IMPERIAL ? 'mi' : 'km'; // Label
export const ELEV_UNIT = IS_IMPERIAL ? 'ft' : 'm'; // Label

export interface Activity {
  geography?: import('@core/types').Geography;
  geographyIssue?: 'invalid';
  run_id: number;
  name: string;
  distance: number;
  moving_time: string;
  type: string;
  subtype: string;
  start_date: string;
  start_date_local: string;
  location_country?: string | null;
  summary_polyline?: string | null;
  average_heartrate?: number | null;
  elevation_gain: number | null;
  average_speed: number;
  streak: number;
  week_streak?: number;
  source?: string | null;
  detail_available?: boolean;
  calories_kcal?: number | null;
  total_steps?: number | null;
  average_cadence_spm?: number | null;
  average_stride_m?: number | null;
}

const titleForShow = (run: Activity): string => {
  const date = run.start_date_local.slice(0, 11);
  const distance = IS_IMPERIAL
    ? (run.distance / M_TO_DIST).toFixed(2)
    : formatDistanceMeters(run.distance, 2);
  let name = 'Run';
  if (run.name.slice(0, 7) === 'Running') {
    name = 'run';
  }
  if (run.name) {
    name = run.name;
  }
  return `${name} ${date} ${distance} ${DIST_UNIT} ${
    routeDisplayStatus(run) === 'missing' ? '(No map data for this run)' : ''
  }`;
};

const formatPace = (d: number): string => {
  if (!IS_IMPERIAL) return formatPaceFromSpeed(d, 'runner');
  if (!Number.isFinite(d) || d <= 0) return '—';
  const pace = (M_TO_DIST / 60.0) * (1.0 / d);
  const minutes = Math.floor(pace);
  const seconds = Math.floor((pace - minutes) * 60.0);
  return `${minutes}'${seconds.toFixed(0).toString().padStart(2, '0')}"`;
};

const convertMovingTime2Sec = (moving_time: string): number => {
  return parseMovingSeconds(moving_time) ?? 0;
};

const formatRunTime = (moving_time: string): string => {
  const totalSeconds = convertMovingTime2Sec(moving_time);
  const seconds = totalSeconds % 60;
  const minutes = (totalSeconds - seconds) / 60;
  if (minutes === 0) {
    return seconds + 's';
  }
  return minutes + 'min';
};

// for scroll to the map
const scrollToMap = () => {
  const mapContainer = document.getElementById('map-container');
  if (mapContainer) {
    mapContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const locationForRun = (run: Activity) =>
  parseActivityLocation(run.location_country);

const intComma = (x = '') => {
  if (x.toString().length <= 5) {
    return x;
  }
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const getActivitySport = (act: Activity): string => {
  if (act.type === 'Run') {
    if (act.subtype === 'generic') {
      const runDistance = act.distance / 1000;
      if (runDistance > 20 && runDistance < 40) {
        return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
      } else if (runDistance >= 40) {
        return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
      }
      return ACTIVITY_TYPES.RUN_GENERIC_TITLE;
    } else if (act.subtype === 'trail') return ACTIVITY_TYPES.RUN_TRAIL_TITLE;
    else if (act.subtype === 'treadmill')
      return ACTIVITY_TYPES.RUN_TREADMILL_TITLE;
    else return ACTIVITY_TYPES.RUN_GENERIC_TITLE;
  } else if (act.type === 'hiking') {
    return ACTIVITY_TYPES.HIKING_TITLE;
  } else if (act.type === 'cycling') {
    return ACTIVITY_TYPES.CYCLING_TITLE;
  } else if (act.type === 'walking') {
    return ACTIVITY_TYPES.WALKING_TITLE;
  }
  // if act.type contains 'skiing'
  else if (act.type.includes('skiing')) {
    return ACTIVITY_TYPES.SKIING_TITLE;
  }
  return '';
};

const titleForRun = (run: Activity): string => {
  if (run.type !== 'Run') return run.name || sportDisplayName(run.type);
  if (RICH_TITLE) {
    // 1. try to use user defined name
    if (run.name != '') {
      return run.name;
    }
    // 2. try to use location+type if the location is available, eg. 'Shanghai Run'
    const { city } = locationForRun(run);
    const activity_sport = getActivitySport(run);
    if (city && city.length > 0 && activity_sport.length > 0) {
      return `${city} ${activity_sport}`;
    }
  }
  // 3. use time+length if location or type is not available
  const runDistance = run.distance / 1000;
  const runHour = +run.start_date_local.slice(11, 13);
  if (runDistance > 20 && runDistance < 40) {
    return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
  }
  if (runDistance >= 40) {
    return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
  }
  if (runHour >= 0 && runHour <= 10) {
    return RUN_TITLES.MORNING_RUN_TITLE;
  }
  if (runHour > 10 && runHour <= 14) {
    return RUN_TITLES.MIDDAY_RUN_TITLE;
  }
  if (runHour > 14 && runHour <= 18) {
    return RUN_TITLES.AFTERNOON_RUN_TITLE;
  }
  if (runHour > 18 && runHour <= 21) {
    return RUN_TITLES.EVENING_RUN_TITLE;
  }
  return RUN_TITLES.NIGHT_RUN_TITLE;
};

const filterYearRuns = (run: Activity, year: string) => {
  if (run && run.start_date_local) {
    return run.start_date_local.slice(0, 4) === year;
  }
  return false;
};

const filterCityRuns = (run: Activity, city: string) =>
  matchesActivityCity(run, city);
const filterTitleRuns = (run: Activity, title: string) =>
  titleForRun(run) === title;

const filterAndSortRuns = (
  activities: Activity[],
  item: string,
  filterFunc: (_run: Activity, _bvalue: string) => boolean,
  sortFunc: (_a: Activity, _b: Activity) => number
) => {
  let s = activities.slice();
  if (item !== 'Total') {
    s = activities.filter((run) => filterFunc(run, item));
  }
  return s.sort(sortFunc);
};

const sortDateFunc = (a: Activity, b: Activity) =>
  compareActivitiesNewest(a, b);
const sortDateFuncReverse = (a: Activity, b: Activity) => sortDateFunc(b, a);

export {
  titleForShow,
  formatPace,
  scrollToMap,
  locationForRun,
  intComma,
  titleForRun,
  filterYearRuns,
  filterCityRuns,
  filterTitleRuns,
  filterAndSortRuns,
  sortDateFunc,
  sortDateFuncReverse,
  formatRunTime,
  convertMovingTime2Sec,
};
