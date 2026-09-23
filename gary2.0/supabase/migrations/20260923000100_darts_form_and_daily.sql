-- DARTS, built out (founder, Sep 23 2026: "do it for real in the app").
-- Each dart carries its form, filled by the darts job after the throw (his
-- last 10 games for MLB; this season beside last season for the NFL; each
-- club's first-inning scoring), and Gary's run carries his day-by-day record
-- over the last 30 days, per league, for the page's chart.
begin;

alter table public.darts add column if not exists form jsonb;

create or replace function public.darts_day(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'game_date', d.game_date, 'league', d.league, 'kind', d.kind, 'player', d.player,
    'player_id', d.player_id, 'team', d.team, 'position', d.position, 'matchup', d.matchup, 'game_id', d.game_id,
    'commence_time', d.commence_time, 'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'odds_alt', d.odds_alt,
    'book', d.book, 'reason', d.reason, 'scratched', d.scratched_at is not null, 'scratch_reason', d.scratch_reason,
    'form', d.form)
    order by d.commence_time nulls last, d.id), '[]'::jsonb)
  from public.darts d
  where d.game_date = p_day
$$;
revoke all on function public.darts_day(date) from public;

create or replace function public.gary_run(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with g as (select * from public.gary_graded_games(p_day - 120, p_day) where league in ('MLB', 'NFL', 'NCAAF')),
  decided as (select * from g where result in ('won', 'lost') and team not in ('Over', 'Under')),
  t as (select *, row_number() over (partition by league, team order by game_date desc, created_at desc) as rn from decided),
  team_streaks as (
    select league, team, coalesce(min(rn) filter (where result = 'lost') - 1, count(*)) as streak, max(game_date) as last_date
    from t group by league, team),
  top_teams as (
    select *, row_number() over (partition by league order by streak desc, last_date desc) as rk
    from team_streaks where streak >= 3),
  l as (select *, row_number() over (partition by league order by game_date desc, created_at desc) as rn from g where result in ('won', 'lost')),
  league_streaks as (
    select league, coalesce(min(rn) filter (where result = 'lost') - 1, count(*)) as streak,
           (array_agg(result order by rn))[1] as latest
    from l group by league),
  dogs as (
    select league, count(*) filter (where result = 'won') as won, count(*) filter (where result = 'lost') as lost,
           round(coalesce(sum(case when result = 'won' then price / 100.0 when result = 'lost' then -1 else 0 end), 0), 2) as units
    from g where price > 0 and game_date > p_day - 30 group by league),
  daily as (
    select league, game_date, count(*) filter (where result = 'won') as won, count(*) filter (where result = 'lost') as lost
    from g where game_date >= p_day - 30 group by league, game_date),
  best_games as (
    select distinct on (league) league, pick_text, price, game_date from g
    where game_date = p_day - 1 and result = 'won' and price > 0 order by league, price desc),
  best_props as (
    select distinct on (league) * from (
      select case when upper(pr.sport) like 'MLB%' then 'MLB' else upper(pr.sport) end as league,
             pr.player_name, pr.prop_type, pr.bet, pr.odds, pr.actual_value, pr.matchup
      from public.prop_results pr
      where pr.game_date = p_day - 1 and lower(pr.result) = 'won' and pr.odds ~ '^\+?\d+$' and pr.odds::int > 0) x
    order by league, odds::int desc),
  weekly as (
    select pk->>'pick' as pick_text, pk->>'bdl_game_id' as game_id, nullif(pk->>'commence_time', '')::timestamptz as commence
    from public.weekly_nfl_picks w, jsonb_array_elements(w.picks) pk
    where w.season = extract(year from p_day)::int),
  prime as (
    select case
             when extract(dow from (wk.commence at time zone 'America/New_York')) = 4 and extract(hour from (wk.commence at time zone 'America/New_York')) >= 19 then 'TNF'
             when extract(dow from (wk.commence at time zone 'America/New_York')) = 0 and extract(hour from (wk.commence at time zone 'America/New_York')) >= 19 then 'SNF'
             when extract(dow from (wk.commence at time zone 'America/New_York')) = 1 and extract(hour from (wk.commence at time zone 'America/New_York')) >= 19 then 'MNF'
           end as slot, lower(n.result) as result
    from public.nfl_results n
    join weekly wk on wk.pick_text = n.pick_text and (wk.game_id = n.game_id or n.game_id is null)
    where n.game_date between p_day - 120 and p_day and coalesce(n.season_type, 2) = 2 and lower(n.result) in ('won', 'lost'))
  select jsonb_build_object(
    'team_streaks', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'team', team, 'streak', streak) order by league, streak desc, last_date desc), '[]'::jsonb)
                     from top_teams where rk <= 6),
    'league_streaks', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'streak', streak, 'latest', latest) order by league), '[]'::jsonb) from league_streaks),
    'dogs', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'won', won, 'lost', lost, 'units', units) order by league), '[]'::jsonb) from dogs),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'date', game_date, 'won', won, 'lost', lost) order by league, game_date), '[]'::jsonb) from daily),
    'best_games', (select coalesce(jsonb_agg(to_jsonb(b) order by league), '[]'::jsonb) from best_games b),
    'best_props', (select coalesce(jsonb_agg(to_jsonb(b) order by league), '[]'::jsonb) from best_props b),
    'primetime', (select coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'won', won, 'lost', lost) order by slot), '[]'::jsonb)
                  from (select slot, count(*) filter (where result = 'won') as won, count(*) filter (where result = 'lost') as lost
                        from prime where slot is not null group by slot) p)
  )
$$;
revoke all on function public.gary_run(date) from public;

commit;
