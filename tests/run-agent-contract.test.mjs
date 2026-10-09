import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Reuse the JSON Schema validator shipped with the existing development lint tool.
const require = createRequire(import.meta.url);
const Ajv = createRequire(require.resolve('eslint'))('ajv');
const ajv = new Ajv({ allErrors: true });
const root = new URL('../docs/contracts/runagent-v1/', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const validators = Object.fromEntries(
  [
    'chat-request',
    'chat-response',
    'agent-request',
    'agent-response',
    'error',
    'stream-event',
  ].map((name) => [name, ajv.compile(json(`${name}.schema.json`))])
);

function parseFixture(name) {
  const source = readFileSync(new URL(`fixtures/${name}.sse`, root), 'utf8');
  assert.ok(source.endsWith('\n\n'), 'final SSE event needs a blank line');
  return source
    .trim()
    .split(/\n\n/)
    .map((block) => {
      const fields = Object.fromEntries(
        block.split('\n').map((line) => {
          const colon = line.indexOf(':');
          return [line.slice(0, colon), line.slice(colon + 1).trim()];
        })
      );
      const value = JSON.parse(fields.data);
      assert.equal(fields.event, value.type);
      assert.equal(Number(fields.id), value.sequence);
      return value;
    });
}
function verifyStream(events) {
  let terminal = false;
  const id = events[0]?.requestId;
  events.forEach((event, sequence) => {
    assert.equal(validators['stream-event'](event), true);
    assert.equal(event.requestId, id);
    assert.equal(event.sequence, sequence);
    assert.equal(terminal, false, 'no event after terminal');
    terminal = event.type === 'complete' || event.type === 'error';
  });
  assert.equal(terminal, true, 'EOF without a terminal event is incomplete');
}

test('proposed JSON payload fixtures conform to schemas', () => {
  for (const name of [
    'chat-request',
    'chat-response',
    'agent-request',
    'agent-response',
    'error',
  ]) {
    assert.equal(
      validators[name](json(`fixtures/${name}.json`)),
      true,
      `${name}: ${ajv.errorsText(validators[name].errors)}`
    );
  }
});
test('requests reject blank, oversize, unsafe IDs and browser activity context', () => {
  for (const message of ['', '   ', 'x'.repeat(4001)])
    assert.equal(validators['chat-request']({ message }), false);
  assert.equal(
    validators['chat-request']({ message: '热身', activities: [] }),
    false
  );
  assert.equal(
    validators['agent-request']({
      message: '热身',
      conversationId: '../private',
    }),
    false
  );
  assert.equal(
    validators['agent-response']({
      ...json('fixtures/agent-response.json'),
      toolCallCount: -1,
    }),
    false
  );
  assert.equal(
    validators.error({
      requestId: 'synthetic',
      code: 'UNREVIEWED_CODE',
      message: 'error',
    }),
    false
  );
});
test('SSE success and error fixtures have ordered events and explicit termination', () => {
  const complete = parseFixture('stream-complete');
  const error = parseFixture('stream-error');
  verifyStream(complete);
  verifyStream(error);
  assert.throws(() => verifyStream(complete.slice(0, 1)));
  assert.throws(() => verifyStream([...complete, complete[0]]));
  assert.throws(() => verifyStream([complete[1], complete[0]]));
  assert.throws(() =>
    verifyStream([complete[0], { ...complete[1], requestId: 'different' }])
  );
  assert.equal(
    validators['stream-event']({
      type: 'error',
      requestId: 'synthetic',
      sequence: 0,
      message: 'error',
    }),
    false
  );
});
