import { readActivityGeography, regionLabel } from '../activityGeography';
import { parseProviderRegionChain, regionCatalog } from '../regionCatalog';
import { useLocale } from '../hooks/useLocale';
import styles from './RegionExplorer.module.css';
export function ActivityGeographySummary({
  activity,
}: {
  activity: {
    geography?: unknown;
    geographyIssue?: 'invalid';
    location_country?: string | null;
  };
}) {
  const { t } = useLocale();
  const geography = readActivityGeography(activity.geography);
  const provider =
    geography?.provider ?? parseProviderRegionChain(activity.location_country);
  const names = (chain: {
    countryId: string | null;
    provinceId: string | null;
    cityId: string | null;
  }) =>
    [chain.countryId, chain.provinceId, chain.cityId]
      .filter(Boolean)
      .map(
        (id) =>
          geography?.regions.find((r) => r.id === id)?.name ??
          regionCatalog.regions.find((r) => r.id === id)?.name
      )
      .filter(Boolean)
      .join(' / ') || '—';
  return (
    <section className={styles.panel} aria-label={t('regionExplore')}>
      <h2>{t('regionExplore')}</h2>
      <p>
        {t('regionSource_provider')}: {names(provider)}
      </p>
      <p>
        {t('regionStatus')}:{' '}
        {t(
          `regionStatus_${activity.geographyIssue ? 'invalid' : (geography?.status ?? 'pending')}`
        )}
      </p>
      {geography && (
        <>
          <p>
            {t('regionPrimary')}: {names(geography.primary)}
          </p>
          {(['country', 'province', 'city'] as const).map((level) => (
            <div key={level}>
              <h3>{t(`regionLevel_${level}`)}</h3>
              <ul>
                {geography.regions
                  .filter((r) => r.level === level)
                  .map((region) => (
                    <li key={region.id}>
                      {regionLabel(region)} ·{' '}
                      {(region.distanceM / 1000).toFixed(2)} km
                    </li>
                  ))}
              </ul>
              <p>
                {t('regionUncertain')}:{' '}
                {geography.levels[level].uncertainDistanceM === null
                  ? '—'
                  : `${(geography.levels[level].uncertainDistanceM / 1000).toFixed(2)} km`}{' '}
                · {t('regionUncovered')}:{' '}
                {geography.levels[level].uncoveredDistanceM === null
                  ? '—'
                  : `${(geography.levels[level].uncoveredDistanceM / 1000).toFixed(2)} km`}
              </p>
              <p>
                {geography.levels[level].reasons
                  .map((reason) => t(`regionReason_${reason}`))
                  .join(' · ')}
              </p>
            </div>
          ))}
        </>
      )}
      <p>{t('regionMapExplanation')}</p>
    </section>
  );
}
