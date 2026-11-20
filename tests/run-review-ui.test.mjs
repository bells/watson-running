import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tsModule } from './ts-loader.mjs';

const { requestRunReview } = await import(
  tsModule(new URL('../src/core/services/runAgentReview.ts', import.meta.url))
);

const id = 1001;
const token = 'a'.repeat(48);
const signal = () => new AbortController().signal;
const report = {
  schemaVersion: 1,
  runId: id,
  generatedAt: '2026-11-19T08:00:00Z',
  mode: 'SPLIT_COMPARISON',
  facts: {
    distanceMeters: 4000,
    movingSeconds: 1260,
    averagePaceSecondsPerKm: 315,
    firstHalfPaceSecondsPerKm: 300,
    secondHalfPaceSecondsPerKm: 330,
    paceDeltaSecondsPerKm: 30,
    estimated: false,
  },
  observations: ['前半每公里 5 分，后半每公里 5 分 30 秒。'],
  improvement: '下次观察起跑节奏。',
  nextRun: '用更轻松的起跑节奏完成前半程。',
};
const ready = { status: 'READY', requestId: 'review-ready', report };

test('reading and explicit generation use the same-origin activity URL and send no run data in the body', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(ready)
  );
  for (const method of ['GET', 'POST']) {
    assert.deepEqual(
      await requestRunReview(id, method, token, signal()),
      ready
    );
  }
  for (const [index, call] of fetch.mock.calls.entries()) {
    const [url, options] = call.arguments;
    assert.equal(url, '/api/v1/runs/1001/review');
    assert.equal(options.method, index ? 'POST' : 'GET');
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    assert.equal(options.body, undefined);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
  }
});

test('missing, in-progress, failure and generation disabled have separate branches', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  const candidates = [
    [404, { code: 'REVIEW_NOT_FOUND' }, 'MISSING'],
    [404, { code: 'REVIEW_NOT_FOUND', generationEnabled: false }, 'DISABLED'],
    [202, { status: 'GENERATING' }, 'GENERATING'],
    [200, { status: 'FAILED', code: 'REVIEW_GENERATION_FAILED' }, 'FAILED'],
    [503, { code: 'REVIEW_GENERATION_FAILED' }, 'FAILED'],
    [503, { code: 'REVIEW_GENERATION_DISABLED' }, 'DISABLED'],
  ];
  for (const [status, data, expected] of candidates) {
    fetch.mock.mockImplementation(async () =>
      Response.json({ ...data, requestId: 'review-test' }, { status })
    );
    assert.equal(
      (await requestRunReview(id, 'GET', token, signal())).status,
      expected
    );
  }
});

test('review with mismatched activity ID or malformed facts never reaches the view', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const altered of [
    { ...report, runId: 1002 },
    { ...report, generatedAt: 'yesterday' },
    { ...report, facts: { ...report.facts, paceDeltaSecondsPerKm: '30' } },
    { ...report, observations: [''] },
  ]) {
    fetch.mock.mockImplementation(async () =>
      Response.json({ ...ready, report: altered })
    );
    await assert.rejects(requestRunReview(id, 'GET', token, signal()), {
      kind: 'invalidResponse',
    });
  }
});

test('invalid input stops before sending a request, and bad credentials never expose server messages', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { requestId: 'review-denied', message: 'provider secret' },
      { status: 401 }
    )
  );
  await assert.rejects(requestRunReview(id, 'GET', '', signal()), {
    kind: 'unauthorized',
  });
  await assert.rejects(requestRunReview(-1, 'GET', token, signal()), {
    kind: 'invalidRequest',
  });
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(
    requestRunReview(id, 'POST', token, signal()),
    (error) => {
      assert.equal(error.kind, 'unauthorized');
      assert.equal(error.requestId, 'review-denied');
      assert.doesNotMatch(error.message, /provider secret/);
      return true;
    }
  );
});

test('list/report navigation can abort an active GET', async (t) => {
  const controller = new AbortController();
  t.mock.method(
    globalThis,
    'fetch',
    async (_url, { signal: requestSignal }) =>
      new Promise((_resolve, reject) =>
        requestSignal.addEventListener(
          'abort',
          () => reject(requestSignal.reason),
          { once: true }
        )
      )
  );
  const response = requestRunReview(id, 'GET', token, controller.signal);
  controller.abort();
  await assert.rejects(response, { kind: 'cancelled' });
});

test('visitor can load a public review and request weather without persisting its location', async (t) => {
  const knowledge = { status: 'READY', sources: [{ title: '训练资料' }] };
  const weather = { status: 'READY', city: '上海', temperatureC: 18 };
  const adviceContext = { city: '上海', runningAt: '2026-11-21T07:00' };
  const saved = { ...ready, report: { ...report, knowledge } };
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) =>
    Response.json(options.method === 'POST' ? { ...saved, weather } : saved)
  );
  assert.deepEqual(
    await requestRunReview(id, 'GET', undefined, signal()),
    saved
  );
  assert.deepEqual(
    await requestRunReview(
      id,
      'POST',
      undefined,
      signal(),
      undefined,
      adviceContext
    ),
    { ...saved, weather }
  );
  for (const [index, call] of fetch.mock.calls.entries()) {
    const [url, options] = call.arguments;
    assert.equal(url, '/api/v1/runs/1001/review');
    assert.equal(new Headers(options.headers).has('authorization'), false);
    if (index) assert.deepEqual(JSON.parse(options.body), { adviceContext });
    else assert.equal(options.body, undefined);
  }
});
