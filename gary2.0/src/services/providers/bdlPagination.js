import { decodeBdlRows } from './bdlResponse.js';

/** A complete collection or an error. A page cap is never a valid sample. */
export async function fetchBdlPages(readPage, { label = 'BDL collection', maxPages = 100 } = {}) {
  const rows = [];
  const seen = new Set();
  let cursor;
  for (let page = 1; page <= maxPages; page++) {
    const payload = await readPage(cursor);
    const batch = decodeBdlRows(payload, `${label} page ${page}`);
    if (batch.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`${label}: invalid collection row`);
    }
    rows.push(...batch);
    const next = payload.meta?.next_cursor;
    if (payload.meta != null && (typeof payload.meta !== 'object' || Array.isArray(payload.meta))) {
      throw new Error(`${label}: invalid pagination metadata`);
    }
    if (next == null) return rows;
    if (!((typeof next === 'number' && Number.isFinite(next) && next >= 0)
      || (typeof next === 'string' && next.trim()))) {
      throw new Error(`${label}: invalid next cursor`);
    }
    if (!batch.length) throw new Error(`${label}: empty nonterminal page`);
    if (seen.has(String(next))) throw new Error(`${label}: repeated pagination cursor`);
    seen.add(String(next));
    cursor = next;
  }
  throw new Error(`${label}: incomplete collection after ${maxPages} pages`);
}
