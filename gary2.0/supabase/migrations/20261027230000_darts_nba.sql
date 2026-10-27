-- Darts page, NBA (Oct 27 2026, founder: the NBA tab's GARY 7D/14D/30D read "No games yet" and its streak boards were
-- empty). Both reads predate the NBA season: gary_run graded MLB, NFL and college picks only, and get_darts returned
-- MLB and NFL streaks only. NBA joins both; the streak cap rises to 240 so three leagues' boards fit.

CREATE OR REPLACE FUNCTION public.gary_run(p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with g as (select * from public.gary_graded_games(p_day - 120, p_day) where league in ('MLB', 'NFL', 'NCAAF', 'NBA')),
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
$function$;

CREATE OR REPLACE FUNCTION public.get_darts(p_date text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_day date; v_week date;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  -- The Tuesday that opens the current NFL week; last week is the seven days before it.
  v_week := v_day - ((extract(isodow from v_day)::int - 2 + 7) % 7);
  return jsonb_build_object(
    'date', v_day,
    'today', public.darts_day(v_day),
    -- Yesterday's hits only: the page celebrates what landed, never a tally.
    'yesterday', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'league', d.league, 'kind', d.kind, 'player', d.player, 'matchup', d.matchup,
        'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'actual', d.actual)
        order by d.odds desc nulls last, d.id), '[]'::jsonb)
      from public.darts d where d.game_date = v_day - 1 and d.result = 'hit'),
    -- The NFL plays weekly: last week's props that won.
    'last_week', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', -w.n, 'league', 'NFL', 'kind', w.prop_type, 'player', w.player_name, 'matchup', w.matchup,
        'prop', w.prop_type, 'bet', w.bet, 'odds', w.odds_i, 'actual', w.actual_value, 'line', w.line_value)
        order by w.odds_i desc nulls last, w.n), '[]'::jsonb)
      from (select pr.prop_type, pr.player_name, pr.matchup, pr.bet, pr.actual_value, pr.line_value,
                   case when pr.odds ~ '^[+-]?\d+$' then pr.odds::int end as odds_i,
                   row_number() over (order by pr.game_date, pr.player_name, pr.prop_type) as n
            from public.prop_results pr
            where upper(pr.sport) = 'NFL' and pr.result = 'won'
              and pr.game_date >= v_week - 7 and pr.game_date < v_week) w),
    'streaks', (select coalesce(jsonb_agg(jsonb_build_object(
        'game_date', s.game_date, 'league', s.league, 'subject_type', s.subject_type, 'subject', s.subject,
        'team', s.team, 'kind', s.kind, 'length', s.length, 'detail', s.detail, 'next_game', s.next_game)
        order by s.league, s.length desc), '[]'::jsonb)
      from (select s.* from public.streaks s
            where s.league in ('MLB', 'NFL', 'NBA')
              and s.kind not in ('over', 'under')
              and s.game_date = (select max(x.game_date) from public.streaks x where x.league = s.league)
            order by s.league, s.length desc limit 240) s),
    'run', public.gary_run(v_day));
end $function$;
