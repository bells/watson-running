import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { GET } from '../api/visitor-city.js';

test('visitor-city returns only a localized city and prevents caching', async () => {
  for (const [header, country, expected] of [
    [encodeURIComponent('南京'), 'CN', '南京'],
    ['Guangzhou', 'CN', '广州'],
    ['Guangzhou', undefined, '广州'],
    ['Guangzhou', 'CA', 'Guangzhou'],
    ['Shen-zhen', 'CN', '深圳'],
    ['%E5%8D', 'CN', null],
    ['A%0AB', 'CN', null],
    [undefined, 'CN', null],
  ]) {
    const request = new Request('https://example.com/api/visitor-city', {
      headers: {
        ...(header && { 'x-vercel-ip-city': header }),
        ...(country && { 'x-vercel-ip-country': country }),
      },
    });
    const response = GET(request);
    assert.deepEqual(await response.json(), { city: expected });
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
});

test('public assistant suggests an editable city only when opened', async (t) => {
  process.env.VITE_RUN_AGENT_PUBLIC_API = 'true';
  const vite = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  t.after(() => vite.close());
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());

  for (const scenario of ['detected', 'edited', 'unavailable']) {
    await t.test(scenario, async () => {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      try {
        page.setDefaultTimeout(5_000);
        const cityRequested = Promise.withResolvers();
        const respondWithCity = Promise.withResolvers();
        const chatRequested = Promise.withResolvers();
        let cityRequests = 0;
        let activityRequests = 0;
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/src/static/activities.json' && !url.search) {
            activityRequests += 1;
            return route.fulfill({ json: [] });
          }
          if (url.pathname === '/api/visitor-city') {
            cityRequests += 1;
            cityRequested.resolve();
            return route.fulfill({ json: await respondWithCity.promise });
          }
          if (url.pathname === '/api/v1/chat') {
            chatRequested.resolve(route.request().postDataJSON());
            return route.fulfill({
              json: { requestId: 'synthetic-chat', content: '合成跑步建议' },
            });
          }
          return route.continue();
        });

        await page.goto(origin);
        const launcher = page.getByRole('button', { name: 'AI 跑步助手' });
        await launcher.waitFor();
        assert.equal(activityRequests, 1);
        assert.equal(cityRequests, 0);
        await launcher.click();
        const city = page.getByLabel('出跑城市');
        const cityResponse = page.waitForResponse('**/api/visitor-city');
        await Promise.race([cityRequested.promise, cityResponse]);
        assert.equal(await city.inputValue(), '');
        if (scenario === 'edited') await city.fill('杭州');
        respondWithCity.resolve({
          city: scenario === 'unavailable' ? null : '南京',
        });
        await cityResponse;

        if (scenario === 'detected') {
          await page.waitForFunction(
            () =>
              document.querySelector('input[placeholder="例如上海"]')?.value ===
              '南京'
          );
          await page.getByRole('button', { name: /我在南京/ }).click();
          const request = await chatRequested.promise;
          assert.equal(request.context.city, '南京');
          assert.match(request.message, /南京/);
        } else {
          const expected = scenario === 'edited' ? '杭州' : '';
          await page.getByRole('button', { name: '关闭聊天' }).click();
          await launcher.click();
          assert.equal(await city.inputValue(), expected);
          await city.fill('苏州');
          assert.equal(await city.inputValue(), '苏州');
        }
      } finally {
        await page.close();
      }
    });
  }
  for (const scenario of [
    'device',
    'device-error',
    'coarse-location',
    'manual-during-lookup',
  ]) {
    await t.test(scenario, async () => {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      try {
        page.setDefaultTimeout(5_000);
        await page.context().grantPermissions(['geolocation'], { origin });
        await page.context().setGeolocation({
          latitude: 22.5431,
          longitude: 114.0579,
          accuracy: scenario === 'coarse-location' ? 15_000 : 30,
        });
        const respond = Promise.withResolvers();
        let reverseRequests = 0;
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (
            url.href.startsWith(
              'https://api.bigdatacloud.net/data/reverse-geocode-client?'
            )
          ) {
            reverseRequests += 1;
            return route.fulfill({ json: await respond.promise });
          }
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/api/visitor-city') {
            return route.fulfill({ json: { city: '广州' } });
          }
          if (url.pathname === '/src/static/activities.json' && !url.search) {
            return route.fulfill({ json: [] });
          }
          return route.continue();
        });
        await page.goto(origin);
        await page.getByRole('button', { name: 'AI 跑步助手' }).click();
        const city = page.getByLabel('出跑城市', { exact: true });
        await page.waitForFunction(
          () =>
            document.querySelector('input[placeholder="例如上海"]')?.value ===
            '广州'
        );
        assert.equal(reverseRequests, 0);
        const locate = page.getByRole('button', { name: '使用设备定位' });
        const error = page.getByText('暂时无法确定所在城市，可手动填写。');
        if (scenario === 'coarse-location') {
          await locate.click();
          await error.waitFor();
          assert.equal(await city.inputValue(), '广州');
          assert.equal(reverseRequests, 0);
          return;
        }
        const nextLookup = page.waitForRequest(
          'https://api.bigdatacloud.net/**'
        );
        await locate.click();
        const url = new URL((await nextLookup).url());
        assert.equal(url.searchParams.get('latitude'), '22.54');
        assert.equal(url.searchParams.get('longitude'), '114.06');
        assert.equal(url.searchParams.get('localityLanguage'), 'zh');
        const manual = scenario === 'manual-during-lookup';
        const settled = manual
          ? page.waitForEvent(
              'requestfailed',
              (entry) => entry.url() === url.href
            )
          : page.waitForResponse(url.href);
        if (manual) await city.fill('杭州');
        respond.resolve({
          city: '深圳市',
          countryCode: 'CN',
          lookupSource:
            scenario === 'device-error' ? 'ipGeolocation' : 'reverseGeocoding',
        });
        await settled;
        if (scenario === 'device') {
          await page.getByRole('button', { name: /我在深圳，/ }).waitFor();
          assert.equal(await city.inputValue(), '深圳');
        } else if (scenario === 'device-error') {
          await error.waitFor();
          assert.equal(await city.inputValue(), '广州');
        } else {
          await locate.waitFor();
          assert.equal(await city.inputValue(), '杭州');
        }
      } finally {
        await page.close();
      }
    });
  }
});
