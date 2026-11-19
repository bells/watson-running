import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tsModule } from './ts-loader.mjs';

const { requestTrainingStats, recentTrainingRange, isValidTrainingRange } =
  await import(
    tsModule(
      new URL('../src/core/services/runAgentTraining.ts', import.meta.url)
    )
  );

const token = 'a'.repeat(48);
const summaryQuery = {
  kind: 'SUMMARY',
  startDate: '2026-11-01',
  endDate: '2026-11-07',
};
const summary = {
  ...summaryQuery,
  requestId: 'synthetic-summary',
  dataThrough: '2026-11-19',
  runCount: 2,
  totalDistanceKm: 12.5,
  totalDurationSeconds: 4500,
  averagePaceSecondsPerKm: 360,
};
const bestQuery = { kind: 'PERSONAL_BEST', distanceType: 'FIVE_K' };
const best = {
  ...bestQuery,
  requestId: 'synthetic-best',
  dataThrough: '2026-11-19',
  approximate: true,
  result: {
    date: '2026-11-06',
    activityDistanceKm: 5.1,
    durationSeconds: 1530,
    averagePaceSecondsPerKm: 300,
  },
};
const signal = () => new AbortController().signal;

test('summary sends only the requested date range to the authenticated same-origin endpoint', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(summary)
  );
  assert.deepEqual(
    await requestTrainingStats(summaryQuery, token, signal()),
    summary
  );
  const [[url, options]] = fetch.mock.calls.map((call) => call.arguments);
  assert.equal(url, '/api/v1/training/stats');
  assert.equal(options.method, 'POST');
  assert.equal(
    new Headers(options.headers).get('authorization'),
    `Bearer ${token}`
  );
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
  assert.deepEqual(JSON.parse(options.body), summaryQuery);
});

test('mismatched or malformed statistics are rejected before they reach the UI', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const malformed of [
    { ...summary, startDate: '2026-11-02' },
    { ...summary, dataThrough: '2026-02-30' },
    { ...summary, runCount: -1 },
    { ...summary, averagePaceSecondsPerKm: '360' },
  ]) {
    fetch.mock.mockImplementation(async () => Response.json(malformed));
    await assert.rejects(requestTrainingStats(summaryQuery, token, signal()), {
      kind: 'invalidResponse',
    });
  }
});

test('personal best preserves an approximate result and distinguishes no match', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(best)
  );
  assert.deepEqual(
    await requestTrainingStats(bestQuery, token, signal()),
    best
  );
  const empty = { ...best, dataThrough: null, result: null };
  fetch.mock.mockImplementation(async () => Response.json(empty));
  assert.deepEqual(
    await requestTrainingStats(bestQuery, token, signal()),
    empty
  );
  fetch.mock.mockImplementation(async () =>
    Response.json({ ...best, approximate: false })
  );
  await assert.rejects(requestTrainingStats(bestQuery, token, signal()), {
    kind: 'invalidResponse',
  });
});

test('summary accepts an empty date range result with unknown freshness', async (t) => {
  const empty = {
    ...summary,
    dataThrough: null,
    runCount: 0,
    totalDistanceKm: 0,
    totalDurationSeconds: 0,
    averagePaceSecondsPerKm: null,
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json(empty));
  assert.deepEqual(
    await requestTrainingStats(summaryQuery, token, signal()),
    empty
  );
});

test('invalid range or token stops the request before making any fetch', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  await assert.rejects(
    requestTrainingStats(
      { ...summaryQuery, endDate: '2026-02-29' },
      token,
      signal()
    ),
    { kind: 'invalidRequest' }
  );
  await assert.rejects(
    requestTrainingStats(summaryQuery, 'invalid', signal()),
    { kind: 'unauthorized' }
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test('returns safe failures and correlates a valid request ID without retrying', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const [status, kind] of [
    [400, 'invalidRequest'],
    [401, 'unauthorized'],
    [429, 'rateLimited'],
    [503, 'unavailable'],
    [502, 'http'],
  ]) {
    fetch.mock.mockImplementation(async () =>
      Response.json(
        { requestId: 'synthetic-failure', message: 'internal provider detail' },
        { status }
      )
    );
    await assert.rejects(
      requestTrainingStats(summaryQuery, token, signal()),
      (error) => {
        assert.equal(error.kind, kind);
        assert.equal(error.requestId, 'synthetic-failure');
        assert.doesNotMatch(error.message, /internal provider detail/);
        return true;
      }
    );
  }
  assert.equal(fetch.mock.callCount(), 5);
});

test('time limit covers a stalled response body and cancellation is distinct', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => ({
    ok: true,
    json: () =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
  }));
  await assert.rejects(
    requestTrainingStats(summaryQuery, token, signal(), 15),
    {
      kind: 'timeout',
    }
  );
  const controller = new AbortController();
  const result = requestTrainingStats(summaryQuery, token, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(result, { kind: 'cancelled' });
});

test('calendar presets are inclusive in local time and the range caps at 366 days', () => {
  const date = new Date(2026, 2, 8, 23, 30);
  assert.deepEqual(recentTrainingRange(7, date), {
    startDate: '2026-03-02',
    endDate: '2026-03-08',
  });
  assert.deepEqual(recentTrainingRange(30, date), {
    startDate: '2026-02-07',
    endDate: '2026-03-08',
  });
  assert.equal(isValidTrainingRange('2024-01-01', '2024-12-31'), true);
  assert.equal(isValidTrainingRange('2024-01-01', '2025-01-01'), false);
  assert.equal(isValidTrainingRange('2024-03-01', '2024-02-29'), false);
  assert.equal(isValidTrainingRange('2024-02-29', '2024-02-29'), true);
});
