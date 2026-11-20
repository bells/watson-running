import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { tsModule } from './ts-loader.mjs';

const { CHAT_TIMEOUT_MS, requestChat } = await import(
  tsModule(new URL('../src/core/services/runAgentChat.ts', import.meta.url))
);

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const signal = () => new AbortController().signal;
const rejectsKind = (promise, kind) =>
  assert.rejects(promise, (error) => error.kind === kind);

// Stub only the HTTP boundary: these tests never contact a model or local backend.
test('sends only the trimmed question to the same-origin endpoint', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/chat');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { message: '一周跑几次？' });
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    return Response.json({ content: '**每周三次**\n\n循序渐进。' });
  };
  assert.deepEqual(await requestChat({ message: ' 一周跑几次？ ' }, signal()), {
    content: '**每周三次**\n\n循序渐进。',
  });
  assert.equal(CHAT_TIMEOUT_MS, 60_000);
});

test('rejects blank and oversized input without fetch', async () => {
  globalThis.fetch = () => {
    assert.fail('must not send');
  };
  for (const message of [' \n ', 'x'.repeat(4001)]) {
    await rejectsKind(requestChat({ message }, signal()), 'input');
  }
});

test('private chat sends the access token only in the header and validates the v1 response', async () => {
  const token = 'a'.repeat(48);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/chat');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.deepEqual(JSON.parse(options.body), { message: 'test' });
    return Response.json({ content: 'answer', requestId: 'request-1' });
  };
  assert.deepEqual(
    await requestChat({ message: 'test' }, signal(), undefined, token),
    {
      content: 'answer',
      requestId: 'request-1',
    }
  );
  globalThis.fetch = async () => Response.json({ content: 'answer' });
  await rejectsKind(
    requestChat({ message: 'test' }, signal(), undefined, token),
    'invalid'
  );
});

test('rejects non-2xx without exposing the response body or retrying', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('private stack', { status: 500 });
  };
  await assert.rejects(
    requestChat({ message: 'test' }, signal()),
    (error) => error.kind === 'http' && !error.message.includes('private')
  );
  assert.equal(calls, 1);
});

test('validates JSON and content shape', async () => {
  for (const data of [
    null,
    {},
    { content: 12 },
    { content: '' },
    { content: '  ' },
    ['answer'],
  ]) {
    globalThis.fetch = async () => Response.json(data);
    await rejectsKind(requestChat({ message: 'test' }, signal()), 'invalid');
  }
  globalThis.fetch = async () => new Response('not json');
  await rejectsKind(requestChat({ message: 'test' }, signal()), 'invalid');
});

test('maps connection failures to a safe error', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('network internals');
  };
  await rejectsKind(requestChat({ message: 'test' }, signal()), 'network');
});

function waitingFetch(_url, { signal: requestSignal }) {
  return new Promise((_resolve, reject) => {
    if (requestSignal.aborted) return reject(requestSignal.reason);
    requestSignal.addEventListener(
      'abort',
      () => reject(requestSignal.reason),
      { once: true }
    );
  });
}

test('timeout aborts the HTTP request', async () => {
  globalThis.fetch = waitingFetch;
  await rejectsKind(requestChat({ message: 'test' }, signal(), 10), 'timeout');
});

test('timeout covers a stalled response body too', async () => {
  globalThis.fetch = async (url, options) => ({
    ok: true,
    json: () => waitingFetch(url, options),
  });
  await rejectsKind(requestChat({ message: 'test' }, signal(), 10), 'timeout');
});

test('explicit cancellation and already cancelled requests are distinguished', async () => {
  globalThis.fetch = waitingFetch;
  const controller = new AbortController();
  const pending = requestChat({ message: 'test' }, controller.signal);
  controller.abort();
  await rejectsKind(pending, 'cancelled');
  await rejectsKind(
    requestChat({ message: 'test' }, controller.signal),
    'cancelled'
  );
});

test('visitor chat keeps the versioned URL and renders server-provided evidence', async (t) => {
  const context = { city: '上海', runningAt: '2026-11-21T07:00' };
  const evidence = {
    knowledge: { status: 'READY', sources: [{ title: '训练资料' }] },
    weather: {
      status: 'READY',
      city: '上海',
      timezone: 'Asia/Shanghai',
      validAt: '2026-11-21T07:00',
      temperatureC: 18,
    },
  };
  const answer = { requestId: 'chat-public', content: '适度热身。', evidence };
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(answer)
  );
  const message = '早上跑步应该怎么热身？';
  assert.deepEqual(
    await requestChat(
      { message, context },
      signal(),
      undefined,
      undefined,
      true
    ),
    answer
  );
  const [[url, options]] = fetch.mock.calls.map((call) => call.arguments);
  assert.equal(url, '/api/v1/chat');
  assert.equal(new Headers(options.headers).has('authorization'), false);
  assert.deepEqual(JSON.parse(options.body), { message, context });
});
