import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer, preview } from 'vite';
import { test } from 'node:test';
import { tsModule } from './ts-loader.mjs';

const { isRunReviewEligible } = await import(
  tsModule(new URL('../src/core/runReviewEligibility.ts', import.meta.url))
);
const { projectRunReviewEvidence, runReviewEvidence } = await import(
  tsModule(new URL('../plugins/runReviewEvidence.ts', import.meta.url))
);

const activity = {
  run_id: 42,
  type: 'Run',
  distance: 4200,
  moving_time: '0:22:00',
  summary_polyline: 'synthetic-route',
  start_date_local: '2026-01-01 08:04:05',
  average_heartrate: 140,
};

function splitsFrom(pairs) {
  let cumulativeDistance = 0;
  let cumulativeSeconds = 0;
  return pairs.map(([distance, seconds, partial = false]) => {
    cumulativeDistance += distance;
    cumulativeSeconds += seconds;
    return {
      distance_m: distance,
      moving_seconds: seconds,
      cumulative_distance_m: cumulativeDistance,
      cumulative_moving_seconds: cumulativeSeconds,
      partial,
      gps: ['synthetic private field'],
    };
  });
}

const detail = {
  schema_version: 1,
  run_id: 42,
  distance_m: 4200,
  moving_seconds: 1320,
  splits: splitsFrom([
    [1000, 300],
    [1000, 300],
    [1000, 330],
    [1000, 330],
    [200, 60, true],
  ]),
  device: 'synthetic-device',
  samples: [{ heart_rate_bpm: 140 }],
  start_time_unix: 12345678,
};

test('eligibility uses positive running data and rejects unsafe or unusable ID and metrics', () => {
  assert.equal(isRunReviewEligible(activity), true);
  assert.equal(
    isRunReviewEligible({ ...activity, moving_time: '1 day, 0:01:00' }),
    true
  );
  for (const change of [
    { run_id: 0 },
    { run_id: Number.MAX_SAFE_INTEGER + 1 },
    { run_id: '42' },
    { type: 'Walk' },
    { distance: 0 },
    { distance: Infinity },
    { moving_time: '0:00:00' },
    { moving_time: '0:80:01' },
    { moving_time: '10000000000000000:00:00' },
  ]) {
    const candidate = { ...activity, ...change };
    assert.equal(isRunReviewEligible(candidate), false);
    assert.equal(projectRunReviewEvidence(candidate, detail), null);
  }
});

test('projects an exact schema including an optional short tail with no private field carryover', () => {
  assert.deepEqual(projectRunReviewEvidence(activity, detail), {
    schemaVersion: 1,
    runId: 42,
    distanceMeters: 4200,
    movingSeconds: 1320,
    splits: [
      { distanceMeters: 1000, movingSeconds: 300, partial: false },
      { distanceMeters: 1000, movingSeconds: 300, partial: false },
      { distanceMeters: 1000, movingSeconds: 330, partial: false },
      { distanceMeters: 1000, movingSeconds: 330, partial: false },
      { distanceMeters: 200, movingSeconds: 60, partial: true },
    ],
  });
});

test('prefers a valid matching detail and falls back to basic data for absent or invalid identity', () => {
  const source = { ...activity, distance: 4250, moving_time: '0:22:05' };
  const basic = {
    schemaVersion: 1,
    runId: 42,
    distanceMeters: 4250,
    movingSeconds: 1325,
    splits: [],
  };
  assert.equal(projectRunReviewEvidence(source, detail).movingSeconds, 1320);
  for (const input of [
    null,
    { ...detail, run_id: 43 },
    { ...detail, schema_version: 2 },
    { ...detail, moving_seconds: 0 },
  ]) {
    assert.deepEqual(projectRunReviewEvidence(source, input), basic);
  }
});

test('accepts documented whole-run rounding tolerance but excludes mismatches', () => {
  const toleranceDetail = {
    ...detail,
    distance_m: 4210,
    moving_seconds: 1322,
  };
  assert.equal(
    projectRunReviewEvidence(activity, toleranceDetail).splits.length,
    detail.splits.length
  );
  for (const change of [{ distance_m: 4210.01 }, { moving_seconds: 1323 }]) {
    assert.deepEqual(
      projectRunReviewEvidence(activity, { ...toleranceDetail, ...change })
        .splits,
      []
    );
  }
});

