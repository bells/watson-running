import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(
  readFileSync(
    new URL('../src/core/activityLocation.ts', import.meta.url),
    'utf8'
  )
).replace(
  "'./locationNames'",
  JSON.stringify(new URL('../src/core/locationNames.ts', import.meta.url).href)
);
const { parseActivityLocation, summarizeLocations, matchesActivityCity } =
  await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );

const locations = [
  '深圳:广东',
  '深圳市:广东省',
  "{'country': 'China', 'province': '广东省', 'city': '深圳市', 'latitude': 0.0, 'longitude': 0.0}",
  '宝安区, 深圳市, 广东省, 中国',
];
test('merges JoyRun, dictionary and address aliases without losing distance', () => {
  const records = locations.map((location_country) => ({
    location_country,
    distance: 1000,
  }));
  assert.deepEqual(summarizeLocations(records), {
    countries: ['中国'],
    provinces: ['广东省'],
    cities: { 深圳市: 4000 },
  });
  for (const record of records)
    assert.equal(matchesActivityCity(record, '深圳市'), true);
  assert.equal(
    matchesActivityCity({ location_country: '南昌:江西' }, '深圳市'),
    false
  );
});
test('normalizes municipalities, autonomous regions and country aliases', () => {
  const municipality = parseActivityLocation('北京:北京');
  assert.equal(municipality.province, '北京市');
  assert.equal(municipality.city, '北京市');
  assert.equal(parseActivityLocation('南宁:广西').province, '广西壮族自治区');
  assert.equal(
    parseActivityLocation('乌鲁木齐:新疆').province,
    '新疆维吾尔自治区'
  );
  assert.equal(
    parseActivityLocation(
      '{"country":"中华人民共和国","province":"广东","city":"深圳"}'
    ).country,
    '中国'
  );
  assert.equal(
    parseActivityLocation(
      '{"country":"美利坚合众国","state":"California","city":"Los Angeles"}'
    ).country,
    '美国'
  );
});
test('keeps unknown locations empty and never treats dictionary colons as JoyRun separators', () => {
  for (const location of [null, '', 'None', '{broken', '{"country":42}']) {
    assert.deepEqual(parseActivityLocation(location), {
      country: '',
      province: '',
      city: '',
      coordinate: null,
    });
  }
  assert.deepEqual(summarizeLocations([]), {
    countries: [],
    provinces: [],
    cities: {},
  });
  assert.deepEqual(parseActivityLocation(locations[2]).coordinate, [0, 0]);
});
test('distinguishes homonymous cities in different countries or provinces', () => {
  const records = [
    {
      location_country:
        '{"country":"美国","state":"Illinois","city":"Springfield"}',
      distance: 1000,
    },
    {
      location_country:
        '{"country":"美国","state":"Oregon","city":"Springfield"}',
      distance: 2000,
    },
  ];
  const summary = summarizeLocations(records);
  assert.equal(Object.keys(summary.cities).length, 2);
  assert.equal(
    matchesActivityCity(records[0], 'Springfield · Illinois，美国'),
    true
  );
  assert.equal(
    matchesActivityCity(records[1], 'Springfield · Illinois，美国'),
    false
  );
});
