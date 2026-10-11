import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const cache = new Map();
export function tsModule(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  let source = url.pathname.endsWith('.json')
    ? `export default ${readFileSync(url, 'utf8')};`
    : stripTypeScriptTypes(readFileSync(url, 'utf8'));
  source = source.replace(/from ['"](\.[^'"]+)['"]/g, (_, path) => {
    const dependency = new URL(
      path.endsWith('.json') ? path : `${path}.ts`,
      url
    );
    return `from '${tsModule(dependency)}'`;
  });
  const result = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  cache.set(key, result);
  return result;
}
