import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { tsModule } from './ts-loader.mjs';
const geo = await import(
  tsModule(new URL('../src/core/activityGeography.ts', import.meta.url))
);
const activities = JSON.parse(
  readFileSync(
    new URL('./fixtures/geography-activities.json', import.meta.url),
    'utf8'
  )
);
test('geography is locally rejected without losing activity facts', () => {
  assert.ok(geo.readActivityGeography(activities[0].geography));
  assert.equal(geo.normalizeActivityGeography(activities[1]), activities[1]);
  for (const mutate of [
    (g) => {
      g.schemaVersion = 2;
    },
    (g) => {
      g.regions[0].distanceM = -1;
    },
    (g) => {
      g.regions.push(g.regions[0]);
    },
    (g) => {
      g.regions[0].level = 'county';
    },
    (g) => {
      g.regions.at(-1).parentId = 'CHN:province:110000';
    },
    (g) => {
      g.levels.city.trustedDistanceM = 1;
    },
    (g) => {
      g.provider.source = null;
    },
    (g) => {
      g.primary.cityId = 'CHN:city:110000';
    },
    (g) => {
      g.status = 'error';
    },
    (g) => {
      g.regions[0].id = 'country:XXX';
    },
  ]) {
    const activity = structuredClone(activities[0]);
    mutate(activity.geography);
    const normalized = geo.normalizeActivityGeography(activity);
    assert.equal(normalized.geography, undefined);
    assert.equal(normalized.geographyIssue, 'invalid');
    assert.equal(normalized.distance, 21100);
    assert.equal(normalized.run_id, 201);
  }
});
test('route filters any trusted region once after year and sport scope', () => {
  const scoped = geo.scopeRegionActivities(activities, {
    year: '2026',
    sport: 'Run',
  });
  assert.equal(scoped.length, 2);
  assert.deepEqual(
    scoped
      .filter((a) =>
        geo.matchesActivityRegion(a, {
          source: 'route',
          level: 'city',
          regionId: 'CHN:city:110000',
        })
      )
      .map((a) => a.run_id),
    [201]
  );
  const route = geo.aggregateActivityRegions(activities, 'route', 'city', {
    year: '2026',
    sport: 'Run',
  });
  assert.equal(
    route.rows.find((r) => r.id === 'CHN:city:440300').distanceM,
    12000
  );
  assert.equal(
    route.rows.find((r) => r.id === 'CHN:city:110000').distanceM,
    8000
  );
  assert.equal(route.coveredActivities, 1);
  const provider = geo.aggregateActivityRegions(scoped, 'provider', 'city');
  assert.equal(provider.rows.length, 1);
  assert.equal(provider.rows[0].distanceM, 22100);
  assert.equal(provider.rows[0].activityCount, 2);
});
test('stale, indoor and unknown CRS never add route regions', () => {
  for (const status of ['stale', 'indoor', 'unknown_crs']) {
    const a = structuredClone(activities[0]);
    a.geography.status = status;
    assert.deepEqual(geo.activityRegions(a, 'route', 'province'), []);
  }
  assert.equal(geo.defaultGeographySource(activities), 'route');
  assert.equal(geo.defaultGeographySource(activities.slice(1)), 'provider');
});

test('child allocation cannot exceed its trusted parent and homonyms have distinct labels', () => {
  const activity = structuredClone(activities[0]);
  activity.geography.regions.find(
    (r) => r.id === 'CHN:province:110000'
  ).distanceM = 5000;
  activity.geography.regions.find(
    (r) => r.id === 'CHN:province:440000'
  ).distanceM = 15000;
  assert.equal(geo.readActivityGeography(activity.geography), null);
  assert.notEqual(
    geo.regionLabel({ name: '同名市', parentId: 'CHN:province:440000' }),
    geo.regionLabel({ name: '同名市', parentId: 'CHN:province:110000' })
  );
});
