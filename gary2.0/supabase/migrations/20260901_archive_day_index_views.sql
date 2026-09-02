-- Sep 1 2026 (evening): the website's archive index in ONE light request.
-- Before this, every archive surface (index, month, day, sitemap) pulled three full
-- tables through PostgREST pagination (pick_page_index 4 pages, prop_picks dates,
-- insight_connections 13 pages of headline+detail) and every game page probed
-- daily_picks per date for its created_at. Per-day COUNTS are all those pages need.
-- ~336 rows, no JSON body leaves the database. security_invoker: the reader's own
-- RLS applies, exactly as the anon site reads do today.
-- APPLIED to prod Sep 1 2026 via the Supabase MCP (apply_migration).
create or replace view public.archive_day_index
with (security_invoker = true) as
with picks as (
  select date, min(created_at) as published_at
  from public.daily_picks
  group by date
), games as (
  select date,
         count(distinct lower(coalesce(away_team, '') || '|' || coalesce(home_team, '') || '|' || coalesce(pick, '')))::int as game_count
  from public.pick_page_index
  group by date
), props as (
  select date,
         sum(case when jsonb_typeof(picks) = 'array'  then jsonb_array_length(picks)
                  when jsonb_typeof(picks) = 'string' then jsonb_array_length((picks #>> '{}')::jsonb)
                  else 0 end)::int as prop_count
  from public.prop_picks
  group by date
), research as (
  select date::text as date, count(*)::int as research_count
  from public.insight_connections
  where length(btrim(coalesce(headline, '') || ' ' || coalesce(detail, ''))) >= 30
  group by date
), days as (
  select date from picks
  union select date from props
  union select date from research
)
select d.date,
       p.published_at,
       coalesce(g.game_count, 0)      as game_count,
       coalesce(pr.prop_count, 0)     as prop_count,
       coalesce(r.research_count, 0)  as research_count
from days d
left join picks    p  on p.date  = d.date
left join games    g  on g.date  = d.date
left join props    pr on pr.date = d.date
left join research r  on r.date  = d.date;

grant select on public.archive_day_index to anon, authenticated;

-- Which leagues had a board on which day — for the per-league day navigation.
create or replace view public.pick_day_index
with (security_invoker = true) as
select date, league, sport, count(*)::int as game_count
from public.pick_page_index
group by date, league, sport;

grant select on public.pick_day_index to anon, authenticated;
