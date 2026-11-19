import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const token = 'a'.repeat(48);
const statsPath = '/api/v1/training/stats';

test('Classic private assistant queries training stats and still sends general chat', async (t) => {
  process.env.VITE_RUN_AGENT_PRIVATE_CHAT = 'true';
  process.env.VITE_RUN_AGENT_PRIVATE_TRAINING = 'true';

  const vite = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  t.after(() => vite.close());
  await vite.listen();
  const address = vite.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());

  for (const [surface, width, height] of [
    ['desktop', 1280, 800],
    ['mobile', 390, 844],
  ]) {
    await t.test(surface, async () => {
      const page = await browser.newPage({
        viewport: { width, height },
        timezoneId: 'Asia/Shanghai',
      });
      try {
        page.setDefaultTimeout(10_000);
        await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+08:00'));
        const requests = [];
        const scriptErrors = [];
        page.on('pageerror', (error) => scriptErrors.push(error.message));

        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (
            url.pathname === '/src/static/activities.json' &&
            route.request().resourceType() === 'fetch'
          ) {
            return route.fulfill({ json: [] });
          }
          if (!url.pathname.startsWith('/api/')) return route.continue();
          const body = route.request().postDataJSON();
          requests.push({
            path: url.pathname,
            method: route.request().method(),
            token: route.request().headers().authorization,
            body,
          });
          const headers = { 'Cache-Control': 'no-store' };
          if (url.pathname === '/api/v1/chat') {
            return route.fulfill({
              headers,
              json: { requestId: 'synthetic-chat', content: '合成跑步建议' },
            });
          }
          assert.equal(url.pathname, statsPath);
          if (requests.length === 1) {
            return route.fulfill({
              status: 503,
              headers,
              json: {
                requestId: 'synthetic-unavailable',
                code: 'TRAINING_DATA_UNAVAILABLE',
                message: 'internal test diagnostic',
              },
            });
          }
          const metadata = {
            requestId: 'synthetic-training',
            dataThrough: '2026-11-18',
          };
          if (body.kind === 'PERSONAL_BEST') {
            return route.fulfill({
              headers,
              json: {
                ...body,
                ...metadata,
                approximate: true,
                result: {
                  date: '2026-11-15',
                  activityDistanceKm: 10.1,
                  durationSeconds: 3030,
                  averagePaceSecondsPerKm: 300,
                },
              },
            });
          }
          const empty = body.startDate === '2026-01-01';
          return route.fulfill({
            headers,
            json: {
              ...body,
              ...metadata,
              runCount: empty ? 0 : 2,
              totalDistanceKm: empty ? 0 : 12.5,
              totalDurationSeconds: empty ? 0 : 4500,
              averagePaceSecondsPerKm: empty ? null : 360,
            },
          });
        });

        await page.goto(origin);
        assert.equal(new URL(page.url()).origin, origin);
        assert.match(await page.title(), /Watson|Running/i);
        const launcher = page.getByRole('button', { name: 'AI 跑步助手' });
        await launcher.click();
        const dialog = page.getByRole('dialog', { name: 'AI 跑步助手' });
        const accessToken = dialog.getByLabel('访问令牌');
        await dialog.getByRole('button', { name: '我的训练' }).click();
        const summary = dialog.getByRole('button', { name: '查询汇总' });
        assert.equal(await summary.isDisabled(), true);
        assert.equal(requests.length, 0);
        await accessToken.fill(token);
        const startDate = dialog.getByLabel('开始日期');
        const endDate = dialog.getByLabel('结束日期');
        assert.equal(await startDate.inputValue(), '2026-11-13');
        assert.equal(await endDate.inputValue(), '2026-11-19');

        await dialog.getByRole('button', { name: '最近 30 天' }).click();
        assert.equal(await startDate.inputValue(), '2026-10-21');
        await summary.click();
        const failure = dialog.getByRole('alert');
        await failure
          .getByText('暂时无法读取训练数据', { exact: false })
          .waitFor();
        assert.doesNotMatch(
          await failure.innerText(),
          /internal test diagnostic/
        );
        assert.match(await failure.innerText(), /synthetic-unavailable/);
        assert.equal(requests.length, 1);
        await failure.getByRole('button', { name: '重试查询' }).click();

        const result = dialog.getByRole('region', { name: '训练统计结果' });
        await result.getByText('12.5 km', { exact: true }).waitFor();
        assert.match(await result.innerText(), /数据截至 2026-11-18/);
        assert.deepEqual(requests[0], {
          path: statsPath,
          method: 'POST',
          token: `Bearer ${token}`,
          body: {
            kind: 'SUMMARY',
            startDate: '2026-10-21',
            endDate: '2026-11-19',
          },
        });
        assert.deepEqual(requests[1], requests[0]);

        await startDate.fill('2026-01-01');
        await endDate.fill('2026-01-03');
        await summary.click();
        await result.getByText('该日期范围没有跑步记录').waitFor();
        assert.deepEqual(requests[2].body, {
          kind: 'SUMMARY',
          startDate: '2026-01-01',
          endDate: '2026-01-03',
        });

        await dialog.getByLabel('PB 距离').selectOption('TEN_K');
        await dialog.getByRole('button', { name: '查询 PB' }).click();
        await result.getByText('估算个人最佳', { exact: true }).waitFor();
        assert.match(await result.innerText(), /2026-11-15/);
        assert.match(await result.innerText(), /10.1 km/);
        await page.waitForFunction(() => {
          const result = document.querySelector('[aria-label="训练统计结果"]');
          return result?.getBoundingClientRect().bottom <= window.innerHeight;
        });
        assert.deepEqual(requests[3].body, {
          kind: 'PERSONAL_BEST',
          distanceType: 'TEN_K',
        });
        assert.equal(requests[3].token, `Bearer ${token}`);
        assert.equal(
          await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
          true
        );
        assert.doesNotMatch(await dialog.innerText(), new RegExp(token));
        const storage = await page.context().storageState();
        assert.doesNotMatch(JSON.stringify(storage), new RegExp(token));
        assert.equal(await page.locator('vite-error-overlay').count(), 0);
        assert.deepEqual(scriptErrors, []);

        const evidence = process.env.RUNAGENT_BROWSER_SCREENSHOT_DIR;
        if (evidence) {
          await mkdir(evidence, { recursive: true });
          await page.screenshot({
            path: join(evidence, `training-${surface}.png`),
          });
        }

        await dialog.getByRole('button', { name: '通用问答' }).click();
        await dialog.getByLabel('你的问题').fill('合成问题');
        await dialog.getByRole('button', { name: /^发送/ }).click();
        await dialog.getByText('合成跑步建议', { exact: true }).waitFor();
        assert.deepEqual(requests[4], {
          path: '/api/v1/chat',
          method: 'POST',
          token: `Bearer ${token}`,
          body: { message: '合成问题' },
        });

        await dialog.getByRole('button', { name: '我的训练' }).click();
        assert.equal(await result.isVisible(), false);
        assert.equal(await accessToken.inputValue(), token);
      } finally {
        await page.close();
      }
    });
  }
});
