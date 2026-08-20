-- Pick-history summary (Aug 20 2026, founder GO: "fix it — the math has to be
-- right for whatever the time range is, users may not go back to every pick").
--
-- READ-SIDE ONLY, ADDITIVE. The Billfold's history math previously extracted
-- picks->N->>… across 90 days of very large daily_picks jsonb from every
-- phone; under the 11 AM Aug 20 insights load those queries blew the anon
-- 3-second statement timeout (Postgres: "canceling statement due to statement
-- timeout" -> HTTP 500 -> the Picks surfaces blanked). This materialized view
-- detoasts that jsonb ONCE per refresh into thin rows covering ALL history,
-- so every range's ledger math stays exact while phones read kilobytes.
--
-- Refresh: pg_cron, every 15 minutes, CONCURRENTLY (unique index below).
-- Billfold reads graded/published history — 15-minute staleness is inside
-- the app's own cache TTL. No trigger, no write-path or grading coupling.

create materialized view if not exists public.pick_history_summary as
select
  d.date::text as game_date,
  upper(coalesce(p.value->>'league', '')) as league,
  p.value->>'pick' as pick,
  case when p.value->>'confidence' ~ '^-?[0-9]+(\.[0-9]+)?$'
       then (p.value->>'confidence')::double precision end as confidence,
  coalesce(lower(p.value->>'is_top_pick') = 'true', false) as is_top_pick,
  'daily'::text as source,
  d.date::text as src_key,
  p.ordinality::int as slot
from public.daily_picks d
cross join lateral jsonb_array_elements(d.picks) with ordinality as p(value, ordinality)
where jsonb_typeof(d.picks) = 'array'
  and coalesce(p.value->>'pick', '') <> ''
  -- weekly_nfl_picks is canonical for NFL; a legacy daily copy must not
  -- let one pick calibrate twice (same rule the app enforced client-side).
  and upper(coalesce(p.value->>'league', '')) <> 'NFL'

union all

select
  -- ET LAW: the game day is the Eastern date of kickoff, never the UTC date.
  ((p.value->>'commence_time')::timestamptz at time zone 'America/New_York')::date::text as game_date,
  'NFL'::text as league,
  p.value->>'pick' as pick,
  case when p.value->>'confidence' ~ '^-?[0-9]+(\.[0-9]+)?$'
       then (p.value->>'confidence')::double precision end as confidence,
  coalesce(lower(p.value->>'is_top_pick') = 'true', false) as is_top_pick,
  'weekly_nfl'::text as source,
  w.week_start::text as src_key,
  p.ordinality::int as slot
from public.weekly_nfl_picks w
cross join lateral jsonb_array_elements(w.picks) with ordinality as p(value, ordinality)
where jsonb_typeof(w.picks) = 'array'
  and coalesce(p.value->>'pick', '') <> ''
  -- A malformed commence_time must not break the whole refresh.
  and p.value->>'commence_time' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
with data;

-- CONCURRENTLY refresh requires a unique index; (source, src_key, slot) is
-- unique by construction (one daily row per date, one weekly row per week).
create unique index if not exists pick_history_summary_identity
  on public.pick_history_summary (source, src_key, slot);

-- The app's only filter shape: game_date >= :since (optionally + league).
create index if not exists pick_history_summary_date
  on public.pick_history_summary (game_date desc, league);

grant select on public.pick_history_summary to anon, authenticated;

-- 15-minute refresh. Idempotent: replace any prior schedule of the same name.
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-pick-history-summary';
select cron.schedule(
  'refresh-pick-history-summary',
  '*/15 * * * *',
  $$refresh materialized view concurrently public.pick_history_summary$$
);

-- Bridge for builds already in the field tonight (they still run the heavy
-- jsonb extraction): the app role's 3-second statement timeout was the exact
-- edge those queries died on under load. 8s matches `authenticated`.
alter role anon set statement_timeout = '8s';
