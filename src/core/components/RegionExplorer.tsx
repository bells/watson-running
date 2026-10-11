import { useId } from 'react';
import type { GeographySource, RegionSelection } from '../types';
import type { RegionLevel } from '../regionCatalog';
import { aggregateActivityRegions, regionLabel } from '../activityGeography';
import { useLocale } from '../hooks/useLocale';
import styles from './RegionExplorer.module.css';

interface Props {
  activities: readonly {
    geography?: unknown;
    distance: number;
    location_country?: string | null;
  }[];
  source: GeographySource;
  onSourceChange: (source: GeographySource) => void;
  selection: RegionSelection | null;
  onSelect: (selection: RegionSelection | null) => void;
}
export function RegionExplorer({
  activities,
  source,
  onSourceChange,
  selection,
  onSelect,
}: Props) {
  const { t } = useLocale();
  const headingId = useId();
  const level: RegionLevel = selection?.level ?? 'city';
  const summary = aggregateActivityRegions(activities, source, level);
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId}>{t('regionExplore')}</h2>
      <div className={styles.controls}>
        {(['route', 'provider'] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={mode === source}
            onClick={() => {
              onSourceChange(mode);
              onSelect(null);
            }}
          >
            {t(`regionSource_${mode}`)}
          </button>
        ))}
        <label>
          {t('regionLevel')}{' '}
          <select
            value={level}
            onChange={(event) =>
              onSelect({
                source,
                level: event.target.value as RegionLevel,
                regionId: '',
              })
            }
          >
            {(['country', 'province', 'city'] as const).map((item) => (
              <option key={item} value={item}>
                {t(`regionLevel_${item}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>{t(`regionExplanation_${source}`)}</p>
      <p role="status">
        {t('regionCoverage')}: {summary.coveredActivities} /{' '}
        {summary.totalActivities} · {t('regionUnavailable')}:{' '}
        {summary.unavailableActivities}
      </p>
      <p>{t('regionScope')}</p>
      {selection?.regionId && (
        <button type="button" onClick={() => onSelect(null)}>
          {t('regionClear')}
        </button>
      )}
      {!summary.rows.length && <p>{t('regionEmpty')}</p>}
      <ul className={styles.rows}>
        {summary.rows.map((region) => (
          <li key={region.id}>
            <button
              type="button"
              aria-pressed={selection?.regionId === region.id}
              onClick={() =>
                onSelect(
                  selection?.regionId === region.id
                    ? null
                    : { source, level, regionId: region.id }
                )
              }
            >
              <span>{regionLabel(region)}</span>
              <span>
                {(region.distanceM / 1000).toFixed(2)} km ·{' '}
                {region.activityCount} {t('activities')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
