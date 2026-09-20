import { connection } from 'next/server';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const REST_TIMEOUT_MS = 8_000;
const REST_ATTEMPTS = 2;

function tableName(path: string): string {
  return path.split('?')[0];
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * One PostgREST GET. `path` is `table?query` (no leading slash).
 * Callers must use a consistent revalidate value per path — mixed values on the same URL conflict in the Next.js fetch cache.
 */
export async function rest<T>(path: string, opts: { revalidate?: number } = {}): Promise<T> {
  // Live data belongs to requests, not deployment builds. This leaves the
  // explicit fetch cache below intact, including its last-good data on errors.
  // The sitemap's force-static route opts into ISR after its first request.
  await connection();
  let lastFailure: unknown;
  for (let attempt = 1; attempt <= REST_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        next: { revalidate: opts.revalidate ?? 600 },
        signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const failure = new Error(`PostgREST ${res.status}: ${tableName(path)}`);
        if (attempt < REST_ATTEMPTS && retryableStatus(res.status)) {
          lastFailure = failure;
          continue;
        }
        throw failure;
      }
      return await res.json() as T;
    } catch (error) {
      // Preserve stable HTTP errors for callers and tests. Transport failures,
      // truncated bodies, and timeouts get one fresh attempt before surfacing.
      if (error instanceof Error && /^PostgREST \d+:/.test(error.message)) throw error;
      lastFailure = error;
    }
  }
  throw new Error(`PostgREST request failed: ${tableName(path)}`, { cause: lastFailure });
}

/**
 * Fetch ALL rows. Supabase caps a single response at 1000 rows, so page
 * through with limit/offset. Callers MUST include an `order=` in `path`
 * for stable pagination.
 */
export async function restAll<T>(path: string, opts: { revalidate?: number } = {}): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let offset = 0; ; offset += PAGE) {
    const rows = await rest<T[]>(`${path}${sep}limit=${PAGE}&offset=${offset}`, opts);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * One PostgREST INSERT (single row). Uncached — writes must never hit the fetch cache.
 * `Prefer: return=minimal` so PostgREST returns nothing, which means insert-only RLS
 * (no SELECT policy) is enough. Used by the /get redirect to log a click with the anon key.
 * `onConflict` names a unique COLUMN and turns duplicate rows into silent no-ops
 * (ignore-duplicates), so repeat submits never surface as errors.
 */
export async function restInsert(
  table: string,
  row: Record<string, unknown>,
  opts: { onConflict?: string } = {},
): Promise<void> {
  const qs = opts.onConflict ? `?on_conflict=${opts.onConflict}` : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.onConflict ? 'return=minimal,resolution=ignore-duplicates' : 'return=minimal',
    },
    body: JSON.stringify(row),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`PostgREST insert ${res.status}: ${table}`);
}
