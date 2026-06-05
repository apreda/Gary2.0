const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** One PostgREST GET. `path` is `table?query` (no leading slash). */
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
