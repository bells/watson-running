import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { MAPBOX_TOKEN } from '../config';
import { useLocale } from '../hooks/useLocale';
import { StatusPanel } from '../core/components/StatusPanel';

interface RouteMapProps {
  activities: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
}

export function RouteMap({
  activities,
  selectedActivity,
  dark,
  onClearSelection,
}: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapError, setMapError] = useState(false);
  const { locale } = useLocale();
  const hasRoutes = activities.some((activity) => activity.summary_polyline);
  const selectedMissingRoute = Boolean(
    selectedActivity && !selectedActivity.summary_polyline
  );
  const unavailable =
    !MAPBOX_TOKEN || !hasRoutes || selectedMissingRoute || mapError;

  const style =
    dark !== false
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11';

  // Declared before the effects that reference it (react-hooks/immutability).
  function updateRoutes() {
    if (!map.current) return;

    // Remove existing source/layer
    if (map.current.getLayer('routes')) map.current.removeLayer('routes');
    if (map.current.getSource('routes')) map.current.removeSource('routes');
    if (map.current.getLayer('selected')) map.current.removeLayer('selected');
    if (map.current.getSource('selected')) map.current.removeSource('selected');

    // If a single activity is selected, show only that route highlighted
    if (selectedActivity?.summary_polyline) {
      const coords = polyline
        .decode(selectedActivity.summary_polyline)
        .map(([lat, lng]) => [lng, lat]);

      map.current.addSource('selected', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      });

      map.current.addLayer({
        id: 'selected',
        type: 'line',
        source: 'selected',
        paint: {
          'line-color': dark ? '#e0ed5e' : '#405000',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      });

      const bounds = new mapboxgl.LngLatBounds();
      for (const c of coords) bounds.extend(c as [number, number]);
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 14,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 500,
      });
      return;
    }

    // Otherwise show all routes
    const features = activities
      .filter((a) => a.summary_polyline)
      .map((a) => {
        const coords = polyline
          .decode(a.summary_polyline!)
          .map(([lat, lng]) => [lng, lat]);
        return {
          type: 'Feature' as const,
          properties: { type: a.type },
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
        };
      });

    if (features.length === 0) return;

    map.current.addSource('routes', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features,
      },
    });

    map.current.addLayer({
      id: 'routes',
      type: 'line',
      source: 'routes',
      paint: {
        'line-color': [
          'match',
          ['get', 'type'],
          'Run',
          dark ? '#e0ed5e' : '#405000',
          'Ride',
          dark ? '#7fcee7' : '#326c86',
          dark ? '#b7a1ed' : '#69589a',
        ],
        'line-width': 1.5,
        'line-opacity': 0.6,
      },
    });

    // Fit bounds to majority of routes (ignore outliers)
    // Use median-based approach: find the region where most routes are
    const allCoords: [number, number][] = [];
    for (const f of features) {
      // Use first coord of each route as representative point
      if (f.geometry.coordinates.length > 0) {
        allCoords.push(f.geometry.coordinates[0] as [number, number]);
      }
    }

    if (allCoords.length === 0) return;

    // Sort by lng and lat, take the middle 80% to exclude outliers
    const trimPct = 0.1;
    const trimCount = Math.floor(allCoords.length * trimPct);

    const lngs = allCoords.map((c) => c[0]).sort((a, b) => a - b);
    const lats = allCoords.map((c) => c[1]).sort((a, b) => a - b);

    const bounds = new mapboxgl.LngLatBounds(
      [lngs[trimCount], lats[trimCount]],
      [lngs[lngs.length - 1 - trimCount], lats[lats.length - 1 - trimCount]]
    );

    map.current.fitBounds(bounds, {
      padding: 30,
      maxZoom: 13,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 500,
    });
  }

  useEffect(() => {
    if (!MAPBOX_TOKEN || !hasRoutes || !mapContainer.current) return;

    if (map.current) {
      map.current.setStyle(style);
      return;
    }

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style,
        center: [121.4, 31.2],
        zoom: 10,
      });
    } catch {
      setMapError(true);
      return;
    }

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.current.on('style.load', () => {
      updateRoutes();
    });
    map.current.on('error', () => setMapError(true));

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [dark, hasRoutes]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !hasRoutes) return;
    if (map.current?.isStyleLoaded()) {
      updateRoutes();
    } else {
      map.current?.once('style.load', () => updateRoutes());
    }
  }, [activities, selectedActivity, hasRoutes]);

  return (
    <div className="relative h-[280px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      {selectedActivity && (
        <button
          onClick={onClearSelection}
          className="absolute top-3 left-3 z-20 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium shadow-md transition-colors hover:bg-[var(--color-bg)]"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Overview
        </button>
      )}
      <div ref={mapContainer} className="h-full w-full" />
      {unavailable && (
        <StatusPanel
          kind="map"
          className="absolute inset-0 z-10"
          title={locale === 'zh' ? '路线地图暂不可用' : 'Route map unavailable'}
          description={
            selectedMissingRoute || !hasRoutes
              ? locale === 'zh'
                ? '当前记录没有公开路线，其他运动信息仍可查看。'
                : 'No public route is available for this record.'
              : locale === 'zh'
                ? '地图瓦片未能加载，记录列表与详情仍可查看。'
                : 'Map tiles could not load. Records and details remain available.'
          }
          actionLabel={
            mapError && MAPBOX_TOKEN
              ? locale === 'zh'
                ? '重试地图'
                : 'Retry map'
              : undefined
          }
          onAction={() => {
            setMapError(false);
            map.current?.setStyle(style);
          }}
        />
      )}
    </div>
  );
}
