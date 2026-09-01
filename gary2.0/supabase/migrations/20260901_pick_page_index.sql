-- Sep 1 2026: a light index of every game pick ever published, for the website's per-game
-- pages and sitemap (betwithgary.ai/picks/<sport>/<date>/<away>-at-<home>). daily_picks holds one
-- jsonb row per day with the full rationales inside; the sitemap needs only the keys. The picks
-- column is polymorphic (an array, or a stringified array) — both shapes are unnested here.
-- security_invoker so the reader's own RLS on daily_picks applies, exactly as the site's
-- anon reads do today. APPLIED to prod Sep 1 2026 via the Supabase MCP (apply_migration).
create or replace view public.pick_page_index
with (security_invoker = true) as
select
  d.date,
  e->>'league'        as league,
  e->>'sport'         as sport,
  e->>'awayTeam'      as away_team,
  e->>'homeTeam'      as home_team,
  e->>'pick'          as pick,
  e->>'commence_time' as commence_time
from public.daily_picks d
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(d.picks) = 'array'  then d.picks
    when jsonb_typeof(d.picks) = 'string' then (d.picks #>> '{}')::jsonb
    else '[]'::jsonb
  end
) e
where coalesce(e->>'type', 'game') <> 'prop'
  and e->>'awayTeam' is not null
  and e->>'homeTeam' is not null;

grant select on public.pick_page_index to anon, authenticated;
