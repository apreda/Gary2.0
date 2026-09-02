-- Sep 2 2026: pick_page_index becomes a MATERIALIZED view.
-- Every read of the archive index (archive_day_index), the league-day index (pick_day_index),
-- the picks sitemap and robots.txt expanded the whole daily_picks jsonb (24 MB, ~3.6k rows,
-- 200-1000 ms) on every call. After the Sep 1 evening Postgres crash (5:40-6:02 PM ET) the
-- site's multi-day reads must cost milliseconds, not a table expansion.
-- Same columns and grants as the view it replaces; rows are DISTINCT and carry a non-null
-- row_key so REFRESH MATERIALIZED VIEW CONCURRENTLY (no read blocking) has its unique index.
-- pg_cron refreshes it every 15 minutes (job 'refresh-pick-page-index'); the site caches every
-- index read for an hour anyway, so a new game page is never more than 15 minutes behind.
-- The two dependent views are recreated unchanged: security_invoker, so daily_picks,
-- prop_picks and insight_connections are still read under the caller's own RLS; the
-- materialized view itself carries a plain anon SELECT — the same public keys the view exposed.
-- APPLIED to prod Sep 2 2026 via the Supabase MCP (apply_migration).

drop view if exists public.archive_day_index;
drop view if exists public.pick_day_index;
drop view if exists public.pick_page_index;

create materialized view public.pick_page_index as
select distinct
  d.date,
  e->>'league'        as league,
  e->>'sport'         as sport,
  e->>'awayTeam'      as away_team,
  e->>'homeTeam'      as home_team,
  e->>'pick'          as pick,
  e->>'commence_time' as commence_time,
  md5(concat_ws('|',
    d.date,
    coalesce(e->>'league', '<null>'),
    coalesce(e->>'sport', '<null>'),
    e->>'awayTeam',
    e->>'homeTeam',
    coalesce(e->>'pick', '<null>'),
    coalesce(e->>'commence_time', '<null>')
  )) as row_key
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

create unique index pick_page_index_row_key on public.pick_page_index (row_key);
create index pick_page_index_date on public.pick_page_index (date desc);

grant select on public.pick_page_index to anon, authenticated;

-- Which leagues had a board on which day — for the per-league day navigation.
create or replace view public.pick_day_index
with (security_invoker = true) as
select date, league, sport, count(*)::int as game_count
from public.pick_page_index
group by date, league, sport;

grant select on public.pick_day_index to anon, authenticated;

-- The website's archive index in ONE light request (per-day counts + published_at).
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

select cron.schedule(
  'refresh-pick-page-index',
  '*/15 * * * *',
  $$refresh materialized view concurrently public.pick_page_index$$
);