test('invalid cumulative measures, malformed full splits and non-terminal partials use basic evidence', () => {
  const invalidSplits = [
    [
      { ...detail.splits[0], cumulative_distance_m: 999 },
      ...detail.splits.slice(1),
    ],
    [
      { ...detail.splits[0], cumulative_moving_seconds: 301 },
      ...detail.splits.slice(1),
    ],
    splitsFrom([
      [1000, 300],
      [994, 300],
      [1000, 330],
      [1000, 330],
      [206, 60, true],
    ]),
    splitsFrom([
      [1000, 300, true],
      [1000, 300],
      [1000, 330],
      [1000, 330],
      [200, 60, true],
    ]),
    splitsFrom([
      [1000, 0],
      [1000, 600],
      [1000, 330],
      [1000, 330],
      [200, 60, true],
    ]),
    [null],
    new Array(201).fill(detail.splits[0]),
  ];
  for (const splits of invalidSplits) {
    assert.deepEqual(
      projectRunReviewEvidence(activity, { ...detail, splits }).splits,
      []
    );
  }
});

test('Vercel forwards the review route and keeps reserved paths outside SPA fallback', () => {
  const { rewrites } = JSON.parse(
    readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  );
  const api = rewrites.find(({ destination }) =>
    destination.endsWith('/api/v1/runs/:runId/review')
  );
  assert.equal(api?.source, '/api/v1/runs/:runId([1-9][0-9]{0,15})/review');
  const fallback = rewrites.find(({ destination }) => destination === '/');
  assert.ok(fallback.source.startsWith('/:spa('));
  const fallbackPattern = new RegExp('^/' + fallback.source.slice(6, -1) + '$');
  for (const route of ['/summary', '/activity/42']) {
    assert.match(route, fallbackPattern);
  }
  for (const route of [
    '/run-review-evidence',
    '/run-review-evidence/9999.json',
    '/api/v1/runs/abc/review',
    '/api/visitor-city',
    '/assets/missing.js',
  ]) {
    assert.doesNotMatch(route, fallbackPattern);
  }
});

test('builds only evidence JSON and returns true 404 in dev and preview under either site base', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'run-review-fixtures-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src/static'), { recursive: true });
  await mkdir(path.join(root, 'public/activity-details'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<h1>Synthetic site</h1>');
  await writeFile(
    path.join(root, 'src/static/activities.json'),
    JSON.stringify([
      activity,
      { ...activity, run_id: 43 },
      { ...activity, run_id: 44, type: 'Walk' },
    ])
  );
  await writeFile(
    path.join(root, 'public/activity-details/42.json'),
    JSON.stringify(detail)
  );

  for (const base of ['/', '/watson-running/']) {
    const config = {
      root,
      base,
      configFile: false,
      logLevel: 'silent',
      plugins: [runReviewEvidence()],
    };
    await build(config);
    const published = path.join(root, 'dist/run-review-evidence');
    assert.deepEqual((await readdir(published)).sort(), ['42.json', '43.json']);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(published, '42.json'), 'utf8')),
      projectRunReviewEvidence(activity, detail)
    );
    assert.deepEqual(
      JSON.parse(await readFile(path.join(published, '43.json'), 'utf8'))
        .splits,
      []
    );

    const startConfig = { ...config, plugins: [runReviewEvidence()] };
    const dev = await createServer({
      ...startConfig,
      server: { host: '127.0.0.1', port: 0, ws: false },
    });
    try {
      await dev.listen();
      await assertEvidenceServing(dev, base);
    } finally {
      await dev.close();
    }

    const previewServer = await preview({
      ...startConfig,
      plugins: [runReviewEvidence()],
      preview: { host: '127.0.0.1', port: 0 },
    });
    try {
      await assertEvidenceServing(previewServer, base);
    } finally {
      await previewServer.close();
    }
  }
});

async function assertEvidenceServing(server, base) {
  const { port } = server.httpServer.address();
  const local = `http://127.0.0.1:${port}${base}`;
  const headers = { Accept: 'text/html' };
  const existing = await fetch(`${local}run-review-evidence/42.json`, {
    headers,
  });
  assert.equal(existing.status, 200);
  assert.match(existing.headers.get('content-type'), /^application\/json\b/);
  assert.equal((await existing.json()).runId, 42);
  const missing = await fetch(`${local}run-review-evidence/456.json`, {
    headers,
  });
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), '');
  const page = await fetch(`${local}summary`, { headers });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Synthetic site/);
}
