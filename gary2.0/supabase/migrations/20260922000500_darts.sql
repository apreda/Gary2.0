-- DARTS (founder, Sep 22 2026): the Hub becomes Gary's fun picks that never
-- touch the record. Four home run darts on an MLB day, four touchdown darts
-- on an NFL day, chosen from Gary's own HR and TD lanes by his stated
-- confidence with variety (one per game, at most two in a price band).
-- The page reads one RPC: today's and yesterday's darts with grades, the
-- league streaks, and Gary's run (team streaks, primetime, yesterday's
-- biggest hit, the active streak, the month's underdogs).
begin;

create table if not exists public.darts (
  id bigserial primary key,
  game_date date not null,
  league text not null,
  kind text not null,                 -- hr | td
  player text not null,
  player_id text,
  team text,
  matchup text,
  game_id text,
  commence_time timestamptz,
  prop text not null,                 -- 'home_runs 0.5' / 'anytime_td 0.5'
  bet text not null default 'over',
  odds integer,
  confidence numeric,
  reason text,
  created_at timestamptz not null default now(),
  unique (game_date, league, player, prop)
);
alter table public.darts enable row level security;
drop policy if exists darts_read on public.darts;
create policy darts_read on public.darts for select to anon, authenticated using (true);
create index if not exists darts_day on public.darts (game_date, league);

-- The day's darts from the HR and TD lanes. Immutable once chosen: a later,
-- higher-confidence pick never bumps one already on the board.
create or replace function public.select_darts(p_date text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_inserted int := 0; v_league text; v_cap int; v_have int; v_games text[]; v_bands int[]; v_band int; r record;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  for v_league, v_cap in select * from (values ('MLB', 4), ('NFL', 4)) t(l, c) loop
    select count(*), coalesce(array_agg(game_id) filter (where game_id is not null), '{}'),
           array[count(*) filter (where odds < 200), count(*) filter (where odds between 200 and 399), count(*) filter (where odds >= 400)]
      into v_have, v_games, v_bands
      from public.darts where game_date = p_date::date and league = v_league;
    for r in
      select pk->>'player' as player, pk->>'player_id' as player_id, pk->>'team' as team, pk->>'matchup' as matchup,
             pk->>'game_id' as game_id, nullif(pk->>'commence_time', '')::timestamptz as commence_time,
             pk->>'prop' as prop, coalesce(pk->>'bet', 'over') as bet, (pk->>'odds')::int as odds,
             nullif(pk->>'confidence', '')::numeric as confidence, pk->>'rationale' as reason,
             case when pk->>'lane' = 'HR' then 'hr' else 'td' end as kind
      from public.prop_picks d, jsonb_array_elements(d.picks) pk
      where d.date = p_date
        and ((v_league = 'MLB' and pk->>'lane' = 'HR')
          or (v_league = 'NFL' and pk->>'lane' = 'TD' and upper(pk->>'sport') = 'NFL'))
        and (pk->>'odds') ~ '^-?\d+$'
        and coalesce(pk->>'player', '') <> ''
      order by nullif(pk->>'confidence', '')::numeric desc nulls last, (pk->>'odds')::int desc
    loop
      exit when v_have >= v_cap;
      continue when r.game_id is not null and r.game_id = any(v_games);
      v_band := case when r.odds < 200 then 1 when r.odds < 400 then 2 else 3 end;
      continue when v_bands[v_band] >= 2;
      insert into public.darts (game_date, league, kind, player, player_id, team, matchup, game_id, commence_time, prop, bet, odds, confidence, reason)
      values (p_date::date, v_league, r.kind, r.player, r.player_id, r.team, r.matchup, r.game_id, r.commence_time, r.prop, r.bet, r.odds, r.confidence, r.reason)
      on conflict do nothing;
      if found then
        v_have := v_have + 1; v_inserted := v_inserted + 1;
        if r.game_id is not null then v_games := v_games || r.game_id; end if;
        v_bands[v_band] := v_bands[v_band] + 1;
      end if;
    end loop;
  end loop;
  return v_inserted;
end $$;
revoke all on function public.select_darts(text) from public;
grant execute on function public.select_darts(text) to service_role;

-- One day's darts with their grade from the props grader.
create or replace function public.darts_day(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'game_date', d.game_date, 'league', d.league, 'kind', d.kind, 'player', d.player,
    'player_id', d.player_id, 'team', d.team, 'matchup', d.matchup, 'game_id', d.game_id,
    'commence_time', d.commence_time, 'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'reason', d.reason,
    'result', r.result, 'actual', r.actual_value) order by d.commence_time nulls last, d.id), '[]'::jsonb)
  from public.darts d
  left join lateral (
    select lower(pr.result) as result, pr.actual_value
    from public.prop_results pr
    where pr.game_date = d.game_date and lower(pr.player_name) = lower(d.player)
      and pr.prop_type = split_part(d.prop, ' ', 1) and lower(coalesce(pr.bet, 'over')) = lower(d.bet)
    order by pr.updated_at desc nulls last limit 1) r on true
  where d.game_date = p_day
$$;
revoke all on function public.darts_day(date) from public;

