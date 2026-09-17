// Read-only StatsAPI transport, scoped and bounded independently of pick models.
const cache = new Map(), inflight = new Map();
const BASE = 'https://statsapi.mlb.com/api/';
export const sourceUrl = path => `${BASE}${path}`;
export async function readBullpenSource(path, { ttl = 60000 } = {}) {
  const saved = cache.get(path);
  if (saved && Date.now() - saved.at < ttl) return saved.data;
  if (inflight.has(path)) return inflight.get(path);
  const pending = (async () => {
    const response = await fetch(sourceUrl(path), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`StatsAPI HTTP ${response.status}`);
    const data = await response.json();
    cache.delete(path); cache.set(path, { at: Date.now(), data });
    while (cache.size > 160) cache.delete(cache.keys().next().value);
    return data;
  })().finally(() => inflight.delete(path));
  inflight.set(path, pending);
  return pending;
}
export async function mapLimit(items, limit, work) {
  const result = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; result[i] = await work(items[i], i); }
  }));
  return result;
}
