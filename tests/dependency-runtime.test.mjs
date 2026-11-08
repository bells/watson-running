import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

test('React and React DOM can render together after dependency updates', async () => {
  const { renderToString } = await import('react-dom/server');

  assert.equal(
    renderToString(React.createElement('p', null, 'dependency smoke test')),
    '<p>dependency smoke test</p>'
  );
});
