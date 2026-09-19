import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const flights = new Map();
/** Shared by fresh game/content processes; atomic writes and a bounded lease. */
export async function cachedResearch(key, load, { ttlMs, cacheDir = process.env.GARY_RESEARCH_CACHE_DIR || join(tmpdir(), 'gary-research-v1'), enabled = !process.env.VITEST, valid = value => !value?.unavailable } = {}) {
  if (!enabled) return load();
  const id = `${cacheDir}:${key}`;
  if (flights.has(id)) return flights.get(id);
  const work = (async () => {
    await mkdir(cacheDir, { recursive: true });
    const path = join(cacheDir, createHash('sha256').update(key).digest('hex'));
    const read = async () => {
      try {
        const row = JSON.parse(await readFile(`${path}.json`, 'utf8'));
        return row.key === key && row.expires > Date.now() && valid(row.value) ? row.value : null;
      } catch { return null; }
    };
    const started = Date.now();
    let lease;
    while (!lease) {
      const hit = await read();
      if (hit) return hit;
      try { lease = await open(`${path}.lock`, 'wx'); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try { if (Date.now() - (await stat(`${path}.lock`)).mtimeMs > 600_000) await unlink(`${path}.lock`); } catch {}
        if (Date.now() - started > 210_000) throw new Error('Required research is still being collected by another process');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    try {
      const hit = await read();
      if (hit) return hit;
      const value = await load();
      if (valid(value)) {
        const temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify({ key, expires: Date.now() + (typeof ttlMs === 'function' ? ttlMs(value) : ttlMs), value }), { mode: 0o600 });
        await rename(temporary, `${path}.json`);
      }
      return value;
    } finally {
      await lease.close();
      await unlink(`${path}.lock`).catch(() => {});
    }
  })();
  flights.set(id, work);
  try { return await work; } finally { flights.delete(id); }
}
