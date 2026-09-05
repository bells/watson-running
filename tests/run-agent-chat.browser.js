// Run in an isolated Playwright CLI session after opening the Classic dev page:
// playwright-cli -s=runagent run-code --filename tests/run-agent-chat.browser.js
// All /api/chat requests below are intercepted; this is not a real backend smoke.
async function verifyChat(page) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const panel = page.getByRole('dialog');
  const input = page.getByRole('textbox', { name: '你的问题' });
  const send = page.getByRole('button', { name: /^发送/ });
  const clear = page.getByRole('button', { name: '清空对话' });
  const launcher = page.getByRole('button', {
    name: 'AI 跑步助手',
    exact: true,
  });
  const region = page.getByRole('region', { name: '对话消息' });
  let calls = 0;
  let mode = 'success';
  let heldRoute;
  let responseText =
    '| 目标 | 频率 |\n| --- | --- |\n| 健康 | 每周三次 |\n\n**建议**\n\n第一段。\n\n第二段。\n\n- 轻松跑\n- 休息\n\n1. 热身\n2. 放松\n\n```text\nrun <safe>\n```\n\n<img src=x onerror=alert(1)>\n\n![tracking](https://invalid.example/track)\n\n[bad](javascript:alert(1))';
  await page.route('**/api/chat', async (route) => {
    calls++;
    const payload = route.request().postDataJSON();
    check(
      Object.keys(payload).join(',') === 'message',
      'payload leaked context'
    );
    check(typeof payload.message === 'string', 'message must be a string');
    if (mode === 'hold') {
      heldRoute = route;
      return;
    }
    if (mode === 'network') {
      await route.abort('connectionfailed');
      return;
    }
    if (mode === 'http') {
      await route.fulfill({ status: 503, body: 'private stack' });
      return;
    }
    if (mode === 'invalid') {
      await route.fulfill({ json: { content: 42 } });
      return;
    }
    await route.fulfill({ json: { content: responseText } });
  });
  try {
    if (await panel.isVisible())
      await page.getByRole('button', { name: '关闭聊天' }).click();
    const switchToDark = page.getByRole('button', {
      name: 'Switch to dark theme',
    });
    if (await switchToDark.count()) await switchToDark.click();
    await launcher.click();
    await clear.click();
    check(
      await input.evaluate((el) => document.activeElement === el),
      'initial focus'
    );
    check(await panel.evaluate((el) => el.matches(':modal')), 'must be modal');
    await input.fill('  \n ');
    await input.press('Enter');
    check((await send.isDisabled()) && calls === 0, 'blank input');
    await page
      .getByRole('button', { name: '一周跑几次比较合适？', exact: true })
      .click();
    check(
      (await input.inputValue()) === '一周跑几次比较合适？',
      'example selection'
    );
    await input.press('Shift+Enter');
    check((await input.inputValue()).includes('\n') && calls === 0, 'newline');
    await input.dispatchEvent('compositionstart');
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      isComposing: true,
      bubbles: true,
    });
    check(calls === 0, 'IME must not submit');
    await input.dispatchEvent('compositionend');
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 229,
      bubbles: true,
    });
    check(calls === 0, 'Safari IME keyCode guard');
    mode = 'hold';
    await input.fill('测试重复发送');
    await input.press('Enter');
    await page.getByRole('status').filter({ hasText: '正在思考…' }).waitFor();
    await input.press('Enter');
    check(await send.isDisabled(), 'pending disables send');
    await page.waitForFunction(
      () => document.querySelector('textarea')?.readOnly
    );
    check(calls === 1, 'duplicate request');
    await clear.click();
    check((await panel.getByRole('article').count()) === 0, 'clear messages');
    check((await input.inputValue()) === '', 'clear draft');
    await heldRoute
      .fulfill({ json: { content: 'STALE_CLEARED_ANSWER' } })
      .catch(() => {});
    await page.waitForTimeout(100);
    check(
      !(await panel.innerText()).includes('STALE_CLEARED_ANSWER'),
      'stale clear response'
    );
    for (const failureMode of ['http', 'network', 'invalid']) {
      mode = failureMode;
      await input.fill('失败后保留问题');
      await input.press('Enter');
      await page.getByRole('alert').waitFor();
      check(
        (await input.inputValue()) === '失败后保留问题',
        'failure draft retention'
      );
      check(
        !(await panel.innerText()).includes('private stack'),
        'unsafe error body'
      );
      const attempts = calls;
      await page.waitForTimeout(100);
      check(calls === attempts, 'automatic retry');
      mode = 'success';
      await page.getByRole('button', { name: /^重试/ }).click();
      await page
        .getByRole('status')
        .filter({ hasText: '回答已就绪' })
        .waitFor();
      check(calls === attempts + 1, 'explicit retry');
      await clear.click();
    }
    mode = 'success';
    await input.fill('验证 Markdown');
    await input.press('Enter');
    await page.getByRole('status').filter({ hasText: '回答已就绪' }).waitFor();
    const answer = panel.getByRole('article', { name: '助手', exact: true });
    check(
      (await answer.locator('table tbody tr').count()) === 1,
      'GFM table rendering'
    );
    check((await answer.locator('strong').count()) === 1, 'bold rendering');
    check(
      (await answer.locator('ul li').count()) === 2 &&
        (await answer.locator('ol li').count()) === 2,
      'list rendering'
    );
    check(
      (await answer.locator('pre code').innerText()) === 'run <safe>\n',
      'code rendering'
    );
    check(
      (await answer.locator('img, script').count()) === 0,
      'unsafe HTML/image'
    );
    check(
      (await answer.locator('a[href^="javascript:"]').count()) === 0,
      'unsafe link'
    );
    await page.screenshot({ path: '/tmp/runagent-desktop-markdown.png' });
    responseText = Array.from(
      { length: 35 },
      (_, i) => `段落 ${i + 1}：循序渐进，充分休息。`
    ).join('\n\n');
    await input.fill('长回答');
    await input.press('Enter');
    await page.getByRole('status').filter({ hasText: '回答已就绪' }).waitFor();
    check(
      await region.evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 48
      ),
      'auto-scroll near bottom'
    );
    mode = 'hold';
    await input.fill('阅读时的新回答');
    await input.press('Enter');
    await page.getByRole('status').filter({ hasText: '正在思考…' }).waitFor();
    await region.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.getByRole('button', { name: '查看最新消息 ↓' }).waitFor();
    await heldRoute.fulfill({ json: { content: '新的回答已到达。' } });
    await page.getByRole('status').filter({ hasText: '回答已就绪' }).waitFor();
    check(
      (await region.evaluate((el) => el.scrollTop)) === 0,
      'reading position preserved'
    );
    await page.getByRole('button', { name: '查看最新消息 ↓' }).click();
    check(
      await region.evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 48
      ),
      'explicit scroll'
    );
    await input.fill('关闭时保留草稿');
    await input.press('Enter');
    await page.getByRole('status').filter({ hasText: '正在思考…' }).waitFor();
    await page.getByRole('button', { name: '关闭聊天' }).click();
    check(
      await launcher.evaluate((el) => document.activeElement === el),
      'restored focus'
    );
    await heldRoute
      .fulfill({ json: { content: 'STALE_CLOSED_ANSWER' } })
      .catch(() => {});
    await launcher.click();
    check(
      (await input.inputValue()) === '关闭时保留草稿',
      'close retains draft'
    );
    check(
      !(await panel.innerText()).includes('STALE_CLOSED_ANSWER'),
      'stale close response'
    );
    await input.press('Escape');
    check(!(await panel.isVisible()), 'Escape close');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await launcher.click();
    await page.setViewportSize({ width: 390, height: 844 });
    check(
      await panel.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      }),
      'panel edges fit viewport with scrollbars'
    );
    check(
      await panel.evaluate(
        (el) => el.clientWidth <= innerWidth && el.clientHeight <= innerHeight
      ),
      'narrow layout fits'
    );
    await page.screenshot({ path: '/tmp/runagent-mobile-light.png' });
    await page.setViewportSize({ width: 320, height: 568 });
    check(
      await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
      'no panel horizontal overflow'
    );
    await clear.focus();
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab');
      check(
        await panel.evaluate((el) => el.contains(document.activeElement)),
        'focus escaped modal'
      );
    }
    await input.press('Escape');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await launcher.click();
    await clear.click();
    await page.screenshot({ path: '/tmp/runagent-mobile-dark.png' });
    check((await panel.getByRole('article').count()) === 0, 'final clear');
    return {
      result: 'PASS',
      mockedRequests: calls,
      coverage:
        'blank/example/newline/IME/duplicates/clear/errors/manual retry/Markdown/scroll/close/focus/light-dark/320-390px',
    };
  } finally {
    await page.unroute('**/api/chat');
  }
}
