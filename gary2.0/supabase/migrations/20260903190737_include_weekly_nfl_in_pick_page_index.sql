-- Website-only read index for permanent pick pages.
--
-- NFL calls are canonical in weekly_nfl_picks, not daily_picks. Derive each
-- NFL page's calendar date from its real kickoff in America/New_York so late
-- UTC kickoffs remain attached to the Eastern date shown by the website.
-- This migration only reads pick tables; it does not alter either source or
-- any generation, grading, or scoring function.

-- Production currently uses a materialized pick_page_index with these two
-- dependent read views. Drop and restore the dependants explicitly so this
-- migration also replays cleanly from the older ordinary-view migration.
drop view if exists public.archive_day_index;
drop view if exists public.pick_day_index;

do $drop_pick_page_index$
declare
  relation_kind "char";
begin
  select c.relkind
    into relation_kind
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'pick_page_index';

  if relation_kind = 'm' then
    execute 'drop materialized view public.pick_page_index';
  elsif relation_kind = 'v' then
    execute 'drop view public.pick_page_index';
  end if;
end;
$drop_pick_page_index$;

create materialized view public.pick_page_index as
with indexed_picks as (
  -- Preserve every existing daily game-pick row and its stored board date.
  select
    d.date::text       as date,
    e->>'league'       as league,
    e->>'sport'        as sport,
    e->>'awayTeam'     as away_team,
    e->>'homeTeam'     as home_team,
    e->>'pick'         as pick,
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
    and e->>'homeTeam' is not null

  union all

  select
    (((
      case
        when e->>'commence_time' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
        then case
          when substring(e->>'commence_time' from 9 for 2)::integer <= extract(
            day from (
              make_date(
                substring(e->>'commence_time' from 1 for 4)::integer,
                substring(e->>'commence_time' from 6 for 2)::integer,
                1
              ) + interval '1 month - 1 day'
            )
          )::integer
          then (e->>'commence_time')::timestamptz
        end
      end
    ) at time zone 'America/New_York')::date)::text as date,
    'NFL'::text         as league,
    e->>'sport'        as sport,
    e->>'awayTeam'     as away_team,
    e->>'homeTeam'     as home_team,
    e->>'pick'         as pick,
    e->>'commence_time' as commence_time
  from public.weekly_nfl_picks w
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(w.picks) = 'array'  then w.picks
      when jsonb_typeof(w.picks) = 'string' then (w.picks #>> '{}')::jsonb
      else '[]'::jsonb
    end
  ) e
  where coalesce(e->>'type', 'game') <> 'prop'
    and nullif(btrim(e->>'awayTeam'), '') is not null
    and nullif(btrim(e->>'homeTeam'), '') is not null
    -- Only strict provider UTC timestamps are accepted. The calendar check
    -- prevents a malformed value such as February 30 from breaking refresh.
    and case
      when e->>'commence_time' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
      then substring(e->>'commence_time' from 9 for 2)::integer <= extract(
        day from (
          make_date(
            substring(e->>'commence_time' from 1 for 4)::integer,
            substring(e->>'commence_time' from 6 for 2)::integer,
            1
          ) + interval '1 month - 1 day'
        )
      )::integer
      else false
    end
)
select distinct
  date,
  league,
  sport,
  away_team,
  home_team,
  pick,
  commence_time,
  md5(concat_ws(
    '|',
    date,
    coalesce(league, '<null>'),
    coalesce(sport, '<null>'),
    away_team,
    home_team,
    coalesce(pick, '<null>'),
    coalesce(commence_time, '<null>')
  )) as row_key
from indexed_picks;

create unique index pick_page_index_row_key
  on public.pick_page_index (row_key);
create index pick_page_index_date
  on public.pick_page_index (date desc);

grant select on public.pick_page_index to anon, authenticated;

create or replace view public.pick_day_index
with (security_invoker = true) as
select date, league, sport, count(*)::integer as game_count
from public.pick_page_index
group by date, league, sport;

grant select on public.pick_day_index to anon, authenticated;

-- Preserve the existing archive summary contract while rebuilding its
-- dependency on pick_page_index.
create or replace view public.archive_day_index
with (security_invoker = true) as
with daily_published as (
  select date, min(created_at) as published_at
  from public.daily_picks
  group by date
), weekly_published as (
  select
    (((
      case
        when e->>'commence_time' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
        then case
          when substring(e->>'commence_time' from 9 for 2)::integer <= extract(
            day from (
              make_date(
                substring(e->>'commence_time' from 1 for 4)::integer,
                substring(e->>'commence_time' from 6 for 2)::integer,
                1
              ) + interval '1 month - 1 day'
            )
          )::integer
          then (e->>'commence_time')::timestamptz
        end
      end
    ) at time zone 'America/New_York')::date)::text as date,
    min(coalesce(w.created_at, w.updated_at)) as published_at
  from public.weekly_nfl_picks w
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(w.picks) = 'array'  then w.picks
      when jsonb_typeof(w.picks) = 'string' then (w.picks #>> '{}')::jsonb
      else '[]'::jsonb
    end
  ) e
  where case
    when e->>'commence_time' ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z$'
    then substring(e->>'commence_time' from 9 for 2)::integer <= extract(
      day from (
        make_date(
          substring(e->>'commence_time' from 1 for 4)::integer,
          substring(e->>'commence_time' from 6 for 2)::integer,
          1
        ) + interval '1 month - 1 day'
      )
    )::integer
    else false
  end
  group by date
), picks as (
  select date, min(published_at) as published_at
  from (
    select date, published_at from daily_published
    union all
    select date, published_at from weekly_published
  ) published
  group by date
), games as (
  select
    date,
    count(distinct lower(
      coalesce(away_team, '') || '|' ||
      coalesce(home_team, '') || '|' ||
      coalesce(pick, '')
    ))::integer as game_count
  from public.pick_page_index
  group by date
), props as (
  select
    date,
    sum(
      case
        when jsonb_typeof(picks) = 'array'  then jsonb_array_length(picks)
        when jsonb_typeof(picks) = 'string' then jsonb_array_length((picks #>> '{}')::jsonb)
        else 0
      end
    )::integer as prop_count
  from public.prop_picks
  group by date
), research as (
  select date::text as date, count(*)::integer as research_count
  from public.insight_connections
  where length(btrim(coalesce(headline, '') || ' ' || coalesce(detail, ''))) >= 30
  group by date
), days as (
  select date from picks
  union select date from games
  union select date from props
  union select date from research
)
select
  d.date,
  p.published_at,
  coalesce(g.game_count, 0) as game_count,
  coalesce(pr.prop_count, 0) as prop_count,
  coalesce(r.research_count, 0) as research_count
from days d
left join picks p on p.date = d.date
left join games g on g.date = d.date
left join props pr on pr.date = d.date
left join research r on r.date = d.date;

grant select on public.archive_day_index to anon, authenticated;

-- Retain a single concurrent-refresh job after the materialized view swap.
select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh-pick-page-index';

select cron.schedule(
  'refresh-pick-page-index',
  '*/15 * * * *',
  $$refresh materialized view concurrently public.pick_page_index$$
);
