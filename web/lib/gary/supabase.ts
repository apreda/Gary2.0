function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

/**
 * One PostgREST GET. `path` is `table?query` (no leading slash).
 * Callers must use a consistent revalidate value per path — mixed values on the same URL conflict in the Next.js fetch cache.
 */
export async function rest<T>(path: string, opts: { revalidate?: number } = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    next: { revalidate: opts.revalidate ?? 600 },
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
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
 */
export async function restInsert(table: string, row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`PostgREST insert ${res.status}: ${table}`);
}
