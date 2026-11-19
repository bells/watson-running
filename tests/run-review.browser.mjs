import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const token = 'a'.repeat(48);
const latestId = 1002;
const earlierId = 1001;
const dateFor = (day) => `2026-11-${day} 10:00:00`;
const activities = [
  [latestId, '19', '合成分段训练', true],
  [earlierId, '18', '合成基础训练', false],
].map(([run_id, day, name, detail_available]) => ({
  run_id,
  name,
  detail_available,
  distance: 4000,
  moving_time: '0:21:00',
  type: 'Run',
  start_date: dateFor(day),
  start_date_local: dateFor(day),
  location_country: null,
  summary_polyline: null,
  average_heartrate: null,
  average_speed: 3.17,
  elevation_gain: null,
  streak: 1,
  week_streak: 1,
}));
const detail = {
  schema_version: 1,
  run_id: latestId,
  source: null,
  heart_rate_source: null,
  start_time_unix: 1795053600,
  distance_m: 4000,
  moving_seconds: 1260,
  elapsed_seconds: 1260,
  calories_kcal: null,
  total_steps: null,
  sample_interval_seconds: 0,
  average_cadence_spm: null,
  average_stride_m: null,
  min_heart_rate_bpm: null,
  max_heart_rate_bpm: null,
  average_heart_rate_bpm: null,
  min_altitude_m: null,
  max_altitude_m: null,
  splits: [300, 300, 330, 330].map((seconds, i, all) => ({
    distance_m: 1000,
    moving_seconds: seconds,
    cumulative_distance_m: (i + 1) * 1000,
    cumulative_moving_seconds: all
      .slice(0, i + 1)
      .reduce((sum, value) => sum + value, 0),
    partial: false,
  })),
  samples: [],
};
const completedReport = (runId) => ({
  status: 'READY',
  requestId: 'test-ready',
  report: {
    schemaVersion: 1,
    runId,
    generatedAt: '2026-11-19T08:00:00Z',
    mode: runId === latestId ? 'SPLIT_COMPARISON' : 'SUMMARY',
    facts: {
      distanceMeters: 4000,
      movingSeconds: 1260,
      averagePaceSecondsPerKm: 315,
      ...(runId === latestId && {
        firstHalfPaceSecondsPerKm: 300,
        secondHalfPaceSecondsPerKm: 330,
        paceDeltaSecondsPerKm: 30,
        estimated: false,
      }),
    },
    observations: ['合成节奏观察'],
    improvement: '合成改进重点',
    nextRun: '合成训练建议',
  },
});

test('Classic review discovers both records, requires consentful generation and reopens the report', async (t) => {
  process.env.VITE_RUN_AGENT_PRIVATE_CHAT = 'true';
  process.env.VITE_RUN_AGENT_RUN_REVIEW = 'true';
  const vite = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  t.after(() => vite.close());
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const browser = await chromium.launch();
  t.after(() => browser.close());

  for (const [name, width, height] of [
    ['desktop', 1280, 900],
    ['mobile', 390, 844],
  ]) {
    await t.test(name, async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        page.setDefaultTimeout(5000);
        const requests = [];
        const errors = [];
        let posts = 0;
        let ready = false;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (
            url.pathname === '/src/static/activities.json' &&
            route.request().resourceType() === 'fetch'
          )
            return route.fulfill({ json: activities });
          if (url.pathname === '/activity-details/1002.json')
            return route.fulfill({ json: detail });
          if (url.pathname === '/activity-details/1001.json')
            return route.fulfill({ status: 404 });
          if (!url.pathname.startsWith('/api/')) return route.continue();
          const request = route.request();
          const match = /^\/api\/v1\/runs\/(\d+)\/review$/.exec(url.pathname);
          assert.ok(match);
          const runId = Number(match[1]);
          assert.equal(request.headers().authorization, 'Bearer ' + token);
          assert.equal(request.postData(), null);
          requests.push([request.method(), runId]);
          if (runId === earlierId && request.method() === 'GET') {
            return route.fulfill({
              status: 404,
              json: {
                requestId: 'test-disabled',
                code: 'REVIEW_NOT_FOUND',
                generationEnabled: false,
              },
            });
          }
          if (request.method() === 'POST') {
            posts += 1;
            if (posts === 1)
              return route.fulfill({
                status: 503,
                json: {
                  requestId: 'test-failed',
                  code: 'REVIEW_GENERATION_FAILED',
                  message: 'private diagnostic',
                },
              });
            ready = true;
            return route.fulfill({
              status: 202,
              json: { status: 'GENERATING', requestId: 'test-in-progress' },
            });
          }
          if (ready) return route.fulfill({ json: completedReport(runId) });
          return route.fulfill({
            status: 404,
            json: {
              requestId: 'test-missing',
              code: 'REVIEW_NOT_FOUND',
              generationEnabled: true,
            },
          });
        });
        await page.goto(origin);
        const latestLink = page.getByRole('link', {
          name: 'AI 跑后复盘',
          exact: true,
        });
        await latestLink.waitFor();
        const launcher = page.getByRole('button', { name: 'AI 跑步助手' });
        await launcher.click();
        const dialog = page.getByRole('dialog', { name: 'AI 跑步助手' });
        await dialog.getByLabel('访问令牌').fill(token);
        await dialog.getByRole('button', { name: '关闭聊天' }).click();
        assert.deepEqual(requests, []);
        await latestLink.click();
        const card = page.getByRole('region', { name: 'AI 跑后复盘' });
        await card.getByRole('button', { name: '生成报告' }).waitFor();
        assert.match(page.url(), /\/activity\/1002#run-review$/);
        assert.equal(
          await card.evaluate((node) => node === document.activeElement),
          true
        );
        assert.deepEqual(requests, [['GET', latestId]]);
        await card.getByRole('button', { name: '生成报告' }).click();
        await card
          .getByRole('alert')
          .getByText('报告生成失败', { exact: false })
          .waitFor();
        assert.doesNotMatch(await card.innerText(), /private diagnostic/);
        await card.getByRole('button', { name: '重试生成' }).click();
        await card.getByText('正在生成报告', { exact: false }).waitFor();
        await card.getByRole('button', { name: '查看报告' }).click();
        await card.getByText('合成训练建议').waitFor();
        assert.match(await card.innerText(), /5′00″\/km/);
        assert.match(await card.innerText(), /5′30″\/km/);
        assert.equal(
          await card.evaluate((node) => node.scrollWidth <= node.clientWidth),
          true
        );
        assert.deepEqual(requests, [
          ['GET', latestId],
          ['POST', latestId],
          ['POST', latestId],
          ['GET', latestId],
        ]);

        await page
          .getByRole('link', { name: '返回跑步记录', exact: false })
          .click();
        const earlierLink = page
          .locator('a[href="/activity/1001"]')
          .filter({ hasText: '详情 · AI 复盘' });
        await earlierLink.filter({ visible: true }).click();
        const basic = page.getByRole('region', { name: '已有运动概览' });
        await basic.getByText('合成基础训练').waitFor();
        await card.getByText('生成暂未开放').waitFor();
        assert.equal(
          (await page.context().storageState()).origins.some((origin) =>
            origin.localStorage.some((entry) => entry.value.includes(token))
          ),
          false
        );
        assert.deepEqual(requests.at(-1), ['GET', earlierId]);
        assert.equal(await page.locator('vite-error-overlay').count(), 0);
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    });
  }
});