-- Every graded game pick, both ledgers, regular season only.
create or replace function public.gary_graded_games(p_from date, p_to date)
returns table(league text, game_date date, pick_text text, result text, created_at timestamptz, team text, price integer)
language sql stable security definer set search_path = '' as $$
  with g as (
    select upper(g.league) as league, g.game_date, g.pick_text, lower(g.result) as result, g.created_at
    from public.game_results g
    where g.game_date between p_from and p_to and lower(g.result) in ('won', 'lost', 'push')
    union all
    select 'NFL', n.game_date, n.pick_text, lower(n.result), n.created_at
    from public.nfl_results n
    where n.game_date between p_from and p_to and lower(n.result) in ('won', 'lost', 'push')
      and coalesce(n.season_type, 2) = 2)
  select g.league, g.game_date, g.pick_text, g.result, g.created_at,
         regexp_replace(g.pick_text, '\s+(ML|[+-]?\d+(\.\d+)?)(\s.*)?$', '') as team,
         (regexp_match(g.pick_text, '([+-]\d+)\s*$'))[1]::int as price
  from g
$$;
revoke all on function public.gary_graded_games(date, date) from public;

-- Gary's run: the fun numbers beyond the Billfold.
create or replace function public.gary_run(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with g as (select * from public.gary_graded_games(p_day - 120, p_day)),
  decided as (select * from g where result in ('won', 'lost') and team not in ('Over', 'Under')),
  t as (select *, row_number() over (partition by league, team order by game_date desc, created_at desc) as rn from decided),
  team_streaks as (
    select league, team, coalesce(min(rn) filter (where result = 'lost') - 1, count(*)) as streak, max(game_date) as last_date
    from t group by league, team),
  l as (select *, row_number() over (partition by league order by game_date desc, created_at desc) as rn from g where result in ('won', 'lost')),
  league_streaks as (
    select league, coalesce(min(rn) filter (where result = 'lost') - 1, count(*)) as streak,
           (array_agg(result order by rn))[1] as latest
    from l group by league),
  dogs as (
    select count(*) filter (where result = 'won') as won, count(*) filter (where result = 'lost') as lost,
           round(coalesce(sum(case when result = 'won' then price / 100.0 when result = 'lost' then -1 else 0 end), 0), 2) as units
    from g where price > 0 and game_date > p_day - 30),
  best_game as (
    select league, pick_text, price, game_date from g
    where game_date = p_day - 1 and result = 'won' and price > 0 order by price desc limit 1),
  best_prop as (
    select upper(pr.sport) as league, pr.player_name, pr.prop_type, pr.bet, pr.odds, pr.actual_value, pr.matchup
    from public.prop_results pr
    where pr.game_date = p_day - 1 and lower(pr.result) = 'won' and pr.odds ~ '^\+?\d+$' and pr.odds::int > 0
    order by pr.odds::int desc limit 1),
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
    'team_streaks', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'team', team, 'streak', streak) order by streak desc, last_date desc), '[]'::jsonb)
                     from (select * from team_streaks where streak >= 3 order by streak desc, last_date desc limit 6) x),
    'league_streaks', (select coalesce(jsonb_agg(jsonb_build_object('league', league, 'streak', streak, 'latest', latest) order by league), '[]'::jsonb) from league_streaks),
    'dogs_30d', (select jsonb_build_object('won', won, 'lost', lost, 'units', units) from dogs),
    'best_game', (select to_jsonb(best_game) from best_game),
    'best_prop', (select to_jsonb(best_prop) from best_prop),
    'primetime', (select coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'won', won, 'lost', lost) order by slot), '[]'::jsonb)
                  from (select slot, count(*) filter (where result = 'won') as won, count(*) filter (where result = 'lost') as lost
                        from prime where slot is not null group by slot) p)
  )
$$;
revoke all on function public.gary_run(date) from public;

-- The page's one read.
create or replace function public.get_darts(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_day date;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  return jsonb_build_object(
    'date', v_day,
    'today', public.darts_day(v_day),
    'yesterday', public.darts_day(v_day - 1),
    'streaks', (select coalesce(jsonb_agg(jsonb_build_object(
        'game_date', s.game_date, 'league', s.league, 'subject_type', s.subject_type, 'subject', s.subject,
        'team', s.team, 'kind', s.kind, 'length', s.length, 'detail', s.detail, 'next_game', s.next_game)
        order by s.league, s.length desc), '[]'::jsonb)
      from (select s.* from public.streaks s
            where s.league in ('MLB', 'NFL')
              and s.game_date = (select max(x.game_date) from public.streaks x where x.league = s.league)
            order by s.league, s.length desc limit 120) s),
    'run', public.gary_run(v_day));
end $$;
revoke all on function public.get_darts(text) from public;
grant execute on function public.get_darts(text) to anon, authenticated, service_role;

-- Picks land through the day; the board fills as they do.
select cron.unschedule(jobid) from cron.job where jobname = 'darts-select';
select cron.schedule('darts-select', '*/20 * * * *',
  $cron$select public.select_darts(to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'))$cron$);

commit;

-- Applied as a follow-up (same day): price bands per kind (a home run dart is
-- never short: MLB bands 400/600, NFL 200/400) and Gary's run reads the
-- current sports only, naming the HR lane's league plainly. The function
-- bodies above are superseded by the versions in the database; see the
-- migration history entry `darts_bands_and_run_fixes`.
