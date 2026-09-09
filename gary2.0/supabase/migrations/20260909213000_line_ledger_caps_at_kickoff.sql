-- Sep 9 2026 — line movement stops at kickoff. The poller keeps recording
-- in-game prices for the grader, but a started game's "now" in line_movers is
-- its last PREGAME rung (MIN @ DET showed -125 → -900 in the 4th inning), and
-- line_ladder marks every rung after the first pitch/kickoff as live so the
-- app can draw the closing line and stop the story there.

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
           'live', (v_kickoff is not null and s.seen_at > v_kickoff),
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
    'closed', (v_kickoff is not null and v_kickoff <= now()),
    'rungs', v_rungs
  );
end;
$$;

drop function if exists public.line_movers(text, text, text);

create function public.line_movers(p_sport text, p_from text, p_to text)
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
  open_total_seen timestamptz,
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
    -- pregame rungs only: the last one before kickoff is the closing line
    select s.*
    from public.odds_snapshots s
    join chosen c on c.game_date = s.game_date and c.game_id = s.game_id and c.vendor = s.line_vendor
    where s.sport = p_sport
      and (s.commence_time is null or s.seen_at <= s.commence_time)
  )
  select b.game_date, b.game_id,
         max(b.home_team), max(b.away_team), max(b.line_vendor),
         max(b.commence_time), min(b.seen_at), max(b.seen_at), count(*)::integer,
         (array_agg(b.spread_home order by b.seen_at) filter (where b.spread_home is not null))[1],
         (array_agg(b.spread_home order by b.seen_at desc) filter (where b.spread_home is not null))[1],
         (array_agg(b.spread_home_odds order by b.seen_at) filter (where b.spread_home_odds is not null))[1],
         (array_agg(b.spread_home_odds order by b.seen_at desc) filter (where b.spread_home_odds is not null))[1],
         (array_agg(b.total order by b.seen_at) filter (where b.total is not null))[1],
         (array_agg(b.total order by b.seen_at desc) filter (where b.total is not null))[1],
         min(b.seen_at) filter (where b.total is not null),
         (array_agg(b.moneyline_home order by b.seen_at) filter (where b.moneyline_home is not null))[1],
         (array_agg(b.moneyline_home order by b.seen_at desc) filter (where b.moneyline_home is not null))[1],
         (array_agg(b.moneyline_away order by b.seen_at) filter (where b.moneyline_away is not null))[1],
         (array_agg(b.moneyline_away order by b.seen_at desc) filter (where b.moneyline_away is not null))[1]
  from book b
  group by b.game_date, b.game_id
  order by b.game_date, max(b.commence_time) nulls last, b.game_id
$$;

revoke all on function public.line_movers(text, text, text) from public;
grant execute on function public.line_movers(text, text, text) to anon, authenticated, service_role;
