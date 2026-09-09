-- Sep 9 2026 (founder: opening and closing lines under the NFL pick card, and
-- a live board of the games whose lines are moving in The Hub).
--
-- The ledger already keeps every board the odds service sees, one row per
-- book per change (odds_snapshots, Sep 1-3 2026). Two things were missing for
-- the fan story: the TOTAL (weather and pace live there) and the kickoff, so a
-- week's ladder can say which rung was the close. Two reads sit on top:
--   line_ladder  — one game's story in one book: every rung, oldest first.
--   line_movers  — every game in a date range with where its line opened and
--                  where it is now, so the app can sort by the size of the move.
-- Same-book law throughout: a game's ladder is told in the book with the most
-- snapshots for it (ties → the most recent), never across books.
-- Display only. Nothing here reaches Gary's desk.

alter table public.odds_snapshots
  add column if not exists total numeric(5,1),
  add column if not exists total_over_odds integer,
  add column if not exists total_under_odds integer,
  add column if not exists commence_time timestamptz;

create or replace function public.line_ladder_vendor(p_sport text, p_game_date text, p_game_id text)
returns text
language sql stable
set search_path = ''
as $$
  select s.line_vendor
  from public.odds_snapshots s
  where s.sport = p_sport and s.game_date = p_game_date and s.game_id = p_game_id
    and s.line_vendor is not null
    -- prediction markets are not books (the odds service blocks them too)
    and s.line_vendor not in ('polymarket', 'kalshi')
  group by s.line_vendor
  order by count(*) desc, max(s.seen_at) desc
  limit 1
$$;

create or replace function public.line_ladder(p_sport text, p_game_date text, p_game_id text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_vendor text;
  v_home text;
  v_away text;
  v_kickoff timestamptz;
  v_rungs jsonb;
begin
  v_vendor := public.line_ladder_vendor(p_sport, p_game_date, p_game_id);
  if v_vendor is null then
    return null;
  end if;
  select max(s.home_team), max(s.away_team), max(s.commence_time)
    into v_home, v_away, v_kickoff
  from public.odds_snapshots s
  where s.sport = p_sport and s.game_date = p_game_date and s.game_id = p_game_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'seen_at', s.seen_at,
           'spread_home', s.spread_home,
           'spread_home_odds', s.spread_home_odds,
           'spread_away', s.spread_away,
           'spread_away_odds', s.spread_away_odds,
           'ml_home', s.moneyline_home,
           'ml_away', s.moneyline_away,
           'total', s.total,
           'total_over_odds', s.total_over_odds,
           'total_under_odds', s.total_under_odds
         ) order by s.seen_at), '[]'::jsonb)
    into v_rungs
  from public.odds_snapshots s
  where s.sport = p_sport and s.game_date = p_game_date and s.game_id = p_game_id
    and s.line_vendor = v_vendor;
  return jsonb_build_object(
    'sport', p_sport,
    'game_date', p_game_date,
    'game_id', p_game_id,
    'vendor', v_vendor,
    'home_team', v_home,
    'away_team', v_away,
    'commence_time', v_kickoff,
    'rungs', v_rungs
  );
end;
$$;

create or replace function public.line_movers(p_sport text, p_from text, p_to text)
returns table (
  game_date text,
  game_id text,
  home_team text,
  away_team text,
  vendor text,
  commence_time timestamptz,
  first_seen timestamptz,
  last_seen timestamptz,
  rungs integer,
  open_spread_home numeric,
  now_spread_home numeric,
  open_spread_home_odds integer,
  now_spread_home_odds integer,
  open_total numeric,
  now_total numeric,
  open_ml_home integer,
  now_ml_home integer,
  open_ml_away integer,
  now_ml_away integer
)
language sql stable security definer
set search_path = ''
as $$
  with games as (
    select distinct s.game_date, s.game_id
    from public.odds_snapshots s
    where s.sport = p_sport and s.game_date between p_from and p_to
  ), chosen as (
    select g.game_date, g.game_id,
           public.line_ladder_vendor(p_sport, g.game_date, g.game_id) as vendor
    from games g
  ), book as (
    select s.*
    from public.odds_snapshots s
    join chosen c on c.game_date = s.game_date and c.game_id = s.game_id and c.vendor = s.line_vendor
    where s.sport = p_sport
  ), firsts as (
    select distinct on (b.game_date, b.game_id) b.*
    from book b
    order by b.game_date, b.game_id, b.seen_at asc
  ), lasts as (
    select distinct on (b.game_date, b.game_id) b.*
    from book b
    order by b.game_date, b.game_id, b.seen_at desc
  ), counts as (
    select b.game_date, b.game_id, count(*)::integer as rungs, max(b.commence_time) as commence_time
    from book b
    group by b.game_date, b.game_id
  )
  select f.game_date, f.game_id, f.home_team, f.away_team, f.line_vendor,
         k.commence_time, f.seen_at, l.seen_at, k.rungs,
         f.spread_home, l.spread_home, f.spread_home_odds, l.spread_home_odds,
         f.total, l.total,
         f.moneyline_home, l.moneyline_home, f.moneyline_away, l.moneyline_away
  from firsts f
  join lasts l on l.game_date = f.game_date and l.game_id = f.game_id
  join counts k on k.game_date = f.game_date and k.game_id = f.game_id
  order by f.game_date, k.commence_time nulls last, f.game_id
$$;

revoke all on function public.line_ladder_vendor(text, text, text) from public;
revoke all on function public.line_ladder(text, text, text) from public;
revoke all on function public.line_movers(text, text, text) from public;
grant execute on function public.line_ladder_vendor(text, text, text) to anon, authenticated, service_role;
grant execute on function public.line_ladder(text, text, text) to anon, authenticated, service_role;
grant execute on function public.line_movers(text, text, text) to anon, authenticated, service_role;
