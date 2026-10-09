import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activityYear,
  compareActivitiesNewest,
  formatDistanceMeters,
  formatDurationShort,
  formatPaceFromElapsed,
  formatPaceFromSpeed,
  parseMovingSeconds,
  routeDisplayStatus,
  sportDisplayName,
} from '../src/core/activityDisplay.ts';

test('sorts local records across years with a stable ID tie-break', () => {
  const older = { run_id: 1, start_date_local: '2025-12-31 23:59:00' };
  const newer = { run_id: 2, start_date_local: '2026-01-01 00:01:00' };
  const sameTime = { run_id: 3, start_date_local: newer.start_date_local };
  assert.deepEqual([older, newer, sameTime].sort(compareActivitiesNewest), [
    sameTime,
    newer,
    older,
  ]);
  assert.equal(activityYear(older), '2025');
  assert.equal(activityYear(newer), '2026');
  assert.equal(activityYear({ start_date_local: '' }), null);
});

test('keeps missing measurements distinct from zero and handles day durations', () => {
  assert.equal(formatDistanceMeters(null), '—');
  assert.equal(formatDistanceMeters(-1), '—');
  assert.equal(formatDistanceMeters(0), '0.0');
  assert.equal(formatDistanceMeters(6500, 2), '6.50');
  assert.equal(formatPaceFromSpeed(0), '—');
  assert.equal(formatPaceFromSpeed(1000 / 389), '6:29');
  assert.equal(formatPaceFromElapsed(389, 1000), '6′29″');
  assert.equal(parseMovingSeconds('2 days, 01:02:03'), 176523);
  assert.equal(formatDurationShort('2 days, 01:02:03'), '49h 2m');
  assert.equal(formatDurationShort(''), '—');
});

test('labels other sports and missing public routes without inventing data', () => {
  assert.equal(sportDisplayName('Run'), '跑步');
  assert.equal(sportDisplayName('Ride'), '骑行');
  assert.equal(sportDisplayName('Yoga'), 'Yoga');
  assert.equal(sportDisplayName(null), '未分类运动');
  assert.equal(routeDisplayStatus({ summary_polyline: null }), 'missing');
  assert.equal(routeDisplayStatus({ summary_polyline: 'synthetic-route' }), 'available');
});
