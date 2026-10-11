import { chinaCities, COUNTRY_STANDARDIZATION } from './locationNames';

export interface ActivityLocation {
  country: string;
  province: string;
  city: string;
  coordinate: [number, number] | null;
}

const provinces = chinaCities.filter((entry) => !entry.city);
const cities = chinaCities.filter((entry) => entry.city);
const municipalities = ['北京市', '天津市', '上海市', '重庆市'];
const provinceAlias = (name: string) =>
  name.replace(
    /(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/,
    ''
  );

const provinceNames = new Map(
  provinces.flatMap((entry) => [
    [entry.name, entry.name],
    [provinceAlias(entry.name), entry.name],
  ])
);
const countryNames = new Map([
  ...COUNTRY_STANDARDIZATION,
  ['China', '中国'],
  ['中华人民共和国', '中国'],
  ['中国大陆', '中国'],
  ['中国', '中国'],
  ['United States', '美国'],
  ['USA', '美国'],
  ['United Kingdom', '英国'],
  ['UK', '英国'],
  ['日本', '日本'],
  ['泰国', '泰国'],
]);

function text(value: unknown): string {
  return typeof value === 'string' && value !== 'None' && value !== 'null'
    ? value.trim()
    : '';
}

function structuredLocation(value: string): Record<string, unknown> | null {
  if (!value.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(
      value.replace(/'/g, '"').replace(/\bNone\b/g, 'null')
    );
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseActivityLocation(value?: string | null): ActivityLocation {
  const raw = text(value);
  let country = '';
  let province = '';
  let city = '';
  let coordinate: [number, number] | null = null;
  const fields = structuredLocation(raw);
  if (fields) {
    country = text(fields.country);
    province = text(fields.province) || text(fields.state);
    city = text(fields.city) || text(fields.town);
    const { latitude, longitude } = fields;
    if (
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      typeof longitude === 'number' &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    )
      coordinate = [longitude, latitude];
  } else if (!raw.startsWith('{')) {
    // JoyRun uses city:province; dictionary colons belong to structured data.
    if (/^[^:]+:[^:]*$/.test(raw)) {
      [city, province] = raw.split(':').map(text);
    } else {
      const parts = raw.split(/[,，]/).map(text).filter(Boolean);
      country =
        countryNames.get(raw) || (parts.length > 1 ? parts.at(-1)! : '');
    }
    province =
      provinceNames.get(province) ||
      provinces.find((entry) => raw.includes(entry.name))?.name ||
      provinces.find((entry) =>
        raw.split(/[,，]/).map(text).includes(provinceAlias(entry.name))
      )?.name ||
      province;
    city ||= cities.find((entry) => raw.includes(entry.name))?.name || '';
  }
  country = countryNames.get(country) || country;
  province = provinceNames.get(province) || province;
  if (
    !country &&
    (provinceNames.has(province) || cities.some((entry) => entry.name === city))
  )
    country = '中国';

  if (country === '中国') {
    const provinceCode = provinces.find(
      (entry) => entry.name === province
    )?.province;
    const canonicalCity = cities.find(
      (entry) =>
        (!provinceCode || entry.province === provinceCode) &&
        (entry.name === city || entry.name.replace(/市$/, '') === city)
    );
    city = canonicalCity?.name || city;
    if (!province && canonicalCity) {
      province =
        provinces.find((entry) => entry.province === canonicalCity.province)
          ?.name || '';
    }
    if (municipalities.includes(province)) city = province;
  }
  return { country, province, city, coordinate };
}

export function summarizeLocations(
  activities: readonly { location_country?: string | null; distance: number }[]
) {
  const countries = new Set<string>();
  const provinces = new Map<string, string>();
  const cityTotals = new Map<
    string,
    { location: ActivityLocation; distance: number }
  >();
  const cities: Record<string, number> = {};
  for (const activity of activities) {
    const location = parseActivityLocation(activity.location_country);
    if (location.country) countries.add(location.country);
    if (location.province)
      provinces.set(
        JSON.stringify([location.country, location.province]),
        location.province
      );
    if (location.city.length > 1) {
      const key = JSON.stringify([
        location.country,
        location.province,
        location.city,
      ]);
      const previous = cityTotals.get(key);
      cityTotals.set(key, {
        location,
        distance: (previous?.distance || 0) + activity.distance,
      });
    }
  }
  const nameCounts = new Map<string, number>();
  for (const { location } of cityTotals.values()) {
    nameCounts.set(location.city, (nameCounts.get(location.city) || 0) + 1);
  }
  for (const { location, distance } of cityTotals.values()) {
    const label =
      nameCounts.get(location.city) === 1 ? location.city : cityLabel(location);
    cities[label] = distance;
  }
  return {
    countries: [...countries],
    provinces: [...provinces.values()],
    cities,
  };
}

function cityLabel(location: ActivityLocation) {
  return `${location.city} · ${[location.province, location.country].filter(Boolean).join('，')}`;
}

export function matchesActivityCity(
  activity: { location_country?: string | null },
  city: string
) {
  const location = parseActivityLocation(activity.location_country);
  return location.city === city || cityLabel(location) === city;
}
