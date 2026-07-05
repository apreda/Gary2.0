// betwithgary.ai/sheet?k=TOKEN — the founder's Daily Engagement Sheet (Engine 2).
// Thin proxy to the engagement-sheet edge function: the Supabase gateway rewrites Content-Type to
// text/plain (+nosniff) on gzipped responses, so browsers hitting the function URL directly see raw
// source. Vercel serves it with the right header, and the URL is bookmarkable. Token checked by the
// edge function itself; ?generate=1 passes through (its 303 redirect is followed server-side, so the
// regenerated page comes straight back).
const FN = 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/engagement-sheet';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('k') ?? url.searchParams.get('token') ?? '';
  const params = new URLSearchParams({ token });
  for (const p of ['generate', 'redirect', 'dry_run']) {
    const v = url.searchParams.get(p);
    if (v) params.set(p, v);
  }
  const r = await fetch(`${FN}?${params.toString()}`, { cache: 'no-store' });
  const body = await r.text();
  const ct = body.trimStart().startsWith('<') ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8';
  return new Response(body, {
    status: r.status,
    headers: { 'Content-Type': ct, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
