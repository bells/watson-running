import catalogDocument from '../../run_page/geography/region_catalog.json';

export type RegionLevel = 'country' | 'province' | 'city';
export interface CatalogRegion {
  id: string;
  countryCode: string;
  level: RegionLevel;
  codeNamespace: string;
  code: string;
  name: string;
  parentId: string | null;
  aliases: string[];
  equivalent?: boolean;
}
export interface RegionCatalog {
  version: string;
  regions: CatalogRegion[];
}
export interface ProviderRegionChain {
  countryId: string | null;
  provinceId: string | null;
  cityId: string | null;
  source: 'provider' | 'catalog_inferred' | null;
}

const levels: readonly RegionLevel[] = ['country', 'province', 'city'];
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string {
  return typeof value === 'string' && !['None', 'null'].includes(value.trim())
    ? value.trim()
    : '';
}

export function readRegionCatalog(value: unknown): RegionCatalog {
  if (!object(value) || !text(value.version) || !Array.isArray(value.regions))
    throw new Error('invalid_catalog_version');
  const regions: CatalogRegion[] = [];
  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const entry of value.regions as unknown[]) {
    if (
      !object(entry) ||
      !['id', 'countryCode', 'codeNamespace', 'code', 'name'].every((key) =>
        text(entry[key])
      ) ||
      typeof entry.countryCode !== 'string' ||
      !/^[A-Z]{3}$/.test(entry.countryCode) ||
      !levels.includes(entry.level as RegionLevel) ||
      !(entry.parentId === null || typeof entry.parentId === 'string') ||
      !Array.isArray(entry.aliases) ||
      !entry.aliases.every((alias: unknown) => !!text(alias))
    )
      throw new Error('invalid_region_identity');
    const region = entry as unknown as CatalogRegion;
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(region.id))
      throw new Error('invalid_region_identity');
    if (
      region.codeNamespace === 'ISO3166-1-alpha3' &&
      (region.level !== 'country' ||
        region.id !== `country:${region.countryCode}` ||
        region.code !== region.countryCode)
    )
      throw new Error('invalid_region_code');
    if (
      region.codeNamespace.startsWith('CN-adcode') &&
      (region.countryCode !== 'CHN' ||
        !/^\d{6}$/.test(region.code) ||
        region.id !== `CHN:${region.level}:${region.code}`)
    )
      throw new Error('invalid_region_code');
    const identity = JSON.stringify([
      region.codeNamespace,
      region.level,
      region.code,
    ]);
    if (ids.has(region.id) || identities.has(identity))
      throw new Error('duplicate_region_code');
    ids.add(region.id);
    identities.add(identity);
    regions.push(region);
  }
  for (const region of regions) {
    if (region.level === 'country') {
      if (region.parentId !== null) throw new Error('invalid_country_parent');
    } else {
      const parent = regions.find((entry) => entry.id === region.parentId);
      if (
        !parent ||
        parent.level !== levels[levels.indexOf(region.level) - 1] ||
        parent.countryCode !== region.countryCode
      )
        throw new Error('invalid_region_parent');
    }
  }
  return { version: value.version as string, regions };
}

export const regionCatalog = readRegionCatalog(catalogDocument);

function candidates(
  catalog: RegionCatalog,
  level: RegionLevel,
  name: string,
  parentId: string | null = null
): CatalogRegion[] {
  return catalog.regions.filter(
    (entry) =>
      entry.level === level &&
      (entry.name === name || entry.aliases.includes(name)) &&
      (!parentId || entry.parentId === parentId)
  );
}

function fields(value: unknown, catalog: RegionCatalog) {
  const raw = text(value);
  if (raw.length > 4096) return ['', '', ''];
  if (raw.startsWith('{')) {
    try {
      const entry: unknown = JSON.parse(
        raw.replace(/'/g, '"').replace(/\bNone\b/g, 'null')
      );
      if (!object(entry)) return ['', '', ''];
      return [
        text(entry.country),
        text(entry.province) || text(entry.state),
        text(entry.city) || text(entry.town),
      ];
    } catch {
      return ['', '', ''];
    }
  }
  if (/^[^:]+:[^:]*$/.test(raw)) {
    const [city, province] = raw.split(':').map(text);
    return ['', province, city];
  }
  const tokens = raw.split(/[,，]/).map(text).filter(Boolean);
  const token = (level: RegionLevel) => {
    const matches = tokens.filter(
      (part) => candidates(catalog, level, part).length
    );
    return matches.length === 1 ? matches[0] : '';
  };
  let country = token('country');
  if (!country && tokens.length > 1) {
    const last = tokens.at(-1)!;
    if (
      !levels.slice(1).some((level) => candidates(catalog, level, last).length)
    )
      country = last;
  }
  return [country, token('province'), token('city')];
}

export function parseProviderRegionChain(
  value: unknown,
  catalog: RegionCatalog = regionCatalog
): ProviderRegionChain {
  const [country, province, city] = fields(value, catalog);
  const empty: ProviderRegionChain = {
    countryId: null,
    provinceId: null,
    cityId: null,
    source: null,
  };
  const resolve = (
    level: RegionLevel,
    name: string,
    parentId: string | null = null
  ) => {
    const matches = candidates(catalog, level, name, parentId);
    return name && matches.length === 1 ? matches[0].id : null;
  };
  let countryId = resolve('country', country);
  if (country && !countryId) return empty;
  let provinceId = resolve('province', province, countryId);
  let cityId = resolve('city', city, provinceId);
  if (province && !provinceId) cityId = null;
  if (cityId) {
    const parentId = catalog.regions.find(
      (entry) => entry.id === cityId
    )!.parentId!;
    const ancestorId = catalog.regions.find(
      (entry) => entry.id === parentId
    )!.parentId!;
    if (countryId && countryId !== ancestorId) cityId = null;
    else {
      provinceId = parentId;
      countryId = ancestorId;
    }
  }
  if (provinceId && !countryId)
    countryId = catalog.regions.find(
      (entry) => entry.id === provinceId
    )!.parentId;
  return {
    countryId,
    provinceId,
    cityId,
    source: countryId ? (country ? 'provider' : 'catalog_inferred') : null,
  };
}
