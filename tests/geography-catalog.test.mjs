import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/geography-contract.json', import.meta.url),
    'utf8'
  )
);
const runtime = JSON.parse(
  readFileSync(
    new URL('../run_page/geography/region_catalog.json', import.meta.url),
    'utf8'
  )
);
const source = stripTypeScriptTypes(
  readFileSync(new URL('../src/core/regionCatalog.ts', import.meta.url), 'utf8')
).replace(
  "import catalogDocument from '../../run_page/geography/region_catalog.json';",
  `const catalogDocument = ${JSON.stringify(runtime)};`
);
const { readRegionCatalog, parseProviderRegionChain } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
const catalog = readRegionCatalog(fixture.catalog);

test('shared provider chains preserve raw text, ambiguous names and parent scope', () => {
  for (const entry of fixture.cases) {
    const before = structuredClone(entry);
    assert.deepEqual(
      parseProviderRegionChain(entry.raw, catalog),
      entry.provider,
      String(entry.raw)
    );
    assert.deepEqual(entry, before);
  }
});
test('rejects malformed catalog identities and parents', () => {
  for (const change of ['duplicate', 'parent', 'level', 'code']) {
    const data = structuredClone(fixture.catalog);
    if (change === 'duplicate') data.regions.push(data.regions[0]);
    if (change === 'parent') data.regions.at(-1).parentId = 'country:USA';
    if (change === 'level') data.regions.at(-1).level = 'county';
    if (change === 'code') data.regions.at(-1).code = data.regions.at(-3).code;
    assert.throws(() => readRegionCatalog(data));
  }
});
test('runtime aliases agree with existing location parser for known China chains', () => {
  assert.equal(parseProviderRegionChain('深圳:广东').cityId, 'CHN:city:440300');
  assert.equal(parseProviderRegionChain('南昌:江西').cityId, 'CHN:city:360100');
});
