import styles from './ChinaMap.module.css';
import { useEffect, useMemo, useState } from 'react';
import type { Activity, SportFilter } from '../types';
import { useLocale } from '../hooks/useLocale';
import { aggregateActivityRegions } from '@core/activityGeography';
import type { GeographySource } from '@core/types';
import { regionCatalog } from '@core/regionCatalog';

interface ChinaMapProps {
  activities: Activity[];
  filter: SportFilter;
  source: GeographySource;
  onSelectProvince?: (province: string | null) => void;
  selectedProvince?: string | null;
}

type GeoFeature = {
  type: 'Feature';
  properties: { name: string; adcode: number };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][][];
  };
};

// Simple equirectangular projection bounded to China
const BOUNDS = { minLng: 73, maxLng: 136, minLat: 15, maxLat: 54 };

function project(
  lng: number,
  lat: number,
  w: number,
  h: number
): [number, number] {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * w;
  const y = h - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * h;
  return [x, y];
}

function ringToPath(ring: number[][], w: number, h: number): string {
  return (
    ring
      .map(([lng, lat], i) => {
        const [x, y] = project(lng, lat, w, h);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

function featureToPath(feature: GeoFeature, w: number, h: number): string {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') {
    return (coordinates as unknown as number[][][])
      .map((r) => ringToPath(r, w, h))
      .join(' ');
  }
  // MultiPolygon
  return (coordinates as unknown as number[][][][])
    .flatMap((poly) => poly.map((r) => ringToPath(r, w, h)))
    .join(' ');
}

export function ChinaMap({
  activities,
  filter,
  source,
  onSelectProvince,
  selectedProvince,
}: ChinaMapProps) {
  const { locale } = useLocale();
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [features, setFeatures] = useState<GeoFeature[]>([]);

  const SVG_W = 260;
  const SVG_H = 190;

  // Lazy-load GeoJSON to keep initial bundle small
  useEffect(() => {
    import('../assets/china-provinces.json')
      .then((mod) => {
        setFeatures((mod.default as { features: GeoFeature[] }).features);
      })
      .catch(() => setMapFailed(true));
  }, []);

  const provinceCount = useMemo(
    () =>
      new Map(
        aggregateActivityRegions(activities, source, 'province').rows.map(
          (row) => [row.id, row.activityCount]
        )
      ),
    [activities, source]
  );
  const label = (id: string) =>
    regionCatalog.regions.find((r) => r.id === id)?.name ?? id;

  const visitedCount = provinceCount.size;
  const displayProvince = hoveredProvince ?? selectedProvince;
  const displayCount = displayProvince
    ? (provinceCount.get(displayProvince) ?? 0)
    : 0;

  function handleClick(name: string) {
    if (!onSelectProvince) return;
    const visited = (provinceCount.get(name) ?? 0) > 0;
    if (!visited) return;
    onSelectProvince(selectedProvince === name ? null : name);
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {locale === 'zh' ? '足迹地图' : 'Footprint Map'}
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          {selectedProvince ? (
            <button
              onClick={() => onSelectProvince?.(null)}
              className="flex min-h-11 items-center gap-1 text-[var(--color-accent)] transition-opacity hover:opacity-70"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              {locale === 'zh' ? '清除筛选' : 'Clear'}
            </button>
          ) : (
            <>
              <span className="font-mono font-bold text-[var(--color-accent)]">
                {visitedCount}
              </span>
              <span>
                / {features.length || 35}{' '}
                {locale === 'zh' ? '省份' : 'provinces'}
              </span>
            </>
          )}
        </div>
      </div>

      {mapFailed && (
        <p>
          {locale === 'zh'
            ? '地图暂不可用；地区列表仍可筛选。'
            : 'Map unavailable; region filters remain usable.'}
        </p>
      )}
      {/* SVG Map — aspect-ratio wrapper prevents stretching */}
      <div className="relative" style={{ aspectRatio: `${SVG_W} / ${SVG_H}` }}>
        <svg
          key={filter}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          style={{ display: 'block', position: 'absolute', inset: 0 }}
        >
          {features.map((feature) => {
            const name = `CHN:province:${feature.properties.adcode}`;
            const count = provinceCount.get(name) ?? 0;
            const visited = count > 0;
            const isHovered = hoveredProvince === name;
            const isSelected = selectedProvince === name;

            let fill: string;
            if (visited) {
              if (isSelected) {
                fill = 'var(--color-accent)';
              } else if (isHovered) {
                fill =
                  'color-mix(in srgb, var(--color-accent) 80%, transparent)';
              } else if (selectedProvince) {
                // dim other provinces when one is selected
                fill =
                  'color-mix(in srgb, var(--color-accent) 25%, transparent)';
              } else {
                fill =
                  'color-mix(in srgb, var(--color-accent) 55%, transparent)';
              }
            } else {
              fill = 'var(--color-border)';
            }

            return (
              <path
                key={feature.properties.adcode}
                d={featureToPath(feature, SVG_W, SVG_H)}
                fill={fill}
                stroke="var(--color-bg)"
                strokeWidth="0.5"
                className={`${styles.province} transition-all duration-150 motion-reduce:transition-none ${visited ? 'cursor-pointer' : 'cursor-default'}`}
                onMouseEnter={() => setHoveredProvince(name)}
                onMouseLeave={() => setHoveredProvince(null)}
                onClick={() => handleClick(name)}
                role="button"
                tabIndex={visited ? 0 : -1}
                aria-label={label(name)}
                aria-pressed={isSelected}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleClick(name);
                  }
                }}
              />
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      <div className="mt-1.5 h-4 text-xs text-[var(--color-muted)]">
        {displayProvince && (
          <>
            <span className="font-medium text-[var(--color-text)]">
              {label(displayProvince)}
            </span>
            {displayCount > 0 && (
              <span className="ml-1.5">
                {displayCount} {locale === 'zh' ? '次' : 'activities'}
              </span>
            )}
            {selectedProvince === displayProvince && !hoveredProvince && (
              <span className="ml-1.5 text-[var(--color-accent)]">
                {locale === 'zh' ? '（已筛选）' : '(filtered)'}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
