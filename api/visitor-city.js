import { pinyin } from 'pinyin-pro';
import catalog from '../run_page/geography/region_catalog.json' with { type: 'json' };

const cityKey = (name) => name.toLowerCase().replace(/[\s-]/g, '');
const chineseCityNames = new Map();

for (const region of catalog.regions) {
  if (region.countryCode !== 'CHN' || region.level !== 'city') continue;
  const shortName = region.name.replace(/市$/u, '');
  for (const name of [region.name, ...region.aliases]) {
    const romanized = pinyin(name, { toneType: 'none', type: 'array' }).join(
      ''
    );
    for (const key of [cityKey(name), cityKey(romanized)]) {
      const previous = chineseCityNames.get(key);
      chineseCityNames.set(
        key,
        previous === undefined || previous === shortName ? shortName : null
      );
    }
  }
}

function readCity(header) {
  if (!header) return null;
  try {
    const city = decodeURIComponent(header).trim();
    return city && city.length <= 80 && !/[\x00-\x1f\x7f]/.test(city)
      ? city
      : null;
  } catch {
    return null;
  }
}

export function GET(request) {
  const city = readCity(request.headers.get('x-vercel-ip-city'));
  const country = request.headers.get('x-vercel-ip-country');
  return Response.json(
    {
      city:
        city && (!country || country === 'CN')
          ? (chineseCityNames.get(cityKey(city)) ?? city)
          : city,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
