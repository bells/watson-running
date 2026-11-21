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
          if (url.pathname === '/src/static/activities.json' && !url.search)
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

test('a visitor can use the live site paths for chat, published stats and a listed review without a token', async (t) => {
  process.env.VITE_RUN_AGENT_PRIVATE_CHAT = 'false';
  process.env.VITE_RUN_AGENT_PRIVATE_TRAINING = 'false';
  process.env.VITE_RUN_AGENT_RUN_REVIEW = 'false';
  process.env.VITE_RUN_AGENT_PUBLIC_API = 'true';
  process.env.VITE_RUN_AGENT_PUBLIC_REVIEW_IDS = String(latestId);

  const vite = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  t.after(() => vite.close());
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const browser = await chromium.launch();
  t.after(() => browser.close());

  const knowledge = { status: 'READY', sources: [{ title: '合成训练书' }] };
  const weather = {
    status: 'READY',
    city: '上海',
    timezone: 'Asia/Shanghai',
    validAt: '2026-11-20T19:00',
    temperatureC: 16,
  };
  for (const [surface, width, height] of [
    ['desktop', 1280, 800],
    ['mobile', 390, 844],
  ]) {
    await t.test(surface, async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        page.setDefaultTimeout(10_000);
        const requests = [];
        let generated = false;
        await page.route('**/*', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/src/static/activities.json' && !url.search)
            return route.fulfill({ json: activities });
          if (url.pathname === '/activity-details/' + latestId + '.json')
            return route.fulfill({ json: detail });
          if (url.pathname === '/api/visitor-city')
            return route.fulfill({ json: { city: null } });
          if (!url.pathname.startsWith('/api/')) return route.continue();

          assert.equal(request.headers().authorization, undefined);
          const body = request.postDataJSON();
          const method = request.method();
          requests.push({ path: url.pathname, method, body });
          if (url.pathname === '/api/v1/chat') {
            assert.deepEqual(body.context, { city: '上海' });
            return route.fulfill({
              json: {
                requestId: 'visitor-chat',
                content: '合成跑步建议',
                evidence: { knowledge, weather },
              },
            });
          }
          if (url.pathname === '/api/v1/training/stats') {
            return route.fulfill({
              json: {
                kind: body.kind,
                startDate: body.startDate,
                endDate: body.endDate,
                requestId: 'visitor-stats',
                dataThrough: '2026-11-19',
                runCount: 2,
                totalDistanceKm: 8,
                totalDurationSeconds: 2520,
                averagePaceSecondsPerKm: 315,
                evidence: { knowledge, weather },
                advice: '先轻松跑，再看体感。',
              },
            });
          }

          assert.equal(url.pathname, '/api/v1/runs/' + latestId + '/review');
          if (!generated && method === 'GET') {
            return route.fulfill({
              status: 404,
              json: {
                requestId: 'visitor-not-generated',
                code: 'REVIEW_NOT_FOUND',
                generationEnabled: true,
              },
            });
          }
          generated = true;
          const ready = completedReport(latestId);
          return route.fulfill({
            json: {
              ...ready,
              report: { ...ready.report, knowledge },
              ...(body?.adviceContext && { weather }),
            },
          });
        });

        await page.goto(origin);
        await page.getByRole('button', { name: 'AI 跑步助手' }).click();
        assert.equal(
          await page.getByRole('textbox', { name: '你的问题' }).isEnabled(),
          true
        );
        await page
          .getByRole('button', { name: /我在上海，现在出门跑步/ })
          .click();
        await page.getByText('合成跑步建议').waitFor();
        await page.getByText('《合成训练书》', { exact: true }).waitFor();
        await page.getByText(/上海 · 2026-11-20 19:00/).waitFor();
        assert.equal(
          await page
            .getByRole('link', { name: 'Open-Meteo' })
            .getAttribute('href'),
          'https://open-meteo.com/'
        );
        await page
          .getByRole('button', { name: '训练统计', exact: true })
          .click();
        await page.getByText('附加训练依据', { exact: true }).click();
        await page
          .getByRole('checkbox', { name: '查询时附上相关书籍和天气' })
          .check();
        await page.getByLabel('训练目标').fill('恢复跑');
        await page.getByRole('button', { name: '查询汇总' }).click();
        await page.getByRole('heading', { name: '训练汇总' }).waitFor();
        const stats = page.getByRole('region', { name: '训练统计结果' });
        await stats.getByText('8 km', { exact: true }).waitFor();
        await stats
          .getByText('先轻松跑，再看体感。', { exact: true })
          .waitFor();
        assert.equal(requests[1].body.endDate, '2026-11-19');
        assert.deepEqual(requests[1].body.adviceContext, {
          city: '上海',
          goal: '恢复跑',
        });
        await page.getByRole('button', { name: '关闭聊天' }).click();
        const reviewList = page.getByRole('region', {
          name: '体验 AI 跑后复盘',
        });
        assert.equal(await reviewList.getByRole('link').count(), 1);
        await reviewList.getByRole('link').click();
        await page.getByRole('button', { name: '生成报告' }).click();
        await page.getByRole('button', { name: '查看报告' }).click();
        await page.getByText('《合成训练书》', { exact: true }).waitFor();
        await page.getByLabel('出跑城市').fill('上海');
        await page.getByRole('button', { name: '查看当地天气' }).click();
        await page.getByText(/上海 · 2026-11-20 19:00/).waitFor();
        assert.deepEqual(
          requests.map(({ path, method }) => [path, method]),
          [
            ['/api/v1/chat', 'POST'],
            ['/api/v1/training/stats', 'POST'],
            ['/api/v1/runs/' + latestId + '/review', 'GET'],
            ['/api/v1/runs/' + latestId + '/review', 'POST'],
            ['/api/v1/runs/' + latestId + '/review', 'POST'],
          ]
        );
      } finally {
        await page.close();
      }
    });
  }
});
