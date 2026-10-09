import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(
  readFileSync(
    new URL('../src/core/activitySummary.ts', import.meta.url),
    'utf8'
  )
).replace(
  "'./activityDisplay'",
  JSON.stringify(
    new URL('../src/core/activityDisplay.ts', import.meta.url).href
  )
);
const { activityPeriod, groupActivityPeriods, summarizeActivities } =
  await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
const run = (run_id, date, distance, time, type = 'Run', heart = null) => ({
  run_id,
  start_date_local: date,
  distance,
  moving_time: time,
  type,
  average_heartrate: heart,
});
const records = [
  run(1, '2025-12-31 23:59:00', 1000, '0:05:00'),
  run(2, '2026-01-01 00:01:00', 2000, '0:15:00', 'Walk', 120),
  run(3, '2026-01-05 10:00:00', 0, '0:00:00', 'Workout'),
];
test('weeks keep their Monday across a calendar year without timezone shifts', () => {
  assert.equal(activityPeriod('2026-01-01 00:01:00', 'week'), '2025-12-29');
  assert.equal(activityPeriod('2026-01-05 00:01:00', 'week'), '2026-01-05');
  assert.equal(activityPeriod('2026-02-30 00:00:00', 'month'), null);
  const grouped = groupActivityPeriods(records, 'week');
  assert.equal(grouped.length, 2);
  assert.equal(grouped[1].summary.activities.length, 2);
  assert.equal(groupActivityPeriods(records, 'year').length, 2);
  assert.equal(groupActivityPeriods(records, 'month').length, 2);
});
test('totals preserve metres and seconds; pace is weighted over eligible records', () => {
  const total = summarizeActivities(records);
  assert.equal(total.distanceMeters, 3000);
  assert.equal(total.movingSeconds, 1200);
  assert.equal(total.paceSpeed, 2.5);
  assert.equal(total.averageHeartRate, 120);
  assert.deepEqual(
    total.activities.map((r) => r.run_id),
    [3, 2, 1]
  );
  const runs = summarizeActivities(records.filter((r) => r.type === 'Run'));
  assert.equal(runs.distanceMeters, 1000);
  assert.equal(runs.paceSpeed, 1000 / 300);
});
test('empty and missing data remain distinct from recorded zero', () => {
  assert.equal(summarizeActivities([]).distanceMeters, null);
  assert.equal(summarizeActivities([]).movingSeconds, null);
  const zero = summarizeActivities([records[2]]);
  assert.equal(zero.distanceMeters, 0);
  assert.equal(zero.movingSeconds, 0);
  assert.equal(zero.paceSpeed, null);
  const missing = summarizeActivities([
    run(4, '2026-01-01 00:00:00', 1000, ''),
  ]);
  assert.equal(missing.movingSeconds, null);
  assert.equal(missing.missingDurations, 1);
  assert.equal(missing.paceSpeed, null);
  assert.equal(missing.averageHeartRate, null);
});
